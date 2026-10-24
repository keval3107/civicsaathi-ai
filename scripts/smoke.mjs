// Live smoke test against a running server. Usage: node scripts/smoke.mjs [baseUrl] [imagePath] [--no-create]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const base = args[0] || 'http://localhost:8080';
const img = args[1] || 'samples/pothole-sample.jpg';
const lookupOnly = process.argv.includes('--lookup');
const j = async (p, init) => { const r = await fetch(base + p, init); return { status: r.status, body: await r.json() }; };

if (lookupOnly) {
  const id = args[2];
  const r = await j(`/api/complaints/${id}`);
  console.log('status lookup', r.status, r.body.complaint?.trackingId, r.body.complaint?.status);
  process.exit(r.status === 200 ? 0 : 1);
}

const fd = new FormData();
fd.append('image', new Blob([fs.readFileSync(img)], { type: 'image/jpeg' }), path.basename(img));
const a = await j('/api/analyze', { method: 'POST', body: fd });
console.log('analyze', a.status, a.body.analysis);
const post = (p, b) => j(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const category = ['pothole', 'garbage', 'broken_streetlight', 'waterlogging'].includes(a.body.analysis?.category)
  ? a.body.analysis.category
  : 'pothole';
const r = await post('/api/route', { locality: 'Navrangpura', category });
console.log('route', r.status, r.body.ward?.ward?.name, r.body.department?.department?.name, r.body.duplicates?.status);
const key = crypto.randomUUID();
const body = { idempotencyKey: key, confirmed: true, category, severity: a.body.analysis?.severity || 'medium', locality: 'Navrangpura', imageRef: a.body.uploadId, analysisMode: a.body.analysis?.mode || 'demo' };
const c1 = await post('/api/complaints', body);
const c2 = await post('/api/complaints', body);
console.log('create', c1.status, c1.body.complaint?.trackingId, '| repeat', c2.status, c2.body.complaint?.trackingId, 'replayed', c2.body.replayed);
const bad = await post('/api/route', { locality: 'Atlantis', category: 'pothole' });
console.log('unknown locality', bad.body.ward.status, bad.body.ward.message);
console.log('TRACKING_ID=' + c1.body.complaint?.trackingId);
