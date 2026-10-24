/**
 * /api/recruitment/:aksi: IRIS Open Recruitment (OPREC 2026), slice S1.
 * The shapes are in src/lib/recruitment/types.ts; the rules in
 * docs/recruitment/PRD.md. The calendar drives every window
 * (src/lib/recruitment/gates.ts): nothing here opens or closes a stage by
 * a switch of its own.
 *
 * Anyone:
 * GET  /api/recruitment/banner       the Home banner, one shape per viewer
 *                                    (a signed out visitor gets dates only)
 * GET  /api/recruitment/edition      the live edition, the viewer's kind and rights
 *
 * Signed in:
 * GET  /api/recruitment/calendar     the events this viewer may see
 *
 * Praktikan:
 * GET  /api/recruitment/me           my candidacy, documents and envelopes
 * POST /api/recruitment/ticket       { kind, ukuran, sha256, halaman? } where to PUT one PDF
 * POST /api/recruitment/apply        { biodata, docs: [{ kind, tiket }], consent: true }
 * POST /api/recruitment/document     { kind, tiket } confirm a (re)upload
 * POST /api/recruitment/withdraw     step back from the process
 * GET  /api/recruitment/berkas?id=   my own PDF (a redirect to a 10 minute link)
 *
 * Panitia (by seat, src/lib/recruitment/rights.ts):
 * GET  /api/recruitment/candidates[?stage=&status=&q=]   the list
 * GET  /api/recruitment/candidate?id=   one candidate; biodata and documents
 *                                       only with the documents right
 * GET  /api/recruitment/committee    who sits where
 * GET  /api/recruitment/berkas?id=   any candidate's PDF (documents right)
 * POST /api/recruitment/review       { id, decision: approve | revision, note? }
 * POST /api/recruitment/event-save   { id?, ...event, confirm? }  Ketua and Acara
 * POST /api/recruitment/event-move   { id, startsOn, endsOn, confirm? }
 * POST /api/recruitment/event-delete { id, confirm? }
 * POST /api/recruitment/seat         { nim, division, isKoor?, title? }
 * POST /api/recruitment/unseat       { nim }
 * POST /api/recruitment/visibility   { hidden }  Sembunyikan Oprec (api/_lib/recruitment-sembunyi.ts)
 *
 * A candidate only ever reads their own row: every candidate read is
 * filtered by the session's NIM and checked again in code. Editing or
 * deleting an event whose stage has started asks for `confirm: true` and is
 * written to rec_event_log.
 */
import { and, asc, eq, ilike, or } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonBody, noStore, pgErrorCode, requireMethod } from "../_lib/http.js";
import { currentSession, requireRole, tolakPraktikanTot } from "../_lib/session.js";
import { denganSiaran } from "../_lib/siaran.js";
import { muatOrang } from "../_lib/hak.js";
import { getDb } from "../../src/lib/db.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import {
  praktikan,
  recCandidate,
  recCommittee,
  recDocument,
  recEvent,
  recEventLog,
} from "../../src/lib/schema.js";
import { susunBanner, lite, type BannerViewer } from "../../src/lib/recruitment/banner.js";
import { gateOpen, tahapSudahMulai, visibleEvents } from "../../src/lib/recruitment/gates.js";
import { cekBiodata, cekEvent, cekNimRek, cekTanggal } from "../../src/lib/recruitment/validate.js";
import {
  CANDIDATE_STATUS,
  DIVISIONS,
  DOC_REQUIRED,
  STAGES,
  type CandidateRow,
  type CommitteeDivision,
  type DocKind,
  type EditionInfo,
  type RecEvent,
  type Viewer,
  type ViewerKind,
} from "../../src/lib/recruitment/types.js";
import { bolehDuduk } from "../../src/lib/recruitment/rights.js";
import { kunciRekrutmen } from "../../src/lib/tp-r2.js";
import {
  adaEdisiDraft,
  hitungDokumen,
  kandidatSendiri,
  muatAmplop,
  muatDokumen,
  muatEdisiHidup,
  muatEvents,
  muatKandidat,
  muatKursi,
  muatKolam,
  muatKursiSemua,
  muatWaktuGagal,
  eventDariRow,
  type Db,
} from "../_lib/recruitment-data.js";
import {
  anggotaPanitia,
  muatPelaku,
  wajibHak,
  type PelakuServer,
} from "../_lib/recruitment-rights.js";
import {
  bacaTiketRek,
  buatTiketRek,
  cekParamTiket,
  periksaBerkas,
} from "../_lib/recruitment-unggah.js";
import { SimpanGalat, simpanSiap, tiketUnggah, urlBaca } from "../_lib/tp-simpan.js";
import {
  bolehSembunyikan,
  handleTampil,
  jawabTersembunyi,
  oprecTersembunyi,
} from "../_lib/recruitment-sembunyi.js";

