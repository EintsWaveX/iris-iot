import { describe, expect, it } from "vitest";
import {
  acakId,
  bolehKonsol,
  bolehSetujui,
  istimewaKonsol,
  cekTiket,
  sisaDetikKonsol,
  statusEfektif,
  tandaTiket,
  targetBuka,
  type Tiket,
} from "../konsol";

const SECRET = "uji-".repeat(10);
const now = Math.floor(Date.now() / 1000);
const base = (p: Tiket["p"]): Tiket => ({
  v: 1,
  p,
  k: acakId(),
  s: 1,
  u: p === "web" ? "1101200001" : "",
  t: "terminal",
  exp: now + 60,
  end: now + 3600,
  n: acakId(),
});

describe("Konsol PC rights", () => {
  it("only DEV or the Pencipta may open it", () => {
    expect(bolehKonsol({ status: "aktif" })).toBe(true);
    expect(bolehKonsol({})).toBe(true);
    expect(bolehKonsol({ status: "cuti" })).toBe(false);
  });
  it("the Pencipta, the Inti and DEV need no approver", () => {
    expect(istimewaKonsol({ badges: ["dev"] })).toBe(true);
    expect(istimewaKonsol({ badges: ["pencipta"] })).toBe(true);
    expect(istimewaKonsol({ badges: [], tier: "admin" })).toBe(true);
    expect(istimewaKonsol({ badges: [], tier: "pengelola" })).toBe(false);
    expect(istimewaKonsol({ badges: [] })).toBe(false);
  });
  it("one of them approves, never the asker", () => {
    expect(bolehSetujui({ nim: "a", badges: ["dev"] }, { nim: "b" })).toBe(true);
    expect(bolehSetujui({ nim: "a", badges: [], tier: "admin" }, { nim: "b" })).toBe(true);
    expect(bolehSetujui({ nim: "a", badges: ["dev"] }, { nim: "a" })).toBe(false);
    expect(bolehSetujui({ nim: "a", badges: [] }, { nim: "b" })).toBe(false);
  });
  it("opens the terminal or the PC's own screen, never a virtual desktop", () => {
    expect(targetBuka("terminal")).toBe(true);
    expect(targetBuka(":0")).toBe(true);
    expect(targetBuka(":1")).toBe(false);
    expect(targetBuka("x0")).toBe(false);
  });
});

describe("Konsol PC time", () => {
  const t0 = new Date("2026-10-04T10:00:00Z").getTime();
  it("an unanswered request expires after 10 minutes", () => {
    const r = { status: "diminta" as const, dimintaPada: new Date(t0) };
    expect(statusEfektif(r, t0 + 9 * 60_000)).toBe("diminta");
    expect(statusEfektif(r, t0 + 11 * 60_000)).toBe("kedaluwarsa");
  });
  it("an open console is over after 60 minutes", () => {
    const r = { status: "aktif" as const, dimintaPada: new Date(t0), mulai: new Date(t0) };
    expect(statusEfektif(r, t0 + 59 * 60_000)).toBe("aktif");
    expect(statusEfektif(r, t0 + 61 * 60_000)).toBe("selesai");
    expect(sisaDetikKonsol(r, t0 + 30 * 60_000)).toBe(1800);
  });
  it("approved but never opened runs out with the request window", () => {
    const r = {
      status: "disetujui" as const,
      dimintaPada: new Date(t0),
      disetujuiPada: new Date(t0),
    };
    expect(statusEfektif(r, t0 + 11 * 60_000)).toBe("kedaluwarsa");
  });
});

describe("Konsol PC tickets", () => {
  it("a signed ticket checks out for its own end only", async () => {
    const t = base("web");
    const tok = await tandaTiket(t, SECRET);
    const ok = await cekTiket(tok, SECRET, "web");
    expect(ok.ok && ok.tiket.k).toBe(t.k);
    expect(await cekTiket(tok, SECRET, "pc")).toEqual({ ok: false, kode: "peran" });
  });
  it("refuses a wrong secret, a changed body and an expired ticket", async () => {
    const tok = await tandaTiket(base("pc"), SECRET);
    expect((await cekTiket(tok, "lain-".repeat(10), "pc")).ok).toBe(false);
    const [body, sig] = tok.split(".");
    const forged = `${body.slice(0, -2)}AA.${sig}`;
    expect((await cekTiket(forged, SECRET, "pc")).ok).toBe(false);
    expect(await cekTiket(tok, SECRET, "pc", now + 61)).toEqual({ ok: false, kode: "kedaluwarsa" });
    expect(await cekTiket("bukan-tiket", SECRET, "pc")).toEqual({ ok: false, kode: "format" });
  });
  it("won't sign with a short secret", async () => {
    await expect(tandaTiket(base("web"), "pendek")).rejects.toThrow();
  });
});
