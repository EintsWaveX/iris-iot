import { describe, expect, it } from "vitest";
import { porsiSesi } from "../sesi-waktu";

/**
 * The Praktikan session row's underline (Phase 21, f2): the part of the
 * session gone, 0 to 1.
 */

const MULAI = "2026-10-19T06:30:00+07:00";
const pada = (jam: string) => Date.parse(`2026-10-19T${jam}:00+07:00`);

describe("porsiSesi", () => {
  it("is half way 75 minutes into a 150 minute session", () => {
    expect(porsiSesi(MULAI, 150, pada("07:45"))).toBeCloseTo(0.5);
  });

  it("stays full past the end", () => {
    expect(porsiSesi(MULAI, 150, pada("10:00"))).toBe(1);
  });

  it("stays empty before the start", () => {
    expect(porsiSesi(MULAI, 150, pada("06:00"))).toBe(0);
  });

  it("is empty without a start time", () => {
    expect(porsiSesi(null, 150, pada("07:45"))).toBe(0);
  });

  it("is empty for a session with no length", () => {
    expect(porsiSesi(MULAI, 0, pada("07:45"))).toBe(0);
  });
});
