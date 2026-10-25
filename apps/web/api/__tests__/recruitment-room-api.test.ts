/**
 * /api/recruitment, S3: exam rooms and the Master console (prompt 11). The
 * database is a fake keyed by table, like recruitment-s2-api.test.ts. What
 * the SQL itself must do (the `seq` guard that lets one of two racing writers
 * win, the room row lock) is proved on the rig by rec_room_api.mjs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  asisten,
  recAnswer,
  recCandidate,
  recEdition,
  recExamConfig,
  recExamLog,
  recExamRoom,
  recExamSeat,
  recKitLoan,
  recQuestion,
  recSeatNote,
  recSlot,
  recSlotAssignment,
  recSlotExaminer,
  recStrike,
} from "../../src/lib/schema";
import { newRoomState } from "../../src/lib/recruitment/room";
import type { RoomState } from "../../src/lib/recruitment/exam-types";
import { DEFAULT_EXAM_CONFIG } from "../../src/lib/recruitment/exam-types";
import { cekTiketUjian } from "../../src/lib/recruitment/room-relay";

process.env.SESSION_SECRET = "x".repeat(40);

type Rows = Record<string, unknown[] | ((sel: unknown) => unknown[])>;
const nama = new Map<unknown, string>([
  [asisten, "asisten"],
  [recAnswer, "answer"],
  [recCandidate, "candidate"],
  [recEdition, "edition"],
  [recExamConfig, "config"],
  [recExamLog, "log"],
  [recExamRoom, "room"],
  [recExamSeat, "seat"],
  [recKitLoan, "kit"],
  [recQuestion, "question"],
  [recSeatNote, "note"],
  [recSlot, "slot"],
  [recSlotAssignment, "assignment"],
  [recSlotExaminer, "examiner"],
  [recStrike, "strike"],
]);

let rows: Rows = {};
let kalah = 0;
const tulis: { op: string; tabel: string; nilai?: unknown }[] = [];

function chain(sel?: unknown): unknown {
  let tabel = "";
  const p: Record<string, unknown> = {};
  for (const m of ["where", "orderBy", "limit", "innerJoin", "leftJoin", "groupBy", "for"])
    p[m] = () => p;
  p.from = (t: unknown) => {
    tabel = nama.get(t) ?? "";
    return p;
  };
  p.then = (ok: (v: unknown) => unknown) => {
    const r = rows[tabel];
    return ok(typeof r === "function" ? r(sel) : (r ?? []));
  };
  return p;
}

function tulisan(op: string, t: unknown) {
  const tabel = nama.get(t) ?? "";
  const p: Record<string, unknown> = {};
  for (const m of ["where", "onConflictDoUpdate", "onConflictDoNothing", "for"]) p[m] = () => p;
  let terakhir: unknown = null;
  p.values = (nilai: unknown) => {
    tulis.push({ op, tabel, nilai });
    terakhir = nilai;
    return p;
  };
  p.set = (nilai: unknown) => {
    tulis.push({ op, tabel, nilai });
    return p;
  };
  p.returning = () => p;
  p.then = (ok: (v: unknown) => unknown) => {
    // Another writer got there first: the version guard matches nothing.
    if (op === "update" && tabel === "room" && kalah > 0) {
      kalah--;
      return ok([]);
    }
    if (op === "delete" && !tulis.some((w) => w.tabel === tabel && w.op === op))
      tulis.push({ op, tabel });
    // A new row comes back with an id, like the database's RETURNING.
    if (op === "insert" && terakhir && !Array.isArray(terakhir))
      return ok([{ id: 99, ...(terakhir as object) }]);
    const r = rows[tabel];
    return ok(typeof r === "function" ? r(undefined) : (r ?? []));
  };
  return p;
}

vi.mock("../../src/lib/db", () => {
  const db = {
    select: (sel?: unknown) => chain(sel),
    insert: (t: unknown) => tulisan("insert", t),
    update: (t: unknown) => tulisan("update", t),
    delete: (t: unknown) => tulisan("delete", t),
    transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { getDb: () => db };
});
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async () => undefined,
}));

interface Pelaku {
  orang: { status: string; badges: string[] };
  kursi: null;
  hak: Record<string, boolean>;
  penuh: boolean;
}
const SEMUA_TIDAK = {
  calendar: false,
  board: false,
  seatKetua: false,
  candidates: true,
  documents: false,
  approve: false,
  bank: false,
  plotting: false,
  plotPengawas: false,
  cuttingPropose: false,
  cuttingLock: false,
  attendance: false,
  kitLoans: false,
  accept: false,
};
const pelaku = (hak: Record<string, boolean> = {}, penuh = false): Pelaku => ({
  orang: { status: "aktif", badges: [] },
  kursi: null,
  hak: { ...SEMUA_TIDAK, ...hak },
  penuh,
});
let pelakuNim: Record<string, Pelaku | null> = {};
vi.mock("../_lib/recruitment-rights", () => ({
  muatPelaku: async (_db: unknown, _e: number, nim: string) => pelakuNim[nim] ?? null,
}));
vi.mock("../_lib/hak", () => ({
  muatOrang: async (nim: string) =>
    orangNim[nim] ?? { nim, nama: nim, status: "aktif", badges: [], tier: "asisten" },
}));
let orangNim: Record<string, { nim: string; nama: string; status: string; badges: string[] }> = {};

const {
  handleRoom,
  susunHotspot,
  bacaAksi,
  cekPapan,
  sinkronKursi,
  simpanHotspotKursi,
  antreUjian,
} = await import("../_lib/recruitment-room");
const { ambilAntre } = await import("../_lib/aliran");

const EDISI = { id: 1, year: 2026, title: "Open Recruitment Asisten IRIS 2026", status: "live" };
const sesi = (nim: string) => ({ role: "asisten" as const, nim, nama: nim, exp: 9e9 });
const PENGAWAS = [
  { nim: "N1", nama: "Ani", status: "aktif", badges: [] as string[] },
  { nim: "N2", nama: "Budi", status: "aktif", badges: [] as string[] },
  { nim: "PEN", nama: "Pencipta", status: "aktif", badges: ["pencipta"] },
];

let state: RoomState;
const kamar = (o: Record<string, unknown> = {}) => ({
  id: 7,
  editionId: 1,
  slotId: 3,
  title: "Ruang A",
  rehearsal: false,
  state,
  masterSeenAt: null as Date | null,
  topicNext: 0,
  hotspots: [] as unknown[],
  createdBy: "X",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...o,
});
const SLOT = () => ({
  id: 3,
  editionId: 1,
  stage: "tes_tulis",
  eventId: 5,
  room: "Lab IoT",
  startsAt: new Date(),
  endsAt: new Date(Date.now() + 3 * 3600_000),
  capacity: 35,
});
const SIAP = [
  { part: "logika", lang: "cpp", n: 20 },
  { part: "logika", lang: "py", n: 10 },
  { part: "fitb", lang: "cpp", n: 20 },
  { part: "fitb", lang: "py", n: 10 },
  { part: "kodingan", lang: "cpp", n: 10 },
  { part: "kodingan", lang: "py", n: 10 },
  { part: "mikro", lang: "cpp", n: 6 },
  { part: "mikro", lang: "py", n: 6 },
];
const SEAT_MASUK = (id: number, candidateId: number) => ({
  id,
  editionId: 1,
  roomId: 7,
  candidateId,
  rehearsal: false,
  checkin: { fullscreen: 1, connection: { at: 1 }, name: 1 },
  draw: {},
  done: {},
  tab: null,
  tabAt: null,
  createdAt: new Date(),
  lastSeenAt: null,
});

function jalan(
  aksi: string,
  nim: string,
  body: Record<string, unknown> | null,
  query: Record<string, string> = {},
) {
  const out: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader: () => undefined,
    status(n: number) {
      out.status = n;
      return res;
    },
    json(b: Record<string, unknown>) {
      out.body = b;
    },
  };
  const req = {
    method: body === null ? "GET" : "POST",
    query: { aksi, ...query },
    headers: {},
    body: body ?? {},
  };
  return handleRoom(req as never, res as never, sesi(nim) as never).then(() => ({
    ...out,
    antre: ambilAntre(res as never),
  }));
}

beforeEach(() => {
  state = { ...newRoomState(), stage: "prep" };
  kalah = 0;
  tulis.length = 0;
  orangNim = {};
  pelakuNim = {
    N1: pelaku(),
    N2: pelaku(),
    PEN: pelaku(),
    AKD: pelaku({ plotPengawas: true, bank: true }),
  };
  rows = {
    edition: [EDISI],
    room: (sel) => (sel ? [{ room: kamar(), slot: SLOT() }] : [kamar()]),
    slot: [SLOT()],
    examiner: PENGAWAS,
    asisten: PENGAWAS,
    config: [{ config: DEFAULT_EXAM_CONFIG }],
    question: SIAP,
    seat: [SEAT_MASUK(11, 101)],
    assignment: [{ candidateId: 101, slotId: 3, n: 1 }],
    candidate: [{ id: 101, nim: "1101200001", nama: "Dina" }],
  };
});

/* ------------------------------------------------------------------ pure */

