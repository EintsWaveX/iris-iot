import { Readable } from 'node:stream';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

process.env.OPERATOR_TOKEN = 'secret-token-abc';
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'x', client_email: 'a@b.c', private_key: 'k' });
process.env.FIREBASE_DATABASE_URL = 'https://demo.firebasedatabase.app';

const { __calls } = await import('firebase-admin');
const write = (await import('./api/write.js')).default;
const whoami = (await import('./api/whoami.js')).default;
const config = (await import('./api/config.js')).default;

function mkRes() {
  const r = { _status: 200, _json: null, _ended: false };
  r.status = (s) => { r._status = s; return r; };
  r.json = (j) => { r._json = j; r._ended = true; return r; };
  r.send = (t) => { r._json = t; r._ended = true; return r; };
  r.setHeader = () => r;
  r.end = () => { r._ended = true; return r; };
  return r;
}
function mkReq(method, body, { token, query = {} } = {}) {
  const raw = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  const req = Readable.from([Buffer.from(raw, 'utf8')]);
  req.method = method;
  req.headers = { 'content-type': 'application/json' };
  if (raw) req.headers['content-length'] = String(Buffer.byteLength(raw));
  if (token) req.headers['x-operator-token'] = token;
  req.query = query;
  req.body = undefined;
  return req;
}
const T = 'secret-token-abc';
const call = async (h, req) => { const res = mkRes(); await h(req, res); return res; };

console.log('\n=== auth ===');
let r = await call(write, mkReq('POST', { patch: { meta: { phase: 'draw' } } }));
ok(r._status === 401, 'no token -> 401 (got ' + r._status + ')');
r = await call(write, mkReq('POST', { patch: { meta: { phase: 'draw' } } }, { token: 'wrong-length-x' }));
ok(r._status === 403, 'wrong token -> 403 (got ' + r._status + ')');
r = await call(write, mkReq('GET', undefined, { token: T }));
ok(r._status === 405, 'GET -> 405 (got ' + r._status + ')');

console.log('\n=== valid write + paths ===');
__calls.updates.length = 0;
r = await call(write, mkReq('POST', { patch: {
  attendance: { hadir: { NUE: false } },
  games: { g1: { draw: [['A'],['B'],['C'],['D']], sf1: 0, sf2: 2, champion: 0, drawnAt: 123 } },
  meta: { activeGame: 'g1', phase: 'champion' } } }, { token: T }));
ok(r._status === 200, 'valid patch -> 200 (got ' + r._status + ')');
const u = __calls.updates.at(-1)?.update || {};
ok('state/attendance/hadir/NUE' in u, 'attendance written at its own key path');
ok(u['state/attendance/hadir/NUE'] === false, 'attendance value preserved');
ok('state/games/g1' in u && typeof u['state/games/g1'] === 'object', 'game doc replaced wholesale');
ok(u['state/meta/phase'] === 'champion' && u['state/meta/activeGame'] === 'g1', 'meta written per key');
ok(u['state/rev'] && u['state/rev'].__increment === 1, 'rev uses atomic increment');
ok(!Object.keys(u).some(k => !k.startsWith('state/')), 'every path is scoped under state/');

console.log('\n=== validation ===');
const bad = async (patch, label) => {
  const rr = await call(write, mkReq('POST', { patch }, { token: T }));
  ok(rr._status === 400, label + ' -> 400 (got ' + rr._status + ')');
};
await bad({ nope: 1 }, 'unknown top-level key');
await bad({ games: { g9: { draw: [[],[],[],[]] } } }, 'bad game id');
await bad({ games: { g1: { draw: [['A'],['B']] } } }, 'draw with 2 groups');
await bad({ games: { g1: { draw: [['A'],['B'],['C'],['D']], sf1: 9 } } }, 'sf1 out of range');
await bad({ attendance: { hadir: { NUE: 'yes' } } }, 'non-boolean hadir');
await bad({ attendance: { hadir: { 'a/b': true } } }, 'hadir key with slash');
await bad({ meta: { evil: 'x' } }, 'unknown meta key (path-injection guard)');
await bad({ meta: { 'a/b': 'x' } }, 'meta key with slash');
await bad({ meta: { phase: 'nonsense' } }, 'invalid phase value');

r = await call(write, mkReq('POST', '{not json', { token: T }));
ok(r._status === 400, 'malformed JSON -> 400 (got ' + r._status + ')');
r = await call(write, mkReq('POST', { patch: { games: { g1: { draw: [['x'.repeat(300000)],[],[],[]] } } } }, { token: T }));
ok(r._status === 413 || r._status === 400, 'oversized body rejected (got ' + r._status + ')');