const tolak = (res: ApiResponse, kode: string, status = 400, extra: Record<string, unknown> = {}) =>
  res.status(status).json({ ok: false, kode, ...extra });

const LABEL_DIVISI: Record<CommitteeDivision, string> = {
  ketua: "Ketua",
  wakil: "Wakil",
  acara: "Acara",
  akademik: "Akademik",
  logistik: "Logistik",
  admin: "Admin",
  pdd: "PDD",
};

function rahasia(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set");
  return s;
}

/** The edition, or a 404 answer and null. */
async function wajibEdisi(res: ApiResponse, db: Db): Promise<EditionInfo | null> {
  const e = await muatEdisiHidup(db);
  if (!e) tolak(res, "tidak_ada_edisi", 404);
  return e;
}

/** Who is asking and how the calendar sees them. */
async function kenali(
  db: Db,
  edisi: EditionInfo,
  s: SessionPayload | null,
): Promise<{ kind: ViewerKind; pelaku: PelakuServer | null; viewer: Viewer }> {
  if (!s) return { kind: "visitor", pelaku: null, viewer: { kind: "visitor" } };
  if (s.role === "praktikan") {
    const k = await muatKandidat(db, edisi.id, s.nim);
    const kind: ViewerKind = k ? "candidate" : "praktikan";
    return { kind, pelaku: null, viewer: { kind, ownEventIds: [] } };
  }
  const pelaku = await muatPelaku(db, edisi.id, s.nim);
  const panitia = anggotaPanitia(pelaku);
  return {
    kind: panitia ? "panitia" : "asisten",
    pelaku,
    viewer: { kind: panitia ? "panitia" : "asisten", full: !!pelaku?.penuh },
  };
}

/* ================================================================== GET */

async function handleBanner(req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const s = currentSession(req);
  const now = new Date();
  const edisi = await muatEdisiHidup(db);
  if (!edisi) {
    return void res.status(200).json(
      susunBanner({
        edition: null,
        segera: await adaEdisiDraft(db),
        events: [],
        now,
        viewer: { kind: "visitor" },
      }),
    );
  }
  const events = await muatEvents(db, edisi.id);
  let viewer: BannerViewer = { kind: "visitor" };
  if (s?.role === "praktikan") {
    const k = await muatKandidat(db, edisi.id, s.nim);
    viewer = {
      kind: "praktikan",
      candidate: k
        ? {
            status: k.status,
            stage: k.currentStage,
            cutAt: k.status === "out" ? await muatWaktuGagal(db, k.id, now) : null,
            ownEventIds: [],
            envelope: (await muatAmplop(db, k.id, now)).some((a) => !a.opened),
          }
        : null,
    };
  } else if (s?.role === "asisten") {
    const p = await muatPelaku(db, edisi.id, s.nim);
    viewer = {
      kind: "asisten",
      panitia: anggotaPanitia(p),
      seat: p?.kursi ? LABEL_DIVISI[p.kursi.division] : null,
    };
  }
  res.status(200).json(
    susunBanner({
      edition: { title: edisi.title, status: "live" },
      segera: false,
      events,
      now,
      viewer,
    }),
  );
}

async function handleEdisi(req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const s = currentSession(req);
  const edisi = await muatEdisiHidup(db);
  if (!edisi) {
    return void res.status(200).json({
      ok: true,
      edition: null,
      viewer: s ? (s.role === "asisten" ? "asisten" : "praktikan") : "visitor",
      rights: null,
      seat: null,
    });
  }
  const { kind, pelaku } = await kenali(db, edisi, s);
  res.status(200).json({
    ok: true,
    edition: edisi,
    viewer: kind,
    rights: pelaku && anggotaPanitia(pelaku) ? pelaku.hak : null,
    seat: pelaku?.kursi ?? null,
    // Only an Asisten gets this far while it is on (the router answers everyone else).
    ...(s?.role === "asisten" && {
      hidden: await oprecTersembunyi(db),
      canHide: bolehSembunyikan(pelaku),
    }),
  });
}

