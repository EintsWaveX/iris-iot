import { describe, it, expect } from "vitest";
import { batasLuringDetik, INTERVAL_AKTIF_SEC, INTERVAL_IDLE_SEC } from "../server-lib";

describe("batasLuringDetik", () => {
  const mulai = new Date("2026-09-24T02:30:00Z");

  it("allows the idle interval when no session is running", () => {
    // The old flat 60s marked a healthy Pi offline for 9 of every 10 idle
    // minutes, since outside a session it only reports every 600s.
    const pada = new Date("2026-09-24T01:00:00Z");
    expect(batasLuringDetik(pada, null)).toBeGreaterThan(INTERVAL_IDLE_SEC);
  });

  it("uses the fast interval once a beat arrived during the running session", () => {
    const pada = new Date("2026-09-24T02:31:00Z");
    const batas = batasLuringDetik(pada, mulai);
    expect(batas).toBeGreaterThan(INTERVAL_AKTIF_SEC);
    expect(batas).toBeLessThan(INTERVAL_IDLE_SEC);
  });

  it("still allows the idle interval for the last beat before the session started", () => {
    // That beat was answered with the 600s interval, so the next one can
    // legitimately be up to 10 minutes away even though a session runs now.
    const pada = new Date("2026-09-24T02:25:00Z");
    expect(batasLuringDetik(pada, mulai)).toBeGreaterThan(INTERVAL_IDLE_SEC);
  });
});