console.log('');
console.log('=== reset shape (regression) ===');
// resetGame() on the client sends the default game doc, whose draw/drawnAt are
// null. An earlier validator demanded draw be four arrays and 400'd this, so
// Reset failed silently in the browser: optimistic clear, rejected write, then
// the next snapshot restored the stale draw. Caught by replaying real captured
// client bodies through this handler.
__calls.updates.length = 0;
r = await call(write, mkReq('POST', { patch: { games: { g4: {
  draw: null, sf1: null, sf2: null, champion: null, drawnAt: null } } } }, { token: T }));
ok(r._status === 200, 'reset doc (draw:null, drawnAt:null) accepted (got ' + r._status + ')');
ok('state/games/g4' in (__calls.updates.at(-1)?.update || {}), 'reset replaces the game doc wholesale');
r = await call(write, mkReq('POST', { patch: { games: { g4: { draw: [['A'],['B']] } } } }, { token: T }));
ok(r._status === 400, 'a non-null malformed draw is still rejected (got ' + r._status + ')');

console.log('\n=== meta.celebrate (champion broadcast) ===');
// The champion takeover reaches the other 25 phones through this one field,
// so it is both load-bearing and the widest-blast-radius value in the whole
// document: whatever lands here makes every screen in the room take over.
__calls.updates.length = 0;
r = await call(write, mkReq('POST', { patch: {
  meta: { celebrate: { gameId: 'g2', at: 1717171717171 } } } }, { token: T }));
ok(r._status === 200, 'valid celebrate -> 200 (got ' + r._status + ')');
const cu = __calls.updates.at(-1)?.update || {};
ok('state/meta/celebrate' in cu, 'celebrate written at state/meta/celebrate');
ok(cu['state/meta/celebrate'] && cu['state/meta/celebrate'].gameId === 'g2'
   && cu['state/meta/celebrate'].at === 1717171717171,
   'celebrate stored whole, not flattened into sub-paths');

r = await call(write, mkReq('POST', { patch: { meta: { celebrate: null } } }, { token: T }));
ok(r._status === 200, 'celebrate:null accepted so a reset can clear it (got ' + r._status + ')');

r = await call(write, mkReq('POST', { patch: {
  meta: { celebrate: { gameId: 'g9', at: 1 } } } }, { token: T }));
ok(r._status === 400, 'celebrate with an out-of-range gameId -> 400 (got ' + r._status + ')');

r = await call(write, mkReq('POST', { patch: {
  meta: { celebrate: { gameId: '../../rev', at: 1 } } } }, { token: T }));
ok(r._status === 400, 'celebrate gameId cannot carry a path traversal (got ' + r._status + ')');

r = await call(write, mkReq('POST', { patch: {
  meta: { celebrate: { gameId: 'g1', at: 'now' } } } }, { token: T }));
ok(r._status === 400, 'celebrate at must be a number (got ' + r._status + ')');

r = await call(write, mkReq('POST', { patch: {
  meta: { celebrate: { gameId: 'g1', at: 0 } } } }, { token: T }));
ok(r._status === 400, 'celebrate at must be positive (got ' + r._status + ')');

r = await call(write, mkReq('POST', { patch: {
  meta: { celebrate: { gameId: 'g1', at: 1, holdMs: 999999 } } } }, { token: T }));
ok(r._status === 400, 'an unknown key inside celebrate -> 400 (got ' + r._status + ')');

r = await call(write, mkReq('POST', { patch: { meta: { celebrate: [1, 2] } } }, { token: T }));
ok(r._status === 400, 'celebrate must be an object, not an array (got ' + r._status + ')');

console.log('\n=== whoami / config ===');
r = await call(whoami, mkReq('GET', undefined, { query: {} }));
ok(r._json && r._json.operator === false, 'whoami without token -> false');
r = await call(whoami, mkReq('GET', undefined, { token: T }));
ok(r._json && r._json.operator === true, 'whoami with token -> true');
r = await call(whoami, mkReq('GET', undefined, { query: { op: T } }));
ok(r._json && r._json.operator === true, 'whoami via ?op= -> true');
ok(JSON.stringify(r._json).indexOf(T) === -1, 'whoami never echoes the token back');

r = await call(config, mkReq('GET'));
ok(r._status === 200 && r._json.ok === true && r._json.databaseURL, 'config returns databaseURL');
const savedUrl = process.env.FIREBASE_DATABASE_URL;
delete process.env.FIREBASE_DATABASE_URL;
r = await call(config, mkReq('GET'));
ok(r._status === 200 && r._json.ok === false, 'config unset -> 200 with ok:false (not a 5xx)');
process.env.FIREBASE_DATABASE_URL = savedUrl;

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
export const failed = fail;
