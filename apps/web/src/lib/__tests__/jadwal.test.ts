import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SLOT_MULAI, hariIniWib, idHuntSusulan } from "../jadwal";

// Stage 18: apps/modul4/server.py's own JADWAL_MULAI tuple must name the
// exact same four clock times as SLOT_MULAI here, since the schedule that
// api/agent/index.ts now pushes to the PC (jadwalModul4Hari()) is matched
// against server.py's own JADWAL["sesi"][slot.id] by slot number alone --
// a silent drift between the two would misfile a session at the wrong time
// on the scoreboard without either side ever raising an error.
const SERVER_PY = fileURLToPath(new URL("../../../../modul4/server.py", import.meta.url));

describe("SLOT_MULAI stays in sync with apps/modul4/server.py's JADWAL_MULAI", () => {
  it("names the same four clock times, in the same order", () => {
    const source = readFileSync(SERVER_PY, "utf-8");
    const match = source.match(/^JADWAL_MULAI = \(([^)]+)\)/m);
    expect(match).not.toBeNull();

    const fromServer = match![1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/^"|"$/g, ""));

    const fromWeb = [1, 2, 3, 4].map((slot) => SLOT_MULAI[slot]);
    expect(fromServer).toEqual(fromWeb);
  });
});

describe("hariIniWib()", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(hariIniWib()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("idHuntSusulan", () => {
  it("borrows the nearest free slot id", () => {
    expect(idHuntSusulan("20:54", new Set())).toBe(4);
    expect(idHuntSusulan("08:00", new Set())).toBe(1);
    expect(idHuntSusulan("08:00", new Set([1]))).toBe(2);
    expect(idHuntSusulan("13:00", new Set([3, 4]))).toBe(2);
  });

  it("gives up when every slot is taken", () => {
    expect(idHuntSusulan("13:00", new Set([1, 2, 3, 4]))).toBeNull();
  });
});
