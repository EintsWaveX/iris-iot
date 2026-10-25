/**
 * The 2026 edition and its calendar, PRD section 3. Migration 0048 inserts
 * seedSql(), and a test keeps the two in step; after that the Ketua and
 * Acara edit the calendar in the app. Committee members are never seeded:
 * the Ketua and Admin seat them in the UI.
 *
 * Penerimaan Asisten Baru is left out on purpose: its date is still open,
 * and a made-up date would show on candidates' calendars. The Ketua adds it
 * (kind acceptance, gate accept) when the date is known.
 */
import type { EditionStatus, RecEvent } from "./types.js";

export const EDITION_SEED = {
  year: 2026,
  title: "Open Recruitment Asisten IRIS 2026",
  status: "live" as EditionStatus,
};

type Seed = Omit<RecEvent, "id" | "color" | "sort"> & Partial<Pick<RecEvent, "color">>;

const TES = { dayStart: "18:30", dayEnd: "21:00", place: "TULT" };
const TANPA = { dayStart: null, dayEnd: null, place: null };

/** In date order; `sort` is the position. */
const BARIS: Seed[] = [
  {
    kind: "registration",
    title: "Open Recruitment",
    startsOn: "2026-10-25",
    endsOn: "2026-10-31",
    ...TANPA,
    internal: false,
    audience: "all",
    gates: ["daftar"],
    stage: "berkas",
  },
  {
    kind: "registration",
    title: "Extend",
    startsOn: "2026-11-01",
    endsOn: "2026-11-02",
    ...TANPA,
    internal: false,
    audience: "all",
    gates: ["daftar"],
    stage: "berkas",
  },
  {
    kind: "review",
    title: "Pengecekan Berkas",
    startsOn: "2026-11-09",
    endsOn: "2026-11-10",
    ...TANPA,
    internal: true,
    audience: "all",
    gates: ["review"],
    stage: "berkas",
  },
  {
    kind: "announcement",
    title: "Pengumuman Berkas",
    startsOn: "2026-11-11",
    endsOn: "2026-11-11",
    ...TANPA,
    internal: false,
    audience: "all",
    gates: ["reveal"],
    stage: "berkas",
  },
  {
    kind: "meeting",
    title: "First Meet",
    startsOn: "2026-11-12",
    endsOn: "2026-11-12",
    ...TES,
    internal: false,
    audience: "all",
    gates: ["qr"],
    stage: "first_meet",
  },
  {
    kind: "pleno",
    title: "Pleno Tes Tulis",
    startsOn: "2026-11-16",
    endsOn: "2026-11-16",
    ...TANPA,
    internal: true,
    audience: "all",
    gates: [],
    stage: "tes_tulis",
  },
  {
    kind: "test",
    title: "Tes Tulis & Program",
    startsOn: "2026-11-17",
    endsOn: "2026-11-19",
    ...TES,
    internal: false,
    audience: "own",
    gates: ["exam"],
    stage: "tes_tulis",
  },
  {
    kind: "makeup",
    title: "Susulan Tes Tulis",
    startsOn: "2026-11-20",
    endsOn: "2026-11-20",
    ...TES,
    internal: false,
    audience: "offered",
    gates: ["exam"],
    stage: "tes_tulis",
  },
  {
    kind: "cutting",
    title: "Cutting Tes Tulis",
    startsOn: "2026-11-25",
    endsOn: "2026-11-26",
    ...TANPA,
    internal: true,
    audience: "all",
    gates: ["cutting"],
    stage: "tes_tulis",
  },
  {
    kind: "announcement",
    title: "Pengumuman Tes Tulis",
    startsOn: "2026-11-27",
    endsOn: "2026-11-27",
    ...TANPA,
    internal: false,
    audience: "all",
    gates: ["reveal"],
    stage: "tes_tulis",
  },
  {
    kind: "pleno",
    title: "Pleno Wawancara",
    startsOn: "2026-11-30",
    endsOn: "2026-11-30",
    ...TANPA,
    internal: true,
    audience: "all",
    gates: [],
    stage: "wawancara",
  },
  {
    kind: "interview",
    title: "Tes Wawancara",
    startsOn: "2026-12-01",
    endsOn: "2026-12-03",
    ...TES,
    internal: false,
    audience: "own",
    gates: ["rubric"],
    stage: "wawancara",
  },
  {
    kind: "makeup",
    title: "Susulan Wawancara",
    startsOn: "2026-12-04",
    endsOn: "2026-12-04",
    ...TES,
    internal: false,
    audience: "offered",
    gates: ["rubric"],
    stage: "wawancara",
  },
  {
    kind: "cutting",
    title: "Cutting Wawancara",
    startsOn: "2026-12-09",
    endsOn: "2026-12-10",
    ...TANPA,
    internal: true,
    audience: "all",
    gates: ["cutting"],
    stage: "wawancara",
  },
  {
    kind: "announcement",
    title: "Pengumuman Wawancara",
    startsOn: "2026-12-11",
    endsOn: "2026-12-11",
    ...TANPA,
    internal: false,
    audience: "all",
    gates: ["reveal"],
    stage: "wawancara",
  },
  {
    kind: "meeting",
    title: "Techmeet Tubes",
    startsOn: "2026-12-12",
    endsOn: "2026-12-12",
    ...TANPA,
    internal: false,
    audience: "all",
    gates: ["topics"],
    stage: "tubes",
  },
  {
    kind: "work",
    title: "Pengerjaan Tubes",
    startsOn: "2026-12-13",
    endsOn: "2026-12-17",
    dayStart: "18:30",
    dayEnd: "22:00",
    place: "Lab IRIS",
    internal: false,
    audience: "all",
    gates: ["checkin", "qr"],
    stage: "tubes",
  },
  {
    kind: "presentation",
    title: "Presentasi Tubes",
    startsOn: "2026-12-18",
    endsOn: "2026-12-18",
    ...TANPA,
    internal: false,
    audience: "all",
    gates: ["submission", "rubric"],
    stage: "tubes",
  },
  {
    kind: "cutting",
    title: "Cutting Tubes",
    startsOn: "2026-12-19",
    endsOn: "2026-12-19",
    ...TANPA,
    internal: true,
    audience: "all",
    gates: ["cutting"],
    stage: "tubes",
  },
  {
    kind: "announcement",
    title: "Pengumuman Tubes",
    startsOn: "2026-12-20",
    endsOn: "2026-12-20",
    ...TANPA,
    internal: false,
    audience: "all",
    gates: ["reveal"],
    stage: "tubes",
  },
  {
    kind: "pleno",
    title: "Pleno Mengajar",
    startsOn: "2026-12-21",
    endsOn: "2026-12-21",
    ...TANPA,
    internal: true,
    audience: "all",
    gates: [],
    stage: "mengajar",
  },
  {
    kind: "teaching",
    title: "Tes Mengajar",
    startsOn: "2026-12-22",
    endsOn: "2026-12-24",
    ...TES,
    internal: false,
    audience: "own",
    gates: ["rubric"],
    stage: "mengajar",
  },
  {
    kind: "makeup",
    title: "Susulan Mengajar",
    startsOn: "2026-12-26",
    endsOn: "2026-12-26",
    ...TES,
    internal: false,
    audience: "offered",
    gates: ["rubric"],
    stage: "mengajar",
  },
  {
    kind: "cutting",
    title: "Cutting Mengajar",
    startsOn: "2027-01-04",
    endsOn: "2027-01-05",
    ...TANPA,
    internal: true,
    audience: "all",
    gates: ["cutting"],
    stage: "mengajar",
  },
  {
    kind: "announcement",
    title: "Pengumuman Mengajar",
    startsOn: "2027-01-06",
    endsOn: "2027-01-06",
    ...TANPA,
    internal: false,
    audience: "all",
    gates: ["reveal"],
    stage: "mengajar",
  },
];

