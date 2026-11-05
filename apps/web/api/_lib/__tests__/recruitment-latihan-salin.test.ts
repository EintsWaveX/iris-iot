/**
 * Copying an edition's setup for Mode Latihan (recruitment-latihan-salin.ts): the ids that point at each other
 * are carried over, nothing a person did is copied, and the practice copy gets its own salt. A recording fake
 * stands in for the database: every insert is kept, and `returning` hands out new ids in row order.
 */
import { describe, expect, it } from "vitest";
import { TOPIK_CONTOH, tulisSetup, type SetupLatihan } from "../recruitment-latihan-salin";
import {
  recCProblem,
  recCandidate,
  recCommittee,
  recEvent,
  recExamConfig,
  recPartRef,
  recQuestion,
  recReference,
  recRubric,
  recSlot,
  recTubesSession,
  recTubesTopic,
} from "../../../src/lib/schema";

type Tulis = { tabel: unknown; baris: Record<string, unknown>[] };

function palsu(mulaiId = 500) {
  const tulis: Tulis[] = [];
  let id = mulaiId;
  const tx = {
    insert: (tabel: unknown) => ({
      values: (nilai: unknown) => {
        const baris = (Array.isArray(nilai) ? nilai : [nilai]) as Record<string, unknown>[];
        tulis.push({ tabel, baris });
        return {
          returning: async () => baris.map(() => ({ id: id++ })),
          then: (ok: (v: unknown) => unknown) => ok(undefined),
        };
      },
    }),
  };
  const ke = (tabel: unknown) => tulis.filter((w) => w.tabel === tabel).flatMap((w) => w.baris);
  return { tx: tx as never, tulis, ke };
}

const kosong = (): SetupLatihan => ({
  events: [],
  slots: [],
  rubrics: [],
  sessions: [],
  topics: [],
  references: [],
  partRefs: [],
  committee: [],
  config: null,
  questions: [],
  problems: [],
});

const acara = (id: number, extra: Record<string, unknown> = {}) =>
  ({
    id,
    editionId: 1,
    kind: "meeting",
    title: `Acara ${id}`,
    startsOn: "2026-11-09",
    endsOn: "2026-11-09",
    dayStart: null,
    dayEnd: null,
    place: null,
    internal: false,
    audience: "all",
    gates: [],
    stage: "first_meet",
    color: null,
    sort: 0,
    updatedBy: "real",
    updatedAt: new Date("2026-10-01"),
    ...extra,
  }) as never;

