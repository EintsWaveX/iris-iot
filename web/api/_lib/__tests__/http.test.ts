import { describe, it, expect } from "vitest";
import { pgErrorCode } from "../http";

describe("pgErrorCode", () => {
  it("reads a code directly on the error", () => {
    expect(pgErrorCode({ code: "23505" })).toBe("23505");
  });

  it("falls back to err.cause -- how drizzle-orm's neon-serverless driver actually surfaces it", () => {
    // Reproduces the real shape seen from a live Neon unique-violation:
    // DrizzleQueryError has no `code` of its own, only `.cause.code`. A
    // caller checking `err.code` alone (the bug this test guards against)
    // would silently fall through to a generic error instead of the
    // friendly "already exists" response.
    const drizzleQueryError = {
      message: "Failed query: insert into ...",
      cause: { code: "23505", constraint: "sesi_slot_unik" },
    };
    expect(pgErrorCode(drizzleQueryError)).toBe("23505");
  });

  it("prefers a direct code over one on .cause when both exist", () => {
    expect(pgErrorCode({ code: "direct", cause: { code: "nested" } })).toBe("direct");
  });

  it("returns undefined for an error with no code anywhere", () => {
    expect(pgErrorCode(new Error("boom"))).toBeUndefined();
    expect(pgErrorCode({ cause: {} })).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
    expect(pgErrorCode("plain string")).toBeUndefined();
  });
});
