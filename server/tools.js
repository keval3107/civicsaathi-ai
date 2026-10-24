import crypto from 'node:crypto';
import { CATEGORIES, DEPARTMENTS, SEVERITIES, STATUSES } from './seed.js';

export class ToolError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const TRACKING_RE = /^(CSA-[0-9A-HJKMNP-TV-Z]{8}|DEMO-\d{4})$/;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const normalize = (s) =>
  String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function parseTrackingId(raw) {
  const id = String(raw ?? '').trim().toUpperCase();
  return TRACKING_RE.test(id) ? id : null;
}

export function generateTrackingId() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 32];
  return `CSA-${out}`;
}

/** Tool 2: lookup_ward via SQLite database query */
export function lookupWard(db, locality) {
  const q = normalize(locality);
  if (q.length < 2 || q.length > 80) {
    return { status: 'unresolved', message: 'Enter the name of your area or locality.', suggestions: [] };
  }

  // Exact normalized match from DB
  const exactRows = db.prepare(`
    SELECT DISTINCT l.locality_name, w.id AS ward_table_id, w.ward_code, w.ward_name, w.zone, w.is_demo_data
    FROM localities l
    JOIN wards w ON l.ward_id = w.id
    WHERE l.normalized_name = ?
  `).all(q);

  if (exactRows.length === 1) {
    const row = exactRows[0];
    return {
      status: 'resolved',
      locality: row.locality_name,
      ward: { id: row.ward_code, dbId: row.ward_table_id, name: row.ward_name, zone: row.zone },
      isDemoData: !!row.is_demo_data,
    };
  }

  if (exactRows.length > 1) {
    return {
      status: 'ambiguous',
      locality: exactRows[0].locality_name,
      candidates: exactRows.map((r) => ({ id: r.ward_code, dbId: r.ward_table_id, name: r.ward_name, zone: r.zone })),
      message: `${exactRows[0].locality_name} spans more than one ward. Enter a nearby neighbourhood instead.`,
      suggestions: [],
      isDemoData: true,
    };
  }

  // Substring suggestions
  const suggestions = db.prepare(`
    SELECT DISTINCT locality_name
    FROM localities
    WHERE normalized_name LIKE ?
    LIMIT 5
  `).all(`%${q}%`).map((r) => r.locality_name);

  return {
    status: 'unresolved',
    message: 'This locality is not in the demonstration dataset. Check the spelling or pick a suggestion.',
    suggestions,
    isDemoData: true,
  };
}

/** Tool 3: lookup_department via SQLite */
export function lookupDepartment(db, category, wardCodeOrDbId) {
  if (!Object.hasOwn(CATEGORIES, category)) {
    return { status: 'unsupported', message: 'No routing rule exists for this category. Choose a supported category.' };
  }

  let ward;
  if (typeof wardCodeOrDbId === 'number') {
    ward = db.prepare('SELECT * FROM wards WHERE id = ?').get(wardCodeOrDbId);
  } else {
    ward = db.prepare('SELECT * FROM wards WHERE ward_code = ?').get(String(wardCodeOrDbId));
  }
  if (!ward) return { status: 'unresolved', message: 'A resolved ward is required for routing.' };

  const deptMeta = DEPARTMENTS[category];
  if (!deptMeta) return { status: 'missing', message: 'No department is configured for this category.' };

  const deptRow = db.prepare('SELECT * FROM departments WHERE department_code = ?').get(deptMeta.id);
  if (!deptRow) return { status: 'missing', message: 'Department not found in database.' };

  const rule = CATEGORIES[category].ruleId;
  return {
    status: 'resolved',
    department: { id: deptRow.department_code, dbId: deptRow.id, name: deptRow.department_name },
    office: `${ward.zone} office`,
    ruleId: rule,
    explanation: `Rule ${rule}: ${CATEGORIES[category].label.toLowerCase()} reports go to the ${deptRow.department_name}, handled through the ${ward.zone} office for ${ward.ward_name} ward.`,
  };
}

/** Tool 4: check_duplicate_complaint. Searches open tickets in same ward in SQLite */
export function checkDuplicates(db, category, locality, { days = 30 } = {}) {
  if (!Object.hasOwn(CATEGORIES, category)) throw new ToolError('invalid_category', 'Unsupported category.');
  const wardRes = lookupWard(db, locality);
  if (wardRes.status !== 'resolved') return { status: 'skipped', duplicates: [], message: 'Locality not resolved.' };

  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = db.prepare(`
    SELECT c.tracking_id, c.issue_type, c.locality, w.ward_name, c.status, c.created_at, c.source
    FROM complaints c
    JOIN wards w ON c.ward_id = w.id
    WHERE c.issue_type = ? AND c.ward_id = ? AND c.status != 'resolved' AND c.created_at >= ?
    ORDER BY c.created_at DESC
  `).all(category, wardRes.ward.dbId, since);

  const duplicates = rows.map((r) => ({
    trackingId: r.tracking_id,
    locality: r.locality,
    ward: r.ward_name,
    status: r.status,
    createdAt: r.created_at,
    isDemo: r.source === 'demo',
    sameLocality: normalize(r.locality) === normalize(wardRes.locality),
  })).slice(0, 5);

  return { status: duplicates.length ? 'possible_duplicates' : 'none_found', duplicates };
}