async function handleKalender(req: ApiRequest, res: ApiResponse, s: SessionPayload | null) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const { viewer } = await kenali(db, edisi, s);
  const events = await muatEvents(db, edisi.id);
  res.status(200).json({
    ok: true,
    edition: edisi,
    events: visibleEvents(events, viewer),
    now: new Date().toISOString(),
  });
}

async function handleSaya(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  if (await tolakPraktikanTot(req, res)) return;
  const db = getDb();
  const edisi = await muatEdisiHidup(db);
  if (!edisi) {
    return void res.status(200).json({
      ok: true,
      edition: null,
      candidate: null,
      documents: [],
      envelopes: [],
      daftarOpen: false,
    });
  }
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const k = await muatKandidat(db, edisi.id, s.nim);
  res.status(200).json({
    ok: true,
    edition: edisi,
    candidate: k ? kandidatSendiri(k) : null,
    // The ids are the candidate's own: berkas answers 404 for anyone else's.
    documents: k ? await muatDokumen(db, k.id) : [],
    envelopes: k ? await muatAmplop(db, k.id, now) : [],
    daftarOpen: gateOpen(events, "daftar", now),
  });
}

function saring(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function handleDaftarKandidat(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "candidates")) return;
  const stage = saring(req.query.stage);
  const status = saring(req.query.status);
  const q = saring(req.query.q).trim().slice(0, 40);
  if (stage && !(STAGES as readonly string[]).includes(stage))
    return tolak(res, "data_salah", 400, { field: "stage" });
  if (status && !(CANDIDATE_STATUS as readonly string[]).includes(status))
    return tolak(res, "data_salah", 400, { field: "status" });
  const cocok = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : "";
  const rows = await db
    .select({
      id: recCandidate.id,
      nim: recCandidate.nim,
      nama: praktikan.nama,
      status: recCandidate.status,
      stage: recCandidate.currentStage,
      appliedAt: recCandidate.appliedAt,
      biodata: recCandidate.biodata,
    })
    .from(recCandidate)
    .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
    .where(
      and(
        eq(recCandidate.editionId, edisi.id),
        stage ? eq(recCandidate.currentStage, stage as (typeof STAGES)[number]) : undefined,
        status ? eq(recCandidate.status, status as (typeof CANDIDATE_STATUS)[number]) : undefined,
        q ? or(ilike(praktikan.nama, cocok), ilike(recCandidate.nim, cocok)) : undefined,
      ),
    )
    .orderBy(asc(recCandidate.appliedAt), asc(recCandidate.id));
  const jumlah = await hitungDokumen(
    db,
    rows.map((r) => r.id),
    DOC_REQUIRED,
  );
  const candidates: CandidateRow[] = rows.map((r) => ({
    id: r.id,
    nim: r.nim,
    nama: r.nama ?? "",
    kelas: r.biodata?.kelas ?? null,
    angkatan: r.biodata?.angkatan ?? null,
    status: r.status,
    stage: r.stage,
    appliedAt: r.appliedAt.toISOString(),
    docs: jumlah.get(r.id) ?? 0,
  }));
  res.status(200).json({ ok: true, candidates });
}

async function handleKandidatRinci(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) return tolak(res, "data_salah", 400, { field: "id" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "candidates")) return;
  const [r] = await db
    .select({ k: recCandidate, nama: praktikan.nama })
    .from(recCandidate)
    .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
    .where(and(eq(recCandidate.id, id), eq(recCandidate.editionId, edisi.id)))
    .limit(1);
  if (!r) return tolak(res, "tidak_ditemukan", 404);
  const k = r.k;
  const lengkap = !!p?.hak.documents;
  const dokumen = lengkap ? await muatDokumen(db, k.id) : null;
  res.status(200).json({
    ok: true,
    candidate: {
      id: k.id,
      nim: k.nim,
      nama: r.nama ?? "",
      kelas: k.biodata?.kelas ?? null,
      angkatan: k.biodata?.angkatan ?? null,
      status: k.status,
      stage: k.currentStage,
      appliedAt: k.appliedAt.toISOString(),
      docs: dokumen ? dokumen.filter((d) => DOC_REQUIRED.includes(d.kind)).length : 0,
      reviewNote: k.reviewNote,
      reviewedBy: k.reviewedBy,
      reviewedAt: k.reviewedAt ? k.reviewedAt.toISOString() : null,
    },
    biodata: lengkap ? k.biodata : null,
    documents: dokumen,
  });
}