describe("tulisSetup: the calendar and what hangs on it", () => {
  it("writes the events into the new edition and points each slot at the NEW event id", async () => {
    const f = palsu(500);
    const s = kosong();
    s.events = [acara(7), acara(9)];
    const dari = new Date("2026-11-14T08:00:00Z");
    const sampai = new Date("2026-11-14T10:00:00Z");
    s.slots = [
      {
        id: 1,
        editionId: 1,
        stage: "tes_tulis",
        eventId: 9,
        room: "Lab A",
        startsAt: dari,
        endsAt: sampai,
        capacity: 20,
      },
      {
        id: 2,
        editionId: 1,
        stage: "tes_tulis",
        eventId: 7,
        room: "Lab B",
        startsAt: dari,
        endsAt: sampai,
        capacity: 20,
      },
      {
        id: 3,
        editionId: 1,
        stage: "tes_tulis",
        eventId: null,
        room: "Lab C",
        startsAt: dari,
        endsAt: sampai,
        capacity: 20,
      },
      {
        id: 4,
        editionId: 1,
        stage: "tes_tulis",
        eventId: 999,
        room: "Lab D",
        startsAt: dari,
        endsAt: sampai,
        capacity: 20,
      },
    ] as never;
    const hasil = await tulisSetup(f.tx, s, 42, "1101200001", { topikContoh: false });

    const e = f.ke(recEvent);
    expect(e).toHaveLength(2);
    expect(e.every((x) => x.editionId === 42 && x.updatedBy === "1101200001" && !("id" in x))).toBe(
      true,
    );
    expect(hasil.acara.get(7)).toBe(500);
    expect(hasil.acara.get(9)).toBe(501);

    const sl = f.ke(recSlot);
    expect(sl.map((x) => x.eventId)).toEqual([501, 500, null, null]); // an event that was not copied leaves no dangling id
    expect(sl.every((x) => x.editionId === 42 && !("id" in x))).toBe(true);
    expect(sl[0]).toMatchObject({ room: "Lab A", capacity: 20, startsAt: dari });
  });

  it("copies the rubrics, Tubes sessions and the Panitia roster into the new edition", async () => {
    const f = palsu();
    const s = kosong();
    s.rubrics = [
      {
        id: 3,
        editionId: 1,
        stage: "wawancara",
        kind: "pewawancara",
        rows: [{ key: "a" }],
        updatedBy: "x",
        updatedAt: new Date(),
      },
    ] as never;
    s.sessions = [
      {
        id: 4,
        editionId: 1,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600e3),
        capacity: 30,
        place: "Lab IRIS",
      },
    ] as never;
    s.committee = [
      {
        id: 5,
        editionId: 1,
        asistenNim: "1101200002",
        division: "Akademik",
        isKoor: true,
        title: null,
        seatedBy: "x",
        seatedAt: new Date(),
      },
    ] as never;
    await tulisSetup(f.tx, s, 42, "me", { topikContoh: false });
    expect(f.ke(recRubric)).toMatchObject([
      { editionId: 42, stage: "wawancara", kind: "pewawancara", updatedBy: "me" },
    ]);
    expect(f.ke(recTubesSession)).toMatchObject([
      { editionId: 42, capacity: 30, place: "Lab IRIS" },
    ]);
    expect(f.ke(recCommittee)).toMatchObject([
      { editionId: 42, asistenNim: "1101200002", division: "Akademik", isKoor: true },
    ]);
    for (const t of [recRubric, recTubesSession, recCommittee])
      expect(f.ke(t)[0]).not.toHaveProperty("id");
  });
});

describe("tulisSetup: Tubes topics", () => {
  it("copies the source's topics and never adds the samples on top", async () => {
    const f = palsu();
    const s = kosong();
    s.topics = [{ id: 1, editionId: 1, title: "Topik Asli", brief: "b", cap: 4, sort: 0 }] as never;
    await tulisSetup(f.tx, s, 42, "me", { topikContoh: true });
    expect(f.ke(recTubesTopic)).toEqual([
      { editionId: 42, title: "Topik Asli", brief: "b", cap: 4, sort: 0 },
    ]);
  });

  it("fills in the six sample topics when the source has none, and only when asked", async () => {
    const a = palsu();
    await tulisSetup(a.tx, kosong(), 42, "me", { topikContoh: true });
    expect(a.ke(recTubesTopic)).toHaveLength(TOPIK_CONTOH.length);
    expect(a.ke(recTubesTopic)[0]).toMatchObject({
      editionId: 42,
      title: TOPIK_CONTOH[0][0],
      cap: 6,
      sort: 0,
    });
    const b = palsu();
    await tulisSetup(b.tx, kosong(), 42, "me", { topikContoh: false });
    expect(b.ke(recTubesTopic)).toEqual([]);
  });
});

