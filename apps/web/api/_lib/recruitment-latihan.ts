/**
 * Mode Latihan on the server (src/lib/recruitment/latihan.ts has the idea).
 *
 *   GET  /api/recruitment/latihan          { latihan: { mode, siap, caas, asisten } }
 *   POST /api/recruitment/latihan-masuk    { as } turn it on (makes the practice edition the first time)
 *   POST /api/recruitment/latihan-ganti    { as } swap between Asisten and CaAs
 *   POST /api/recruitment/latihan-reset    wipe the practice edition and make it again
 *   POST /api/recruitment/latihan-keluar   turn it off
 *
 * The practice edition is a second `rec_edition` row (status "latihan"). While
 * the cookie is on, `denganLatihan` runs the whole request inside a context
 * where the live edition lookup answers with it, a practicing Asisten holds
 * every Panitia right on it, and "As CaAs" makes their own NIM its sample CaAs.
 * Only an active Asisten ever gets the context; a stale or forged cookie on
 * anyone else does nothing. The live edition's rows are never read or written.
 */
import { and, count, desc, eq, like, notInArray } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, parseCookies } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { readSessionCookie, writeAudit } from "../../src/lib/auth.js";
import {
  asisten,
  pengaturan,
  recAccount,
  recCandidate,
  recEdition,
  recEvent,
  recEventLog,
  recExamConfig,
} from "../../src/lib/schema.js";
import {
  LATIHAN_COOKIE,
  bacaModeLatihan,
  cookieLatihan,
  geseranKalender,
  geserTanggal,
  latihanTahun,
  type LatihanMode,
  type LatihanRingkas,
} from "../../src/lib/recruitment/latihan.js";
import type { EditionInfo } from "../../src/lib/recruitment/types.js";
import { bolehDuduk } from "../../src/lib/recruitment/rights.js";
import { SETTING_PREFIX } from "../../src/lib/recruitment/settings.js";
import { randomBytes } from "node:crypto";
import { muatOrang } from "./hak.js";
import { pasangBawaanKe } from "./recruitment-bank.js";
import { jalankanLatihan, konteksLatihan } from "./recruitment-latihan-ctx.js";

export { konteksLatihan };

type Db = ReturnType<typeof getDb>;

const tolak = (res: ApiResponse, kode: string, status: number) =>
  void res.status(status).json({ ok: false, kode });

/** Today in WIB, as YYYY-MM-DD. */
const hariIniWib = (): string => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export async function muatEdisiLatihan(db: Db): Promise<EditionInfo | null> {
  const [r] = await db
    .select({
      id: recEdition.id,
      year: recEdition.year,
      title: recEdition.title,
      status: recEdition.status,
    })
    .from(recEdition)
    .where(eq(recEdition.status, "latihan"))
    .orderBy(desc(recEdition.year))
    .limit(1);
  return r ?? null;
}

/**
 * Runs `fn` in the practice context when this request carries the cookie and
 * belongs to an active Asisten; otherwise just runs it. The latihan routes
 * themselves run outside it (they must see the real session).
 */
export async function denganLatihan<T>(req: ApiRequest, fn: () => Promise<T>): Promise<T> {
  const aksi = String(req.query?.aksi ?? "");
  if (aksi.startsWith("latihan")) return fn();
  const cookies = parseCookies(req);
  const mode = bacaModeLatihan(cookies[LATIHAN_COOKIE]);
  if (!mode) return fn();
  const s = readSessionCookie(cookies["iris_session"]);
  if (s?.role !== "asisten") return fn();
  const orang = await muatOrang(s.nim);
  if (!orang || !bolehDuduk(orang.status)) return fn();
  const edisi = await muatEdisiLatihan(getDb());
  if (!edisi) return fn();
  return jalankanLatihan({ mode, nim: s.nim, nama: orang.nama, edisi }, fn);
}

/** The Asisten who may practice: everyone not inactive or alumni, as the Ketua's pool. */
const kolam = (db: Db) =>
  db
    .select({ nim: asisten.nim, nama: asisten.nama })
    .from(asisten)
    .where(notInArray(asisten.status, ["nonaktif", "alumni"]));

/**
 * Makes the practice edition from the live one, wiping the old one first: the
 * calendar (moved so it starts today), the exam settings (with a fresh salt),
 * the built-in sample question bank and Live Coding problems, and one sample
 * CaAs per Asisten, verified and waiting at the start of the road. No
 * candidates, scores, envelopes or live questions are copied.
 */