describe("hotspots as typed", () => {
  const baru = () => "h-baru";
  it("seals the password and never keeps it in plain text", () => {
    const r = susunHotspot(
      7,
      [],
      [{ owner: "NUE", ssid: "Pixel", pass: "kata-sandi", cap: 8 }],
      [],
      baru,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0].id).toBe("h-baru");
    expect(r.value[0].pass).not.toContain("kata-sandi");
    expect(r.value[0].pass.startsWith("g1.")).toBe(true);
  });
  it("makes an id the id rule accepts, whatever the random bytes are", () => {
    // base64url carries "_", which the id rule refuses: it failed about one in eleven
    for (let i = 0; i < 400; i++) {
      const r = susunHotspot(
        7,
        [],
        [{ owner: "NUE", ssid: "Pixel", pass: "kata-sandi", cap: 8 }],
        [],
      );
      expect(r.ok).toBe(true);
    }
  });
  it("keeps the stored password when none is sent", () => {
    const lama = [{ id: "a", owner: "NUE", ssid: "Lama", pass: "g1.tersimpan", cap: 8 }];
    const r = susunHotspot(7, lama, [{ id: "a", owner: "NUE", ssid: "Baru", cap: 4 }], [], baru);
    expect(r.ok && r.value[0]).toMatchObject({ ssid: "Baru", pass: "g1.tersimpan", cap: 4 });
  });
  it("needs a password for a new phone", () => {
    const r = susunHotspot(7, [], [{ owner: "NUE", ssid: "Pixel", cap: 8 }], [], baru);
    expect(r).toMatchObject({ ok: false, kode: "sandi_salah" });
  });
  it("leaves a row a candidate typed exactly as they typed it", () => {
    const cand = {
      id: "kursi-11",
      owner: { seat: 11 },
      ssid: "HP Dina",
      pass: "g1.dina",
      cap: 0,
      by: "cand" as const,
    };
    const r = susunHotspot(
      7,
      [cand],
      [{ owner: { seat: 11 }, ssid: "diubah", pass: "kata-sandi-baru" }],
      [11],
      baru,
    );
    expect(r.ok && r.value[0]).toEqual(cand);
  });
  it("drops a row left out, and refuses a seat that is not in the room", () => {
    const cand = {
      id: "kursi-11",
      owner: { seat: 11 },
      ssid: "HP",
      pass: "g1.x",
      cap: 0,
      by: "cand" as const,
    };
    expect(susunHotspot(7, [cand], [], [11], baru)).toEqual({ ok: true, value: [] });
    expect(
      susunHotspot(7, [], [{ owner: { seat: 99 }, ssid: "HP", pass: "kata-sandi" }], [11], baru),
    ).toMatchObject({ ok: false, kode: "kursi_tak_dikenal" });
  });
  it("refuses a bad capacity, owner or SSID", () => {
    for (const x of [
      { owner: "NUE", ssid: "P", pass: "kata-sandi", cap: 0 },
      { owner: "NUE", ssid: "P", pass: "kata-sandi", cap: 31 },
      { owner: "bad owner!", ssid: "P", pass: "kata-sandi", cap: 8 },
      { owner: "NUE", ssid: "", pass: "kata-sandi", cap: 8 },
    ])
      expect(susunHotspot(7, [], [x], [], baru).ok).toBe(false);
  });
});

