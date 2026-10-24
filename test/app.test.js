import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { openDb, seedDatabase } from '../server/db.js';
import {
  lookupWard, lookupDepartment, checkDuplicates, createComplaint, getComplaintStatus, updateComplaintStatus, ToolError,
} from '../server/tools.js';

const freshDb = () => {
  const db = openDb(':memory:');
  seedDatabase(db);
  return db;
};
const KEY = (n) => `test-key-${String(n).padStart(12, '0')}`;
const base = { confirmed: true, category: 'pothole', severity: 'high', locality: 'Navrangpura', analysisMode: 'demo' };

test('1. Database initialization and schema creation', () => {
  const db = freshDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  assert.ok(tables.includes('wards'));
  assert.ok(tables.includes('departments'));
  assert.ok(tables.includes('localities'));
  assert.ok(tables.includes('complaints'));
  assert.ok(tables.includes('complaint_status_history'));
  assert.ok(tables.includes('complaint_idempotency'));
  assert.ok(tables.includes('agent_events'));
});

test('2. Seed data initialization without overwriting user complaints', () => {
  const db = freshDb();
  // Create a user complaint
  const { complaint } = createComplaint(db, { ...base, idempotencyKey: KEY(100) });
  assert.equal(complaint.locality, 'Navrangpura');

  // Re-run seedDatabase
  seedDatabase(db);
  const found = getComplaintStatus(db, complaint.trackingId);
  assert.equal(found.trackingId, complaint.trackingId);
  assert.equal(found.source, 'user_report');
});

test('3. Ward lookup queries SQLite for names and aliases', () => {
  const db = freshDb();
  assert.equal(lookupWard(db, 'Navrangpura').ward.id, 'W01');
  assert.equal(lookupWard(db, '  ellis BRIDGE ').ward.name, 'Ellisbridge');
  assert.equal(lookupWard(db, 'satellite').ward.name, 'Jodhpur');
});

test('4. Ward lookup flags ambiguous and unknown localities', () => {
  const db = freshDb();
  const amb = lookupWard(db, 'SG Highway');
  assert.equal(amb.status, 'ambiguous');
  assert.ok(amb.candidates.length > 1);
  const unk = lookupWard(db, 'Atlantis');
  assert.equal(unk.status, 'unresolved');
  assert.equal(lookupWard(db, '').status, 'unresolved');
});

test('5. Department lookup queries SQLite deterministically', () => {
  const db = freshDb();
  const r = lookupDepartment(db, 'garbage', 'W08');
  assert.equal(r.department.id, 'DEPT-SWM');
  assert.match(r.explanation, /RULE-SWM-01/);
  assert.equal(lookupDepartment(db, 'other', 'W08').status, 'unsupported');
  assert.equal(lookupDepartment(db, 'pothole', 'W99').status, 'unresolved');
  assert.equal(lookupDepartment(db, '__proto__', 'W01').status, 'unsupported');
});

test('6. Duplicate check finds open tickets in the same ward only', () => {
  const db = freshDb();
  const hit = checkDuplicates(db, 'pothole', 'Navrangpura');
  assert.equal(hit.status, 'possible_duplicates');
  assert.equal(hit.duplicates[0].trackingId, 'DEMO-1001');
  assert.equal(checkDuplicates(db, 'pothole', 'Vatva').status, 'none_found');
  // resolved demo ticket is not an open duplicate
  assert.equal(checkDuplicates(db, 'waterlogging', 'Naroda').status, 'none_found');
});

test('7. Complaint creation persists, creates history and idempotency', () => {
  const db = freshDb();
  const { complaint, replayed } = createComplaint(db, { ...base, idempotencyKey: KEY(1) });
  assert.equal(replayed, false);
  assert.match(complaint.trackingId, /^CSA-[0-9A-Z]{8}$/);
  assert.equal(complaint.status, 'submitted');
  assert.equal(complaint.department.id, 'DEPT-ROADS');
  assert.equal(complaint.history.length, 1);
  assert.equal(complaint.history[0].status, 'submitted');

  // Verify idempotency table
  const idem = db.prepare('SELECT * FROM complaint_idempotency WHERE idempotency_key = ?').get(KEY(1));
  assert.ok(idem);

  // Replaying returns same complaint
  const again = createComplaint(db, { ...base, idempotencyKey: KEY(1) });
  assert.equal(again.replayed, true);
  assert.equal(again.complaint.trackingId, complaint.trackingId);
});

test('8. Complaint creation rejects invalid inputs', () => {
  const db = freshDb();
  const code = (input) => { try { createComplaint(db, input); } catch (e) { return e.code; } return null; };
  assert.equal(code({ ...base, confirmed: false, idempotencyKey: KEY(2) }), 'confirmation_required');
  assert.equal(code({ ...base, idempotencyKey: 'short' }), 'invalid_idempotency_key');
  assert.equal(code({ ...base, category: 'noise', idempotencyKey: KEY(3) }), 'invalid_category');
  assert.equal(code({ ...base, severity: 'extreme', idempotencyKey: KEY(4) }), 'invalid_severity');
  assert.equal(code({ ...base, locality: 'Atlantis', idempotencyKey: KEY(5) }), 'ward_unresolved');
  assert.equal(code({ ...base, locality: 'SG Highway', idempotencyKey: KEY(6) }), 'ward_unresolved');
  assert.equal(code({ ...base, imageRef: '../../etc/passwd', idempotencyKey: KEY(7) }), 'invalid_image_ref');
});

