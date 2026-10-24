import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, seedDatabase } from './db.js';
import {
  CATEGORIES, DEPARTMENTS, STATUSES, STATUS_EXPLANATIONS, DATASET_NOTICE,
} from './seed.js';
import {
  ToolError, lookupWard, lookupDepartment, checkDuplicates, createComplaint, getComplaintStatus,
  listComplaints, updateComplaintStatus, runTool, listEvents,
} from './tools.js';
import { createGemini } from './gemini.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROUTES = ['/', '/track', '/recent', '/activity', '/privacy', '/terms'];

/** Detects real image format from magic bytes */
export function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra }));

export function createApp({
  dbFile = process.env.DB_PATH || './data/civicsaathi.db',
  uploadDir = process.env.UPLOAD_DIR || './data/uploads',
  geminiKey = process.env.GEMINI_API_KEY,
  gemini,
  corsOrigin = process.env.CORS_ORIGIN,
  rateLimits = true,
} = {}) {
  const db = openDb(dbFile);
  seedDatabase(db);
  fs.mkdirSync(uploadDir, { recursive: true });
  const ai = gemini ?? createGemini({ apiKey: geminiKey, model: process.env.GEMINI_MODEL || undefined });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(cors({ origin: corsOrigin ? corsOrigin.split(',') : false }));
  app.use(express.json({ limit: '20kb' }));
  app.use((req, res, next) => {
    req.setTimeout(30000);
    res.setTimeout(30000);
    const start = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api')) {
        log('info', 'request', { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start });
      }
    });
    next();
  });

  const limiter = (windowMs, limit) =>
    rateLimits
      ? rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Too many requests. Try again shortly.' } } })
      : (_req, _res, next) => next();
  const expensive = limiter(10 * 60_000, 20);
  const writes = limiter(10 * 60_000, 30);
  const general = limiter(60_000, 120);
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', general);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    fileFilter: (_req, file, cb) =>
      Object.hasOwn(MIME_EXT, file.mimetype)
        ? cb(null, true)
        : cb(new ToolError('invalid_file_type', 'Upload a JPG, PNG or WEBP image.', 415)),
  });

  const session = (req) => {
    const s = req.get('x-session-id');
    return s && /^[A-Za-z0-9-]{8,64}$/.test(s) ? s : 'anonymous';
  };

  app.get('/api/health', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', database: 'ok', aiMode: ai.enabled ? 'gemini' : 'demo' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'error' });
    }
  });

  app.get('/api/meta', (_req, res) => {
    const locNames = db.prepare('SELECT DISTINCT locality_name FROM localities ORDER BY locality_name').all().map((r) => r.locality_name);
    res.json({
      aiMode: ai.enabled ? 'gemini' : 'demo',
      datasetNotice: DATASET_NOTICE,
      categories: Object.entries(CATEGORIES).map(([id, c]) => ({ id, label: c.label })),
      statuses: STATUSES.map((id) => ({ id, label: STATUS_EXPLANATIONS[id].label })),
      localities: locNames,
      maxImageBytes: MAX_IMAGE_BYTES,
    });
  });

  // Dedicated Ward Lookup Endpoint
  app.get('/api/wards/lookup', (req, res, next) => {
    try {
      const locality = typeof req.query.locality === 'string' ? req.query.locality : '';
      const result = lookupWard(db, locality);
      res.json(result);
    } catch (e) { next(e); }
  });

  // Step 1: validate + store the image, then run analyze_civic_image.
  app.post('/api/analyze', expensive, upload.single('image'), async (req, res, next) => {
    try {
      if (!req.file) throw new ToolError('missing_image', 'Attach a photo to continue.');
      const mime = sniffImage(req.file.buffer);
      if (!mime) throw new ToolError('invalid_image', 'The file is not a valid JPG, PNG or WEBP image.', 415);
      const analysis = await runTool(
        db, session(req), 'analyze_civic_image', `${mime} image, ${Math.round(req.file.size / 1024)} KB`,
        () => ai.analyzeCivicImage(req.file.buffer, mime, req.file.originalname),
        (a) => `${a.category}, severity ${a.severity}${a.confidence != null ? `, confidence ${Math.round(a.confidence * 100)}%` : ''} (${a.mode})`,
      ).catch((e) => {
        if (e.code === 'ai_unavailable') return { failed: true, message: e.message };
        throw e;
      });
      const uploadId = crypto.randomBytes(16).toString('hex');
      await fs.promises.writeFile(path.join(uploadDir, `${uploadId}.${MIME_EXT[mime]}`), req.file.buffer, { flag: 'wx' });
      if (analysis.failed) {
        return res.json({
          uploadId,
          analysis: { mode: ai.enabled ? 'gemini' : 'demo', category: 'uncertain', evidence: '', severity: 'medium', confidence: null, needsMoreInfo: true, failed: true, message: analysis.message },
        });
      }
      res.json({ uploadId, analysis });
    } catch (e) { next(e); }
  });

  // Step 2: lookup_ward, lookup_department, check_duplicate_complaint.
  app.post('/api/route', writes, async (req, res, next) => {
    try {
      const { locality, category } = req.body ?? {};
      const sid = session(req);
      if (typeof locality !== 'string' || !locality.trim()) throw new ToolError('missing_locality', 'Enter your area or locality.');
      if (typeof category !== 'string' || !Object.hasOwn(CATEGORIES, category)) {
        throw new ToolError('invalid_category', 'Choose a supported issue category first.');
      }
      const ward = await runTool(db, sid, 'lookup_ward', `locality "${locality.trim().slice(0, 60)}"`,
        () => lookupWard(db, locality),
        (r) => (r.status === 'resolved' ? `${r.ward.name} ward, ${r.ward.zone}` : `${r.status}`));
      if (ward.status !== 'resolved') return res.json({ ward, department: null, duplicates: null });
      const department = await runTool(db, sid, 'lookup_department', `${category}, ward ${ward.ward.id}`,
        () => lookupDepartment(db, category, ward.ward.dbId), (r) => (r.status === 'resolved' ? r.department.name : r.status));
      const duplicates = await runTool(db, sid, 'check_duplicate_complaint', `${category}, ${ward.locality}`,
        () => checkDuplicates(db, category, locality),
        (r) => (r.duplicates.length ? `${r.duplicates.length} possible duplicate(s)` : 'No open duplicates found'));
      res.json({ ward, department, duplicates });
    } catch (e) { next(e); }
  });

  // Step 3: create_complaint, only after explicit confirmation.
  app.post('/api/complaints', writes, async (req, res, next) => {
    try {
      const b = req.body ?? {};
      const result = await runTool(db, session(req), 'create_complaint',
        `${String(b.category).slice(0, 30)}, ${String(b.locality).slice(0, 60)}`,
        () => createComplaint(db, b),
        (r) => `${r.replayed ? 'Existing record returned' : 'Saved'} as ${r.complaint.trackingId}`);
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (e) { next(e); }
  });

  app.get('/api/complaints', (req, res) => {
    const pick = (v, allowed) => (typeof v === 'string' && allowed.includes(v) ? v : '');
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json({
      notice: 'Records marked Demonstration are sample data, not live municipal progress.',
      complaints: listComplaints(db, {
        q: typeof req.query.q === 'string' ? req.query.q.slice(0, 60) : '',
        category: pick(req.query.category, Object.keys(CATEGORIES)),
        status: pick(req.query.status, STATUSES),
        locality: typeof req.query.locality === 'string' ? req.query.locality.slice(0, 60) : '',
        limit,
        offset,
      }),
    });
  });

  app.get('/api/complaints/:id', async (req, res, next) => {
    try {
      const complaint = await runTool(db, session(req), 'get_complaint_status', `tracking ID ${String(req.params.id).slice(0, 20)}`,
        () => getComplaintStatus(db, req.params.id), (r) => `Status: ${r.status}`);
      res.json({ complaint, explanation: STATUS_EXPLANATIONS[complaint.status], statuses: STATUSES.map((id) => ({ id, label: STATUS_EXPLANATIONS[id].label })) });
    } catch (e) { next(e); }
  });

  // PATCH /api/complaints/:trackingId/status (Admin/Simulation workflow)
  app.patch('/api/complaints/:id/status', writes, async (req, res, next) => {
    try {
      const { status, note } = req.body ?? {};
      if (!status) throw new ToolError('missing_status', 'Status is required.');
      const updated = updateComplaintStatus(db, req.params.id, status, note);
      res.json({ complaint: updated });
    } catch (e) { next(e); }
  });

  app.get('/api/uploads/:id', (req, res) => {
    const m = /^([a-f0-9]{32})$/.exec(req.params.id);
    if (!m) return res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
    for (const [mime, ext] of Object.entries(MIME_EXT)) {
      const file = path.join(uploadDir, `${m[1]}.${ext}`);
      if (fs.existsSync(file)) {
        res.set({ 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' });
        return res.sendFile(path.resolve(file));
      }
    }
    res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
  });

  // Chat: the model may only choose get_complaint_status; the answer is built from the database row.
  app.post('/api/chat', expensive, async (req, res, next) => {
    try {
      const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 300) : '';
      if (!message) throw new ToolError('missing_message', 'Type a question.');
      const { id } = await ai.pickStatusCall(message);
      if (!id) {
        return res.json({ reply: 'Which complaint do you mean? Send the tracking ID, for example CSA-7K3M9QX2.', complaint: null });
      }
      try {
        const complaint = await runTool(db, session(req), 'get_complaint_status', `tracking ID ${id}`,
          () => getComplaintStatus(db, id), (r) => `Status: ${r.status}`);
        const ex = STATUS_EXPLANATIONS[complaint.status] || { label: complaint.status, text: '', next: '' };
        res.json({
          reply: `${complaint.trackingId} is "${ex.label}". ${ex.text} ${ex.next}${complaint.isDemo ? ' This is a demonstration record.' : ''}`,
          complaint,
        });
      } catch (e) {
        if (e.code === 'not_found') return res.json({ reply: `No complaint exists with tracking ID ${id}. Check the ID and try again.`, complaint: null });
        throw e;
      }
    } catch (e) { next(e); }
  });

  app.get('/api/activity', (req, res) => res.json({ events: listEvents(db, session(req)) }));

  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Unknown API route.' } }));

  // Static frontend and SPA routes
  const clientDir = path.resolve(here, '../dist/client');
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      const known = CLIENT_ROUTES.includes(req.path) || /^\/track\/[A-Za-z0-9-]{1,20}$/.test(req.path);
      res.status(known ? 200 : 404).sendFile(path.join(clientDir, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ error: { code: tooBig ? 'file_too_large' : 'upload_error', message: tooBig ? 'The image is larger than 5 MB.' : 'The upload could not be read.' } });
    }
    if (err instanceof ToolError) return res.status(err.httpStatus).json({ error: { code: err.code, message: err.message } });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'bad_json', message: 'Malformed request.' } });
    log('error', 'unhandled', { name: err?.name, message: String(err?.message).slice(0, 200) });
    res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } });
  });

  return { app, db };
}