describe("the body of an action", () => {
  it("reads each control with its numbers", () => {
    expect(bacaAksi({ act: "time", deltaMs: 300000, seq: 4 })).toMatchObject({
      ok: true,
      action: { act: "time", deltaMs: 300000, seq: 4 },
    });
    expect(bacaAksi({ act: "seat-time", seatId: 3, deltaMs: 60000, seq: 1 })).toMatchObject({
      ok: true,
    });
    expect(bacaAksi({ act: "reopen", addMs: 120000, seq: 1 }).ok).toBe(true);
  });
  it("names the field that is wrong", () => {
    expect(bacaAksi({ act: "time" })).toEqual({ ok: false, field: "deltaMs" });
    expect(bacaAksi({ act: "nope" })).toEqual({ ok: false, field: "act" });
    expect(bacaAksi({ act: "reroll", seatId: 1, what: "topic", reason: "bebas" })).toEqual({
      ok: false,
      field: "reason",
    });
  });
});

describe("boards on loan", () => {
  it("takes one or two, numbered in order, of the two chips", () => {
    expect(cekPapan([{ chip: "esp32" }, { chip: "esp32s3", code: "K-2" }])).toEqual([
      { n: 1, chip: "esp32" },
      { n: 2, chip: "esp32s3", code: "K-2" },
    ]);
    expect(cekPapan([])).toBeNull();
    expect(cekPapan([{ chip: "esp32" }, { chip: "esp32" }, { chip: "esp32" }])).toBeNull();
    expect(cekPapan([{ chip: "arduino" }])).toBeNull();
  });
});

/* ------------------------------------------------------------- the rooms */

describe("rooms", () => {
  it("lists a room to its own pengawas and to the Panitia who watch, not to others", async () => {
    pelakuNim.X = pelaku();
    const a = await jalan("rooms", "N1", null);
    expect((a.body.rooms as unknown[]).length).toBe(1);
    const b = await jalan("rooms", "AKD", null);
    expect((b.body.rooms as unknown[]).length).toBe(1);
    const c = await jalan("rooms", "X", null);
    expect((c.body.rooms as unknown[]).length).toBe(0);
  });

  it("offers the slots with no room only to the ones who set rooms up", async () => {
    rows.room = (sel) => (sel ? [] : []);
    const a = await jalan("rooms", "AKD", null);
    expect(a.body.canSetup).toBe(true);
    expect((a.body.pending as unknown[]).length).toBe(1);
    const b = await jalan("rooms", "N1", null);
    expect(b.body.canSetup).toBe(false);
    expect(b.body.pending).toEqual([]);
  });
});

describe("the console", () => {
  it("refuses someone who does not watch this room", async () => {
    pelakuNim.X = pelaku();
    const r = await jalan("room", "X", null, { id: "7" });
    expect(r.status).toBe(403);
  });

  it("shows seats with their names, the bank's readiness and who may press what", async () => {
    const r = await jalan("room", "N1", null, { id: "7" });
    expect(r.status).toBe(200);
    const v = r.body as never as {
      seats: { nama: string; checkedIn: boolean }[];
      pool: Record<string, { ok: boolean }>;
      me: { isPengawas: boolean; canBeMaster: boolean; canSetup: boolean };
      view: string;
    };
    expect(v.seats).toHaveLength(1);
    expect(v.seats[0]).toMatchObject({ nama: "Dina", checkedIn: true });
    expect(v.pool.logika.ok).toBe(true);
    expect(v.me).toMatchObject({ isPengawas: true, canBeMaster: true, canSetup: false });
    expect(v.view).toBe("persiapan");
  });

  it("never carries a hotspot password", async () => {
    rows.room = (sel) => [
      sel
        ? {
            room: kamar({
              hotspots: [{ id: "a", owner: "NUE", ssid: "Pixel", pass: "g1.rahasia", cap: 8 }],
            }),
            slot: SLOT(),
          }
        : kamar({
            hotspots: [{ id: "a", owner: "NUE", ssid: "Pixel", pass: "g1.rahasia", cap: 8 }],
          }),
    ];
    const r = await jalan("room", "N1", null, { id: "7" });
    const teks = JSON.stringify(r.body);
    expect(teks).not.toContain("g1.rahasia");
    expect((r.body as never as { hotspots: { hasPass: boolean }[] }).hotspots[0].hasPass).toBe(
      true,
    );
  });

  it("says Butuh N hotspot from the lent boards", async () => {
    rows.kit = [
      {
        id: 1,
        roomId: 7,
        candidateId: 101,
        kitCode: "K1",
        boards: [
          { n: 1, chip: "esp32" },
          { n: 2, chip: "esp32s3" },
        ],
        returnedAt: null,
      },
    ];
    const r = await jalan("room", "N1", null, { id: "7" });
    const v = r.body as never as {
      plan: { wifi: number; need: number; have: number; short: boolean };
    };
    expect(v.plan).toMatchObject({ wifi: 2, need: 1, have: 0, short: true });
  });
});

