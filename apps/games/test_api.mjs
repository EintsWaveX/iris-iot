/**
 * Offline tests for the Vercel API layer.  Run:  node games/test_api.mjs
 *
 * There is no real Firebase here.  The handlers import the bare specifier
 * "firebase-admin", so the only way to intercept it without a network round
 * trip is Node's own resolution: build a throwaway tree in the OS temp dir
 * containing a stub at node_modules/firebase-admin, copy the handlers beside
 * it, and let resolution find the stub.  The stub records every update() it
 * receives, which is what lets the assertions check the exact RTDB paths.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-api-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

fs.mkdirSync(path.join(TMP, 'api'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'node_modules', 'firebase-admin'), { recursive: true });
for (const f of fs.readdirSync(path.join(HERE, 'api'))) {
  fs.copyFileSync(path.join(HERE, 'api', f), path.join(TMP, 'api', f));
}
fs.writeFileSync(path.join(TMP, 'package.json'), '{"type":"module","private":true}');
// The handler uses firebase-admin's MODULAR subpath exports
// (firebase-admin/app, firebase-admin/database). The old namespace API
// (admin.apps / admin.credential / admin.database) was removed in v13+, so
// the stub must expose the same subpaths the real package does -- otherwise
// this suite passes against a shape production does not have.
fs.writeFileSync(path.join(TMP, 'node_modules', 'firebase-admin', 'package.json'), JSON.stringify({
  name: 'firebase-admin', version: '0.0.0-stub', type: 'module',
  exports: { '.': './index.js', './app': './app.js', './database': './database.js' },
}));
fs.writeFileSync(path.join(TMP, 'node_modules', 'firebase-admin', 'index.js'),
  `export * from './app.js';
export { __calls } from './state.js';
`);
fs.writeFileSync(path.join(TMP, 'node_modules', 'firebase-admin', 'state.js'),
  `export const __calls = { updates: [], initialized: 0, apps: [] };
`);
fs.writeFileSync(path.join(TMP, 'node_modules', 'firebase-admin', 'app.js'), `
import { __calls } from './state.js';
export const getApps = () => __calls.apps;
export const initializeApp = (cfg) => { __calls.apps.push(cfg); __calls.initialized++; return cfg; };
export const cert = (sa) => ({ __sa: sa });
`);
fs.writeFileSync(path.join(TMP, 'node_modules', 'firebase-admin', 'database.js'), `
import { __calls } from './state.js';
export const ServerValue = { increment: (n) => ({ __increment: n }) };
export const getDatabase = () => ({
  ref: (p) => ({
    update: async (u) => { __calls.updates.push({ ref: p, update: u }); },
    once: async () => ({ val: () => 1 }),
  }),
});
`);
fs.copyFileSync(path.join(HERE, '.test_api_cases.mjs'), path.join(TMP, 'cases.mjs'));
const mod = await import(pathToFileURL(path.join(TMP, 'cases.mjs')).href);
process.exit(mod.failed ? 1 : 0);
