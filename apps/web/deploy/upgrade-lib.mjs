// The pure rules of the self-host upgrade button (10 Nov 2026), shared by the job that does the work
// (upgrade-job.mjs), the API that asks for it (api/upgrade/[aksi].ts) and the page. Plain ESM with no
// imports, so the job can run it with nothing installed (it runs while node_modules is being rebuilt).
//
// How the button works: the web process is sandboxed (ProtectSystem=strict, NoNewPrivileges) and
// cannot run git, npm or sudo. It only writes a request file into UPGRADE_DIR. A systemd path unit
// (iris-upgrade.path) sees the file and starts iris-upgrade.service, which runs upgrade-job.mjs outside
// the sandbox. The job writes status.json, log.txt, latest.json and releases.json into the same
// directory, and the page reads them back through the API.

/** Where the request, status, log and history live (created once by DEPLOY.md section 7) */
export const UPGRADE_DIR = "/var/lib/iris-web/upgrade";

/**
 * A build can only be rolled back to if it has the upgrade button itself: this file must exist in
 * that commit. Rolling back past the button's own build would take the button, and the API it talks
 * to, away (user, 2026-11-10: roll back "only to when the button was added").
 */
export const MARKER = "apps/web/deploy/upgrade-job.mjs";

export const ACTIONS = ["check", "deploy", "rollback"];

/** A commit, short or full */
export const SHA_RE = /^[0-9a-f]{7,40}$/;

/** How many past builds the page offers for a rollback, and how many the history keeps */
export const ROLLBACK_MAX = 5;
export const HISTORY_MAX = 20;

/** The last lines of the job's log the page shows */
export const LOG_LINES = 60;

/**
 * Reads a request someone wrote into the request file. Null when it is not one: the job never acts
 * on anything it cannot read back exactly.
 */
export function cekPermintaan(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const { id, action, ref, by, at } = v;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{4,40}$/.test(id)) return null;
  if (!ACTIONS.includes(action)) return null;
  if (typeof by !== "string" || by.length < 1 || by.length > 40) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (action === "rollback") {
    if (typeof ref !== "string" || !SHA_RE.test(ref)) return null;
    return { id, action, ref, by, at };
  }
  if (ref !== undefined && ref !== null) return null;
  return { id, action, by, at };
}

/** Two commits are the same build when one is a prefix of the other (12 characters against 40) */
export const samaSha = (a, b) =>
  !!a && !!b && SHA_RE.test(a) && SHA_RE.test(b) && (a.startsWith(b) || b.startsWith(a));

/** Reads the history file forgivingly: junk gives an empty history, bad rows are dropped */
export function bacaRilis(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const r of v) {
    if (!r || typeof r !== "object") continue;
    if (typeof r.sha !== "string" || !SHA_RE.test(r.sha)) continue;
    out.push({
      sha: r.sha,
      at: typeof r.at === "number" ? r.at : 0,
      by: typeof r.by === "string" ? r.by.slice(0, 40) : "",
      action: ["seed", "deploy", "rollback"].includes(r.action) ? r.action : "deploy",
    });
  }
  return out;
}

/** Puts a build at the front of the history, once (an older row of the same build goes) */
export function tambahRilis(rilis, baru) {
  const sisa = rilis.filter((r) => !samaSha(r.sha, baru.sha));
  return [baru, ...sisa].slice(0, HISTORY_MAX);
}

/** The builds a rollback may go to: past builds, newest first, not the one running now */
export function pilihRollback(rilis, sekarang) {
  return rilis.filter((r) => !samaSha(r.sha, sekarang)).slice(0, ROLLBACK_MAX);
}

/**
 * Whether a rollback to `target` is allowed: it is one of the offered builds, and the commit still
 * has the button (`punyaMarker`, read from git by the caller).
 */
export function bolehRollback(rilis, sekarang, target, punyaMarker) {
  if (!punyaMarker) return false;
  if (!SHA_RE.test(target)) return false;
  return pilihRollback(rilis, sekarang).some((r) => samaSha(r.sha, target));
}

/** The last `n` lines of a text, for the page */
export function ekor(teks, n = LOG_LINES) {
  const baris = String(teks ?? "").split("\n");
  if (baris.length && baris[baris.length - 1] === "") baris.pop();
  return baris.slice(-n);
}

/** `IRIS_BUILD_SHA=abc123` (the file deploy.sh writes) to the commit, or null */
export function bacaBuildSha(teks) {
  const m = /^IRIS_BUILD_SHA=([0-9a-f]{7,40})\s*$/m.exec(String(teks ?? ""));
  return m ? m[1] : null;
}