/* -------------------------------------------------------------- the Master */

describe("Jadi Master", () => {
  it("lets a plotted pengawas take the room", async () => {
    const r = await jalan("room-master", "N1", { id: 7, act: "claim" });
    expect(r.status).toBe(200);
    const w = tulis.find((x) => x.op === "update" && x.tabel === "room");
    expect((w?.nilai as { state: RoomState }).state.master?.nim).toBe("N1");
    expect((w?.nilai as { state: RoomState }).state.seq).toBe(1);
  });

  it("never lets the Pencipta be Master", async () => {
    const r = await jalan("room-master", "PEN", { id: 7, act: "claim" });
    expect(r.status).toBe(403);
    expect(r.body.kode).toBe("tidak_boleh_master");
  });

  it("refuses someone who was not plotted for this room", async () => {
    pelakuNim.X = pelaku({ bank: true });
    const r = await jalan("room-master", "X", { id: 7, act: "claim" });
    expect(r.body.kode).toBe("tidak_boleh_master");
  });

  it("refuses a second Master while the first is alive", async () => {
    state = { ...state, master: { nim: "N1", since: Date.now() } };
    rows.room = (sel) => (sel ? [] : [kamar({ masterSeenAt: new Date() })]);
    const r = await jalan("room-master", "N2", { id: 7, act: "claim" });
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("ada_master");
  });

  it("lets a pengawas take over a Master who stopped pinging", async () => {
    state = { ...state, master: { nim: "N1", since: Date.now() - 600_000 } };
    rows.room = (sel) => (sel ? [] : [kamar({ masterSeenAt: new Date(Date.now() - 90_000) })]);
    const r = await jalan("room-master", "N2", { id: 7, act: "claim" });
    expect(r.status).toBe(200);
  });

  it("of two racing claims, the one that lost the version guard sees the winner and is refused", async () => {
    kalah = 1;
    let kali = 0;
    rows.room = (sel) => {
      kali++;
      // The second look finds N1 already Master.
      const s2: RoomState =
        kali > 1 ? { ...state, master: { nim: "N1", since: Date.now() }, seq: 1 } : state;
      return sel ? [] : [kamar({ state: s2, masterSeenAt: new Date() })];
    };
    const r = await jalan("room-master", "N2", { id: 7, act: "claim" });
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("ada_master");
  });

  it("hands over with ask and give, and the others are told", async () => {
    state = { ...state, master: { nim: "N1", since: 1 }, ask: { nim: "N2", at: 2 } };
    rows.room = (sel) => (sel ? [] : [kamar({ masterSeenAt: new Date() })]);
    const r = await jalan("room-master", "N1", { id: 7, act: "give", to: "N2" });
    expect(r.status).toBe(200);
    const w = tulis.find((x) => x.op === "update" && x.tabel === "room");
    const s2 = (w?.nilai as { state: RoomState }).state;
    expect(s2.master?.nim).toBe("N2");
    expect(s2.ask).toBeNull();
    const m = r.antre["rec-7"] as unknown as { j: string }[];
    expect(m.map((x) => x.j)).toEqual(["ruang", "master"]);
  });

  it("refuses to hand the room to the Pencipta", async () => {
    state = { ...state, master: { nim: "N1", since: 1 } };
    rows.room = (sel) => (sel ? [] : [kamar({ masterSeenAt: new Date() })]);
    const r = await jalan("room-master", "N1", { id: 7, act: "give", to: "PEN" });
    expect(r.body.kode).toBe("tidak_boleh_master");
  });

  it("takes a ping from the Master only, without touching the version", async () => {
    state = { ...state, master: { nim: "N1", since: 1 } };
    rows.room = (sel) => (sel ? [] : [kamar()]);
    expect((await jalan("room-master", "N2", { id: 7, act: "ping" })).status).toBe(403);
    const ok = await jalan("room-master", "N1", { id: 7, act: "ping" });
    expect(ok.status).toBe(200);
    const w = tulis.filter((x) => x.op === "update" && x.tabel === "room");
    expect(w).toHaveLength(1);
    expect(Object.keys(w[0].nilai as object)).toEqual(["masterSeenAt"]);
  });
});

/* -------------------------------------------------------- the controls */

