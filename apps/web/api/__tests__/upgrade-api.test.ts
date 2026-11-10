/**
 * The Self-host upgrade API (api/upgrade/[aksi].ts): only the Pencipta, a request is one file that is
 * written once, a deploy waits out an exam or a practicum session while a rollback and a check do
 * not, and a rollback goes only to a build the history offers. The disk is a real temp folder.
 */
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionCookie } from "../../src/lib/auth";

let orang: Record<string, unknown> | null;
let ujian = 0;
let sesi: unknown = null;
const audit: { aksi: string; isi: unknown }[] = [];

vi.mock("../_lib/hak", () => ({ muatOrang: async () => orang }));
vi.mock("../_lib/galat", () => ({ denganGalat: (_r: string, h: unknown) => h }));
vi.mock("../../src/lib/sesi", () => ({ currentSesi: async () => sesi }));
vi.mock("../../src/lib/db", () => ({
  getDb: () => ({ select: () => ({ from: () => ({ where: async () => [{ n: ujian }] }) }) }),
}));
vi.mock("../../src/lib/auth", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  writeAudit: async (_nim: string, aksi: string, isi: unknown) => void audit.push({ aksi, isi }),
}));

const { default: handler } = await import("../upgrade/[aksi]");

const RUN = "aaaaaaaaaaaa";
const OLD = "bbbbbbbbbbbb";
let dir: string;

const cookie = () =>
  `iris_session=${createSessionCookie({ role: "asisten", nim: "101022300172", nama: "Uji" })}`;
const pencipta = (over: Record<string, unknown> = {}) => ({
  nim: "101022300172",
  kode: "NUE",
  nama: "Uji",
  tier: "asisten",
  divisi: null,
  badges: ["pencipta"],
  hakOverride: {},
  status: "aktif",
  ...over,
});

async function panggil(
  method: "GET" | "POST",
  aksi: string,
  o: { body?: unknown; cookie?: string | null } = {},
) {
  const res = {
    code: 200,
    statusCode: 200,
    body: undefined as unknown as Record<string, unknown>,
    headers: {} as Record<string, string>,
    status(n: number) {
      res.code = n;
      res.statusCode = n;
      return res;
    },
    json(b: Record<string, unknown>) {
      res.body = b;
      return res;
    },
    setHeader(k: string, v: string) {
      res.headers[k.toLowerCase()] = v;
    },
    end() {},
  };
  const headers: Record<string, string> = {};
  const c = o.cookie === undefined ? cookie() : o.cookie;
  if (c) headers.cookie = c;
  await (handler as unknown as (q: never, r: never) => Promise<void>)(
    { method, query: { aksi }, body: o.body ?? {}, headers } as never,
    res as never,
  );
  return res;
}

const tulis = (nama: string, v: unknown) =>
  writeFileSync(join(dir, nama), typeof v === "string" ? v : JSON.stringify(v));
const permintaan = () => JSON.parse(readFileSync(join(dir, "request.json"), "utf8"));
const rilis = [
  { sha: RUN, at: 3, by: "x", action: "deploy" },
  { sha: OLD, at: 2, by: "seed", action: "seed" },
];

beforeEach(() => {
  process.env.SESSION_SECRET = "x".repeat(40);
  dir = mkdtempSync(join(tmpdir(), "iris-upgrade-"));
  process.env.UPGRADE_DIR = dir;
  process.env.IRIS_BUILD_SHA = RUN;
  orang = pencipta();
  ujian = 0;
  sesi = null;
  audit.length = 0;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.UPGRADE_DIR;
  delete process.env.IRIS_BUILD_SHA;
});

describe("who may use it", () => {
  it("needs a session", async () => {
    expect((await panggil("GET", "status", { cookie: null })).code).toBe(401);
    expect((await panggil("POST", "deploy", { cookie: null })).code).toBe(401);
  });
  it("is for the Pencipta only: not the Admin tier, not the Ketua's seat, not another Asisten", async () => {
    for (const o of [
      pencipta({ badges: [] }),
      pencipta({ badges: [], tier: "admin" }),
      pencipta({ badges: ["dev"] }),
      null,
    ]) {
      orang = o;
      for (const [m, a] of [
        ["GET", "status"],
        ["POST", "check"],
        ["POST", "deploy"],
        ["POST", "rollback"],
      ] as const) {
        const r = await panggil(m, a, { body: { ref: OLD } });
        expect(r.code, `${m} ${a}`).toBe(403);
      }
    }
    expect(existsSync(join(dir, "request.json"))).toBe(false);
  });
  it("refuses an inactive Pencipta", async () => {
    orang = pencipta({ status: "nonaktif" });
    expect((await panggil("POST", "deploy")).code).toBe(403);
  });
  it("answers the wrong method and an unknown action", async () => {
    expect((await panggil("POST", "status")).code).toBe(405);
    expect((await panggil("GET", "deploy")).code).toBe(405);
    expect((await panggil("POST", "format")).code).toBe(404);
  });
});

