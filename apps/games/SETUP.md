<!--
  Security model, read this before you touch anything below.

  /state is world-readable by design. It holds group names and bracket
  results (who's checked in, which teams drew which slot, who won) —
  nothing sensitive. No phone numbers, no student IDs, nothing PII. That's
  the entire point of the architecture: 25 phones can stream it for hours
  over Firebase's REST streaming API with zero Vercel function invocations.

  /state is NOT publicly writable. RTDB rules set ".write": false. The
  only way data changes is the Admin SDK inside games/api/write.js, which
  bypasses RTDB rules entirely and is itself gated behind OPERATOR_TOKEN.
  There is no client-side path to a write, no matter what a browser sends
  straight to Firebase.
-->

# Setup: Arena Asisten IRIS deployment

For someone who has never touched Firebase or Vercel before. Follow in order.

## LIVE — deployed 2026-09-03

| | |
|---|---|
| **Everyone (25 phones)** | `https://arena-iris.vercel.app` |
| **Operator (you)** | `https://arena-iris.vercel.app/?op=<OPERATOR_TOKEN>` (see `.env.local`) |

Verified end to end on the live deployment: operator writes propagate to a
separate spectator browser in ~200 ms, spectators auto-follow whichever game
the operator opens, spectator controls are inert, and the console is clean on
both sides.

**Redeploying after a code change:**
```bash
cd games && python build.py --standalone && vsafe --prod --yes
```
`arena-iris.vercel.app` is the project's production alias and is
re-pointed automatically by every `--prod` deploy; nothing extra to do.

**About the URL.** The project was renamed to `arena-iris` in the Vercel
dashboard, so the public production alias is `arena-iris.vercel.app`. The
previous `games-beige-one.vercel.app` is dead (404) -- a rename does not leave
a redirect behind, so any link shared before the rename must be re-sent.

Do NOT create a prettier alias by hand with `vercel alias set`. Vercel's
Deployment Protection SSO-gates deployment-specific URLs and manual aliases:
they return a Vercel login page instead of the app, which would lock out every
player. Only the project's own production alias is public, and it follows the
project name.

**`vsafe`, not `vercel`.** This machine is named `Eints決勝の空―Nue`. Vercel's
CLI puts the hostname in an HTTP header, which is latin-1 only, so plain
`vercel login` dies with a ByteString error. `vsafe` is a wrapper that
substitutes an ASCII hostname for that process only. To remove it, delete
`~/.vercel-hostname-patch.cjs` and `vsafe`/`vsafe.cmd` from the npm bin.

---

## 0. Your actual values (project `iris-bracket`, verified 2026-09-03)

The database is already created and its rules are already correct. Verified
live from this machine: a public read returns `200 null`, an unauthenticated
write returns `401 Permission denied`, and the SSE streaming endpoint returns
a well-formed `event: put` frame with the right CORS header for a
`*.vercel.app` origin. Nothing further is needed on the Firebase side except
the service-account key in step 3.

```
FIREBASE_DATABASE_URL = https://iris-bracket-default-rtdb.asia-southeast1.firebasedatabase.app
OPERATOR_TOKEN        = (see games/.env.local -- generated, gitignored)
FIREBASE_SERVICE_ACCOUNT = (step 3 below -- the only real secret)
```

Steps 1, 2, 4 and 5 are therefore already done. Go to step 3, then step 6.

### Do NOT install the Firebase JS SDK

The Firebase console will hand you an `npm install firebase` snippet with an
`initializeApp({apiKey, authDomain, ...})` config. Ignore all of it. This app
reads the database through the browser's built-in `EventSource` against the
REST streaming endpoint, so it needs no SDK, no bundler and no build step --
the page ships as one inline HTML file. Of that whole config object only
`databaseURL` is used, and `/api/config` serves it to the page at runtime.
`npm install -g firebase-tools` is likewise unnecessary; that is the Firebase
Hosting CLI and deployment here goes through Vercel.

The web `apiKey` in that snippet is a public identifier, not a credential --
it is safe in client code and we simply do not use it. The service-account
JSON from step 3 is the actual secret: it never belongs in the repo, in the
page, or in a chat message.

---

## 1. Create the Firebase project + Realtime Database

1. Go to https://console.firebase.google.com → **Add project** → name it, finish the wizard.
2. In the left sidebar: **Build → Realtime Database** (NOT **Firestore Database** —
   they are two different products in the same sidebar, and Firestore is the
   one Firebase pushes by default. Picking Firestore here is the single most
   common mistake when following this guide. You specifically want the item
   literally labeled **Realtime Database**.)
3. Click **Create Database**.
4. Pick a region close to your event (e.g. `asia-southeast1` for Indonesia).
5. Start mode: choose **Start in locked mode**. (You'll paste real rules in step 2 anyway — locked mode just means nothing can read or write until you do.)

## 2. Paste the security rules

1. In Realtime Database, open the **Rules** tab.
2. Replace the contents with everything in [`firebase-rules.json`](./firebase-rules.json) from this repo.
3. Click **Publish**.

## 3. Generate the service account key

1. Click the gear icon → **Project settings** → **Service accounts** tab.
2. Click **Generate new private key** → confirm. A JSON file downloads.
3. Open that file, copy its *entire* contents as one blob of text (whitespace doesn't matter) — this is your `FIREBASE_SERVICE_ACCOUNT` value.
4. **Do not commit this file.** `.gitignore` in this folder already excludes common service-account filenames, but don't rely on that — just don't put it in the repo at all.

## 4. Get the database URL

1. Back in Realtime Database → **Data** tab, copy the URL shown at the top. It looks like:
   `https://<project-id>-default-rtdb.<region>.firebasedatabase.app`
2. This is your `FIREBASE_DATABASE_URL` value.

## 5. Generate an operator token

Run locally:

```bash
node -e "console.log(require('crypto').randomBytes(16).toString('base64url'))"
```

Copy the output. This is your `OPERATOR_TOKEN` value. Keep it — you'll type it into a URL on event night, nothing more.

## 6. Deploy to Vercel

```bash
cd games
npx vercel --prod
```

This creates the project and does a first deploy (writes will 500 until env vars are set — that's expected, keep going).

Set the three environment variables, either:

**Dashboard:** Vercel project → **Settings → Environment Variables** → add each of
`FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_DATABASE_URL`, `OPERATOR_TOKEN` for the **Production** environment.

**Or CLI:**

```bash
npx vercel env add FIREBASE_SERVICE_ACCOUNT production
npx vercel env add FIREBASE_DATABASE_URL production
npx vercel env add OPERATOR_TOKEN production
```

(When pasting `FIREBASE_SERVICE_ACCOUNT`, paste the whole JSON file contents as a single line. If your paste path mangles newlines inside the private key field, base64-encode the file first — `write.js` accepts either raw JSON or base64.)

**Then redeploy:**

```bash
npx vercel --prod
```

Env vars added *after* a deploy do **not** apply retroactively to that deploy — this trips people up constantly. You must redeploy once more after setting them, every time you add or change one.

## 7. Opening the app

- **Operator (you):** `https://<your-app>.vercel.app/?op=<OPERATOR_TOKEN>`
- **Everyone else (the ~25 phones):** `https://<your-app>.vercel.app/` — no token, read-only view.

## 8. Troubleshooting

**Blank page.**
Open browser dev tools → Console. Almost always a JS error in the prebuilt `public/index.html` bundle, unrelated to this deploy layer — check that `games/build.py --standalone` was run and `public/index.html` was committed.

**`{"ok":false,"error":"not_configured"}` from `/api/config`.**
`FIREBASE_DATABASE_URL` isn't set in this environment, or you forgot to redeploy after setting it (see step 6). The app itself treats this as "offline mode," not an error — but you still need it fixed for the live event.

**403 on write.**
The token in the URL / sent by the client doesn't match `OPERATOR_TOKEN` on the server. Re-copy the token from step 5 — check for trailing spaces or a truncated copy-paste. A 401 instead of 403 means no token was sent at all (missing `?op=` or header).

**EventSource not connecting / phones show stale data.**
1. Confirm the rules from `firebase-rules.json` were actually published (step 2) — `.read` must be `true` at `/state`.
2. Open `<databaseURL>/state.json` directly in a browser; you should get JSON back, not a permission error.
3. Check the browser console for a blocked-by-client / ad-blocker error — some aggressive ad blockers flag `EventSource` streams to `*.firebaseio.com` as tracking.