describe("the Master's controls", () => {
  const master = () => {
    state = { ...state, master: { nim: "N1", since: Date.now() } };
    rows.room = (sel) => (sel ? [] : [kamar({ masterSeenAt: new Date() })]);
  };

  it("refuses anyone but the Master", async () => {
    master();
    const r = await jalan("room-act", "N2", { id: 7, seq: 0, act: "start" });
    expect(r.status).toBe(403);
    expect(r.body.kode).toBe("bukan_master");
  });

  it("starts the first part with a seat in and the bank ready, and logs it", async () => {
    master();
    const r = await jalan("room-act", "N1", { id: 7, seq: 0, act: "start" });
    expect(r.status).toBe(200);
    const w = tulis.find((x) => x.op === "update" && x.tabel === "room");
    const s2 = (w?.nilai as { state: RoomState }).state;
    expect(s2.stage).toBe("parts");
    expect(s2.cur).toBe("logika");
    expect(s2.seq).toBe(1);
    expect(tulis.some((x) => x.op === "insert" && x.tabel === "log")).toBe(true);
    // The first real Start locks the parts config.
    expect(tulis.some((x) => x.op === "update" && x.tabel === "config")).toBe(true);
  });

  it("does not lock the config for a practice room", async () => {
    master();
    rows.room = (sel) => (sel ? [] : [kamar({ rehearsal: true, masterSeenAt: new Date() })]);
    await jalan("room-act", "N1", { id: 7, seq: 0, act: "start" });
    expect(tulis.some((x) => x.op === "update" && x.tabel === "config")).toBe(false);
  });

  it("says bank_kurang when the bank is short", async () => {
    master();
    rows.question = [{ part: "logika", lang: "cpp", n: 3 }];
    const r = await jalan("room-act", "N1", { id: 7, seq: 0, act: "start" });
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("bank_kurang");
  });

  it("says kursi_kosong when nobody has checked in", async () => {
    master();
    rows.seat = [{ ...SEAT_MASUK(11, 101), checkin: { fullscreen: 1 } }];
    const r = await jalan("room-act", "N1", { id: 7, seq: 0, act: "start" });
    expect(r.body.kode).toBe("kursi_kosong");
  });

  it("refuses a stale version without writing", async () => {
    master();
    const r = await jalan("room-act", "N1", { id: 7, seq: 3, act: "start" });
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("versi_lama");
    expect(tulis.some((x) => x.tabel === "room")).toBe(false);
  });

  it("answers versi_lama when another writer got in between the read and the write", async () => {
    master();
    kalah = 1;
    const r = await jalan("room-act", "N1", { id: 7, seq: 0, act: "start" });
    expect(r.status).toBe(409);
    expect(r.body.kode).toBe("versi_lama");
    expect(tulis.some((x) => x.tabel === "log")).toBe(false);
  });

  it("refuses to open a room whose evening is not today", async () => {
    state = { ...state, stage: "setup", master: { nim: "N1", since: 1 } };
    rows.room = (sel) => (sel ? [] : [kamar({ masterSeenAt: new Date() })]);
    rows.slot = [{ ...SLOT(), startsAt: new Date(Date.now() + 3 * 86_400_000) }];
    const r = await jalan("room-act", "N1", { id: 7, seq: 0, act: "open" });
    expect(r.body.kode).toBe("bukan_hari_ini");
  });

  it("changes the room's time and sends the new state to every seat", async () => {
    const t0 = Date.now() - 60_000;
    state = {
      ...state,
      stage: "parts",
      cur: "logika",
      startedAt: t0,
      master: { nim: "N1", since: t0 },
      runs: {
        logika: {
          durMs: 900_000,
          usedMs: 0,
          mark: t0,
          state: "running",
          pausedAt: null,
          extra: {},
          startedAt: t0,
          endedAt: null,
          endedBy: null,
          leftAtSkip: 0,
          reopened: 0,
        },
      },
    };
    rows.room = (sel) => (sel ? [] : [kamar({ masterSeenAt: new Date() })]);
    const r = await jalan("room-act", "N1", { id: 7, seq: 0, act: "time", deltaMs: 300_000 });
    expect(r.status).toBe(200);
    const w = tulis.find((x) => x.op === "update" && x.tabel === "room");
    expect((w?.nilai as { state: RoomState }).state.runs.logika?.durMs).toBe(1_200_000);
    const m = r.antre["rec-7"] as unknown as {
      j: string;
      d: { runs: { logika: { durMs: number } } };
    }[];
    expect(m[0].j).toBe("ruang");
    expect(m[0].d.runs.logika.durMs).toBe(1_200_000);
  });

  it("gives one seat extra time and tells that seat, never the others' extras to all", async () => {
    const t0 = Date.now() - 60_000;
    state = {
      ...state,
      stage: "parts",
      cur: "logika",
      startedAt: t0,
      master: { nim: "N1", since: t0 },
      runs: {
        logika: {
          durMs: 900_000,
          usedMs: 0,
          mark: t0,
          state: "running",
          pausedAt: null,
          extra: {},
          startedAt: t0,
          endedAt: null,
          endedBy: null,
          leftAtSkip: 0,
          reopened: 0,
        },
      },
    };
    rows.room = (sel) => (sel ? [] : [kamar({ masterSeenAt: new Date() })]);
    const r = await jalan("room-act", "N1", {
      id: 7,
      seq: 0,
      act: "seat-time",
      seatId: 11,
      deltaMs: 180_000,
    });
    expect(r.status).toBe(200);
    const m = r.antre["rec-7"] as unknown as { j: string; s: number | null; d: unknown }[];
    expect(m.find((x) => x.j === "kursi")).toMatchObject({ s: 11, d: { extraMs: 180_000 } });
    const ruang = JSON.stringify(m.find((x) => x.j === "ruang"));
    expect(ruang).toContain("maxExtraMs");
    expect(ruang).not.toContain('"extra"');
    expect(ruang).not.toContain('"11"');
  });

  it("takes a re-roll only for a reason from the list and keeps the Asisten's code off the seat", async () => {
    const t0 = Date.now() - 60_000;
    state = {
      ...state,
      stage: "spin",
      cur: "livecode",
      startedAt: t0,
      master: { nim: "N1", since: t0 },
    };
    rows.room = (sel) => (sel ? [] : [kamar({ masterSeenAt: new Date() })]);
    const salah = await jalan("room-act", "N1", {
      id: 7,
      seq: 0,
      act: "reroll",
      seatId: 11,
      what: "topic",
      reason: "iseng",
    });
    expect(salah.status).toBe(400);
    const ok = await jalan("room-act", "N1", {
      id: 7,
      seq: 0,
      act: "reroll",
      seatId: 11,
      what: "topic",
      reason: "kit_rusak",
      note: "papan terbakar",
    });
    expect(ok.status).toBe(200);
    const m = ok.antre["rec-7"] as unknown as { j: string; s: number | null; d: unknown }[];
    const kursi = m.find((x) => x.j === "kursi");
    expect(kursi?.d).toMatchObject({ reroll: { what: "topic", reason: "kit_rusak" } });
    expect(JSON.stringify(kursi)).not.toContain("N1");
    expect(JSON.stringify(kursi)).not.toContain("terbakar");
    const log = tulis.find((x) => x.tabel === "log");
    expect(JSON.stringify(log?.nilai)).toContain("terbakar");
  });

  it("clears Kumpulkan for the room on a Reopen", async () => {
    const t0 = Date.now() - 600_000;
    state = {
      ...state,
      stage: "parts",
      cur: "logika",
      startedAt: t0,
      master: { nim: "N1", since: t0 },
      runs: {
        logika: {
          durMs: 900_000,
          usedMs: 300_000,
          mark: null,
          state: "ended",
          pausedAt: null,
          extra: {},
          startedAt: t0,
          endedAt: Date.now() - 20_000,
          endedBy: "skip",
          leftAtSkip: 600_000,
          reopened: 0,
        },
      },
    };
    rows.room = (sel) => (sel ? [] : [kamar({ masterSeenAt: new Date() })]);
    const r = await jalan("room-act", "N1", { id: 7, seq: 0, act: "reopen", addMs: 0 });
    expect(r.status).toBe(200);
    const w = tulis.filter((x) => x.op === "update" && x.tabel === "seat");
    expect(w).toHaveLength(1);
  });

  it("closes the room's sockets after Finish and sends the last state first", async () => {
    const t0 = Date.now() - 600_000;
    state = {
      ...state,
      stage: "prep",
      startedAt: null,
      master: { nim: "N1", since: t0 },
    };
    rows.room = (sel) => (sel ? [] : [kamar({ masterSeenAt: new Date() })]);
    const r = await jalan("room-act", "N1", {
      id: 7,
      seq: 0,
      act: "finish",
      reason: "listrik mati",
    });
    expect(r.status).toBe(200);
    const w = tulis.find((x) => x.op === "update" && x.tabel === "room");
    expect((w?.nilai as { state: RoomState }).state.stage).toBe("finished");
  });

  it("sends the Master's own actions to room-master", async () => {
    master();
    const r = await jalan("room-act", "N1", { id: 7, seq: 0, act: "claim" });
    expect(r.body.kode).toBe("pakai_room_master");
  });
});