function rowToComplaint(r, history = []) {
  return {
    trackingId: r.tracking_id,
    category: r.issue_type,
    categoryLabel: CATEGORIES[r.issue_type]?.label ?? r.issue_type,
    severity: r.severity,
    confidence: r.confidence ?? null,
    locality: r.locality,
    ward: { id: r.ward_code, name: r.ward_name, zone: r.zone },
    department: { id: r.department_code, name: r.department_name },
    routingRule: CATEGORIES[r.issue_type]?.ruleId || 'RULE-GEN-01',
    status: r.status,
    description: r.description ?? null,
    hasImage: !!r.image_reference,
    imageRef: r.image_reference ?? null,
    source: r.source,
    isDemo: r.source === 'demo',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at ?? null,
    history,
  };
}

/** Tool 6: get_complaint_status */
export function getComplaintStatus(db, rawId) {
  const id = parseTrackingId(rawId);
  if (!id) throw new ToolError('invalid_tracking_id', 'Tracking IDs look like CSA-XXXXXXXX or DEMO-1001.');

  const row = db.prepare(`
    SELECT c.*, w.ward_code, w.ward_name, w.zone, d.department_code, d.department_name
    FROM complaints c
    LEFT JOIN wards w ON c.ward_id = w.id
    LEFT JOIN departments d ON c.department_id = d.id
    WHERE c.tracking_id = ?
  `).get(id);

  if (!row) throw new ToolError('not_found', 'No complaint found with this tracking ID.', 404);

  const history = db.prepare(`
    SELECT old_status, new_status, note, created_at
    FROM complaint_status_history
    WHERE complaint_id = ?
    ORDER BY id ASC
  `).all(row.id).map((h) => ({
    status: h.new_status,
    oldStatus: h.old_status,
    note: h.note,
    at: h.created_at,
  }));

  return rowToComplaint(row, history);
}

export function listComplaints(db, { q = '', category = '', status = '', locality = '', limit = 50, offset = 0 } = {}) {
  let sql = `
    SELECT c.*, w.ward_code, w.ward_name, w.zone, d.department_code, d.department_name
    FROM complaints c
    LEFT JOIN wards w ON c.ward_id = w.id
    LEFT JOIN departments d ON c.department_id = d.id
    WHERE 1=1
  `;
  const params = [];

  if (category) {
    sql += ' AND c.issue_type = ?';
    params.push(category);
  }
  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  if (locality) {
    sql += ' AND c.locality LIKE ?';
    params.push(`%${locality}%`);
  }
  if (q) {
    sql += ' AND (c.tracking_id LIKE ? OR c.locality LIKE ? OR w.ward_name LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
  params.push(Math.min(limit, 100), Math.max(offset, 0));

  const rows = db.prepare(sql).all(...params);
  return rows.map((r) => rowToComplaint(r));
}

/**
 * Tool 5: create_complaint.
 * Transactional insert with foreign keys, idempotency, and status history.
 */
export function createComplaint(db, input) {
  const {
    idempotencyKey, confirmed, category, severity, locality, imageRef, description, confidence,
  } = input ?? {};

  if (confirmed !== true) throw new ToolError('confirmation_required', 'Explicit user confirmation is required.');
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(idempotencyKey)) {
    throw new ToolError('invalid_idempotency_key', 'A valid idempotency key is required.');
  }
  if (!Object.hasOwn(CATEGORIES, category)) throw new ToolError('invalid_category', 'Choose a supported issue category.');
  if (!SEVERITIES.includes(severity)) throw new ToolError('invalid_severity', 'Severity must be low, medium, or high.');
  if (imageRef != null && !/^[a-f0-9]{32}$/.test(imageRef)) throw new ToolError('invalid_image_ref', 'Invalid image reference.');
  const desc = description == null ? null : String(description).trim().slice(0, 500) || null;

  // Resolve Ward from DB
  const wardRes = lookupWard(db, locality);
  if (wardRes.status !== 'resolved') {
    throw new ToolError('ward_unresolved', wardRes.message ?? 'The locality could not be resolved to a single ward.', 422);
  }

  // Resolve Department from DB
  const deptRes = lookupDepartment(db, category, wardRes.ward.dbId);
  if (deptRes.status !== 'resolved') throw new ToolError('department_unresolved', deptRes.message, 422);

  // Check Idempotency table
  const existingIdem = db.prepare('SELECT complaint_id FROM complaint_idempotency WHERE idempotency_key = ?').get(idempotencyKey);
  if (existingIdem) {
    const compRow = db.prepare('SELECT tracking_id FROM complaints WHERE id = ?').get(existingIdem.complaint_id);
    if (compRow) {
      return { complaint: getComplaintStatus(db, compRow.tracking_id), replayed: true };
    }
  }

  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const trackingId = generateTrackingId();
    try {
      db.exec('BEGIN IMMEDIATE;');

      const insertStmt = db.prepare(`
        INSERT INTO complaints (
          tracking_id, issue_type, description, severity, confidence, locality,
          ward_id, department_id, status, image_reference, created_at, updated_at, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, 'user_report')
      `);

      const res = insertStmt.run(
        trackingId, category, desc, severity, confidence ?? null, wardRes.locality,
        wardRes.ward.dbId, deptRes.department.dbId, imageRef ?? null, now, now
      );
      const complaintInternalId = res.lastInsertRowid;

      // Status history entry
      db.prepare(`
        INSERT INTO complaint_status_history (complaint_id, old_status, new_status, note, created_at)
        VALUES (?, NULL, 'submitted', 'Complaint registered by citizen', ?)
      `).run(complaintInternalId, now);

      // Idempotency entry
      db.prepare(`
        INSERT INTO complaint_idempotency (idempotency_key, complaint_id, created_at)
        VALUES (?, ?, ?)
      `).run(idempotencyKey, complaintInternalId, now);

      db.exec('COMMIT;');
      return { complaint: getComplaintStatus(db, trackingId), replayed: false };
    } catch (err) {
      try { db.exec('ROLLBACK;'); } catch {}
      if (/UNIQUE.*tracking_id/i.test(err.message)) continue; // Tracking ID retry
      if (/UNIQUE.*idempotency_key/i.test(err.message)) {
        const item = db.prepare('SELECT complaint_id FROM complaint_idempotency WHERE idempotency_key = ?').get(idempotencyKey);
        if (item) {
          const compRow = db.prepare('SELECT tracking_id FROM complaints WHERE id = ?').get(item.complaint_id);
          return { complaint: getComplaintStatus(db, compRow.tracking_id), replayed: true };
        }
      }
      throw new ToolError('database_error', 'The complaint could not be saved. Nothing was filed.', 500);
    }
  }

  throw new ToolError('database_error', 'The complaint could not be saved. Nothing was filed.', 500);
}

