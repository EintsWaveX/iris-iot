// The job behind the "Self-host upgrade" button (10 Nov 2026). Started by iris-upgrade.service when
// the web app drops a request into UPGRADE_DIR (see upgrade-lib.mjs for the whole picture). Runs as
// the iris-web user, outside the web process's sandbox, so it may run git, npm and the one sudo
// command deploy.sh needs.
//
//   check     git fetch, then write latest.json: what origin/main has that this build lacks.
//   deploy    deploy origin/main with deploy.sh, wait until the site answers with the new commit; if it
//             does not, put the previous build back by itself.
//   rollback  deploy an earlier build from the history, only one that still has this button.
//
// Plain ESM with no dependencies: node_modules is rebuilt while it runs. Everything it touches goes
// through `d` (the dependencies), so the flow is tested with fakes (api/__tests__/upgrade-job.test.ts).
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path/posix";
import { fileURLToPath } from "node:url";
import {
  MARKER,
  UPGRADE_DIR,
  bacaBuildSha,
  bacaRilis,
  bolehRollback,
  cekPermintaan,
  samaSha,
  tambahRilis,
} from "./upgrade-lib.mjs";

const SEHAT = "http://127.0.0.1:8787/api/sehat";
/** After deploy.sh says the server is up, how long the new commit gets to show in /api/sehat */
const SEHAT_TUNGGU_MS = 40_000;

const pendek = (sha) => (sha ? sha.slice(0, 12) : "");

/**
 * Runs the one request waiting in the request file, if any.
 * `d`: dir, root, sekarang(), baca(path), tulis(path, text), ambil(from, to), tambahLog(text),
 * kosongkanLog(), git(args), deploy(ref), sehat(), tidur(ms).
 */
export async function jalankan(d) {
  const P = {
    req: join(d.dir, "request.json"),
    taken: join(d.dir, "request.taken.json"),
    status: join(d.dir, "status.json"),
    latest: join(d.dir, "latest.json"),
    rilis: join(d.dir, "releases.json"),
  };
  const taken = await d.ambil(P.req, P.taken);
  if (taken === null) return { ran: false };

  let raw = null;
  try {
    raw = JSON.parse(taken);
  } catch {
    /* handled below */
  }
  const req = cekPermintaan(raw);
  await d.kosongkanLog();
  const catat = (m) => d.tambahLog(`[${new Date(d.sekarang()).toISOString()}] ${m}\n`);
  if (!req) {
    await catat("The request file was not a valid request; nothing was done.");
    await d.tulis(
      P.status,
      JSON.stringify({
        id: "invalid",
        action: "check",
        state: "failed",
        step: "Refused",
        startedAt: d.sekarang(),
        finishedAt: d.sekarang(),
        message: "The request was not valid.",
      }),
    );
    return { ran: true, ok: false };
  }

  const status = {
    id: req.id,
    action: req.action,
    state: "running",
    step: "Starting",
    startedAt: d.sekarang(),
  };
  const simpanStatus = (patch) => {
    Object.assign(status, patch);
    return d.tulis(P.status, JSON.stringify(status));
  };
  const selesai = async (ok, message) => {
    await catat(message);
    await simpanStatus({
      state: ok ? "ok" : "failed",
      step: ok ? "Done" : "Stopped",
      message,
      finishedAt: d.sekarang(),
    });
    return { ran: true, ok };
  };

  const git = async (args) => d.git(args);
  const sekarangSha = async () => {
    const dariBerkas = bacaBuildSha(await d.baca(join(d.root, "apps/web/.build-sha")));
    if (dariBerkas) return dariBerkas;
    const r = await git(["rev-parse", "--short=12", "HEAD"]);
    return r.code === 0 ? r.out.trim() || null : null;
  };
  const punyaMarker = async (sha) => (await git(["cat-file", "-e", `${sha}:${MARKER}`])).code === 0;
  const bacaDaftarRilis = async () => {
    try {
      return bacaRilis(JSON.parse((await d.baca(P.rilis)) ?? "[]"));
    } catch {
      return [];
    }
  };
  const simpanRilis = (r) => d.tulis(P.rilis, JSON.stringify(r));

  await catat(`Request ${req.id}: ${req.action} by ${req.by}`);
  const dari = await sekarangSha();
  await simpanStatus({ from: dari ?? undefined });

  await simpanStatus({ step: "Fetching from GitHub" });
  const f = await git(["fetch", "--quiet", "origin"]);
  if (f.code !== 0) return selesai(false, `git fetch failed: ${f.out.trim().slice(0, 300)}`);
  const h = await git(["rev-parse", "origin/main"]);
  if (h.code !== 0) return selesai(false, "Could not read origin/main.");
  const head = h.out.trim();

  if (req.action === "check") {
    const range = dari ? `${dari}..origin/main` : "origin/main";
    const lg = await git(["log", "--format=%h%x09%ct%x09%s", "-n", "30", range]);
    const ahead = (lg.code === 0 ? lg.out : "")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [sha, ct, ...s] = l.split("\t");
        return { sha, at: Number(ct) * 1000 || 0, subject: s.join("\t").slice(0, 200) };
      });
    await d.tulis(
      P.latest,
      JSON.stringify({ fetchedAt: d.sekarang(), head: pendek(head), current: dari, ahead }),
    );
    return selesai(
      true,
      ahead.length
        ? `${ahead.length} newer commit(s) on main; running ${dari ?? "unknown"}.`
        : "Up to date.",
    );
  }

  let rilis = await bacaDaftarRilis();
  // The build running now joins the history when it has this button, so there is something to go back to.
  if (dari && !rilis.some((r) => samaSha(r.sha, dari)) && (await punyaMarker(dari))) {
    rilis = tambahRilis(rilis, { sha: dari, at: d.sekarang(), by: "seed", action: "seed" });
    await simpanRilis(rilis);
  }

  let target;
  if (req.action === "deploy") {
    target = head;
    if (samaSha(dari, target)) return selesai(true, `Already running ${pendek(target)}.`);
  } else {
    const v = await git(["rev-parse", "--verify", `${req.ref}^{commit}`]);
    if (v.code !== 0) return selesai(false, `Unknown build ${req.ref}.`);
    target = v.out.trim();
    if (!bolehRollback(rilis, dari, target, await punyaMarker(target)))
      return selesai(
        false,
        `Refused: ${pendek(target)} is not a build this page may roll back to (it must be one that ran ` +
          `through this button and still has the button).`,
      );
  }

  await simpanStatus({
    step: `${req.action === "deploy" ? "Building" : "Rolling back to"} ${pendek(target)} (about 2 to 4 minutes)`,
    target: pendek(target),
  });
  await catat(`Deploying ${pendek(target)}${dari ? ` (was ${dari})` : ""}`);
  const kode = await d.deploy(target);
  let sehat = false;
  if (kode === 0) {
    await simpanStatus({ step: "Checking the new build answers" });
    sehat = await menungguSehat(d, pendek(target));
  }
  if (kode === 0 && sehat) {
    await simpanRilis(
      tambahRilis(rilis, {
        sha: pendek(target),
        at: d.sekarang(),
        by: req.by,
        action: req.action,
      }),
    );
    return selesai(true, `Now running ${pendek(target)}.`);
  }

  // It did not build or did not come up: put the build that was running back.
  if (!dari) return selesai(false, `${pendek(target)} failed and the previous build is unknown.`);
  await simpanStatus({ step: `Putting ${dari} back` });
  await catat(
    `${pendek(target)} failed (exit ${kode}, answering: ${sehat}); putting ${dari} back.`,
  );
  const kode2 = await d.deploy(dari);
  const sehat2 = kode2 === 0 && (await menungguSehat(d, dari));
  return selesai(
    false,
    sehat2
      ? `${pendek(target)} failed, so ${dari} was put back and the site is answering.`
      : `${pendek(target)} failed and putting ${dari} back did not work: check the site now.`,
  );
}