export const EVENT_SEED: Omit<RecEvent, "id">[] = BARIS.map((b, i) => ({
  ...b,
  color: b.color ?? null,
  sort: i,
}));

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const qn = (s: string | null) => (s === null ? "NULL" : q(s));

/** The statements migration 0048 carries: the edition, then its events. */
export function seedSql(): string {
  const e = EDITION_SEED;
  const edisi = `INSERT INTO "rec_edition" ("year", "title", "status") VALUES (${e.year}, ${q(e.title)}, ${q(e.status)});`;
  const baris = EVENT_SEED.map(
    (v) =>
      `((SELECT "id" FROM "rec_edition" WHERE "year" = ${e.year}), ${q(v.kind)}, ${q(v.title)}, ${q(v.startsOn)}, ${q(v.endsOn)}, ${qn(v.dayStart)}, ${qn(v.dayEnd)}, ${qn(v.place)}, ${v.internal}, ${q(v.audience)}, ${q(JSON.stringify(v.gates))}::jsonb, ${qn(v.stage)}, ${qn(v.color)}, ${v.sort})`,
  ).join(",\n");
  return `${edisi}\nINSERT INTO "rec_event" ("edition_id", "kind", "title", "starts_on", "ends_on", "day_start", "day_end", "place", "internal", "audience", "gates", "stage", "color", "sort") VALUES\n${baris};`;
}

