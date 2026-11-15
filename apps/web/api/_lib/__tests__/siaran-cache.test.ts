import { describe, expect, it, vi } from "vitest";

vi.mock("../aliran.js", () => ({
  ambilAntre: () => [],
  kirimRelay: vi.fn(async () => {}),
}));

import { cacheTunggal } from "../../../src/lib/cache-tunggal.js";
import { denganSiaran, siarkan } from "../siaran.js";
import type { ApiRequest, ApiResponse } from "../http.js";

function bikin(metode: string) {
  const dikirim: unknown[] = [];
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader: () => {},
    status(this: { statusCode: number }, k: number) {
      this.statusCode = k;
      return this;
    },
    json(b: unknown) {
      dikirim.push(b);
    },
  } as unknown as ApiResponse;
  return { req: { method: metode, query: { aksi: "x" } } as unknown as ApiRequest, res, dikirim };
}

describe("a write drops the server's caches before the answer leaves", () => {
  it("drops them when the handler answers, so the refetch cannot meet a copy from before", async () => {
    let n = 0;
    const c = cacheTunggal(async () => ++n);
    c.atur(60_000);
    await c.ambil();
    let isiSaatJawab = -1;
    const { req, res } = bikin("POST");
    const h = denganSiaran("api/ujicoba/[aksi]", async (_rq, rs) => {
      rs.json({ ok: true });
      // The cache was already dropped when json() ran: the next read loads fresh.
      isiSaatJawab = await c.ambil();
    });
    await h(req, res);
    expect(isiSaatJawab).toBe(2);
  });

  it("leaves the caches alone for a read", async () => {
    let n = 0;
    const c = cacheTunggal(async () => ++n);
    c.atur(60_000);
    await c.ambil();
    const { req, res } = bikin("GET");
    await denganSiaran("api/ujicoba/[aksi]", async (_rq, rs) => rs.json({ ok: true }))(req, res);
    expect(await c.ambil()).toBe(1);
  });

  it("siarkan() drops them too (writes that announce by hand, like the PC heartbeat)", async () => {
    let n = 0;
    const c = cacheTunggal(async () => ++n);
    c.atur(60_000);
    await c.ambil();
    await siarkan(["sesi"]);
    expect(await c.ambil()).toBe(2);
  });
});