/* ------------------------------------------------- notes, kits, moves */

describe("notes", () => {
  beforeEach(() => {
    rows.candidate = [{ id: 101 }];
  });
  it("refuses a candidate who is not of this edition", async () => {
    rows.candidate = [];
    const r = await jalan("room-note", "N1", { id: 7, candidateId: 9999, text: "x" });
    expect(r.status).toBe(404);
    expect(tulis.some((x) => x.tabel === "note")).toBe(false);
  });
  it("saves a note under the writer's own name", async () => {
    const r = await jalan("room-note", "N1", {
      id: 7,
      candidateId: 101,
      text: "  kelihatan gelisah  ",
    });
    expect(r.status).toBe(200);
    const w = tulis.find((x) => x.op === "insert" && x.tabel === "note");
    expect(w?.nilai).toMatchObject({
      authorNim: "N1",
      text: "kelihatan gelisah",
      candidateId: 101,
    });
    const m = r.antre["rec-7"] as unknown as { j: string }[];
    expect(m[0].j).toBe("catatan");
  });
  it("deletes it when the text is emptied", async () => {
    await jalan("room-note", "N1", { id: 7, candidateId: 101, text: "  " });
    expect(tulis.some((x) => x.op === "delete" && x.tabel === "note")).toBe(true);
  });
  it("refuses someone who does not watch the room", async () => {
    pelakuNim.X = pelaku();
    const r = await jalan("room-note", "X", { id: 7, candidateId: 101, text: "x" });
    expect(r.status).toBe(403);
  });
});