describe("status", () => {
  it("says it is not installed when the folder is not there", async () => {
    rmSync(dir, { recursive: true, force: true });
    const r = await panggil("GET", "status");
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ ok: true, enabled: false, build: RUN, busy: false });
    const d = await panggil("POST", "deploy");
    expect(d.code).toBe(503);
    expect(d.body.kode).toBe("belum_terpasang");
  });
  it("reports the build, the job, the log tail and the builds a rollback may go to", async () => {
    tulis("status.json", { id: "u1", state: "ok", startedAt: 1 });
    tulis("latest.json", { fetchedAt: 1, head: OLD, current: RUN, ahead: [] });
    tulis("releases.json", rilis);
    tulis("log.txt", "one\ntwo\nthree\n");
    const r = await panggil("GET", "status");
    expect(r.body).toMatchObject({
      enabled: true,
      build: RUN,
      busy: false,
      examLive: false,
      sessionLive: false,
      log: ["one", "two", "three"],
    });
    // Not the build that runs now
    expect((r.body.rollback as { sha: string }[]).map((x) => x.sha)).toEqual([OLD]);
  });
  it("is busy while a job runs or a request waits, and not for a job that died long ago", async () => {
    tulis("status.json", { id: "u1", state: "running", startedAt: Date.now() });
    expect((await panggil("GET", "status")).body.busy).toBe(true);
    tulis("status.json", { id: "u1", state: "running", startedAt: Date.now() - 31 * 60_000 });
    expect((await panggil("GET", "status")).body.busy).toBe(false);
    tulis("status.json", { id: "u1", state: "ok", startedAt: 1 });
    tulis("request.json", "{}");
    expect((await panggil("GET", "status")).body.busy).toBe(true);
  });
  it("says an exam or a practicum session is running", async () => {
    ujian = 2;
    expect((await panggil("GET", "status")).body.examLive).toBe(true);
    ujian = 0;
    sesi = { id: 1 };
    expect((await panggil("GET", "status")).body.sessionLive).toBe(true);
  });
});

describe("asking for a job", () => {
  it("writes one request for a check, and audits it", async () => {
    const r = await panggil("POST", "check");
    expect(r.code).toBe(200);
    const p = permintaan();
    expect(p).toMatchObject({ action: "check", by: "101022300172" });
    expect(p.id).toBe(r.body.id);
    expect(p.ref).toBeUndefined();
    expect(audit[0]).toMatchObject({ aksi: "web_upgrade", isi: { action: "check" } });
    expect(existsSync(join(dir, "request.json.tmp"))).toBe(false);
  });
  it("writes a deploy request", async () => {
    expect((await panggil("POST", "deploy")).code).toBe(200);
    expect(permintaan().action).toBe("deploy");
  });
  it("refuses a second request while one waits or runs", async () => {
    expect((await panggil("POST", "check")).code).toBe(200);
    const again = await panggil("POST", "deploy");
    expect(again.code).toBe(409);
    expect(again.body.kode).toBe("sedang_jalan");
    rmSync(join(dir, "request.json"));
    tulis("status.json", { id: "u1", state: "running", startedAt: Date.now() });
    expect((await panggil("POST", "check")).body.kode).toBe("sedang_jalan");
  });
  it("lets a job run after a dead one", async () => {
    tulis("status.json", { id: "u1", state: "running", startedAt: Date.now() - 40 * 60_000 });
    expect((await panggil("POST", "deploy")).code).toBe(200);
  });
});

describe("a deploy waits out an exam and a practicum session", () => {
  it("is refused while an exam room runs", async () => {
    ujian = 1;
    const r = await panggil("POST", "deploy");
    expect(r.code).toBe(409);
    expect(r.body.kode).toBe("sedang_ujian");
    expect(existsSync(join(dir, "request.json"))).toBe(false);
  });
  it("is refused while a practicum session runs", async () => {
    sesi = { id: 1 };
    const r = await panggil("POST", "deploy");
    expect(r.code).toBe(409);
    expect(r.body.kode).toBe("sedang_sesi");
  });
  it("does not stop a check or a rollback, which is needed most when something broke", async () => {
    ujian = 1;
    sesi = { id: 1 };
    tulis("releases.json", rilis);
    expect((await panggil("POST", "check")).code).toBe(200);
    rmSync(join(dir, "request.json"));
    expect((await panggil("POST", "rollback", { body: { ref: OLD } })).code).toBe(200);
  });
});

describe("rollback", () => {
  beforeEach(() => tulis("releases.json", rilis));

  it("goes to a build the history offers, and writes it into the request", async () => {
    const r = await panggil("POST", "rollback", { body: { ref: OLD } });
    expect(r.code).toBe(200);
    expect(permintaan()).toMatchObject({ action: "rollback", ref: OLD });
  });
  it("accepts a longer form of the same commit", async () => {
    expect((await panggil("POST", "rollback", { body: { ref: OLD + "0".repeat(28) } })).code).toBe(
      200,
    );
  });
  it("refuses the running build, an unknown one, and a missing or odd ref", async () => {
    for (const ref of [RUN, "cccccccccccc", "", undefined, 5, "main", "HEAD~3", "$(id)"]) {
      const r = await panggil("POST", "rollback", { body: { ref } });
      expect(r.code, String(ref)).toBe(400);
      expect(r.body.kode).toBe("bukan_tujuan_rollback");
    }
    expect(existsSync(join(dir, "request.json"))).toBe(false);
  });
  it("has nothing to go back to before the first upgrade through the button", async () => {
    rmSync(join(dir, "releases.json"));
    expect((await panggil("POST", "rollback", { body: { ref: OLD } })).code).toBe(400);
  });
});