describe("tulisSetup: references, exam settings and a carried-over bank", () => {
  it("carries the reference ids into the part references and the questions", async () => {
    const f = palsu(900);
    const s = kosong();
    s.references = [
      {
        id: 10,
        editionId: 1,
        url: "https://x/a",
        title: "A",
        selector: null,
        r2Key: "k1",
        sha256: "h1",
        bytes: 5,
        status: "ok",
        error: null,
        fetchedAt: null,
        by: "x",
      },
      {
        id: 11,
        editionId: 1,
        url: "https://x/b",
        title: "B",
        selector: null,
        r2Key: "k2",
        sha256: "h2",
        bytes: 6,
        status: "ok",
        error: null,
        fetchedAt: null,
        by: "x",
      },
    ] as never;
    s.partRefs = [
      { editionId: 1, part: "logika", referenceId: 11, sort: 0 },
      { editionId: 1, part: "fitb", referenceId: 77, sort: 1 }, // its reference was not copied
    ] as never;
    s.questions = [
      {
        id: 1,
        editionId: 1,
        part: "logika",
        lang: "id",
        format: "mcq",
        title: "Q1",
        body: {},
        answer: {},
        refs: [10, 11, 99],
        status: "ready",
        sample: false,
        version: 3,
        shownAt: new Date(),
        voidedAt: null,
        voidedBy: null,
        voidNote: null,
        createdBy: "x",
        updatedBy: "x",
        updatedAt: new Date(),
      },
      {
        id: 2,
        editionId: 1,
        part: "logika",
        lang: "id",
        format: "mcq",
        title: "Q2",
        body: {},
        answer: {},
        refs: [],
        status: "ready",
        sample: false,
        version: 1,
        shownAt: null,
        voidedAt: new Date(),
        voidedBy: "x",
        voidNote: "n",
        createdBy: "x",
        updatedBy: "x",
        updatedAt: new Date(),
      },
    ] as never;
    const hasil = await tulisSetup(f.tx, s, 42, "me", { topikContoh: false });

    expect(hasil.rujukan.get(10)).toBe(900);
    expect(hasil.rujukan.get(11)).toBe(901);
    expect(f.ke(recReference).map((r) => r.editionId)).toEqual([42, 42]);
    expect(f.ke(recPartRef)).toEqual([
      { editionId: 42, part: "logika", referenceId: 901, sort: 0 },
    ]);
    const q = f.ke(recQuestion);
    expect(q).toHaveLength(1); // the voided one was a leftover of what was dealt
    expect(q[0]).toMatchObject({
      editionId: 42,
      title: "Q1",
      version: 3,
      shownAt: null,
      refs: [900, 901],
    });
    expect(q[0]).not.toHaveProperty("id");
  });

  it("clears the shown mark on a carried-over Live Coding problem and keeps its check", async () => {
    const f = palsu();
    const s = kosong();
    s.problems = [
      {
        id: 3,
        editionId: 1,
        title: "P",
        tier: "easy",
        body: {},
        limits: {},
        samples: [],
        tests: [],
        reference: "r",
        checkedAt: new Date(),
        checkOk: true,
        status: "ready",
        sample: true,
        version: 2,
        shownAt: new Date(),
        createdBy: "x",
        updatedBy: "x",
        updatedAt: new Date(),
      },
    ] as never;
    await tulisSetup(f.tx, s, 42, "me", { topikContoh: false });
    expect(f.ke(recCProblem)).toMatchObject([
      { editionId: 42, checkOk: true, status: "ready", shownAt: null },
    ]);
    expect(f.ke(recCProblem)[0]).not.toHaveProperty("id");
  });

  it("gives the exam settings the source's values and a salt of their own, unlocked", async () => {
    const f1 = palsu();
    const f2 = palsu();
    const s = kosong();
    s.config = { budgetMin: 120 } as never;
    await tulisSetup(f1.tx, s, 42, "me", { topikContoh: false });
    await tulisSetup(f2.tx, s, 43, "me", { topikContoh: false });
    const [c1] = f1.ke(recExamConfig);
    const [c2] = f2.ke(recExamConfig);
    expect(c1).toMatchObject({
      editionId: 42,
      config: { budgetMin: 120 },
      lockedAt: null,
      updatedBy: "me",
    });
    expect(String(c1.salt)).toMatch(/^[0-9a-f]{32}$/);
    expect(c1.salt).not.toBe(c2.salt);
  });

  it("writes no exam settings when there are none, and never touches a candidate", async () => {
    const f = palsu();
    const s = kosong();
    s.events = [acara(1)];
    await tulisSetup(f.tx, s, 42, "me", { topikContoh: true });
    expect(f.ke(recExamConfig)).toEqual([]);
    expect(f.ke(recCandidate)).toEqual([]);
  });

  it("an empty source writes nothing at all but the sample topics", async () => {
    const f = palsu();
    await tulisSetup(f.tx, kosong(), 42, "me", { topikContoh: false });
    expect(f.tulis).toEqual([]);
  });
});
