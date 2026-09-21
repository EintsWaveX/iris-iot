// POST /api/write
//
// The ONLY way the shared tournament state at RTDB path /state ever changes.
// RTDB rules set ".write": false, so this function's use of the Admin SDK
// (which bypasses all RTDB rules) is the sole write path. This runs on the
// public internet behind an operator token -- every input is treated as
// hostile.
//
// Auth:   X-Operator-Token header, or ?op=<token> query param.
//         Missing/blank token  -> 401
//         Wrong token          -> 403
// Body:   {"patch": {...}}, patch may contain only "meta" | "attendance" | "games"
//         Oversized (>256 KiB) -> 413
//         Malformed / invalid  -> 400 with a specific reason
// Success: 200 {"ok":true,"rev":N}
//
// Merge semantics (see comments at each section below for why):
//   meta               shallow merge into existing meta. meta.celebrate is
//                      the champion broadcast: {gameId, at}, replaced whole.
//   attendance.hadir   merged key-by-key at its own RTDB path (never replaces
//                      the whole map -- two operators toggling different
//                      people must not clobber each other)
//   games.<id>         replaces that one game document wholesale (a re-draw
//                      must not leave stale winners merged in)
//
// rev is incremented atomically via ServerValue.increment(1)
// as part of the same multi-path update -- never read-modify-write.

import crypto from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getDatabase, ServerValue } from 'firebase-admin/database';

// Vercel's Node runtime honors this to disable its default JSON body
// parsing, so we can read the raw stream ourselves and enforce the 256 KiB
// cap while reading, rather than trusting Content-Length or letting a
// built-in parser reject with the wrong status code / shape.
export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_BODY_BYTES = 256 * 1024;
const GAME_ID_RE = /^g[1-6]$/;
const HADIR_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const META_PHASES = ['lobby', 'draw', 'bracket', 'champion'];
const ALLOWED_PATCH_KEYS = ['meta', 'attendance', 'games'];
const ALLOWED_GAME_DOC_KEYS = ['draw', 'sf1', 'sf2', 'champion', 'drawnAt'];
const ALLOWED_CELEBRATE_KEYS = ['gameId', 'at'];

// ---------------------------------------------------------------------
// Firebase Admin init -- once per warm lambda, guarded by getApps().length.
// firebase-admin v13+ removed the old namespace API (admin.apps,
// admin.credential, admin.database); this uses the modular subpath exports,
// which are the only surface that exists on the pinned ^14 dependency.
// so a warm invocation reuses the existing app instead of re-initializing
// (a common and costly bug on serverless: re-init on every request).
// ---------------------------------------------------------------------

function parseServiceAccount(raw) {
  const text = String(raw).trim();
  // Accept either raw JSON or base64-encoded JSON -- people paste it either way.
  try {
    return JSON.parse(text);
  } catch {
    // fall through to base64 attempt
  }
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT is not valid JSON and not valid base64-encoded JSON'
    );
  }
}

function getDb() {
  if (!getApps().length) {
    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    const databaseURL = process.env.FIREBASE_DATABASE_URL;

    if (!rawServiceAccount || String(rawServiceAccount).trim() === '') {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    }
    if (!databaseURL || String(databaseURL).trim() === '') {
      throw new Error('FIREBASE_DATABASE_URL is not set');
    }

    const serviceAccount = parseServiceAccount(rawServiceAccount);

    initializeApp({
      credential: cert(serviceAccount),
      databaseURL,
    });
  }
  return getDatabase();
}

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------