describe("kits", () => {
  beforeEach(() => {
    rows.candidate = [{ id: 101 }];
  });
  it("refuses a candidate who is not of this edition", async () => {
    rows.candidate = [];
    pelakuNim.LOG = pelaku({ kitLoans: true });
    const r = await jalan("room-kit", "LOG", {
      id: 7,
      candidateId: 9999,
      kit: "K1",
      boards: [{ chip: "esp32" }],
    });
    expect(r.status).toBe(404);
    expect(tulis.some((x) => x.tabel === "kit")).toBe(false);
  });
  it("needs the kitLoans right", async () => {
    const r = await jalan("room-kit", "N1", {
      id: 7,
      candidateId: 101,
      kit: "K1",
      boards: [{ chip: "esp32" }],
    });
    expect(r.status).toBe(403);
  });
  it("records the kit and its boards, and a return", async () => {
    pelakuNim.LOG = pelaku({ kitLoans: true });
    const r = await jalan("room-kit", "LOG", {
      id: 7,
      candidateId: 101,
      kit: "K1",
      boards: [{ chip: "esp32" }, { chip: "esp32s3" }],
      returned: true,
    });
    expect(r.status).toBe(200);
    const w = tulis.find((x) => x.op === "insert" && x.tabel === "kit");
    expect(w?.nilai).toMatchObject({ kitCode: "K1", roomId: 7 });
    expect((w?.nilai as { boards: unknown[] }).boards).toHaveLength(2);
  });
  it("refuses a loan with no boards or an unknown chip", async () => {
    pelakuNim.LOG = pelaku({ kitLoans: true });
    for (const boards of [[], [{ chip: "uno" }]]) {
      const r = await jalan("room-kit", "LOG", { id: 7, candidateId: 101, kit: "K1", boards });
      expect(r.status).toBe(400);
    }
  });
});

describe("setting up a room", () => {
  it("needs the plotPengawas right", async () => {
    const r = await jalan("room-setup", "N1", { slotId: 3, pengawas: ["N1"] });
    expect(r.status).toBe(403);
  });

  it("makes a room on a tes_tulis slot with its pengawas", async () => {
    rows.room = (sel) => (sel ? [] : []);
    const dibuat = kamar();
    const awal = rows.room;
    rows.room = (sel) =>
      tulis.some((x) => x.op === "insert" && x.tabel === "room")
        ? sel
          ? []
          : [dibuat]
        : awal(sel);
    const r = await jalan("room-setup", "AKD", {
      slotId: 3,
      pengawas: ["N1", "N2"],
      title: "Ruang A",
    });
    expect(r.status).toBe(200);
    const ins = tulis.find((x) => x.op === "insert" && x.tabel === "room");
    expect(ins?.nilai).toMatchObject({ slotId: 3, rehearsal: false, title: "Ruang A" });
    const pe = tulis.find((x) => x.op === "insert" && x.tabel === "examiner");
    expect((pe?.nilai as unknown[]).length).toBe(2);
  });

  it("makes a practice room with no slot", async () => {
    rows.room = (sel) => (sel ? [] : []);
    const r = await jalan("room-setup", "AKD", { rehearsal: true, title: "Ruang Latihan" });
    expect(r.status).toBe(200);
    const ins = tulis.find((x) => x.op === "insert" && x.tabel === "room");
    expect(ins?.nilai).toMatchObject({ slotId: null, rehearsal: true });
  });

  it("refuses a real room without a slot, and a practice room with one", async () => {
    expect((await jalan("room-setup", "AKD", {})).status).toBe(400);
    expect((await jalan("room-setup", "AKD", { rehearsal: true, slotId: 3 })).status).toBe(400);
  });

  it("refuses a pengawas who is not an active Asisten", async () => {
    rows.asisten = [{ nim: "N1", status: "alumni" }];
    const r = await jalan("room-setup", "AKD", { id: 7, slotId: 3, pengawas: ["N1"] });
    expect(r.body.kode).toBe("bukan_pengawas");
  });

  it("refuses to change a finished room", async () => {
    state = { ...state, stage: "finished" };
    const r = await jalan("room-setup", "AKD", { id: 7, slotId: 3, pengawas: ["N1"] });
    expect(r.status).toBe(409);
  });
});

