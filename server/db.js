import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {
  WARDS, DEPARTMENTS, LOCALITIES, DEMO_COMPLAINTS, CATEGORIES,
} from './seed.js';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS wards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ward_code TEXT UNIQUE NOT NULL,
  ward_name TEXT NOT NULL,
  zone TEXT NOT NULL,
  is_demo_data INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_wards_code ON wards (ward_code);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_code TEXT UNIQUE NOT NULL,
  department_name TEXT NOT NULL,
  description TEXT
);
CREATE INDEX IF NOT EXISTS idx_dept_code ON departments (department_code);

CREATE TABLE IF NOT EXISTS localities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locality_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  ward_id INTEGER NOT NULL REFERENCES wards(id) ON DELETE RESTRICT,
  is_demo_data INTEGER NOT NULL DEFAULT 1,
  UNIQUE(normalized_name, ward_id)
);
CREATE INDEX IF NOT EXISTS idx_localities_norm ON localities (normalized_name);

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_id TEXT UNIQUE NOT NULL,
  issue_type TEXT NOT NULL CHECK(issue_type IN ('pothole', 'garbage', 'broken_streetlight', 'waterlogging', 'other')),
  description TEXT,
  severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical', 'unknown')),
  confidence REAL,
  locality TEXT NOT NULL,
  ward_id INTEGER REFERENCES wards(id) ON DELETE RESTRICT,
  department_id INTEGER REFERENCES departments(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('submitted', 'acknowledged', 'under_review', 'assigned', 'in_progress', 'resolved', 'rejected')),
  image_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  source TEXT NOT NULL CHECK(source IN ('demo', 'user_report'))
);
CREATE INDEX IF NOT EXISTS idx_complaints_tracking ON complaints (tracking_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints (status);
CREATE INDEX IF NOT EXISTS idx_complaints_cat_ward ON complaints (issue_type, ward_id);

CREATE TABLE IF NOT EXISTS complaint_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_status_hist_comp ON complaint_status_history (complaint_id);

CREATE TABLE IF NOT EXISTS complaint_idempotency (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT UNIQUE NOT NULL,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_idempotency_key ON complaint_idempotency (idempotency_key);

CREATE TABLE IF NOT EXISTS agent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  input_summary TEXT NOT NULL,
  result_summary TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  success INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_session ON agent_events (session_id, id);
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  const mode = ['WAL', 'DELETE'].includes(process.env.DB_JOURNAL_MODE) ? process.env.DB_JOURNAL_MODE : 'WAL';
  db.exec(`PRAGMA journal_mode = ${mode}; PRAGMA busy_timeout = 5000;`);
  db.exec(SCHEMA);
  return db;
}

export const normalize = (s) =>
  String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Seed Wards, Departments, Localities, and Demo complaints. Safe to run repeatedly; never deletes user complaints. */
export function seedDatabase(db) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    // 1. Seed Wards
    const insertWard = db.prepare(
      'INSERT OR IGNORE INTO wards (ward_code, ward_name, zone, is_demo_data) VALUES (?, ?, ?, 1)'
    );
    for (const w of WARDS) {
      insertWard.run(w.id, w.name, w.zone);
    }

    // 2. Seed Departments
    const insertDept = db.prepare(
      'INSERT OR IGNORE INTO departments (department_code, department_name, description) VALUES (?, ?, ?)'
    );
    for (const d of Object.values(DEPARTMENTS)) {
      insertDept.run(d.id, d.name, `AMC ${d.name}`);
    }

    // Map ward_code to internal ID
    const wardRows = db.prepare('SELECT id, ward_code FROM wards').all();
    const wardMap = new Map(wardRows.map((r) => [r.ward_code, r.id]));

    // Map department_code to internal ID
    const deptRows = db.prepare('SELECT id, department_code FROM departments').all();
    const deptMap = new Map(deptRows.map((r) => [r.department_code, r.id]));

    // 3. Seed Localities and Aliases
    const insertLoc = db.prepare(
      'INSERT OR IGNORE INTO localities (locality_name, normalized_name, ward_id, is_demo_data) VALUES (?, ?, ?, 1)'
    );
    for (const loc of LOCALITIES) {
      for (const wCode of loc.wardIds) {
        const wardInternalId = wardMap.get(wCode);
        if (wardInternalId) {
          insertLoc.run(loc.name, normalize(loc.name), wardInternalId);
          for (const alias of loc.aliases || []) {
            insertLoc.run(loc.name, normalize(alias), wardInternalId);
          }
        }
      }
    }

    // 4. Seed Demo Complaints
    const existingDemoCount = db.prepare("SELECT COUNT(*) as n FROM complaints WHERE source = 'demo'").get().n;
    if (existingDemoCount === 0) {
      const insertComp = db.prepare(
        `INSERT INTO complaints (tracking_id, issue_type, description, severity, confidence, locality, ward_id, department_id, status, image_reference, created_at, updated_at, resolved_at, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo')`
      );
      const insertHist = db.prepare(
        'INSERT INTO complaint_status_history (complaint_id, old_status, new_status, note, created_at) VALUES (?, ?, ?, ?, ?)'
      );

      const now = Date.now();
      for (const c of DEMO_COMPLAINTS) {
        const wardInternalId = wardMap.get(c.wardId);
        const dept = DEPARTMENTS[c.category];
        const deptInternalId = dept ? deptMap.get(dept.id) : null;
        const created = new Date(now - c.hoursAgo * 3600_000).toISOString();
        const updated = new Date(now - Math.floor(c.hoursAgo / 2) * 3600_000).toISOString();
        const resolved = c.status === 'resolved' ? updated : null;

        const res = insertComp.run(
          c.id, c.category, c.note || 'Demonstration record', c.severity, 0.95, c.locality,
          wardInternalId, deptInternalId, c.status, null, created, updated, resolved
        );
        const complaintId = res.lastInsertRowid;

        insertHist.run(complaintId, null, 'submitted', 'Complaint submitted (demo record)', created);
        if (c.status !== 'submitted') {
          insertHist.run(complaintId, 'submitted', c.status, `Status updated to ${c.status}`, updated);
        }
      }
    }

    db.exec('COMMIT;');
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw err;
  }
}
