/**
 * Every action a recruitment handler answers must be reachable through the router (9 Nov 2026). The
 * violation features shipped with handlers and tests that called the handlers directly, while the router
 * (recruitment-s3.ts) did not list test-warning, room-strike, room-warn, room-hold or room-penalty, so
 * the live site answered them with 401 or 404. This scans the sources, like the live-updates test does.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LIB = resolve(__dirname, "..");
const read = (f: string) => readFileSync(join(LIB, f), "utf8");

/** The `case "..."` labels of the first `switch (aksi)` in a handler file */
function casesOf(src: string): string[] {
  const i = src.indexOf("switch (aksi)");
  if (i < 0) return [];
  const body = src.slice(i, src.indexOf("\n  }\n", i));
  return [...body.matchAll(/case "([a-z-]+)":/g)].map((m) => m[1]);
}

describe("the router lists every action the handlers answer", () => {
  const router = read("recruitment-s3.ts");
  const routed = (aksi: string) => new RegExp(String.raw`^\s+"?${aksi}"?:`, "m").test(router);

  it("the candidate's seat (test and test-*)", () => {
    const aksi = casesOf(read("recruitment-seat.ts"));
    expect(aksi.length).toBeGreaterThan(5);
    expect(aksi.filter((a) => !routed(a))).toEqual([]);
  });

  it("the room console (room and room-*)", () => {
    const aksi = casesOf(read("recruitment-room.ts")).filter((a) => a.startsWith("room"));
    expect(aksi.length).toBeGreaterThan(8);
    expect(aksi.filter((a) => !routed(a))).toEqual([]);
  });

  it("knows the five actions that were missing", () => {
    for (const a of ["test-warning", "room-strike", "room-warn", "room-hold", "room-penalty"])
      expect(routed(a), a).toBe(true);
  });
});
