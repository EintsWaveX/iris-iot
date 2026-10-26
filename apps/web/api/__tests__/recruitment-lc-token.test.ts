/**
 * When a seat's gateway token expires (prompt 20, fix 4). A real room's
 * token is fixed by its evening; a practice room has no slot, so its expiry
 * must follow the day it is used in, not the day the room was made.
 */
import { describe, expect, it, vi } from "vitest";

process.env.SESSION_SECRET = "x".repeat(40);
vi.mock("../../src/lib/db", () => ({ getDb: () => ({}) }));

const { kedaluwarsaToken } = await import("../_lib/recruitment-lc-common");

const JAM = 3600;
const detik = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

describe("kedaluwarsaToken", () => {
  it("a real room's token ends 8 hours after its evening, whatever the clock says", () => {
    const slot = { endsAt: new Date("2026-11-17T21:00:00+07:00") };
    const room = { createdAt: new Date("2026-11-01T00:00:00Z") };
    const a = kedaluwarsaToken(room, slot, new Date("2026-11-17T12:00:00Z").getTime());
    const b = kedaluwarsaToken(room, slot, new Date("2026-11-20T12:00:00Z").getTime());
    expect(a).toBe(detik("2026-11-17T21:00:00+07:00") + 8 * JAM);
    expect(b).toBe(a);
  });

  it("a practice room made days ago still gets a token that lasts the whole session", () => {
    const room = { createdAt: new Date("2026-11-01T03:00:00Z") };
    const now = new Date("2026-11-05T09:30:00Z").getTime();
    const exp = kedaluwarsaToken(room, null, now);
    expect(exp - Math.floor(now / 1000)).toBeGreaterThanOrEqual(8 * JAM);
  });

  it("is the same all day for a practice room, so the header does not go stale between compiles", () => {
    const room = { createdAt: new Date("2026-11-01T03:00:00Z") };
    const morning = kedaluwarsaToken(room, null, new Date("2026-11-05T00:00:01Z").getTime());
    const night = kedaluwarsaToken(room, null, new Date("2026-11-05T23:59:59Z").getTime());
    expect(night).toBe(morning);
    const next = kedaluwarsaToken(room, null, new Date("2026-11-06T00:00:01Z").getTime());
    expect(next).toBeGreaterThan(morning);
  });

  it("a practice room made just now lasts at least 8 hours too", () => {
    const now = new Date("2026-11-05T23:59:59Z").getTime();
    const exp = kedaluwarsaToken({ createdAt: new Date(now) }, null, now);
    expect(exp - Math.floor(now / 1000)).toBeGreaterThanOrEqual(8 * JAM);
  });
});
