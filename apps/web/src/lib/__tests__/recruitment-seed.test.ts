/**
 * The seed calendar is PRD section 3, and migration 0048 inserts exactly it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EDITION_SEED, EVENT_SEED, seedSql } from "../recruitment/seed";
import { AUDIENCES, EVENT_KINDS, GATES, STAGES } from "../recruitment/types";

const por = (t: string) => EVENT_SEED.find((e) => e.title === t)!;

describe("EVENT_SEED", () => {
  it("has the 25 dated events of the PRD, Penerimaan left for the Ketua", () => {
    expect(EVENT_SEED).toHaveLength(25);
    expect(EVENT_SEED.some((e) => e.title.startsWith("Penerimaan"))).toBe(false);
  });
  it("uses only known kinds, gates, stages and audiences", () => {
    for (const e of EVENT_SEED) {
      expect(EVENT_KINDS).toContain(e.kind);
      expect(AUDIENCES).toContain(e.audience);
      for (const g of e.gates) expect(GATES).toContain(g);
      if (e.stage) expect(STAGES).toContain(e.stage);
    }
  });
  it("keeps every range ordered and every window complete", () => {
    for (const e of EVENT_SEED) {
      expect(e.endsOn >= e.startsOn, e.title).toBe(true);
      expect((e.dayStart === null) === (e.dayEnd === null), e.title).toBe(true);
      if (e.dayStart && e.dayEnd) expect(e.dayEnd > e.dayStart, e.title).toBe(true);
    }
  });
  it("is in date order", () => {
    const d = EVENT_SEED.map((e) => e.startsOn);
    expect([...d].sort()).toEqual(d);
  });
  it("gives the registration events the Daftar gate", () => {
    expect(por("Open Recruitment")).toMatchObject({
      startsOn: "2026-10-25",
      endsOn: "2026-10-31",
      gates: ["daftar"],
      internal: false,
    });
    expect(por("Extend")).toMatchObject({ startsOn: "2026-11-01", endsOn: "2026-11-02" });
  });
  it("keeps the internal events internal", () => {
    for (const t of [
      "Pengecekan Berkas",
      "Pleno Tes Tulis",
      "Cutting Tes Tulis",
      "Pleno Wawancara",
      "Cutting Wawancara",
      "Cutting Tubes",
      "Pleno Mengajar",
      "Cutting Mengajar",
    ])
      expect(por(t).internal, t).toBe(true);
    expect(por("Open Recruitment").internal).toBe(false);
  });
  it("shows own evenings and offered make-ups to the right people only", () => {
    expect(por("Tes Tulis & Program").audience).toBe("own");
    expect(por("Tes Wawancara").audience).toBe("own");
    expect(por("Tes Mengajar").audience).toBe("own");
    expect(por("Susulan Tes Tulis").audience).toBe("offered");
    expect(por("Susulan Wawancara").audience).toBe("offered");
    expect(por("Susulan Mengajar").audience).toBe("offered");
  });
  it("runs the tests 18.30 to 21.00 at TULT and the Tubes work to 22.00 at Lab IRIS", () => {
    expect(por("First Meet")).toMatchObject({ dayStart: "18:30", dayEnd: "21:00", place: "TULT" });
    expect(por("Tes Tulis & Program")).toMatchObject({
      startsOn: "2026-11-17",
      endsOn: "2026-11-19",
      dayStart: "18:30",
      dayEnd: "21:00",
      place: "TULT",
    });
    expect(por("Pengerjaan Tubes")).toMatchObject({
      startsOn: "2026-12-13",
      endsOn: "2026-12-17",
      dayStart: "18:30",
      dayEnd: "22:00",
      place: "Lab IRIS",
    });
  });
  it("crosses into 2027 for the Mengajar Cutting and announcement", () => {
    expect(por("Cutting Mengajar")).toMatchObject({ startsOn: "2027-01-04", endsOn: "2027-01-05" });
    expect(por("Pengumuman Mengajar")).toMatchObject({ startsOn: "2027-01-06" });
  });
  it("puts every Pengumuman on the Reveal gate of its own stage", () => {
    const peng = EVENT_SEED.filter((e) => e.title.startsWith("Pengumuman"));
    expect(peng.map((e) => e.stage)).toEqual([
      "berkas",
      "tes_tulis",
      "wawancara",
      "tubes",
      "mengajar",
    ]);
    for (const e of peng) expect(e.gates).toEqual(["reveal"]);
  });
});

describe("EDITION_SEED", () => {
  it("is the 2026 edition", () => {
    expect(EDITION_SEED).toEqual({
      year: 2026,
      title: "Open Recruitment Asisten IRIS 2026",
      status: "live",
    });
  });
});

describe("migration 0048 carries the seed", () => {
  const sql = readFileSync(resolve(__dirname, "../../../drizzle/0048_recruitment.sql"), "utf8");
  it("holds the exact statements seedSql() produces", () => {
    expect(sql).toContain(seedSql());
  });
  it("seeds no committee member", () => {
    expect(sql).not.toMatch(/INSERT INTO "rec_committee"/);
  });
});