async function handlePanitia(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!anggotaPanitia(p)) return tolak(res, "tanpa_hak", 403);
  const seats = await muatKursiSemua(db, edisi.id);
  // Whoever may seat people also needs the Asisten to pick from.
  const boleh = !!p && (p.hak.board || p.hak.seatKetua);
  res.status(200).json({ ok: true, seats, ...(boleh ? { pool: await muatKolam(db) } : {}) });
}

/** A PDF as a 10 minute link, after the rights check: a candidate's own, or the documents right. */
async function handleBerkas(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) return tolak(res, "data_salah", 400, { field: "id" });
  const db = getDb();
  const [d] = await db
    .select({
      kind: recDocument.kind,
      r2Key: recDocument.r2Key,
      nim: recCandidate.nim,
      editionId: recCandidate.editionId,
    })
    .from(recDocument)
    .innerJoin(recCandidate, eq(recCandidate.id, recDocument.candidateId))
    .where(eq(recDocument.id, id))
    .limit(1);
  if (!d) return tolak(res, "tidak_ditemukan", 404);
  if (s.role === "praktikan") {
    // Another candidate's file looks exactly like no file.
    if (d.nim !== s.nim) return tolak(res, "tidak_ditemukan", 404);
  } else {
    const p = await muatPelaku(db, d.editionId, s.nim);
    if (!wajibHak(res, p, "documents")) return;
    await writeAudit(s.nim, "rec_berkas_baca", { id, nim: d.nim, kind: d.kind });
  }
  let url: string;
  try {
    url = await urlBaca({
      kunci: d.r2Key,
      nama: `${d.kind}_${d.nim}.pdf`,
      mime: "application/pdf",
      unduh: req.query.unduh === "1",
    });
  } catch {
    return tolak(res, "penyimpanan_mati", 503);
  }
  res.statusCode = 302;
  res.setHeader("Location", url);
  res.setHeader("Cache-Control", "private, no-store");
  res.end();
}

/* ================================================================= POST */

/** Step 1 of an upload: where to PUT one PDF. */
async function handleTiket(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  if (await tolakPraktikanTot(req, res)) return;
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = cekParamTiket(jsonBody(req));
  if (!p.ok) return tolak(res, p.kode);
  const now = new Date();
  const k = await muatKandidat(db, edisi.id, s.nim);
  const buka = gateOpen(await muatEvents(db, edisi.id), "daftar", now);
  // Registration is open, or Admin asked this candidate for a revision.
  if (!buka && k?.status !== "revision") return tolak(res, "jendela_tutup", 409);
  if (!k && !DOC_REQUIRED.includes(p.kind)) return tolak(res, "format_salah");
  if (k && ["withdrawn", "out", "accepted"].includes(k.status))
    return tolak(res, "status_salah", 409);
  if (!simpanSiap()) return tolak(res, "penyimpanan_mati", 503);

  const kunci = kunciRekrutmen(edisi.id, s.nim, p.kind, p.sha256);
  if (k) {
    const [ada] = await db
      .select({ sha256: recDocument.sha256 })
      .from(recDocument)
      .where(and(eq(recDocument.candidateId, k.id), eq(recDocument.kind, p.kind)))
      .limit(1);
    if (ada?.sha256 === p.sha256) return void res.status(200).json({ ok: true, sama: true });
  }
  const put = await tiketUnggah({ kunci, ukuran: p.ukuran, sha256: p.sha256, halaman: p.halaman });
  const tiket = await buatTiketRek(rahasia(), {
    k: kunci,
    n: p.ukuran,
    s: p.sha256,
    h: p.halaman,
    nim: s.nim,
    ed: edisi.id,
    kind: p.kind,
  });
  res.status(200).json({ ok: true, sama: false, url: put.url, tiket });
}

