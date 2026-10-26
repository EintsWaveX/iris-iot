import { describe, expect, it } from "vitest";
import { newRoomState } from "../recruitment/room";
import type { RoomState } from "../recruitment/exam-types";
import {
  bolehTerimaUjian,
  cekTiketUjian,
  roomPublic,
  ruangUjian,
  saringKirimanUjian,
  saringNaikUjian,
  tandaTiketUjian,
  type PesanUjian,
  type TiketUjian,
} from "../recruitment/room-relay";

/**
 * The exam's relay room (EXAM-ENGINE 6): who may enter, who hears which
 * message, what a seat may send up, and what a seat's copy of the room
 * state leaves out.
 */

const RAHASIA = "r".repeat(40);
const kini = Math.floor(Date.now() / 1000);
const tiket = (o: Partial<TiketUjian> = {}): TiketUjian => ({
  v: 1,
  p: "ujian",
  r: "rec-12",
  peran: "kursi",
  s: 7,
  u: "1101200001",
  exp: kini + 60,
  n: "n".repeat(24),
  ...o,
});

describe("room names", () => {
  it("are rec- plus the room id", () => {
    expect(ruangUjian(12)).toBe("rec-12");
  });
});

describe("room tickets", () => {
  it("open their own room only", async () => {
    const t = await tandaTiketUjian(tiket(), RAHASIA);
    expect((await cekTiketUjian(t, RAHASIA, "rec-12")).ok).toBe(true);
    expect(await cekTiketUjian(t, RAHASIA, "rec-13")).toEqual({ ok: false, kode: "ruang" });
  });

  it("are refused once expired, forged or signed with another secret", async () => {
    const lama = await tandaTiketUjian(tiket({ exp: kini - 1 }), RAHASIA);
    expect(await cekTiketUjian(lama, RAHASIA, "rec-12")).toEqual({
      ok: false,
      kode: "kedaluwarsa",
    });
    const t = await tandaTiketUjian(tiket(), RAHASIA);
    const [body] = t.split(".");
    expect((await cekTiketUjian(`${body}.${"A".repeat(43)}`, RAHASIA, "rec-12")).ok).toBe(false);
    expect((await cekTiketUjian(t, "s".repeat(40), "rec-12")).ok).toBe(false);
  });

  it("refuse a ticket made for the Konsol or session rooms", async () => {
    const t = await tandaTiketUjian(
      tiket({ p: "aliran" } as unknown as Partial<TiketUjian>),
      RAHASIA,
    );
    expect((await cekTiketUjian(t, RAHASIA, "rec-12")).ok).toBe(false);
  });

  it("need a seat id for a seat and none for the Panitia", async () => {
    const bad: Partial<TiketUjian>[] = [
      { peran: "kursi", s: null },
      { peran: "panitia", s: 3 },
      { s: 0 },
      { s: 1.5 },
      { r: "rec-0" },
      { r: "sesi-12" },
      { peran: "x" as TiketUjian["peran"] },
      { n: "short" },
      { u: "" },
    ];
    for (const o of bad) {
      const t = await tandaTiketUjian(tiket(o), RAHASIA);
      const r = await cekTiketUjian(t, RAHASIA, String(o.r ?? "rec-12"));
      expect(r.ok, JSON.stringify(o)).toBe(false);
    }
    const p = await tandaTiketUjian(tiket({ peran: "panitia", s: null }), RAHASIA);
    expect((await cekTiketUjian(p, RAHASIA, "rec-12")).ok).toBe(true);
  });
});

describe("who hears what", () => {
  const m = (j: PesanUjian["j"], s?: number): PesanUjian => ({ j, ...(s ? { s } : {}), d: {} });
  const kursi = { peran: "kursi" as const, s: 7 };
  const panitia = { peran: "panitia" as const, s: null };

  it("gives the Panitia everything", () => {
    for (const j of [
      "ruang",
      "kursi",
      "pelanggaran",
      "catatan",
      "master",
      "kompilasi",
      "antrean",
      "hadir",
      "kemajuan",
    ] as const)
      expect(bolehTerimaUjian(panitia, m(j, 3))).toBe(true);
  });

  it("gives a seat the room and the queue, and its own messages", () => {
    expect(bolehTerimaUjian(kursi, m("ruang"))).toBe(true);
    expect(bolehTerimaUjian(kursi, m("antrean"))).toBe(true);
    expect(bolehTerimaUjian(kursi, m("kursi", 7))).toBe(true);
    expect(bolehTerimaUjian(kursi, m("kompilasi", 7))).toBe(true);
  });

  it("keeps another seat's messages away", () => {
    expect(bolehTerimaUjian(kursi, m("kursi", 8))).toBe(false);
    expect(bolehTerimaUjian(kursi, m("kompilasi", 8))).toBe(false);
    expect(bolehTerimaUjian(kursi, m("kursi"))).toBe(false);
  });

  it("keeps Panitia-only messages from every seat, even with its own number", () => {
    for (const j of ["pelanggaran", "catatan", "master", "hadir", "kemajuan"] as const) {
      expect(bolehTerimaUjian(kursi, m(j, 7)), j).toBe(false);
      expect(bolehTerimaUjian(kursi, m(j)), j).toBe(false);
    }
  });
});

