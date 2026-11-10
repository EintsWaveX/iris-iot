/**
 * The "Self-host upgrade" button (10 Nov 2026): deploy the newest main, or roll back, from the Server
 * page, without opening SSH on the lab PC. The Pencipta only.
 *
 * GET  /api/upgrade/status      the build that runs, what main has on top of it, the job's status and
 *                               log, and the builds a rollback may go to
 * POST /api/upgrade/check       { }        fetch GitHub and list what is new
 * POST /api/upgrade/deploy      { }        build and switch to origin/main; a build that does not come
 *                                          up is replaced by the previous one by itself
 * POST /api/upgrade/rollback    { ref }    switch back to an earlier build, only one that ran through
 *                                          this button and still has it
 *
 * The web process is sandboxed and cannot run git, npm or sudo, so this route only writes a request
 * file into UPGRADE_DIR. iris-upgrade.path sees it and starts iris-upgrade.service, which runs
 * deploy/upgrade-job.mjs outside the sandbox and writes the status back (see deploy/upgrade-lib.mjs
 * and DEPLOY.md section 7). A deploy is refused while an exam room or a practicum session is running:
 * the build uses the PC hard for a few minutes. A rollback is never refused for that reason, because
 * that is when it is needed.
 */
import { access, constants, readFile, rename, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonBody, noStore, requireMethod } from "../_lib/http.js";
import { denganGalat } from "../_lib/galat.js";
import { muatOrang } from "../_lib/hak.js";
import { requireRole } from "../_lib/session.js";
import { getDb } from "../../src/lib/db.js";
import { writeAudit } from "../../src/lib/auth.js";
import { isPencipta } from "../../src/lib/hak.js";
import { recExamRoom } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { bolehDuduk } from "../../src/lib/recruitment/rights.js";
import {
  UPGRADE_DIR,
  bacaRilis,
  ekor,
  pilihRollback,
  samaSha,
  type UpgradeAction,
} from "../../deploy/upgrade-lib.mjs";

const dir = () => process.env.UPGRADE_DIR || UPGRADE_DIR;
/** A job that said "running" this long ago and never finished died with the machine, not still working */
const MACET_MS = 30 * 60_000;

const tolak = (res: ApiResponse, kode: string, status: number, extra = {}) =>
  void res.status(status).json({ ok: false, kode, ...extra });

const bacaJson = async (nama: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(join(dir(), nama), "utf8"));
  } catch {
    return null;
  }
};

/** Whether the folder the job and the page share exists and this process may write in it */
async function terpasang(): Promise<boolean> {
  try {
    await access(dir(), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function adaPermintaan(): Promise<boolean> {
  try {
    await access(join(dir(), "request.json"), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Exam rooms that are in use (not practice ones, not set up or finished) */
async function ruangUjianJalan(): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(recExamRoom)
    .where(
      and(
        eq(recExamRoom.rehearsal, false),
        inArray(sql`${recExamRoom.state}->>'stage'`, ["prep", "parts", "spin"]),
      ),
    );
  return rows[0]?.n ?? 0;
}

async function pencipta(req: ApiRequest, res: ApiResponse): Promise<string | null> {
  const s = requireRole(req, res, "asisten");
  if (!s) return null;
  const o = await muatOrang(s.nim);
  if (!o || !bolehDuduk(o.status) || !isPencipta(o)) {
    tolak(res, "tanpa_hak", 403, { hak: "web_upgrade" });
    return null;
  }
  return s.nim;
}

async function status(res: ApiResponse) {
  const pasang = await terpasang();
  const build = process.env.IRIS_BUILD_SHA ?? null;
  const st = (await bacaJson("status.json")) as {
    state?: string;
    startedAt?: number;
  } | null;
  const jalan = !!st && st.state === "running" && Date.now() - (st.startedAt ?? 0) < MACET_MS;
  const [antre, ujian, sesi, log] = await Promise.all([
    adaPermintaan(),
    ruangUjianJalan(),
    currentSesi().then((x) => !!x),
    readFile(join(dir(), "log.txt"), "utf8").catch(() => ""),
  ]);
  res.status(200).json({
    ok: true,
    enabled: pasang,
    host: hostname(),
    build,
    busy: jalan || antre,
    status: st,
    latest: await bacaJson("latest.json"),
    rollback: pilihRollback(bacaRilis(await bacaJson("releases.json")), build),
    log: ekor(log),
    examLive: ujian > 0,
    sessionLive: sesi,
  });
}

async function minta(
  req: ApiRequest,
  res: ApiResponse,
  nim: string,
  action: UpgradeAction,
): Promise<void> {
  if (!(await terpasang())) return tolak(res, "belum_terpasang", 503);
  const st = (await bacaJson("status.json")) as { state?: string; startedAt?: number } | null;
  if (
    (await adaPermintaan()) ||
    (st?.state === "running" && Date.now() - (st.startedAt ?? 0) < MACET_MS)
  )
    return tolak(res, "sedang_jalan", 409);

  let ref: string | undefined;
  if (action === "rollback") {
    const b = jsonBody(req);
    ref = typeof b.ref === "string" ? b.ref : undefined;
    const boleh = pilihRollback(
      bacaRilis(await bacaJson("releases.json")),
      process.env.IRIS_BUILD_SHA ?? null,
    );
    if (!ref || !boleh.some((r) => samaSha(r.sha, ref)))
      return tolak(res, "bukan_tujuan_rollback", 400, { field: "ref" });
  }
  if (action === "deploy") {
    if ((await ruangUjianJalan()) > 0) return tolak(res, "sedang_ujian", 409);
    if (await currentSesi()) return tolak(res, "sedang_sesi", 409);
  }

  const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const isi = JSON.stringify({ id, action, ...(ref ? { ref } : {}), by: nim, at: Date.now() });
  // Under another name first and renamed, so the path unit never starts on half a file
  const tmp = join(dir(), "request.json.tmp");
  await writeFile(tmp, isi);
  await rename(tmp, join(dir(), "request.json"));
  await writeAudit(nim, "web_upgrade", { action, ref: ref ?? null, id });
  res.status(200).json({ ok: true, id });
}

export default denganGalat("upgrade", async (req, res) => {
  noStore(res);
  const aksi = req.query.aksi;
  if (aksi === "status") {
    if (!requireMethod(req, res, "GET")) return;
    if (!(await pencipta(req, res))) return;
    return status(res);
  }
  if (aksi === "check" || aksi === "deploy" || aksi === "rollback") {
    if (!requireMethod(req, res, "POST")) return;
    const nim = await pencipta(req, res);
    if (!nim) return;
    return minta(req, res, nim, aksi);
  }
  return tolak(res, "aksi_tidak_dikenal", 404);
});
