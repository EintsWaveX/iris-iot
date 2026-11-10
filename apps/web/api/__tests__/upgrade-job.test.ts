/**
 * The job behind the Self-host upgrade button (deploy/upgrade-job.mjs), run against fakes: a made-up
 * disk, a made-up git and a made-up deploy.sh. What matters: a request runs once, a deploy that does
 * not come up is replaced by the previous build by itself, and a rollback goes only to a build that
 * ran through the button and still has it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { jalankan, type JobDeps } from "../../deploy/upgrade-job.mjs";
import { MARKER } from "../../deploy/upgrade-lib.mjs";

const DIR = "/var/lib/iris-web/upgrade";
const A = "aaaaaaaaaaaa"; // the build that runs now
const B = "bbbbbbbbbbbb"; // the newest main
const OLD = "cccccccccccc"; // an older build, from before the button

let files: Map<string, string>;
let log: string[];
let deployed: string[];
/** What each deploy.sh run does: its exit code, and the commit the site answers with afterwards */
let deployPlan: { code: number; sehat: string | null }[];
let sehatSha: string | null;
let withMarker: Set<string>;
let head: string;
let now: number;
let gitLog: string;

const d = (): JobDeps => ({
  dir: DIR,
  root: "/opt/iris-web",
  sekarang: () => now,
  tidur: async (ms) => {
    now += ms;
  },
  baca: async (p) => files.get(p) ?? null,
  tulis: async (p, t) => void files.set(p, t),
  ambil: async (from, to) => {
    const v = files.get(from);
    if (v === undefined) return null;
    files.delete(from);
    files.set(to, v);
    return v;
  },
  tambahLog: (t) => void log.push(t),
  kosongkanLog: () => void (log = []),
  git: async (args) => {
    if (args[0] === "fetch") return { code: 0, out: "" };
    if (args[0] === "rev-parse" && args[1] === "origin/main") return { code: 0, out: head + "\n" };
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      const sha = args[2].replace("^{commit}", "");
      return [A, B, OLD].some((x) => x.startsWith(sha) || sha.startsWith(x))
        ? { code: 0, out: sha + "\n" }
        : { code: 128, out: "fatal" };
    }
    if (args[0] === "rev-parse") return { code: 0, out: A + "\n" };
    if (args[0] === "cat-file") {
      const sha = args[2].split(":")[0];
      return withMarker.has(sha) && args[2].endsWith(MARKER)
        ? { code: 0, out: "" }
        : { code: 1, out: "" };
    }
    if (args[0] === "log") return { code: 0, out: gitLog };
    return { code: 1, out: "unexpected " + args.join(" ") };
  },
  deploy: async (ref) => {
    deployed.push(ref);
    const plan = deployPlan.shift() ?? { code: 0, sehat: ref.slice(0, 12) };
    sehatSha = plan.sehat;
    return plan.code;
  },
  sehat: async () => (sehatSha ? { sha: sehatSha } : null),
});

const ask = (r: Record<string, unknown>) =>
  files.set(`${DIR}/request.json`, JSON.stringify({ by: "101022300172", at: 1, ...r }));
const status = () => JSON.parse(files.get(`${DIR}/status.json`)!);
const rilis = () => JSON.parse(files.get(`${DIR}/releases.json`) ?? "[]");

beforeEach(() => {
  files = new Map([["/opt/iris-web/apps/web/.build-sha", `IRIS_BUILD_SHA=${A}\n`]]);
  log = [];
  deployed = [];
  deployPlan = [];
  sehatSha = A;
  withMarker = new Set([A, B]);
  head = B.repeat(1) + "0".repeat(28);
  now = 1_000_000;
  gitLog = `${B}\t1700000000\tweb: a change\n`;
});

describe("a request", () => {
  it("does nothing when there is none", async () => {
    expect(await jalankan(d())).toEqual({ ran: false });
    expect(files.has(`${DIR}/status.json`)).toBe(false);
  });
  it("runs once: the request file is moved away", async () => {
    ask({ id: "u1abcd", action: "check" });
    await jalankan(d());
    expect(files.has(`${DIR}/request.json`)).toBe(false);
    expect((await jalankan(d())).ran).toBe(false);
  });
  it("refuses a request that is not valid, and does not run anything", async () => {
    for (const bad of [
      { id: "u1abcd", action: "format-disk" },
      { id: "x", action: "check" },
      { id: "u1abcd", action: "rollback" },
      { id: "u1abcd", action: "rollback", ref: "main; rm -rf /" },
    ]) {
      files.delete(`${DIR}/status.json`);
      ask(bad);
      const r = await jalankan(d());
      expect(r, JSON.stringify(bad)).toEqual({ ran: true, ok: false });
      expect(status().state).toBe("failed");
      expect(deployed).toEqual([]);
    }
    files.set(`${DIR}/request.json`, "{not json");
    expect((await jalankan(d())).ok).toBe(false);
    expect(deployed).toEqual([]);
  });
});

describe("check", () => {
  it("writes what main has on top of the running build", async () => {
    ask({ id: "u1abcd", action: "check" });
    const r = await jalankan(d());
    expect(r.ok).toBe(true);
    const latest = JSON.parse(files.get(`${DIR}/latest.json`)!);
    expect(latest).toMatchObject({ current: A, ahead: [{ sha: B, subject: "web: a change" }] });
    expect(latest.head).toHaveLength(12);
    expect(status()).toMatchObject({ state: "ok", action: "check" });
    expect(deployed).toEqual([]);
  });
  it("says it is up to date when nothing is ahead", async () => {
    gitLog = "";
    ask({ id: "u1abcd", action: "check" });
    await jalankan(d());
    expect(status().message).toBe("Up to date.");
  });
});

