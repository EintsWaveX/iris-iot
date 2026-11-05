/**
 * Mode Latihan on the server (src/lib/recruitment/latihan.ts has the idea).
 *
 *   GET  /api/recruitment/latihan          { latihan: { mode, siap, caas, asisten } }
 *   POST /api/recruitment/latihan-masuk    { as } turn it on (makes the practice edition the first time)
 *   POST /api/recruitment/latihan-ganti    { as } swap between Asisten and CaAs
 *   POST /api/recruitment/latihan-ulang    Mulai Ulang: wipe what was done in practice, keep the practice setup
 *   POST /api/recruitment/latihan-samakan  Samakan: copy the real Oprec's setup over the practice one again
 *   POST /api/recruitment/latihan-lompat   { stage } move the practice calendar so that stage opens today
 *   POST /api/recruitment/latihan-keluar   turn it off
 *
 * The practice edition is a second `rec_edition` row (status "latihan"). While
 * the cookie is on, `denganLatihan` runs the whole request inside a context
 * where the live edition lookup answers with it, a practicing Asisten holds
 * every Panitia right on it, and "As CaAs" makes their own NIM its sample CaAs.
 * Only an active Asisten ever gets the context; a stale or forged cookie on
 * anyone else does nothing. The live edition's rows are never read or written.
 */
import { and, count, desc, eq, inArray, isNotNull, like, notInArray } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, parseCookies } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { readSessionCookie, writeAudit } from "../../src/lib/auth.js";
import {
  asisten,
  pengaturan,
  recAccount,
  recCandidate,
  recCommittee,
  recCompileJob,
  recCSubmission,
  recEdition,
  recEvent,
  recEventLog,
  recExamConfig,
  recExamRoom,
  recExamSeat,
  recLivecode,
  recMqttJob,
  recReference,
  recRubric,
  recSlot,
  recStrike,
  recTubesSession,
  recTubesTopic,
} from "../../src/lib/schema.js";
import {
  LATIHAN_COOKIE,
  bacaModeLatihan,
  contohBiodata,
  cookieLatihan,
  geserTanggal,
  latihanTahun,
  selisihHari,
  tahapHariIni,
  type LatihanMode,
  type LatihanRingkas,
} from "../../src/lib/recruitment/latihan.js";
import { STAGES, type EditionInfo, type StageKey } from "../../src/lib/recruitment/types.js";
import { bolehDuduk } from "../../src/lib/recruitment/rights.js";
import { SETTING_PREFIX } from "../../src/lib/recruitment/settings.js";
import { muatOrang } from "./hak.js";
import { pasangBawaanKe } from "./recruitment-bank.js";
import { jalankanLatihan, konteksLatihan } from "./recruitment-latihan-ctx.js";
import { bacaSetup, geserWaktu, tulisSetup } from "./recruitment-latihan-salin.js";

export { konteksLatihan };

type Db = ReturnType<typeof getDb>;

/** Today in WIB, as YYYY-MM-DD. */
const hariIniWib = (): string => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

const tolak = (res: ApiResponse, kode: string, status: number) =>
  void res.status(status).json({ ok: false, kode });

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

/** One sample CaAs per Asisten who has none yet, on `tahap`, verified and waiting (names for the Cutting and Plotting lists included). */
async function tulisCaas(
  tx: Db,
  edisiId: number,
  nim: string,
  orang: { nim: string; nama: string }[],
  tahap: StageKey,
): Promise<void> {
  if (orang.length === 0) return;
  // A name for the Cutting and Plotting lists (they join rec_account); no password, so no sign in.
  await tx
    .insert(recAccount)
    .values(orang.map((o) => ({ nim: o.nim, nama: o.nama })))
    .onConflictDoNothing();
  const ada = new Set(
    (
      await tx
        .select({ nim: recCandidate.nim })
        .from(recCandidate)
        .where(eq(recCandidate.editionId, edisiId))
    ).map((r) => r.nim),
  );
  const baru = orang.filter((o) => !ada.has(o.nim));
  if (baru.length === 0) return;
  await tx.insert(recCandidate).values(
    baru.map((o) => ({
      editionId: edisiId,
      nim: o.nim,
      biodata: contohBiodata(o.nim, o.nama),
      status: "approved" as const,
      currentStage: tahap,
      reviewedBy: nim,
      reviewedAt: new Date(),
    })),
  );
}

