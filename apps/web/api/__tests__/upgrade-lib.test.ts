/**
 * The pure rules of the upgrade button (deploy/upgrade-lib.mjs).
 */
import { describe, expect, it } from "vitest";
import {
  HISTORY_MAX,
  ROLLBACK_MAX,
  bacaBuildSha,
  bacaRilis,
  bolehRollback,
  cekPermintaan,
  ekor,
  pilihRollback,
  samaSha,
  tambahRilis,
} from "../../deploy/upgrade-lib.mjs";

const sha = (c: string) => c.repeat(12);
const rel = (c: string, at = 1) => ({ sha: sha(c), at, by: "x", action: "deploy" as const });

describe("cekPermintaan", () => {
  const ok = { id: "u1abcd", action: "check", by: "101022300172", at: 5 };
  it("reads a valid request", () => {
    expect(cekPermintaan(ok)).toEqual(ok);
    expect(cekPermintaan({ ...ok, action: "deploy" })).toMatchObject({ action: "deploy" });
    expect(cekPermintaan({ ...ok, action: "rollback", ref: sha("a") })).toMatchObject({
      ref: sha("a"),
    });
  });
  it("refuses anything else", () => {
    for (const bad of [
      null,
      "x",
      [],
      {},
      { ...ok, id: "a b" },
      { ...ok, id: "x" },
      { ...ok, action: "reboot" },
      { ...ok, by: "" },
      { ...ok, at: "now" },
      { ...ok, at: NaN },
      { ...ok, action: "rollback" },
      { ...ok, action: "rollback", ref: "main" },
      { ...ok, action: "rollback", ref: "abc; id" },
      { ...ok, action: "rollback", ref: sha("a").toUpperCase() },
      { ...ok, ref: sha("a") },
    ])
      expect(cekPermintaan(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe("samaSha", () => {
  it("matches a short commit against a long one", () => {
    expect(samaSha(sha("a"), sha("a") + "b".repeat(28))).toBe(true);
    expect(samaSha(sha("a"), sha("b"))).toBe(false);
    expect(samaSha(null, sha("a"))).toBe(false);
    expect(samaSha("main", "main")).toBe(false);
  });
});

describe("history", () => {
  it("reads junk as empty and drops bad rows", () => {
    expect(bacaRilis(null)).toEqual([]);
    expect(bacaRilis({})).toEqual([]);
    expect(bacaRilis([{ sha: "zzz" }, 5, null, rel("a")])).toHaveLength(1);
  });
  it("puts a build in front once", () => {
    const h = tambahRilis(tambahRilis([], rel("a")), rel("b"));
    expect(h.map((r) => r.sha)).toEqual([sha("b"), sha("a")]);
    expect(tambahRilis(h, rel("a")).map((r) => r.sha)).toEqual([sha("a"), sha("b")]);
  });
  it("keeps a bounded history", () => {
    let h: ReturnType<typeof bacaRilis> = [];
    for (let i = 0; i < HISTORY_MAX + 5; i++)
      h = tambahRilis(h, { ...rel("a"), sha: i.toString(16).padStart(12, "0") });
    expect(h).toHaveLength(HISTORY_MAX);
  });
});

describe("rollback choices", () => {
  const h = [rel("a"), rel("b"), rel("c"), rel("d"), rel("e"), rel("f"), rel("1")];
  it("leaves out the running build and caps the list", () => {
    const l = pilihRollback(h, sha("a"));
    expect(l.map((r) => r.sha)).not.toContain(sha("a"));
    expect(l).toHaveLength(ROLLBACK_MAX);
    expect(pilihRollback([rel("a")], sha("a"))).toEqual([]);
  });
  it("allows a listed build that still has the button", () => {
    expect(bolehRollback(h, sha("a"), sha("b"), true)).toBe(true);
  });
  it("refuses a build without the button, the running build, an unlisted one, and a bad ref", () => {
    expect(bolehRollback(h, sha("a"), sha("b"), false)).toBe(false);
    expect(bolehRollback(h, sha("a"), sha("a"), true)).toBe(false);
    expect(bolehRollback(h, sha("a"), sha("9"), true)).toBe(false);
    expect(bolehRollback(h, sha("a"), "main", true)).toBe(false);
  });
});

describe("small readers", () => {
  it("takes the tail of a log", () => {
    expect(ekor("a\nb\nc\n", 2)).toEqual(["b", "c"]);
    expect(ekor("", 5)).toEqual([""].slice(1));
    expect(ekor(null)).toEqual([]);
  });
  it("reads the build file deploy.sh writes", () => {
    expect(bacaBuildSha(`IRIS_BUILD_SHA=${sha("a")}\n`)).toBe(sha("a"));
    expect(bacaBuildSha("nonsense")).toBeNull();
    expect(bacaBuildSha(undefined)).toBeNull();
  });
});
