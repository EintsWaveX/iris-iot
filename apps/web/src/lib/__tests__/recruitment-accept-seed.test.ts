/** The Penerimaan events (R8) and migration 0057 that carries them. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCEPT_SEED, EVENT_SEED, PICK_SEED, acceptSeedSql } from "../recruitment/seed";
import { revealAtFor } from "../recruitment/cutting";

describe("ACCEPT_SEED", () => {
  it("is the Ketua's Penerimaan and its own final Pengumuman on the Reveal gate", () => {
    expect(ACCEPT_SEED.map((e) => [e.kind, e.stage, e.gates])).toEqual([
      ["acceptance", "penerimaan", ["accept"]],
      ["announcement", "penerimaan", ["reveal"]],
    ]);
    expect(ACCEPT_SEED[0].internal).toBe(true);
    expect(ACCEPT_SEED[1].internal).toBe(false);
  });

  it("sorts after the pick windows", () => {
    expect(ACCEPT_SEED.map((e) => e.sort)).toEqual([
      EVENT_SEED.length + PICK_SEED.length,
      EVENT_SEED.length + PICK_SEED.length + 1,
    ]);
  });

  it("gives the final envelopes 12.00 on 6 January 2027", () => {
    const at = revealAtFor(ACCEPT_SEED as never, "penerimaan");
    expect(at?.toISOString()).toBe("2027-01-06T05:00:00.000Z");
  });
});

describe("migration 0057 carries the seed", () => {
  const sql = readFileSync(resolve(__dirname, "../../../drizzle/0057_rec_acceptance.sql"), "utf8");
  it("holds acceptSeedSql() verbatim", () => {
    expect(sql).toContain(acceptSeedSql());
  });
  it("skips an edition that already has the event", () => {
    expect(acceptSeedSql()).toContain("NOT EXISTS");
  });
});