/**
 * Gives every Asisten who has no sample CaAs yet one, on the stage the practice calendar is at. The
 * edition makes them only when it is built, so an Asisten who joined (or came back) after that would
 * have no CaAs to practice as and no seat to be given in a practice room. `hanya` limits it to one NIM.
 */
async function lengkapiCaas(db: Db, nim: string, hanya?: string): Promise<void> {
  const edisi = await muatEdisiLatihan(db);
  if (!edisi) return;
  const acara = await db.select().from(recEvent).where(eq(recEvent.editionId, edisi.id));
  const tahap = tahapHariIni(acara, hariIniWib());
  const orang = (await kolam(db)).filter((o) => !hanya || o.nim === hanya);
  if (!orang.length) return;
  await db.transaction(async (tx) => tulisCaas(tx as unknown as Db, edisi.id, nim, orang, tahap));
}

/**
 * Makes the practice edition again, wiping the old one first. `dari` says where the setup comes from:
 *   "live"     the real Oprec (the first make): its calendar on the same dates, slots, rubrics, Tubes sessions,
 *              exam settings, reference documents and Panitia roster, plus the BUILT-IN sample bank and Live
 *              Coding problems (never the live questions: their answer keys are not for a practicing Asisten).
 *   "latihan"  the practice edition that is there now (Mulai Ulang): everything the Asisten set up while
 *              practicing, the bank and problems included, carries over; everything anyone DID is gone.
 * Either way one sample CaAs per active Asisten is made, on the stage the calendar is at today. No real
 * candidate, score, envelope or answer is ever copied.
 */
async function bangunEdisi(
  db: Db,
  nim: string,
  dari: "live" | "latihan",
): Promise<{ caas: number } | null> {
  const [live] = await db
    .select()
    .from(recEdition)
    .where(eq(recEdition.status, "live"))
    .orderBy(desc(recEdition.year))
    .limit(1);
  if (!live) return null;
  const orang = await kolam(db);
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const lama = await tx
      .select({ id: recEdition.id })
      .from(recEdition)
      .where(eq(recEdition.status, "latihan"));
    const lanjutan = dari === "latihan" && lama.length > 0;
    // Read the setup BEFORE the old edition goes: its rows go with it.
    const setup = await bacaSetup(t, lanjutan ? lama[0]!.id : live.id, lanjutan);
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
    // The practice copies of the settings (recruitment-settings.ts) start over only when the real ones are the source.
    if (!lanjutan)
      await tx.delete(pengaturan).where(like(pengaturan.kunci, `${SETTING_PREFIX}%.latihan`));
    await tulisSetup(t, setup, baru, nim, { topikContoh: true });
    if (!lanjutan) await pasangBawaanKe(t, baru, nim);
    await tulisCaas(t, baru, nim, orang, tahapHariIni(setup.events, hariIniWib()));
  });
  await writeAudit(nim, dari === "live" ? "rec_latihan_reset" : "rec_latihan_ulang", {
    caas: orang.length,
  });
  return { caas: orang.length };
}

/** The first make, or a full start over from the real Oprec. */
export const siapkanLatihan = (db: Db, nim: string) => bangunEdisi(db, nim, "live");

/**
 * Mulai Ulang: everything done in practice is wiped (CaAs progress, schedule picks, attendance, berkas, rooms,
 * answers, scores, Tubes teams, interview scores) and the sample CaAs go back to the stage the calendar is at.
 * What the Asisten set up while practicing stays: calendar position, slots, rubrics, settings, bank.
 */
export const ulangLatihan = (db: Db, nim: string) => bangunEdisi(db, nim, "latihan");

/**
 * Samakan dengan Oprec Asli: the practice setup is replaced by the real Oprec's again (calendar back on the real
 * dates, slots, rubrics, Tubes sessions and topics, exam settings, reference documents, Panitia roster, the
 * practice copies of the settings). The sample CaAs stay, with their files and results, and move to the stage the
 * real calendar is at. What hangs on a replaced row goes with it: attendance (events), schedule picks and exam
 * rooms (slots), interview scores (rubrics). The bank and Live Coding problems are left as they are.
 */