/** The application: biodata, the three PDFs already in R2, and the consent. */
async function handleDaftar(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  if (await tolakPraktikanTot(req, res)) return;
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const b = jsonBody(req);
  if (b.consent !== true) return tolak(res, "data_salah", 400, { field: "consent" });
  const bio = cekBiodata(b.biodata);
  if (!bio.ok) return tolak(res, "data_salah", 400, { field: bio.field });
  const docs = Array.isArray(b.docs) ? b.docs : [];
  const jenis = docs.map((d: unknown) => (d as { kind?: unknown })?.kind);
  if (
    docs.length !== DOC_REQUIRED.length ||
    DOC_REQUIRED.some((k) => !jenis.includes(k)) ||
    new Set(jenis).size !== jenis.length
  )
    return tolak(res, "data_salah", 400, { field: "docs" });

  if (!gateOpen(await muatEvents(db, edisi.id), "daftar", new Date()))
    return tolak(res, "jendela_tutup", 409);
  const [prak] = await db
    .select({ nim: praktikan.nim })
    .from(praktikan)
    .where(eq(praktikan.nim, s.nim))
    .limit(1);
  if (!prak) return tolak(res, "bukan_praktikan", 403);
  if (await muatKandidat(db, edisi.id, s.nim)) return tolak(res, "sudah_daftar", 409);

  const berkas: { kind: DocKind; k: string; n: number; s: string }[] = [];
  for (const d of docs as { kind: DocKind; tiket: unknown }[]) {
    const t = await bacaTiketRek(d.tiket, rahasia());
    if (!t || t.nim !== s.nim || t.ed !== edisi.id || t.kind !== d.kind)
      return tolak(res, "tiket_salah", 400, { kind: d.kind });
    let hasil;
    try {
      hasil = await periksaBerkas(t);
    } catch (e) {
      if (e instanceof SimpanGalat) return tolak(res, "penyimpanan_mati", 503);
      throw e;
    }
    if (hasil === "bukan_pdf") return tolak(res, "bukan_pdf", 422, { kind: d.kind });
    if (hasil !== "ok") return tolak(res, "berkas_kurang", 422, { kind: d.kind });
    berkas.push({ kind: d.kind, k: t.k, n: t.n, s: t.s });
  }

  let baris;
  try {
    baris = await db.transaction(async (tx) => {
      const [k] = await tx
        .insert(recCandidate)
        .values({ editionId: edisi.id, nim: s.nim, biodata: bio.biodata })
        .returning();
      await tx.insert(recDocument).values(
        berkas.map((f) => ({
          candidateId: k.id,
          kind: f.kind,
          r2Key: f.k,
          size: f.n,
          sha256: f.s,
        })),
      );
      return k;
    });
  } catch (e) {
    if (pgErrorCode(e) === "23505") return tolak(res, "sudah_daftar", 409);
    throw e;
  }
  await writeAudit(s.nim, "rec_daftar", { edition: edisi.id });
  res.status(200).json({ ok: true, candidate: kandidatSendiri(baris) });
}

/** Step 2: a (re)uploaded PDF becomes the candidate's document of that kind. */
async function handleDokumen(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  if (await tolakPraktikanTot(req, res)) return;
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const b = jsonBody(req);
  const k = await muatKandidat(db, edisi.id, s.nim);
  if (!k) return tolak(res, "tidak_ditemukan", 404);
  if (["withdrawn", "out", "accepted"].includes(k.status)) return tolak(res, "status_salah", 409);
  const buka = gateOpen(await muatEvents(db, edisi.id), "daftar", new Date());
  if (!buka && k.status !== "revision") return tolak(res, "jendela_tutup", 409);

  const t = await bacaTiketRek(b.tiket, rahasia());
  if (!t || t.nim !== s.nim || t.ed !== edisi.id || t.kind !== b.kind)
    return tolak(res, "tiket_salah", 400);
  let hasil;
  try {
    hasil = await periksaBerkas(t);
  } catch (e) {
    if (e instanceof SimpanGalat) return tolak(res, "penyimpanan_mati", 503);
    throw e;
  }
  if (hasil === "bukan_pdf") return tolak(res, "bukan_pdf", 422);
  if (hasil !== "ok") return tolak(res, "berkas_kurang", 422);

  const nilai = { r2Key: t.k, size: t.n, sha256: t.s, uploadedAt: new Date() };
  const [d] = await db
    .insert(recDocument)
    .values({ candidateId: k.id, kind: t.kind, ...nilai })
    .onConflictDoUpdate({ target: [recDocument.candidateId, recDocument.kind], set: nilai })
    .returning();
  // A changed file needs a fresh look from Admin.
  let status = k.status;
  if (k.status === "revision" || k.status === "approved") {
    await db.update(recCandidate).set({ status: "applied" }).where(eq(recCandidate.id, k.id));
    status = "applied";
  }
  await writeAudit(s.nim, "rec_dokumen", { kind: t.kind, ukuran: t.n });
  res.status(200).json({
    ok: true,
    document: { kind: d.kind, size: d.size, uploadedAt: d.uploadedAt.toISOString(), note: d.note },
    status,
  });
}