export async function siapkanLatihan(db: Db, nim: string): Promise<{ caas: number } | null> {
  const [live] = await db
    .select()
    .from(recEdition)
    .where(eq(recEdition.status, "live"))
    .orderBy(desc(recEdition.year))
    .limit(1);
  if (!live) return null;
  const orang = await kolam(db);
  const hariIni = hariIniWib();
  await db.transaction(async (tx) => {
    const lama = await tx
      .select({ id: recEdition.id })
      .from(recEdition)
      .where(eq(recEdition.status, "latihan"));
    for (const e of lama) {
      // The log has no foreign key (it outlives a deleted event), so it goes by hand.
      await tx.delete(recEventLog).where(eq(recEventLog.editionId, e.id));
      await tx.delete(recEdition).where(eq(recEdition.id, e.id));
    }
    const [ed] = await tx
      .insert(recEdition)
      .values({
        year: latihanTahun(live.year),
        title: `Latihan · ${live.title}`,
        status: "latihan",
        createdBy: nim,
      })
      .returning({ id: recEdition.id });
    const baru = ed!.id;
    // The practice copies of the settings (recruitment-settings.ts) start over too.
    await tx.delete(pengaturan).where(like(pengaturan.kunci, `${SETTING_PREFIX}%.latihan`));

    const acara = await tx.select().from(recEvent).where(eq(recEvent.editionId, live.id));
    if (acara.length > 0) {
      const geser = geseranKalender(
        acara.map((e) => e.startsOn),
        hariIni,
      );
      await tx.insert(recEvent).values(
        acara.map(({ id: _id, ...e }) => ({
          ...e,
          editionId: baru,
          startsOn: geserTanggal(e.startsOn, geser),
          endsOn: geserTanggal(e.endsOn, geser),
          updatedBy: nim,
          updatedAt: new Date(),
        })),
      );
    }

    // Exam settings keep the live values but get their own salt, so no draw of the real exam repeats here.
    const [cfg] = await tx.select().from(recExamConfig).where(eq(recExamConfig.editionId, live.id));
    if (cfg) {
      await tx.insert(recExamConfig).values({
        editionId: baru,
        config: cfg.config,
        salt: randomBytes(16).toString("hex"),
        lockedAt: null,
        updatedBy: nim,
      });
    }
    // The bank is the built-in sample set, never the live one: a practicing Asisten holds every right here,
    // and the live questions and their answer keys are for the people who hold the bank right on the live edition.
    await pasangBawaanKe(tx as unknown as Db, baru, nim);

    if (orang.length > 0) {
      // A name for the Cutting and Plotting lists (they join rec_account); no password, so no sign in.
      await tx
        .insert(recAccount)
        .values(orang.map((o) => ({ nim: o.nim, nama: o.nama })))
        .onConflictDoNothing();
      await tx.insert(recCandidate).values(
        orang.map((o) => ({
          editionId: baru,
          nim: o.nim,
          biodata: { angkatan: 2026, kelas: "Latihan", phone: "0800000000", lineId: "latihan" },
          status: "approved" as const,
          currentStage: "berkas" as const,
          reviewedBy: nim,
          reviewedAt: new Date(),
        })),
      );
    }
  });
  await writeAudit(nim, "rec_latihan_reset", { caas: orang.length });
  return { caas: orang.length };
}

async function ringkas(db: Db, mode: LatihanMode | null): Promise<LatihanRingkas> {
  const edisi = await muatEdisiLatihan(db);
  const [pool] = await db
    .select({ n: count() })
    .from(asisten)
    .where(notInArray(asisten.status, ["nonaktif", "alumni"]));
  let caas = 0;
  if (edisi) {
    const [c] = await db
      .select({ n: count() })
      .from(recCandidate)
      .where(and(eq(recCandidate.editionId, edisi.id)));
    caas = c?.n ?? 0;
  }
  return { mode, siap: !!edisi, caas, asisten: pool?.n ?? 0 };
}

/** The five latihan routes. Returns false when `aksi` is not one of them. */
export async function handleLatihan(
  aksi: string,
  req: ApiRequest,
  res: ApiResponse,
): Promise<boolean> {
  if (!aksi.startsWith("latihan")) return false;
  const db = getDb();
  const cookies = parseCookies(req);
  const s = readSessionCookie(cookies["iris_session"]);
  if (s?.role !== "asisten") {
    tolak(res, "belum_masuk", 401);
    return true;
  }
  const orang = await muatOrang(s.nim);
  if (!orang || !bolehDuduk(orang.status)) {
    tolak(res, "tanpa_hak", 403);
    return true;
  }
  const sekarang = bacaModeLatihan(cookies[LATIHAN_COOKIE]);
  if (aksi === "latihan") {
    if (req.method !== "GET") return tolak(res, "metode", 405), true;
    res.status(200).json({ ok: true, latihan: await ringkas(db, sekarang) });
    return true;
  }
  if (req.method !== "POST") return tolak(res, "metode", 405), true;

  if (aksi === "latihan-keluar") {
    res.setHeader("Set-Cookie", cookieLatihan(null));
    res.status(200).json({ ok: true, latihan: await ringkas(db, null) });
    return true;
  }
  if (aksi === "latihan-masuk" || aksi === "latihan-ganti") {
    const mode = bacaModeLatihan(jsonBody(req).as);
    if (!mode) return tolak(res, "data_salah", 400), true;
    if (aksi === "latihan-ganti" && !sekarang) return tolak(res, "latihan_mati", 409), true;
    if (!(await muatEdisiLatihan(db))) {
      const dibuat = await siapkanLatihan(db, s.nim);
      if (!dibuat) return tolak(res, "tidak_ada_edisi", 404), true;
    }
    res.setHeader("Set-Cookie", cookieLatihan(mode));
    res.status(200).json({ ok: true, latihan: await ringkas(db, mode) });
    return true;
  }
  if (aksi === "latihan-reset") {
    const dibuat = await siapkanLatihan(db, s.nim);
    if (!dibuat) return tolak(res, "tidak_ada_edisi", 404), true;
    res.status(200).json({ ok: true, latihan: await ringkas(db, sekarang) });
    return true;
  }
  tolak(res, "aksi_tidak_dikenal", 404);
  return true;
}