export async function samakanLatihan(db: Db, nim: string): Promise<{ caas: number } | null> {
  const edisi = await muatEdisiLatihan(db);
  if (!edisi) return siapkanLatihan(db, nim);
  const [live] = await db
    .select()
    .from(recEdition)
    .where(eq(recEdition.status, "live"))
    .orderBy(desc(recEdition.year))
    .limit(1);
  if (!live) return null;
  const orang = await kolam(db);
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const setup = await bacaSetup(t, live.id, false);
    // The rooms of the slots go with them (cascade), but a seat in one does not (no cascade on
    // its room), so the seats and what hangs off the room go first. Practice rooms have no slot and stay.
    const ruangSlot = await tx
      .select({ id: recExamRoom.id })
      .from(recExamRoom)
      .where(and(eq(recExamRoom.editionId, edisi.id), isNotNull(recExamRoom.slotId)));
    if (ruangSlot.length) {
      const ids = ruangSlot.map((r) => r.id);
      await tx.delete(recStrike).where(inArray(recStrike.roomId, ids));
      await tx.delete(recCSubmission).where(inArray(recCSubmission.roomId, ids));
      await tx.delete(recLivecode).where(inArray(recLivecode.roomId, ids));
      await tx.delete(recCompileJob).where(inArray(recCompileJob.roomId, ids));
      await tx.delete(recMqttJob).where(inArray(recMqttJob.roomId, ids));
      await tx.delete(recExamSeat).where(inArray(recExamSeat.roomId, ids));
    }
    // The slots first: they point at events (set null) and rooms hang on them (cascade).
    await tx.delete(recSlot).where(eq(recSlot.editionId, edisi.id));
    await tx.delete(recEvent).where(eq(recEvent.editionId, edisi.id));
    await tx.delete(recRubric).where(eq(recRubric.editionId, edisi.id));
    await tx.delete(recTubesSession).where(eq(recTubesSession.editionId, edisi.id));
    await tx.delete(recTubesTopic).where(eq(recTubesTopic.editionId, edisi.id));
    await tx.delete(recReference).where(eq(recReference.editionId, edisi.id));
    await tx.delete(recCommittee).where(eq(recCommittee.editionId, edisi.id));
    await tx.delete(pengaturan).where(like(pengaturan.kunci, `${SETTING_PREFIX}%.latihan`));
    // The exam settings keep the practice salt and lock and take the real values.
    const [cfg] = await tx
      .select({ id: recExamConfig.editionId })
      .from(recExamConfig)
      .where(eq(recExamConfig.editionId, edisi.id));
    if (cfg && setup.config)
      await tx
        .update(recExamConfig)
        .set({ config: setup.config, updatedBy: nim })
        .where(eq(recExamConfig.editionId, edisi.id));
    await tulisSetup(t, cfg ? { ...setup, config: null } : setup, edisi.id, nim, {
      topikContoh: true,
    });
    const tahap = tahapHariIni(setup.events, hariIniWib());
    await tx
      .update(recCandidate)
      .set({ currentStage: tahap })
      .where(eq(recCandidate.editionId, edisi.id));
    await tulisCaas(t, edisi.id, nim, orang, tahap);
  });
  await writeAudit(nim, "rec_latihan_samakan", { caas: orang.length });
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
    if (req.method !== "GET") return (tolak(res, "metode", 405), true);
    res.status(200).json({ ok: true, latihan: await ringkas(db, sekarang) });
    return true;
  }
  if (req.method !== "POST") return (tolak(res, "metode", 405), true);

  if (aksi === "latihan-keluar") {
    res.setHeader("Set-Cookie", cookieLatihan(null));
    res.status(200).json({ ok: true, latihan: await ringkas(db, null) });
    return true;
  }
  if (aksi === "latihan-siapkan") {
    // Makes the practice edition only when there is none; it never wipes one that people are using.
    if (!(await muatEdisiLatihan(db))) {
      const dibuat = await siapkanLatihan(db, s.nim);
      if (!dibuat) return (tolak(res, "tidak_ada_edisi", 404), true);
    } else {
      // The edition is there: the button still adds a CaAs for every Asisten who has none.
      await lengkapiCaas(db, s.nim);
    }
    res.status(200).json({ ok: true, latihan: await ringkas(db, sekarang) });
    return true;
  }
  if (aksi === "latihan-masuk" || aksi === "latihan-ganti") {
    const mode = bacaModeLatihan(jsonBody(req).as);
    if (!mode) return (tolak(res, "data_salah", 400), true);
    if (aksi === "latihan-ganti" && !sekarang) return (tolak(res, "latihan_mati", 409), true);
    if (!(await muatEdisiLatihan(db))) {
      const dibuat = await siapkanLatihan(db, s.nim);
      if (!dibuat) return (tolak(res, "tidak_ada_edisi", 404), true);
    } else {
      // Whoever comes in gets a CaAs of their own if they have none (they joined after the edition was made).
      await lengkapiCaas(db, s.nim, s.nim);
    }
    res.setHeader("Set-Cookie", cookieLatihan(mode));
    res.status(200).json({ ok: true, latihan: await ringkas(db, mode) });
    return true;
  }
  if (aksi === "latihan-ulang" || aksi === "latihan-samakan") {
    const dibuat =
      aksi === "latihan-ulang" ? await ulangLatihan(db, s.nim) : await samakanLatihan(db, s.nim);
    if (!dibuat) return (tolak(res, "tidak_ada_edisi", 404), true);
    res.status(200).json({ ok: true, latihan: await ringkas(db, sekarang) });
    return true;
  }
  if (aksi === "latihan-lompat") {
    const tahap = String(jsonBody(req).stage ?? "");
    if (!(STAGES as readonly string[]).includes(tahap))
      return (tolak(res, "data_salah", 400), true);
    const hasil = await lompatLatihan(db, s.nim, tahap as StageKey);
    if (hasil === "tidak_ada_edisi") return (tolak(res, "tidak_ada_edisi", 404), true);
    if (hasil === "tahap_kosong") return (tolak(res, "tahap_kosong", 409), true);
    res.status(200).json({ ok: true, latihan: await ringkas(db, sekarang) });
    return true;
  }
  tolak(res, "aksi_tidak_dikenal", 404);
  return true;
}

