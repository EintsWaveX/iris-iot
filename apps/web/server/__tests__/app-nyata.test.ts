/**
 * Loads every real API handler the way `npm run server` does, once. It
 * catches what the fakes in app.test.ts cannot: a route file whose default
 * export is not a handler, an import that only resolves on Vercel, or a
 * module that needs the environment at import time.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buatApp } from "../app.js";

const AKAR = resolve(__dirname, "..", "..");

describe("the real handlers behind the server", () => {
  it("loads every route and answers /api/sehat and a real API 405", async () => {
    const dist = mkdtempSync(join(tmpdir(), "iris-dist-"));
    writeFileSync(join(dist, "index.html"), "ok");
    try {
      const { server, rute } = await buatApp({ akar: AKAR, dist, config: {} });
      expect(rute.length).toBeGreaterThanOrEqual(12);
      await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      try {
        expect((await fetch(`${base}/api/sehat`)).status).toBe(200);
        // A real handler's own method guard: GET on the sign-in route is refused, not crashed.
        const r = await fetch(`${base}/api/auth/student`);
        expect([401, 404, 405]).toContain(r.status);
        expect(r.headers.get("content-type")).toContain("application/json");
      } finally {
        server.close();
      }
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  }, 60_000);
});