describe("deploy", () => {
  it("builds main, waits for the site to answer with it, and keeps the old build to go back to", async () => {
    ask({ id: "u1abcd", action: "deploy" });
    const r = await jalankan(d());
    expect(r.ok).toBe(true);
    expect(deployed).toEqual([head]);
    expect(status()).toMatchObject({ state: "ok", target: B, from: A });
    // The old build joined the history (it has the button), then the new one went in front
    expect(rilis().map((x: { sha: string }) => x.sha)).toEqual([B, A]);
    expect(rilis()[1]).toMatchObject({ action: "seed" });
  });
  it("does nothing when main is what already runs", async () => {
    head = A + "0".repeat(28);
    ask({ id: "u1abcd", action: "deploy" });
    const r = await jalankan(d());
    expect(r.ok).toBe(true);
    expect(deployed).toEqual([]);
    expect(status().message).toContain("Already running");
  });
  it("does not seed a running build that has no button", async () => {
    withMarker = new Set([B]);
    ask({ id: "u1abcd", action: "deploy" });
    await jalankan(d());
    expect(rilis().map((x: { sha: string }) => x.sha)).toEqual([B]);
  });
  it("puts the previous build back by itself when the new one fails to build", async () => {
    deployPlan = [
      { code: 1, sehat: A },
      { code: 0, sehat: A },
    ];
    ask({ id: "u1abcd", action: "deploy" });
    const r = await jalankan(d());
    expect(r.ok).toBe(false);
    expect(deployed).toEqual([head, A]);
    expect(status().state).toBe("failed");
    expect(status().message).toContain("put back");
    expect(status().message).toContain("answering");
    // A build that failed is not offered for a rollback
    expect(rilis().map((x: { sha: string }) => x.sha)).toEqual([A]);
  });
  it("puts the previous build back when the new one builds but never answers with its commit", async () => {
    deployPlan = [
      { code: 0, sehat: null },
      { code: 0, sehat: A },
    ];
    ask({ id: "u1abcd", action: "deploy" });
    await jalankan(d());
    expect(deployed).toEqual([head, A]);
    expect(status().state).toBe("failed");
  });
  it("says so when putting the previous build back does not work either", async () => {
    deployPlan = [
      { code: 1, sehat: null },
      { code: 1, sehat: null },
    ];
    ask({ id: "u1abcd", action: "deploy" });
    await jalankan(d());
    expect(status().message).toContain("did not work");
  });
  it("keeps a log of the request and the outcome", async () => {
    ask({ id: "u1abcd", action: "deploy" });
    await jalankan(d());
    const text = log.join("");
    expect(text).toContain("Request u1abcd: deploy by 101022300172");
    expect(text).toContain("Now running");
  });
});

describe("rollback", () => {
  const prepare = () => {
    files.set(
      `${DIR}/releases.json`,
      JSON.stringify([
        { sha: B, at: 3, by: "x", action: "deploy" },
        { sha: A, at: 2, by: "seed", action: "seed" },
      ]),
    );
    // B is what runs now
    files.set("/opt/iris-web/apps/web/.build-sha", `IRIS_BUILD_SHA=${B}\n`);
    sehatSha = B;
  };

  it("goes back to an earlier build that ran through the button", async () => {
    prepare();
    ask({ id: "u1abcd", action: "rollback", ref: A });
    const r = await jalankan(d());
    expect(r.ok).toBe(true);
    expect(deployed).toEqual([A]);
    expect(rilis()[0]).toMatchObject({ sha: A, action: "rollback" });
  });
  it("refuses a build that is not in the history, even a real one", async () => {
    prepare();
    withMarker.add(OLD);
    ask({ id: "u1abcd", action: "rollback", ref: OLD });
    const r = await jalankan(d());
    expect(r.ok).toBe(false);
    expect(status().message).toContain("Refused");
    expect(deployed).toEqual([]);
  });
  it("refuses a build from before the button, even when it is in the history", async () => {
    prepare();
    withMarker = new Set([B]); // A has no button
    ask({ id: "u1abcd", action: "rollback", ref: A });
    const r = await jalankan(d());
    expect(r.ok).toBe(false);
    expect(deployed).toEqual([]);
  });
  it("refuses the build that already runs", async () => {
    prepare();
    ask({ id: "u1abcd", action: "rollback", ref: B });
    expect((await jalankan(d())).ok).toBe(false);
    expect(deployed).toEqual([]);
  });
  it("refuses a commit git does not know", async () => {
    prepare();
    ask({ id: "u1abcd", action: "rollback", ref: "deadbeefdead" });
    const r = await jalankan(d());
    expect(r.ok).toBe(false);
    expect(status().message).toContain("Unknown build");
    expect(deployed).toEqual([]);
  });
  it("puts the running build back if the rollback itself fails", async () => {
    prepare();
    deployPlan = [
      { code: 1, sehat: null },
      { code: 0, sehat: B },
    ];
    ask({ id: "u1abcd", action: "rollback", ref: A });
    const r = await jalankan(d());
    expect(r.ok).toBe(false);
    expect(deployed).toEqual([A, B]);
  });
});
