import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cocokkanRute, petaRute } from "../routes.js";

const AKAR = resolve(__dirname, "..", "..");
const rute = petaRute(AKAR);
const dapat = (path: string) => {
  const r = cocokkanRute(rute, path);
  return r ? { berkas: r.rute.berkas, param: r.param } : null;
};

describe("file routing for api/", () => {
  it("finds the route files and none of the shared code or tests", () => {
    const nama = rute.map((r) => r.berkas);
    expect(nama).toContain("api/agent/index.ts");
    expect(nama).toContain("api/action.ts");
    expect(nama).toContain("api/auth/[aksi].ts");
    expect(nama.some((n) => n.includes("_lib") || n.includes("__tests__"))).toBe(false);
  });

  it.each([
    ["/api/agent", "api/agent/index.ts", {}],
    ["/api/agent/", "api/agent/index.ts", {}],
    ["/api/action", "api/action.ts", {}],
    ["/api/server", "api/server/index.ts", {}],
    ["/api/server/12", "api/server/[id].ts", { id: "12" }],
    ["/api/session", "api/session/index.ts", {}],
    ["/api/session/group", "api/session/[aksi].ts", { aksi: "group" }],
    ["/api/auth/student", "api/auth/[aksi].ts", { aksi: "student" }],
    ["/api/tp/detak", "api/tp/[aksi].ts", { aksi: "detak" }],
    ["/api/server/a%20b", "api/server/[id].ts", { id: "a b" }],
  ])("%s -> %s", (path, berkas, param) => {
    expect(dapat(path)).toEqual({ berkas, param });
  });

  it("answers nothing for an unknown or too-deep path", () => {
    expect(dapat("/api/nope")).toBeNull();
    expect(dapat("/api/session/a/b")).toBeNull();
    expect(dapat("/en/modules/3")).toBeNull();
  });

  it("has a real file behind every vercel.json function entry", () => {
    const config = JSON.parse(readFileSync(resolve(AKAR, "vercel.json"), "utf8"));
    const nama = new Set(rute.map((r) => r.berkas));
    for (const k of Object.keys(config.functions ?? {})) expect(nama.has(k)).toBe(true);
  });
});