describe("moving a seat", () => {
  it("needs the plotting right", async () => {
    const r = await jalan("room-move", "N1", { candidateId: 101, toRoomId: 7 });
    expect(r.status).toBe(403);
  });

  it("refuses a room that has started", async () => {
    pelakuNim.PL = pelaku({ plotting: true });
    state = { ...state, stage: "parts", cur: "logika" };
    const t0 = Date.now() - 1000;
    state.runs = {
      logika: {
        durMs: 900_000,
        usedMs: 0,
        mark: t0,
        state: "running",
        pausedAt: null,
        extra: {},
        startedAt: t0,
        endedAt: null,
        endedBy: null,
        leftAtSkip: 0,
        reopened: 0,
      },
    };
    rows.candidate = [{ id: 101 }];
    const r = await jalan("room-move", "PL", { candidateId: 101, toRoomId: 7 });
    expect(r.body.kode).toBe("tahap_salah");
  });

  it("refuses to take a seat out of a room where a part is running for it", async () => {
    pelakuNim.PL = pelaku({ plotting: true });
    const t0 = Date.now() - 1000;
    const berjalan: RoomState = {
      ...newRoomState(),
      stage: "parts",
      cur: "logika",
      runs: {
        logika: {
          durMs: 900_000,
          usedMs: 0,
          mark: t0,
          state: "running",
          pausedAt: null,
          extra: {},
          startedAt: t0,
          endedAt: null,
          endedBy: null,
          leftAtSkip: 0,
          reopened: 0,
        },
      },
    };
    const tujuan = kamar({ id: 8, slotId: 4, state: { ...newRoomState(), stage: "prep" } });
    const asal = kamar({ id: 7, state: berjalan });
    rows.room = (sel) => (sel ? [] : [tujuan]);
    rows.candidate = [{ id: 101 }];
    rows.seat = [{ ...SEAT_MASUK(11, 101), roomId: 7 }];
    // The destination is room 8 (setup), the current room is 7 (running).
    let kali = 0;
    rows.room = () => (++kali === 1 ? [tujuan] : [asal]);
    const r = await jalan("room-move", "PL", { candidateId: 101, toRoomId: 8 });
    expect(r.body.kode).toBe("ruang_berjalan");
  });

  it("makes a practice seat when the target is a practice room", async () => {
    pelakuNim.PL = pelaku({ plotting: true });
    rows.candidate = [{ id: 101 }];
    rows.seat = [];
    rows.room = (sel) =>
      sel ? [] : [kamar({ id: 9, slotId: null, rehearsal: true, state: newRoomState() })];
    const r = await jalan("room-move", "PL", { candidateId: 101, toRoomId: 9 });
    expect(r.status).toBe(200);
    const ins = tulis.find((x) => x.op === "insert" && x.tabel === "seat");
    expect(ins?.nilai).toMatchObject({ candidateId: 101, roomId: 9, rehearsal: true });
  });
});

describe("a real seat follows its assignment", () => {
  it("moves to the room of the new slot", async () => {
    rows.room = [{ id: 7 }];
    await sinkronKursi((await import("../../src/lib/db")).getDb() as never, 101, 3);
    const w = tulis.find((x) => x.op === "update" && x.tabel === "seat");
    expect(w?.nilai).toEqual({ roomId: 7 });
  });
  it("drops an untouched seat when the new slot has no room, or the candidate is taken out", async () => {
    rows.room = [];
    rows.seat = [{ id: 11, draw: {}, done: {} }];
    rows.strike = [];
    const db = (await import("../../src/lib/db")).getDb() as never;
    await sinkronKursi(db, 101, 3);
    expect(tulis.filter((x) => x.tabel === "seat").map((x) => x.op)).toEqual(["delete"]);
    tulis.length = 0;
    await sinkronKursi(db, 101, null);
    expect(tulis.filter((x) => x.tabel === "seat").map((x) => x.op)).toEqual(["delete"]);
  });
  it("keeps a seat that has a draw, a hand-in or a strike when there is no room to follow to", async () => {
    rows.room = [];
    const db = (await import("../../src/lib/db")).getDb() as never;
    rows.strike = [];
    rows.seat = [{ id: 11, draw: { logika: { at: 1 } }, done: {} }];
    await sinkronKursi(db, 101, 3);
    rows.seat = [{ id: 11, draw: {}, done: { logika: 5 } }];
    await sinkronKursi(db, 101, null);
    rows.seat = [{ id: 11, draw: {}, done: {} }];
    rows.strike = [{ id: 1 }];
    await sinkronKursi(db, 101, null);
    expect(tulis).toEqual([]);
  });
});

describe("a candidate's own phone", () => {
  it("is sealed into the room's hotspots as a row owned by the seat", async () => {
    rows.room = [{ hotspots: [{ id: "a", owner: "NUE", ssid: "Pixel", pass: "g1.x", cap: 8 }] }];
    const db = (await import("../../src/lib/db")).getDb() as never;
    const r = await simpanHotspotKursi(db, 7, 11, "HP Dina", "kata-sandi");
    expect(r).toEqual({ ssid: "HP Dina" });
    const w = tulis.find((x) => x.op === "update" && x.tabel === "room");
    const h = (w?.nilai as { hotspots: { id: string; by?: string; pass: string }[] }).hotspots;
    expect(h.map((x) => x.id)).toEqual(["a", "kursi-11"]);
    expect(h[1]).toMatchObject({ by: "cand" });
    expect(JSON.stringify(h)).not.toContain("kata-sandi");
  });
  it("refuses a short password", async () => {
    const db = (await import("../../src/lib/db")).getDb() as never;
    expect(await simpanHotspotKursi(db, 7, 11, "HP", "pendek")).toMatchObject({
      galat: [{ field: "pass" }],
    });
  });
});

describe("the relay ticket", () => {
  beforeEach(() => {
    process.env.KONSOL_RELAY_URL = "wss://relay.example";
    process.env.KONSOL_RELAY_SECRET = "s".repeat(40);
  });
  it("is signed for the Panitia of this room only", async () => {
    const r = await jalan("room-ticket", "N1", null, { id: "7" });
    expect(r.status).toBe(200);
    expect(r.body.url).toBe("wss://relay.example/ujian/rec-7");
    const cek = await cekTiketUjian(String(r.body.tiket), "s".repeat(40), "rec-7");
    expect(cek.ok && cek.tiket).toMatchObject({ peran: "panitia", s: null, u: "N1" });
    pelakuNim.X = pelaku();
    expect((await jalan("room-ticket", "X", null, { id: "7" })).status).toBe(403);
  });
});

describe("the room's own messages", () => {
  it("queue under the room's name", () => {
    const res = { __: 1 } as never;
    antreUjian(res, 12, [{ j: "ruang", s: null, d: {} }]);
    expect(Object.keys(ambilAntre(res))).toEqual(["rec-12"]);
  });
});