async function handleMundur(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  if (await tolakPraktikanTot(req, res)) return;
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const k = await muatKandidat(db, edisi.id, s.nim);
  if (!k) return tolak(res, "tidak_ditemukan", 404);
  if (["withdrawn", "out", "accepted"].includes(k.status)) return tolak(res, "status_salah", 409);
  await db.update(recCandidate).set({ status: "withdrawn" }).where(eq(recCandidate.id, k.id));
  await writeAudit(s.nim, "rec_mundur", { edition: edisi.id });
  res.status(200).json({ ok: true, status: "withdrawn" });
}

/** Admin or the Ketua: approve an application or bounce it back with a note. */
async function handleTinjau(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "approve")) return;
  const b = jsonBody(req);
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return tolak(res, "data_salah", 400, { field: "id" });
  if (b.decision !== "approve" && b.decision !== "revision")
    return tolak(res, "data_salah", 400, { field: "decision" });
  const catatan = typeof b.note === "string" ? b.note.trim() : "";
  if (catatan.length > 500) return tolak(res, "data_salah", 400, { field: "note" });
  if (b.decision === "revision" && !catatan)
    return tolak(res, "data_salah", 400, { field: "note" });

  const [k] = await db
    .select()
    .from(recCandidate)
    .where(and(eq(recCandidate.id, id), eq(recCandidate.editionId, edisi.id)))
    .limit(1);
  if (!k) return tolak(res, "tidak_ditemukan", 404);
  if (!["applied", "revision", "approved"].includes(k.status))
    return tolak(res, "status_salah", 409);
  if (b.decision === "approve") {
    const n = (await hitungDokumen(db, [k.id], DOC_REQUIRED)).get(k.id) ?? 0;
    if (n < DOC_REQUIRED.length) return tolak(res, "berkas_kurang", 409);
  }
  const status = b.decision === "approve" ? "approved" : "revision";
  await db
    .update(recCandidate)
    .set({
      status,
      reviewNote: catatan || null,
      reviewedBy: s.nim,
      reviewedAt: new Date(),
    })
    .where(eq(recCandidate.id, k.id));
  await writeAudit(s.nim, "rec_tinjau", { id: k.id, nim: k.nim, status });
  res.status(200).json({ ok: true, status });
}

/* ------------------------------------------------------------ calendar */

type Perubahan = Omit<RecEvent, "id" | "sort"> & { sort?: number };

/**
 * Writes one calendar change. When the event's stage has started it needs
 * `confirm: true` first, and the before and after go to rec_event_log.
 */
async function ubahKalender(
  res: ApiResponse,
  s: SessionPayload,
  b: Record<string, unknown>,
  jalan: (events: RecEvent[]) => { lama: RecEvent | null; baru: Perubahan | null } | "tidak_ada",
) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "calendar")) return;
  const events = await muatEvents(db, edisi.id);
  const hasil = jalan(events);
  if (hasil === "tidak_ada") return tolak(res, "tidak_ditemukan", 404);
  const { lama, baru } = hasil;
  const now = new Date();
  const mulai =
    (!!lama && tahapSudahMulai(events, lama, now)) ||
    (!!baru && tahapSudahMulai(events, baru, now));
  if (mulai && b.confirm !== true)
    return tolak(res, "perlu_konfirmasi", 409, {
      event: lite((lama ?? { ...baru!, id: 0, sort: 0 }) as RecEvent),
    });

  let tersimpan: RecEvent | null = null;
  const ditulis = {
    updatedBy: s.nim,
    updatedAt: now,
  };
  if (baru && lama) {
    const [r] = await db
      .update(recEvent)
      .set({ ...baru, color: baru.color, ...ditulis })
      .where(and(eq(recEvent.id, lama.id), eq(recEvent.editionId, edisi.id)))
      .returning();
    tersimpan = eventDariRow(r);
  } else if (baru) {
    const sort = Math.max(-1, ...events.map((e) => e.sort)) + 1;
    const [r] = await db
      .insert(recEvent)
      .values({ ...baru, editionId: edisi.id, sort, ...ditulis })
      .returning();
    tersimpan = eventDariRow(r);
  } else if (lama) {
    await db
      .delete(recEvent)
      .where(and(eq(recEvent.id, lama.id), eq(recEvent.editionId, edisi.id)));
  }
  if (mulai) {
    await db.insert(recEventLog).values({
      editionId: edisi.id,
      eventId: (lama ?? tersimpan)!.id,
      who: s.nim,
      before: lama,
      after: tersimpan,
    });
  }
  await writeAudit(s.nim, lama && !baru ? "rec_acara_hapus" : "rec_acara_simpan", {
    id: (lama ?? tersimpan)!.id,
    title: (lama ?? tersimpan)!.title,
    logged: mulai,
  });
  res.status(200).json({ ok: true, event: tersimpan, logged: mulai });
}

