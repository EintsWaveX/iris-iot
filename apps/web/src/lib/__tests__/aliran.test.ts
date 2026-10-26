import { describe, expect, it } from "vitest";
import {
  bolehTerima,
  cekTiketAliran,
  saringKiriman,
  saringNaik,
  tandaTiketAliran,
  type TiketAliran,
} from "../aliran";

/**
 * Session streams (Phase 12): who may enter a room, who sees which message,
 * and what a page may send up.
 */

const RAHASIA = "r".repeat(40);
const kini = Math.floor(Date.now() / 1000);
const tiket = (o: Partial<TiketAliran> = {}): TiketAliran => ({
  v: 1,
  p: "aliran",
  r: "sesi-12",
  peran: "praktikan",
  g: 2,
  u: "1101200001",
  exp: kini + 60,
  n: "n".repeat(24),
  ...o,
});

// ---------- Tickets ----------
// ---------- Tickets ----------
// ---------- Tickets ----------

describe("room tickets", () => {
  it("open their own room only", async () => {
    const t = await tandaTiketAliran(tiket(), RAHASIA);
    expect((await cekTiketAliran(t, RAHASIA, "sesi-12")).ok).toBe(true);
    expect(await cekTiketAliran(t, RAHASIA, "sesi-13")).toEqual({ ok: false, kode: "ruang" });
  });

  it("are refused once expired, forged or signed with another secret", async () => {
    const lama = await tandaTiketAliran(tiket({ exp: kini - 1 }), RAHASIA);
    expect(await cekTiketAliran(lama, RAHASIA, "sesi-12")).toEqual({
      ok: false,
      kode: "kedaluwarsa",
    });
    const t = await tandaTiketAliran(tiket(), RAHASIA);
    const [body] = t.split(".");
    const palsu = `${body}.${"A".repeat(43)}`;
    expect((await cekTiketAliran(palsu, RAHASIA, "sesi-12")).ok).toBe(false);
    expect((await cekTiketAliran(t, "s".repeat(40), "sesi-12")).ok).toBe(false);
  });

  it("keep Praktikan out of the pc room", async () => {
    const t = await tandaTiketAliran(tiket({ r: "pc", g: null }), RAHASIA);
    expect(await cekTiketAliran(t, RAHASIA, "pc")).toEqual({ ok: false, kode: "ruang" });
    const a = await tandaTiketAliran(tiket({ r: "pc", peran: "asisten", g: null }), RAHASIA);
    expect((await cekTiketAliran(a, RAHASIA, "pc")).ok).toBe(true);
  });

  it("refuse a strange room or group", async () => {
    for (const o of [{ r: "sesi-0" }, { r: "konsol" }, { g: 0 }, { g: 2.5 }, { n: "short" }]) {
      const t = await tandaTiketAliran(tiket(o as Partial<TiketAliran>), RAHASIA);
      expect((await cekTiketAliran(t, RAHASIA, String(o.r ?? "sesi-12"))).ok).toBe(false);
    }
  });
});

// ---------- Who Sees What ----------
// ---------- Who Sees What ----------
// ---------- Who Sees What ----------

describe("who sees what", () => {
  const asisten = { peran: "asisten" as const, g: null };
  const g2 = { peran: "praktikan" as const, g: 2 };

  it("an Asisten sees every group and the PC", () => {
    for (const j of ["tel", "serial", "jawaban", "petunjuk", "denyut"] as const)
      expect(bolehTerima(asisten, { j, g: 3, d: null })).toBe(true);
  });

  it("a Praktikan sees telemetry of any group, the rest of their own group only", () => {
    expect(bolehTerima(g2, { j: "tel", g: 3, d: null })).toBe(true);
    for (const j of ["serial", "jawaban", "petunjuk"] as const) {
      expect(bolehTerima(g2, { j, g: 2, d: null })).toBe(true);
      expect(bolehTerima(g2, { j, g: 3, d: null })).toBe(false);
      expect(bolehTerima(g2, { j, g: null, d: null })).toBe(false);
    }
    expect(bolehTerima(g2, { j: "denyut", g: null, d: null })).toBe(false);
  });
});

// ---------- Sent Up ----------
// ---------- Sent Up ----------
// ---------- Sent Up ----------

describe("what a page sends up", () => {
  const g2 = { peran: "praktikan" as const, g: 2 };

  it("takes the group from the ticket, never the message", () => {
    const m = saringNaik(
      JSON.stringify({ j: "serial", g: 5, d: [{ sumber: "b1", teks: "x", t: 5 }] }),
      g2,
    );
    expect(m).toEqual({ j: "serial", g: 2, d: [{ sumber: "b1", teks: "x", t: 5 }] });
  });

  it("keeps only well formed readings", () => {
    const m = saringNaik(
      JSON.stringify({
        j: "tel",
        d: [
          { tx: "10:00:00:000", rx: "10:00:00:040", delayMs: 40, nilai: { suhu: 30, "<x>": 1 } },
          { tx: "bad", rx: null },
          { tx: "10:00:01:000", rx: null, delayMs: 999 },
        ],
      }),
      g2,
    );
    expect(m?.d).toEqual([
      { seq: 0, tx: "10:00:00:000", rx: "10:00:00:040", delayMs: 40, nilai: { suhu: 30 } },
      { seq: 0, tx: "10:00:01:000", rx: null, delayMs: null, nilai: null },
    ]);
  });

  it("refuses what a page may not send", () => {
    const asisten = { peran: "asisten" as const, g: null };
    const baris = JSON.stringify({ j: "serial", d: [{ sumber: "b0", teks: "x", t: 1 }] });
    expect(saringNaik(baris, asisten)).toBeNull();
    expect(saringNaik(JSON.stringify({ j: "jawaban", d: [{ benar: true }] }), g2)).toBeNull();
    expect(saringNaik("x".repeat(20_000), g2)).toBeNull();
    expect(saringNaik("not json", g2)).toBeNull();
  });
});

describe("the API's batch", () => {
  it("names known kinds and plain groups only", () => {
    expect(saringKiriman({ m: [{ j: "jawaban", g: 1, d: { benar: true } }] })).toHaveLength(1);
    expect(saringKiriman({ m: [{ j: "tangan", g: 1, d: { naik: true } }] })).toBeNull();
    expect(saringKiriman({ m: [{ j: "kunci", g: 1, d: {} }] })).toBeNull();
    expect(saringKiriman({ m: [{ j: "tel", g: "1", d: [] }] })).toBeNull();
    expect(saringKiriman({ m: [] })).toBeNull();
  });
});