/**
 * The three Pilih Jadwal windows (PRD 3), added by migration 0049 for the
 * edition that 0048 seeded. Picking opens at 19.00 on the Pengumuman day
 * (user, 2026-10-24), seven hours after the envelopes, so opening one late
 * never costs a seat. For a pick event `dayStart` is when picking opens on
 * the first day and `dayEnd` when it closes on the last (slots.ts), not a
 * daily window. Mengajar closes at the end of 21 Des here: the PRD's 12.00
 * cannot be stored with a 19.00 start, and Panitia can close it earlier from
 * Plotting. A new edition seeds these itself through the calendar editor.
 */
export const PICK_SEED: Omit<RecEvent, "id">[] = [
  ["Pilih Jadwal Tes Tulis", "2026-11-11", "2026-11-14", "tes_tulis"],
  ["Pilih Jadwal Wawancara", "2026-11-27", "2026-11-29", "wawancara"],
  ["Pilih Jadwal Mengajar", "2026-12-20", "2026-12-21", "mengajar"],
].map(([title, startsOn, endsOn, stage], i) => ({
  kind: "pick" as const,
  title,
  startsOn,
  endsOn,
  dayStart: "19:00",
  dayEnd: "23:59",
  place: null,
  internal: false,
  audience: "all" as const,
  gates: ["pick" as const],
  stage: stage as RecEvent["stage"],
  color: null,
  sort: EVENT_SEED.length + i,
}));

/** The statements migration 0049 carries; each is skipped when the edition already has that pick event. */
export function pickSeedSql(): string {
  const y = EDITION_SEED.year;
  return PICK_SEED.map(
    (v) =>
      `INSERT INTO "rec_event" ("edition_id", "kind", "title", "starts_on", "ends_on", "day_start", "day_end", "place", "internal", "audience", "gates", "stage", "color", "sort")\nSELECT (SELECT "id" FROM "rec_edition" WHERE "year" = ${y}), ${q(v.kind)}, ${q(v.title)}, ${q(v.startsOn)}, ${q(v.endsOn)}, ${qn(v.dayStart)}, ${qn(v.dayEnd)}, ${qn(v.place)}, ${v.internal}, ${q(v.audience)}, ${q(JSON.stringify(v.gates))}::jsonb, ${qn(v.stage)}, ${qn(v.color)}, ${v.sort}\nWHERE EXISTS (SELECT 1 FROM "rec_edition" WHERE "year" = ${y})\n  AND NOT EXISTS (SELECT 1 FROM "rec_event" WHERE "edition_id" = (SELECT "id" FROM "rec_edition" WHERE "year" = ${y}) AND "kind" = 'pick' AND "stage" = ${qn(v.stage)});`,
  ).join("\n");
}