async function handleAcaraSimpan(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const bersih = cekEvent(b);
  if (!bersih.ok) return tolak(res, "data_salah", 400, { field: bersih.field });
  const id = b.id === undefined || b.id === null ? null : Number(b.id);
  if (id !== null && (!Number.isInteger(id) || id <= 0))
    return tolak(res, "data_salah", 400, { field: "id" });
  return ubahKalender(res, s, b, (events) => {
    const lama = id === null ? null : (events.find((e) => e.id === id) ?? null);
    if (id !== null && !lama) return "tidak_ada";
    return { lama, baru: bersih.event };
  });
}

async function handleAcaraGeser(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return tolak(res, "data_salah", 400, { field: "id" });
  if (!cekTanggal(b.startsOn)) return tolak(res, "data_salah", 400, { field: "startsOn" });
  if (!cekTanggal(b.endsOn) || b.endsOn < b.startsOn)
    return tolak(res, "data_salah", 400, { field: "endsOn" });
  return ubahKalender(res, s, b, (events) => {
    const lama = events.find((e) => e.id === id);
    if (!lama) return "tidak_ada";
    const { id: _id, sort: _sort, ...sisa } = lama;
    return { lama, baru: { ...sisa, startsOn: b.startsOn as string, endsOn: b.endsOn as string } };
  });
}

async function handleAcaraHapus(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return tolak(res, "data_salah", 400, { field: "id" });
  return ubahKalender(res, s, b, (events) => {
    const lama = events.find((e) => e.id === id);
    return lama ? { lama, baru: null } : "tidak_ada";
  });
}

/* ------------------------------------------------------------ committee */

async function handleDuduk(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!p || (!p.hak.board && !p.hak.seatKetua)) return tolak(res, "tanpa_hak", 403);
  const b = jsonBody(req);
  if (!cekNimRek(b.nim)) return tolak(res, "data_salah", 400, { field: "nim" });
  if (!(DIVISIONS as readonly unknown[]).includes(b.division))
    return tolak(res, "data_salah", 400, { field: "division" });
  const division = b.division as CommitteeDivision;
  if (b.isKoor !== undefined && typeof b.isKoor !== "boolean")
    return tolak(res, "data_salah", 400, { field: "isKoor" });
  let judul: string | null = null;
  if (b.title !== undefined && b.title !== null) {
    if (typeof b.title !== "string" || b.title.trim().length > 40)
      return tolak(res, "data_salah", 400, { field: "title" });
    judul = b.title.trim() || null;
  }
  // Only the Pencipta and Admin tier seat the Ketua; the Ketua seats the rest.
  if (division === "ketua" && !p.hak.seatKetua)
    return tolak(res, "tanpa_hak", 403, { hak: "seatKetua" });
  if (division !== "ketua" && !p.hak.board) return tolak(res, "tanpa_hak", 403, { hak: "board" });

  const target = await muatOrang(b.nim);
  if (!target || !bolehDuduk(target.status)) return tolak(res, "bukan_asisten", 404);
  const lama = await muatKursi(db, edisi.id, target.nim);
  if (lama?.division === "ketua" && !p.hak.seatKetua)
    return tolak(res, "tanpa_hak", 403, { hak: "seatKetua" });
  const bintang = division === "ketua" || division === "wakil" ? false : b.isKoor === true;

  try {
    await db.transaction(async (tx) => {
      if (bintang)
        await tx
          .update(recCommittee)
          .set({ isKoor: false })
          .where(and(eq(recCommittee.editionId, edisi.id), eq(recCommittee.division, division)));
      await tx
        .insert(recCommittee)
        .values({
          editionId: edisi.id,
          asistenNim: target.nim,
          division,
          isKoor: bintang,
          title: judul,
          seatedBy: s.nim,
        })
        .onConflictDoUpdate({
          target: [recCommittee.editionId, recCommittee.asistenNim],
          set: { division, isKoor: bintang, title: judul, seatedBy: s.nim, seatedAt: new Date() },
        });
    });
  } catch (e) {
    if (pgErrorCode(e) === "23505") return tolak(res, "ketua_sudah_ada", 409);
    throw e;
  }
  await writeAudit(s.nim, "rec_duduk", { nim: target.nim, division, isKoor: bintang });
  res.status(200).json({ ok: true, seats: await muatKursiSemua(db, edisi.id) });
}