/** Update status with transactional history audit */
export function updateComplaintStatus(db, trackingId, newStatus, note = '') {
  if (!STATUSES.includes(newStatus)) {
    throw new ToolError('invalid_status', `Status must be one of: ${STATUSES.join(', ')}`);
  }
  const id = parseTrackingId(trackingId);
  if (!id) throw new ToolError('invalid_tracking_id', 'Invalid tracking ID.');

  const row = db.prepare('SELECT id, status FROM complaints WHERE tracking_id = ?').get(id);
  if (!row) throw new ToolError('not_found', 'No complaint found with this tracking ID.', 404);

  if (row.status === newStatus) {
    return getComplaintStatus(db, id);
  }

  const now = new Date().toISOString();
  const resolvedAt = newStatus === 'resolved' ? now : null;

  try {
    db.exec('BEGIN IMMEDIATE;');
    db.prepare(`
      UPDATE complaints
      SET status = ?, updated_at = ?, resolved_at = COALESCE(?, resolved_at)
      WHERE id = ?
    `).run(newStatus, now, resolvedAt, row.id);

    db.prepare(`
      INSERT INTO complaint_status_history (complaint_id, old_status, new_status, note, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(row.id, row.status, newStatus, note || `Status updated to ${newStatus}`, now);

    db.exec('COMMIT;');
    return getComplaintStatus(db, id);
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw new ToolError('database_error', 'Failed to update complaint status.', 500);
  }
}

/** Records a visible tool execution event */
export async function runTool(db, sessionId, tool, inputSummary, fn, summarize) {
  const start = performance.now();
  let result;
  let error = null;
  try {
    result = await fn();
  } catch (e) {
    error = e;
  }
  const duration = Math.round(performance.now() - start);
  try {
    db.prepare(
      'INSERT INTO agent_events (session_id, tool, input_summary, result_summary, duration_ms, success, created_at) VALUES (?,?,?,?,?,?,?)',
    ).run(
      sessionId, tool, String(inputSummary).slice(0, 200),
      (error ? `Failed: ${error.message}` : summarize(result)).slice(0, 300),
      duration, error ? 0 : 1, new Date().toISOString(),
    );
  } catch {}
  if (error) throw error;
  return result;
}

export function listEvents(db, sessionId) {
  return db.prepare(
    'SELECT id, tool, input_summary, result_summary, duration_ms, success, created_at FROM agent_events WHERE session_id = ? ORDER BY id DESC LIMIT 100',
  ).all(sessionId).map((e) => ({
    id: e.id, tool: e.tool, input: e.input_summary, result: e.result_summary,
    durationMs: e.duration_ms, success: !!e.success, at: e.created_at,
  }));
}
