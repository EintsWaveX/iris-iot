import { describe, it, expect, beforeAll, vi } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long";
});

const { createSessionCookie, readSessionCookie, sessionCookieHeader, clearSessionCookieHeader } =
  await import("../auth");

describe("session cookie", () => {
  it("round-trips a payload through sign and verify", () => {
    const cookie = createSessionCookie({ role: "praktikan", nim: "2311102001", nama: "Alya" });
    const payload = readSessionCookie(cookie);
    expect(payload).toMatchObject({ role: "praktikan", nim: "2311102001", nama: "Alya" });
  });

  it("rejects a tampered payload even if the signature format still looks valid", () => {
    const cookie = createSessionCookie({ role: "asisten", nim: "101022300013", nama: "Bustan" });
    const [, sig] = cookie.split(".");
    // Flip the role claimed in the body without re-signing it.
    const tamperedBody = Buffer.from(
      JSON.stringify({ role: "asisten", nim: "999", nama: "attacker", exp: 9999999999 }),
    ).toString("base64url");
    expect(readSessionCookie(`${tamperedBody}.${sig}`)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const cookie = createSessionCookie({ role: "praktikan", nim: "1", nama: "x" });
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "a-completely-different-secret-value-here";
    expect(readSessionCookie(cookie)).toBeNull();
    process.env.SESSION_SECRET = original;
  });

  it("rejects an expired payload", () => {
    vi.useFakeTimers();
    const cookie = createSessionCookie({ role: "praktikan", nim: "1", nama: "x" });
    vi.advanceTimersByTime(3 * 60 * 60 * 1000); // past the 2-hour TTL
    expect(readSessionCookie(cookie)).toBeNull();
    vi.useRealTimers();
  });

  it("rejects malformed input without throwing", () => {
    expect(readSessionCookie(undefined)).toBeNull();
    expect(readSessionCookie("")).toBeNull();
    expect(readSessionCookie("not-a-cookie")).toBeNull();
    expect(readSessionCookie("a.b.c")).toBeNull();
  });

  it("emits an httpOnly, Secure, SameSite=Lax cookie header", () => {
    const header = sessionCookieHeader("abc.def");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
  });

  it("clears the cookie with Max-Age=0", () => {
    expect(clearSessionCookieHeader()).toContain("Max-Age=0");
  });
});