async function handleCabut(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!p || (!p.hak.board && !p.hak.seatKetua)) return tolak(res, "tanpa_hak", 403);
  const b = jsonBody(req);
  if (!cekNimRek(b.nim)) return tolak(res, "data_salah", 400, { field: "nim" });
  const kursi = await muatKursi(db, edisi.id, b.nim);
  if (!kursi) return tolak(res, "tidak_ditemukan", 404);
  if (kursi.division === "ketua" && !p.hak.seatKetua)
    return tolak(res, "tanpa_hak", 403, { hak: "seatKetua" });
  await db
    .delete(recCommittee)
    .where(and(eq(recCommittee.editionId, edisi.id), eq(recCommittee.asistenNim, b.nim)));
  await writeAudit(s.nim, "rec_cabut", { nim: b.nim, division: kursi.division });
  res.status(200).json({ ok: true, seats: await muatKursiSemua(db, edisi.id) });
}

/* ================================================================ route */

async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  const aksi = req.query.aksi;
  const sesiku = currentSession(req);

  // Sembunyikan Oprec: to anyone but an Asisten there is no edition at all.
  if (sesiku?.role !== "asisten" && (await oprecTersembunyi(getDb())))
    return jawabTersembunyi(aksi, res);

  // Anyone, signed in or not.
  if (aksi === "banner") {
    if (!requireMethod(req, res, "GET")) return;
    return handleBanner(req, res);
  }
  if (aksi === "edition") {
    if (!requireMethod(req, res, "GET")) return;
    return handleEdisi(req, res);
  }
  if (aksi === "calendar") {
    if (!requireMethod(req, res, "GET")) return;
    // A visitor sees the public events (the candidate page's journey and
    // calendar, 2026-10-23); the same filter hides every internal one.
    return handleKalender(req, res, sesiku);
  }
  if (aksi === "berkas") {
    if (!requireMethod(req, res, "GET")) return;
    if (!sesiku) return tolak(res, "belum_masuk", 401);
    return handleBerkas(req, res, sesiku);
  }

  // Praktikan.
  if (aksi === "me") {
    if (!requireMethod(req, res, "GET")) return;
    const s = requireRole(req, res, "praktikan");
    return s ? handleSaya(req, res, s) : undefined;
  }
  if (aksi === "ticket") {
    if (!requireMethod(req, res, "POST")) return;
    const s = requireRole(req, res, "praktikan");
    return s ? handleTiket(req, res, s) : undefined;
  }
  if (aksi === "apply") {
    if (!requireMethod(req, res, "POST")) return;
    const s = requireRole(req, res, "praktikan");
    return s ? handleDaftar(req, res, s) : undefined;
  }
  if (aksi === "document") {
    if (!requireMethod(req, res, "POST")) return;
    const s = requireRole(req, res, "praktikan");
    return s ? handleDokumen(req, res, s) : undefined;
  }
  if (aksi === "withdraw") {
    if (!requireMethod(req, res, "POST")) return;
    const s = requireRole(req, res, "praktikan");
    return s ? handleMundur(req, res, s) : undefined;
  }

  // Asisten (the rights check is per action).
  const s = requireRole(req, res, "asisten");
  if (!s) return;
  if (req.method === "GET") {
    if (aksi === "candidates") return handleDaftarKandidat(req, res, s);
    if (aksi === "candidate") return handleKandidatRinci(req, res, s);
    if (aksi === "committee") return handlePanitia(req, res, s);
    return tolak(res, "aksi_tidak_dikenal", 404);
  }
  if (!requireMethod(req, res, "POST")) return;
  if (aksi === "review") return handleTinjau(req, res, s);
  if (aksi === "event-save") return handleAcaraSimpan(req, res, s);
  if (aksi === "event-move") return handleAcaraGeser(req, res, s);
  if (aksi === "event-delete") return handleAcaraHapus(req, res, s);
  if (aksi === "seat") return handleDuduk(req, res, s);
  if (aksi === "unseat") return handleCabut(req, res, s);
  if (aksi === "visibility") {
    const e = await wajibEdisi(res, getDb());
    return e ? handleTampil(req, res, s, getDb(), e.id) : undefined;
  }
  return tolak(res, "aksi_tidak_dikenal", 404);
}

export default denganSiaran("recruitment", handler);