describe("what a seat sends up", () => {
  const kursi = { peran: "kursi" as const, s: 7 };
  const naik = (d: unknown) => JSON.stringify({ j: "kemajuan", d });

  it("stamps progress with the seat from the ticket", () => {
    expect(saringNaikUjian(naik({ part: "logika", answered: 4, total: 15 }), kursi)).toEqual({
      j: "kemajuan",
      s: 7,
      d: { part: "logika", answered: 4, total: 15 },
    });
  });

  it("ignores a seat number the page put in the frame", () => {
    const raw = JSON.stringify({
      j: "kemajuan",
      s: 99,
      d: { part: "fitb", answered: 1, total: 2 },
    });
    expect(saringNaikUjian(raw, kursi)?.s).toBe(7);
  });

  it("takes nothing from the Panitia and nothing but progress from a seat", () => {
    const d = { part: "logika", answered: 1, total: 2 };
    expect(saringNaikUjian(naik(d), { peran: "panitia", s: null })).toBeNull();
    expect(saringNaikUjian(JSON.stringify({ j: "ruang", d }), kursi)).toBeNull();
    expect(saringNaikUjian(JSON.stringify({ j: "master", d: {} }), kursi)).toBeNull();
  });

  it("refuses a malformed or implausible count", () => {
    const bad = [
      { part: "nope", answered: 1, total: 2 },
      { part: "logika", answered: -1, total: 2 },
      { part: "logika", answered: 3, total: 2 },
      { part: "logika", answered: 1.5, total: 2 },
      { part: "logika", answered: 1, total: 500 },
      { part: "logika", answered: "1", total: 2 },
      null,
    ];
    for (const d of bad) expect(saringNaikUjian(naik(d), kursi), JSON.stringify(d)).toBeNull();
    expect(saringNaikUjian("not json", kursi)).toBeNull();
    expect(saringNaikUjian("x".repeat(5000), kursi)).toBeNull();
  });
});

describe("the API's batch", () => {
  it("passes well formed messages", () => {
    const m = saringKirimanUjian({
      m: [
        { j: "ruang", d: { seq: 1 } },
        { j: "kursi", s: 3, d: {} },
      ],
    });
    expect(m).toEqual([
      { j: "ruang", s: null, d: { seq: 1 } },
      { j: "kursi", s: 3, d: {} },
    ]);
  });

  it("refuses an empty, huge, unknown or badly numbered batch", () => {
    expect(saringKirimanUjian({ m: [] })).toBeNull();
    expect(saringKirimanUjian({})).toBeNull();
    expect(
      saringKirimanUjian({ m: Array.from({ length: 101 }, () => ({ j: "ruang", d: 1 })) }),
    ).toBeNull();
    expect(saringKirimanUjian({ m: [{ j: "rahasia", d: 1 }] })).toBeNull();
    expect(saringKirimanUjian({ m: [{ j: "kursi", s: 0, d: 1 }] })).toBeNull();
    expect(saringKirimanUjian({ m: [{ j: "kursi", s: 1.5, d: 1 }] })).toBeNull();
    // Progress only travels up, never down from the API
    expect(saringKirimanUjian({ m: [{ j: "kemajuan", s: 1, d: 1 }] })).toBeNull();
  });
});

describe("the seats' copy of the room state", () => {
  const state = (): RoomState => ({
    ...newRoomState(),
    seq: 5,
    stage: "parts",
    cur: "logika",
    startedAt: 1000,
    master: { nim: "1101200001", since: 900 },
    ask: { nim: "1101200002", at: 950 },
    runs: {
      logika: {
        durMs: 900_000,
        usedMs: 10_000,
        mark: 2000,
        state: "running",
        pausedAt: null,
        extra: { "3": 60_000, "5": 300_000 },
        startedAt: 1000,
        endedAt: null,
        endedBy: null,
        leftAtSkip: 0,
        reopened: 0,
      },
    },
  });

  it("carries the biggest extra time, never the seats' own", () => {
    const p = roomPublic(state(), 5000);
    expect(p.runs.logika?.maxExtraMs).toBe(300_000);
    expect(JSON.stringify(p)).not.toContain('"extra"');
    expect(JSON.stringify(p)).not.toContain("60000");
  });

  it("leaves out who is Master and who asked", () => {
    const p = roomPublic(state(), 5000);
    expect(JSON.stringify(p)).not.toContain("1101200001");
    expect(JSON.stringify(p)).not.toContain("master");
    expect(JSON.stringify(p)).not.toContain("ask");
  });

  it("keeps what the seat's timer needs, with the server clock", () => {
    const p = roomPublic(state(), 5000);
    expect(p).toMatchObject({ seq: 5, stage: "parts", cur: "logika", startedAt: 1000, now: 5000 });
    expect(p.runs.logika).toMatchObject({
      durMs: 900_000,
      usedMs: 10_000,
      mark: 2000,
      state: "running",
    });
  });

  it("ends a part whose time ran out before sending it", () => {
    const s = state();
    s.runs.logika!.usedMs = 890_000;
    s.runs.logika!.mark = 1000;
    s.runs.logika!.extra = {};
    const p = roomPublic(s, 1000 + 10_000);
    expect(p.runs.logika?.state).toBe("ended");
  });
});
