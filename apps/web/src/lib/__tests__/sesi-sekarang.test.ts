import { describe, expect, it, vi } from "vitest";
import { sesiSekarang, type SesiSekarang } from "../sesi-sekarang";
import type { SesiNow } from "../app";

const ada = (milikSaya: boolean | null) =>
  ({ ok: true, sesi: { id: 7, modul: 2, milikSaya } as SesiNow }) satisfies SesiSekarang;
const tiada: SesiSekarang = { ok: true, sesi: null };
const tanpaTunggu = () => Promise.resolve();

describe("sesiSekarang", () => {
  it("asks once for a sign-in that did not join a session", async () => {
    const ambil = vi.fn().mockResolvedValue(tiada);
    expect(await sesiSekarang(false, ambil, tanpaTunggu)).toEqual(tiada);
    expect(ambil).toHaveBeenCalledTimes(1);
  });

  it("returns at once when a join sees its own session", async () => {
    const ambil = vi.fn().mockResolvedValue(ada(true));
    const r = await sesiSekarang(true, ambil, tanpaTunggu);
    expect(r.sesi?.milikSaya).toBe(true);
    expect(ambil).toHaveBeenCalledTimes(1);
  });

  it("asks again after a failed first answer (a phone on a slow link)", async () => {
    const ambil = vi.fn().mockRejectedValueOnce(new Error("408")).mockResolvedValue(ada(true));
    const r = await sesiSekarang(true, ambil, tanpaTunggu);
    expect(r.sesi?.milikSaya).toBe(true);
    expect(ambil).toHaveBeenCalledTimes(2);
  });

  it("asks again when the first answer says the session is not theirs yet", async () => {
    const ambil = vi.fn().mockResolvedValueOnce(ada(false)).mockResolvedValue(ada(true));
    const r = await sesiSekarang(true, ambil, tanpaTunggu);
    expect(r.sesi?.milikSaya).toBe(true);
    expect(ambil).toHaveBeenCalledTimes(2);
  });

  it("gives up after three tries and waits a little longer each time", async () => {
    const ambil = vi.fn().mockRejectedValue(new Error("408"));
    const tunggu = vi.fn().mockResolvedValue(undefined);
    expect(await sesiSekarang(true, ambil, tunggu)).toEqual({ ok: false, sesi: null });
    expect(ambil).toHaveBeenCalledTimes(3);
    expect(tunggu.mock.calls.map((c) => c[0])).toEqual([700, 1400]);
  });
});