test('9. Transaction rollback on failed insert', () => {
  const db = freshDb();
  db.exec('DROP TABLE complaint_status_history');
  assert.throws(() => createComplaint(db, { ...base, idempotencyKey: KEY(8) }));
  // Complaints count should not have increased
  const count = db.prepare("SELECT COUNT(*) AS n FROM complaints WHERE source = 'user_report'").get().n;
  assert.equal(count, 0);
});

test('10. Status retrieval and status updates with history', () => {
  const db = freshDb();
  const { complaint } = createComplaint(db, { ...base, idempotencyKey: KEY(9) });
  assert.equal(getComplaintStatus(db, complaint.trackingId.toLowerCase()).trackingId, complaint.trackingId);
  assert.equal(getComplaintStatus(db, 'DEMO-1001').isDemo, true);

  // Update status
  const updated = updateComplaintStatus(db, complaint.trackingId, 'in_progress', 'Technician dispatched');
  assert.equal(updated.status, 'in_progress');
  assert.equal(updated.history.length, 2);
  assert.equal(updated.history[1].status, 'in_progress');
  assert.equal(updated.history[1].note, 'Technician dispatched');

  // 404 on not found
  assert.throws(() => getComplaintStatus(db, 'CSA-AAAAAAAA'), (e) => e instanceof ToolError && e.code === 'not_found');
  assert.throws(() => getComplaintStatus(db, "x'; DROP TABLE complaints;--"), (e) => e.code === 'invalid_tracking_id');
});

// ---- HTTP level tests ----
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

async function withServer(fn, gemini) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csa-'));
  const { app, db } = createApp({ dbFile: ':memory:', uploadDir: dir, geminiKey: '', gemini, rateLimits: false });
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}`;
  try { await fn(url, db); } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
const upload = (url, buf, name, type) => {
  const f = new FormData();
  f.append('image', new Blob([buf], { type }), name);
  return fetch(`${url}/api/analyze`, { method: 'POST', body: f });
};
const post = (url, p, body) =>
  fetch(`${url}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const patch = (url, p, body) =>
  fetch(`${url}${p}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('11. HTTP end to end: analyze, route, ward lookup endpoint, confirm, status update, chat', async () => {
  await withServer(async (url) => {
    // Health
    assert.equal((await (await fetch(`${url}/api/health`)).json()).status, 'ok');

    // Dedicated ward lookup endpoint
    const wardLookup = await (await fetch(`${url}/api/wards/lookup?locality=Navrangpura`)).json();
    assert.equal(wardLookup.status, 'resolved');
    assert.equal(wardLookup.ward.id, 'W01');

    // Image analyze
    const a = await upload(url, PNG, 'pothole.png', 'image/png');
    assert.equal(a.status, 200);
    const { uploadId, analysis } = await a.json();

    // Route
    const r = await (await post(url, '/api/route', { locality: 'Navrangpura', category: 'pothole' })).json();
    assert.equal(r.ward.ward.id, 'W01');
    assert.equal(r.department.department.id, 'DEPT-ROADS');

    // Create complaint
    const body = { ...base, idempotencyKey: KEY(20), imageRef: uploadId };
    const c1 = await post(url, '/api/complaints', body);
    assert.equal(c1.status, 201);
    const { complaint } = await c1.json();

    // Retrieve complaint
    const s = await (await fetch(`${url}/api/complaints/${complaint.trackingId}`)).json();
    assert.equal(s.complaint.locality, 'Navrangpura');
    assert.equal(s.complaint.history.length, 1);

    // Patch status
    const pRes = await patch(url, `/api/complaints/${complaint.trackingId}/status`, { status: 'in_progress', note: 'Assigned to road team' });
    assert.equal(pRes.status, 200);
    const pJson = await pRes.json();
    assert.equal(pJson.complaint.status, 'in_progress');
    assert.equal(pJson.complaint.history.length, 2);

    // Chat
    const chat = await (await post(url, '/api/chat', { message: `What's the status of ${complaint.trackingId}?` })).json();
    assert.match(chat.reply, /In progress/);
  });
});

test('12. API error handling: not found, invalid uploads, 422 unresolved ward', async () => {
  await withServer(async (url) => {
    assert.equal((await upload(url, Buffer.from('not an image'), 'x.png', 'image/png')).status, 415);
    assert.equal((await upload(url, Buffer.alloc(6 * 1024 * 1024), 'big.png', 'image/png')).status, 413);
    assert.equal((await fetch(`${url}/api/complaints/CSA-AAAAAAAA`)).status, 404);
    assert.equal((await post(url, '/api/complaints', { ...base, locality: 'Atlantis', idempotencyKey: KEY(30) })).status, 422);
  });
});
