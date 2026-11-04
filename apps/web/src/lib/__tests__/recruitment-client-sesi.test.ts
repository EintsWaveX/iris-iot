import { afterEach, describe, expect, it, vi } from "vitest";
import { REC_SESI_HABIS, recGet } from "../recruitment/client";

function jawab(status: number, body: Record<string, unknown>) {
  return vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
}

describe("a session that is gone", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tells the page on a 401 belum_masuk, and still returns the refusal", async () => {
    const win = new EventTarget();
    const heard = vi.fn();
    win.addEventListener(REC_SESI_HABIS, heard);
    vi.stubGlobal("window", win);
    vi.stubGlobal("fetch", jawab(401, { ok: false, kode: "belum_masuk" }));
    const r = await recGet("candidates");
    expect(r).toMatchObject({ ok: false, kode: "belum_masuk", status: 401 });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("stays quiet for other refusals, including belum_masuk with another status", async () => {
    const win = new EventTarget();
    const heard = vi.fn();
    win.addEventListener(REC_SESI_HABIS, heard);
    vi.stubGlobal("window", win);
    vi.stubGlobal("fetch", jawab(403, { ok: false, kode: "belum_masuk" }));
    await recGet("candidates");
    vi.stubGlobal("fetch", jawab(403, { ok: false, kode: "tanpa_hak" }));
    await recGet("candidates");
    expect(heard).not.toHaveBeenCalled();
  });

  it("does not break outside a browser", async () => {
    vi.stubGlobal("fetch", jawab(401, { ok: false, kode: "belum_masuk" }));
    const r = await recGet("candidates");
    expect(r).toMatchObject({ ok: false, kode: "belum_masuk", status: 401 });
  });
});