/**
 * Jump the practice edition to a stage (5 Nov 2026). Practice follows the real
 * calendar, so a later stage is closed until its real day; this moves the
 * practice calendar so the stage's first public day is today and puts every
 * sample CaAs on that stage. Samakan dengan Oprec Asli goes back to the real dates.
 */
export async function lompatLatihan(
  db: Db,
  nim: string,
  tahap: StageKey,
): Promise<"ok" | "tidak_ada_edisi" | "tahap_kosong"> {
  const edisi = await muatEdisiLatihan(db);
  if (!edisi) return "tidak_ada_edisi";
  const acara = await db.select().from(recEvent).where(eq(recEvent.editionId, edisi.id));
  const awal = acara
    .filter((e) => e.stage === tahap && !e.internal)
    .map((e) => e.startsOn)
    .sort()[0];
  if (!awal) return "tahap_kosong";
  const geser = selisihHari(awal, hariIniWib());
  await db.transaction(async (tx) => {
    for (const e of acara)
      await tx
        .update(recEvent)
        .set({
          startsOn: geserTanggal(e.startsOn, geser),
          endsOn: geserTanggal(e.endsOn, geser),
          updatedBy: nim,
          updatedAt: new Date(),
        })
        .where(eq(recEvent.id, e.id));
    // The slots people pick and the Tubes sessions move with the events, or they would stay on the old days.
    await geserWaktu(tx as unknown as Db, edisi.id, geser);
    await tx
      .update(recCandidate)
      .set({ currentStage: tahap })
      .where(eq(recCandidate.editionId, edisi.id));
  });
  await writeAudit(nim, "rec_latihan_lompat", { stage: tahap, geser });
  return "ok";
}