async function menungguSehat(d, sha12) {
  const sampai = d.sekarang() + SEHAT_TUNGGU_MS;
  for (;;) {
    const s = await d.sehat();
    if (s && samaSha(s.sha, sha12)) return true;
    if (d.sekarang() >= sampai) return false;
    await d.tidur(2000);
  }
}

/* ------------------------------------------------------------------ the real dependencies */

function jalankanProses(cmd, args, opsi, perBaris) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { ...opsi, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let sisa = "";
    const masuk = (b) => {
      const s = b.toString();
      out += s;
      if (!perBaris) return;
      sisa += s;
      const baris = sisa.split("\n");
      sisa = baris.pop() ?? "";
      for (const l of baris) perBaris(l);
    };
    p.stdout.on("data", masuk);
    p.stderr.on("data", masuk);
    p.on("error", (e) => resolve({ code: 127, out: String(e) }));
    p.on("close", (code) => {
      if (perBaris && sisa) perBaris(sisa);
      resolve({ code: code ?? 1, out });
    });
  });
}

export function nyata(
  dir = process.env.UPGRADE_DIR || UPGRADE_DIR,
  root = process.env.IRIS_ROOT || "/opt/iris-web",
) {
  const berkasLog = join(dir, "log.txt");
  let antre = Promise.resolve();
  const tambahLog = (t) => {
    antre = antre.then(() => appendFile(berkasLog, t).catch(() => undefined));
    return antre;
  };
  return {
    dir,
    root,
    sekarang: () => Date.now(),
    tidur: (ms) => new Promise((r) => setTimeout(r, ms)),
    baca: async (p) => {
      try {
        return await readFile(p, "utf8");
      } catch {
        return null;
      }
    },
    // Written under another name and renamed, so a page reading it never sees half a file
    tulis: async (p, t) => {
      const tmp = `${p}.tmp`;
      await writeFile(tmp, t);
      await rename(tmp, p);
    },
    ambil: async (dari, ke) => {
      try {
        await rename(dari, ke);
      } catch {
        return null;
      }
      return readFile(ke, "utf8").catch(() => null);
    },
    tambahLog,
    kosongkanLog: () => writeFile(berkasLog, ""),
    git: (args) => jalankanProses("git", args, { cwd: root }),
    deploy: async (ref) => {
      const r = await jalankanProses(
        "bash",
        [join(root, "apps/web/deploy/deploy.sh"), ref],
        { cwd: root, env: process.env },
        (l) => void tambahLog(`${l}\n`),
      );
      await antre;
      return r.code;
    },
    sehat: async () => {
      try {
        const r = await fetch(SEHAT, { signal: AbortSignal.timeout(3000) });
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    },
  };
}

// Run directly (by the unit): do the one waiting request, then leave.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const d = nyata();
  await mkdir(d.dir, { recursive: true });
  const r = await jalankan(d);
  process.exit(r.ran && !r.ok ? 1 : 0);
}
