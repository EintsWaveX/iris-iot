# Konsol PC relay

A Cloudflare Worker with one Durable Object room per approved PC console
(Phase 9 Stage 9). The browser and the PC's bridge both dial in over WSS
with a 60-second, single-use ticket that the IRIS API signs; the room pairs
them and passes their frames through. It stores no frames and no
transcript. See the header of `src/index.ts` for the protocol.

## Local

```sh
npm install
echo "KONSOL_RELAY_SECRET=$(openssl rand -base64 48)" > .dev.vars   # git-ignored
npm run check   # tsc
npm test        # starts `wrangler dev` on :8788 and walks a room through its life
```

For the web rig, run `npx wrangler dev --port 8788 --ip 127.0.0.1` here and
give the API `KONSOL_RELAY_URL=ws://127.0.0.1:8788` plus the same
`KONSOL_RELAY_SECRET`.

## Deploy (once, then on relay changes)

1. `npx wrangler login` with the IRIS Cloudflare account.
2. `npx wrangler secret put KONSOL_RELAY_SECRET` with a fresh random value
   of at least 32 characters (never commit it).
3. `npx wrangler deploy`. Note the URL it prints,
   `https://iris-konsol.<subdomain>.workers.dev`.
4. In the Vercel project (apps/web), set `KONSOL_RELAY_URL` to that origin
   with `wss://` and `KONSOL_RELAY_SECRET` to the same secret.
5. Add the exact `wss://iris-konsol.<subdomain>.workers.dev` origin to
   `connect-src` in `apps/web/vercel.json`. Without it the browser's CSP
   blocks the console.
6. On the PC, rerun the agent installer with the relay it may dial:
   `sudo ./agent/install.sh --konsol-relay wss://iris-konsol.<subdomain>.workers.dev`
   (IRIS ASO `pc/`). It installs `konsol_bridge.py`,
   `iris-konsol@.service` and the exact sudoers lines. The bridge only dials
   out, so no port opens on the PC.