function constantTimeEquals(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  // Guard the length check FIRST -- timingSafeEqual throws on a length
  // mismatch, and that throw path is itself a timing side channel.
  if (bufA.length !== bufB.length) return false;
  if (bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkAuth(req) {
  const headerToken = req.headers ? req.headers['x-operator-token'] : undefined;
  const queryToken = req.query ? req.query.op : undefined;
  const token = headerToken || queryToken || '';

  if (!token || String(token).trim() === '') {
    return { ok: false, status: 401, error: 'missing_token' };
  }

  const expected = process.env.OPERATOR_TOKEN || '';
  if (expected === '' || !constantTimeEquals(token, expected)) {
    return { ok: false, status: 403, error: 'invalid_token' };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------
// Raw body reading with a hard size cap enforced while streaming, not
// after the fact -- an attacker sending an enormous body should be cut off
// as soon as we cross the limit, not after we've buffered all of it.
// ---------------------------------------------------------------------

class PayloadTooLargeError extends Error {}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      fn(arg);
    };

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        finish(reject, new PayloadTooLargeError('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish(resolve, Buffer.concat(chunks)));
    req.on('error', (err) => finish(reject, err));
  });
}

// ---------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidDraw(draw) {
  if (!Array.isArray(draw) || draw.length !== 4) return false;
  return draw.every(
    (team) => Array.isArray(team) && team.every((name) => typeof name === 'string')
  );
}

function isValidSlot(v) {
  return v === null || (Number.isInteger(v) && v >= 0 && v <= 3);
}

// Validates meta.celebrate. Returns an error string, or null if valid.
//
// This value is the champion broadcast: every phone in the room watches it
// and fires a full-screen takeover when it changes. That makes it the one
// piece of state a hostile client could use to hijack all 25 screens at
// once, so it gets the same enumerate-and-reject treatment as the rest of
// meta rather than being waved through as "just an object".
function validateCelebrate(value) {
  // null clears a stale celebration; a reset has to be able to do that.
  if (value === null) return null;
  if (!isPlainObject(value)) return 'invalid_meta_celebrate';
  for (const key of Object.keys(value)) {
    if (!ALLOWED_CELEBRATE_KEYS.includes(key)) return `unknown_celebrate_key:${key}`;
  }
  if (typeof value.gameId !== 'string' || !GAME_ID_RE.test(value.gameId)) {
    return 'invalid_celebrate_gameId';
  }
  // Clients treat `at` only as an opaque change marker, never as a clock to
  // compare against their own, so any positive integer is acceptable here.
  if (!Number.isInteger(value.at) || value.at <= 0) return 'invalid_celebrate_at';
  return null;
}

// Validates patch.meta. Returns an error string, or null if valid.
function validateMeta(meta) {
  if (!isPlainObject(meta)) return 'invalid_meta';
  // Keys here become RTDB update paths, where '/' is a path separator, so an
  // unconstrained key could write somewhere it was never meant to. The data
  // model has exactly two fields -- enumerate them rather than trusting input.
  for (const [key, value] of Object.entries(meta)) {
    if (key === 'activeGame') {
      if (typeof value !== 'string' || !GAME_ID_RE.test(value)) {
        return 'invalid_meta_activeGame';
      }
    } else if (key === 'phase') {
      if (!META_PHASES.includes(value)) return 'invalid_meta_phase';
    } else if (key === 'celebrate') {
      const err = validateCelebrate(value);
      if (err) return err;
    } else {
      return `unknown_meta_key:${key}`;
    }
  }
  return null;
}

// Validates patch.attendance. Returns an error string, or null if valid.
function validateAttendance(attendance) {
  if (!isPlainObject(attendance)) return 'invalid_attendance';
  for (const key of Object.keys(attendance)) {
    if (key !== 'hadir') return `unknown_attendance_key:${key}`;
  }
  if ('hadir' in attendance) {
    const hadir = attendance.hadir;
    if (!isPlainObject(hadir)) return 'invalid_hadir';
    for (const [kode, val] of Object.entries(hadir)) {
      if (!HADIR_KEY_RE.test(kode)) return `invalid_hadir_key:${kode}`;
      if (typeof val !== 'boolean') return `invalid_hadir_value:${kode}`;
    }
  }
  return null;
}

// Validates patch.games. Returns an error string, or null if valid.
function validateGames(games) {
  if (!isPlainObject(games)) return 'invalid_games';
  const gameIds = Object.keys(games);
  if (gameIds.length === 0) return 'empty_games';
  for (const gid of gameIds) {
    if (!GAME_ID_RE.test(gid)) return `invalid_game_id:${gid}`;
    const doc = games[gid];
    if (!isPlainObject(doc)) return `invalid_game_doc:${gid}`;
    for (const key of Object.keys(doc)) {
      if (!ALLOWED_GAME_DOC_KEYS.includes(key)) return `unknown_game_key:${gid}.${key}`;
    }
    // draw === null is the legitimate "not drawn yet" state that Reset
    // writes; only a non-null draw has to be four arrays of codes. Rejecting
    // null here made Reset fail silently: the client cleared optimistically,
    // the write 400'd, and the next snapshot restored the stale draw.
    if ('draw' in doc && doc.draw !== null && !isValidDraw(doc.draw)) {
      return `invalid_draw:${gid}`;
    }
    for (const slotKey of ['sf1', 'sf2', 'champion']) {
      if (slotKey in doc && !isValidSlot(doc[slotKey])) return `invalid_${slotKey}:${gid}`;
    }
    if ('drawnAt' in doc && doc.drawnAt !== null && typeof doc.drawnAt !== 'number') {
      return `invalid_drawnAt:${gid}`;
    }
  }
  return null;
}

function validatePatch(patch) {
  if (!isPlainObject(patch)) return 'invalid_patch';

  const keys = Object.keys(patch);
  if (keys.length === 0) return 'empty_patch';
  for (const key of keys) {
    if (!ALLOWED_PATCH_KEYS.includes(key)) return `unknown_key:${key}`;
  }

  if ('meta' in patch) {
    const err = validateMeta(patch.meta);
    if (err) return err;
  }
  if ('attendance' in patch) {
    const err = validateAttendance(patch.attendance);
    if (err) return err;
  }
  if ('games' in patch) {
    const err = validateGames(patch.games);
    if (err) return err;
  }

  return null;
}

// ---------------------------------------------------------------------
// Build the RTDB multi-path update from a validated patch.
// ---------------------------------------------------------------------

function buildUpdates(patch) {
  const updates = {};

  if ('meta' in patch) {
    for (const [key, value] of Object.entries(patch.meta)) {
      updates[`state/meta/${key}`] = value;
    }
  }

  if ('attendance' in patch && patch.attendance.hadir) {
    for (const [kode, value] of Object.entries(patch.attendance.hadir)) {
      // Each key at its own path -- never replace the whole hadir map, so
      // two operators toggling different people can't clobber each other.
      updates[`state/attendance/hadir/${kode}`] = value;
    }
  }

  if ('games' in patch) {
    for (const [gid, doc] of Object.entries(patch.games)) {
      // Wholesale replace of the one game document -- a re-draw must not
      // leave stale winners merged in from the previous draw.
      updates[`state/games/${gid}`] = doc;
    }
  }

  updates['state/rev'] = ServerValue.increment(1);

  return updates;
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    res.setHeader('Cache-Control', 'no-store');

    const auth = checkAuth(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, error: auth.error });
    }

    let rawBody;
    try {
      rawBody = await readBody(req);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        return res.status(413).json({ ok: false, error: 'payload_too_large' });
      }
      console.error('[api/write] error reading request body:', err);
      return res.status(400).json({ ok: false, error: 'invalid_body' });
    }

    if (rawBody.length > MAX_BODY_BYTES) {
      return res.status(413).json({ ok: false, error: 'payload_too_large' });
    }

    let body;
    try {
      const text = rawBody.length === 0 ? '{}' : rawBody.toString('utf8');
      body = JSON.parse(text);
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid_json' });
    }

    if (!isPlainObject(body)) {
      return res.status(400).json({ ok: false, error: 'invalid_body' });
    }

    const patchError = validatePatch(body.patch);
    if (patchError) {
      return res.status(400).json({ ok: false, error: patchError });
    }

    let db;
    try {
      db = getDb();
    } catch (err) {
      console.error('[api/write] firebase admin init failed:', err);
      return res.status(500).json({ ok: false, error: 'server_misconfigured' });
    }

    const updates = buildUpdates(body.patch);

    try {
      await db.ref().update(updates);
      const revSnap = await db.ref('state/rev').once('value');
      const rev = revSnap.val();
      return res.status(200).json({ ok: true, rev });
    } catch (err) {
      console.error('[api/write] RTDB write failed:', err);
      return res.status(500).json({ ok: false, error: 'write_failed' });
    }
  } catch (err) {
    console.error('[api/write] unexpected error:', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
}
