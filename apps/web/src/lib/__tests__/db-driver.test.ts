import { describe, expect, it } from "vitest";
import { pakaiNeon } from "../db.js";

describe("which driver reaches DATABASE_URL", () => {
  it("uses Neon's WebSocket driver for a neon.tech host, pooled or not", () => {
    expect(
      pakaiNeon(
        "postgresql://u:p@ep-young-truth-b3x1193q-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb",
        undefined,
      ),
    ).toBe(true);
    expect(
      pakaiNeon(
        "postgresql://u:p@ep-young-truth-b3x1193q.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
        undefined,
      ),
    ).toBe(true);
  });

  it("uses plain node-postgres for a Postgres of our own", () => {
    expect(pakaiNeon("postgresql://iris:p@127.0.0.1:5432/iris", undefined)).toBe(false);
    expect(pakaiNeon("postgresql://iris:p@localhost/iris", undefined)).toBe(false);
    expect(pakaiNeon("postgres://iris@/iris?host=/run/postgresql", undefined)).toBe(false);
  });

  it("does not take a host that merely contains neon.tech for Neon", () => {
    expect(pakaiNeon("postgresql://u:p@neon.tech.example.com/db", undefined)).toBe(false);
    expect(pakaiNeon("postgresql://u:p@db.notneon.tech.evil.test/db", undefined)).toBe(false);
  });

  it("lets IRIS_DB_DRIVER force either one, and treats an unreadable URL as plain", () => {
    expect(pakaiNeon("postgresql://iris@127.0.0.1/iris", "neon")).toBe(true);
    expect(pakaiNeon("postgresql://u:p@ep-x.neon.tech/db", "pg")).toBe(false);
    expect(pakaiNeon("not a url", undefined)).toBe(false);
  });
});
