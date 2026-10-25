/**
 * The three Pilih Jadwal events (PRD 3) and migration 0049 inserting exactly them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PICK_SEED, pickSeedSql } from "../recruitment/seed";
import { pickWindow } from "../recruitment/slots";

describe("PICK_SEED", () => {
  it("has one window per stage that has slots", () => {
    expect(PICK_SEED.map((e) => e.stage)).toEqual(["tes_tulis", "wawancara", "mengajar"]);
    for (const e of PICK_SEED) {
      expect(e.kind).toBe("pick");
      expect(e.gates).toEqual(["pick"]);
      expect(e.internal).toBe(false);
    }
  });
  it("opens at 19.00 on the Pengumuman day", () => {
    const hari = { tes_tulis: "2026-11-11", wawancara: "2026-11-27", mengajar: "2026-12-20" };
    for (const e of PICK_SEED) {
      expect(e.startsOn).toBe(hari[e.stage as keyof typeof hari]);
      expect(pickWindow(e).opensAt.toISOString()).toBe(
        new Date(`${e.startsOn}T19:00:00+07:00`).toISOString(),
      );
    }
  });
  it("keeps a valid window (the table's check: end after start)", () => {
    for (const e of PICK_SEED) expect(e.dayEnd! > e.dayStart!).toBe(true);
  });
  it("sorts after the 25 seeded events", () => {
    expect(PICK_SEED.map((e) => e.sort)).toEqual([25, 26, 27]);
  });
});

describe("migration 0049 carries the seed", () => {
  const sql = readFileSync(resolve(__dirname, "../../../drizzle/0049_recruitment_s2.sql"), "utf8");
  it("holds pickSeedSql() verbatim", () => {
    expect(sql).toContain(pickSeedSql());
  });
  it("skips an edition that already has the event", () => {
    expect(pickSeedSql()).toContain("NOT EXISTS");
  });
});
