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
 * Oprec accounts (api/_lib/recruitment-akun.ts):
 * GET  /api/recruitment/account      { account: { nim, nama } | null }
 * POST /api/recruitment/account-signup | account-signin | account-signout
 *
 * Candidates, signed in with their oprec account (never the practicum session):
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
 * GET  /api/recruitment/settings     editable settings (docs, envelope wording, Cutting start)
 * POST /api/recruitment/setting-save | setting-reset   { key, value? }  by role (api/_lib/recruitment-settings.ts)
 * POST /api/recruitment/account-reset { nim }  forget an oprec password (approve right)
 *
 * hakPenuh, while the Google Form is the way in (api/_lib/recruitment-tambah.ts):
 * POST /api/recruitment/candidate-add | candidate-ticket | candidate-document
 *
 * A candidate only ever reads their own row: every candidate read is
 * filtered by the session's NIM and checked again in code. Editing or
 * deleting an event whose stage has started asks for `confirm: true` and is
 * written to rec_event_log.
 */
import { and, asc, eq, ilike, or } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonBody, noStore, pgErrorCode, requireMethod } from "../_lib/http.js";
import { currentSession, requireRole } from "../_lib/session.js";
import { denganSiaran } from "../_lib/siaran.js";
import { muatOrang } from "../_lib/hak.js";
import { getDb } from "../../src/lib/db.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import {
  praktikan,
  recAccount,
  recCandidate,
  recCommittee,
  recDocument,
  recEvent,
  recEventLog,
} from "../../src/lib/schema.js";
import { susunBanner, lite, type BannerViewer } from "../../src/lib/recruitment/banner.js";
import { gateOpen, tahapSudahMulai, visibleEvents } from "../../src/lib/recruitment/gates.js";
import { fogEvents, fogLimit } from "../../src/lib/recruitment/fog.js";
import { cekBiodata, cekEvent, cekNimRek, cekTanggal } from "../../src/lib/recruitment/validate.js";
import {
  CANDIDATE_STATUS,
  DIVISIONS,
  DOC_KINDS,
  DOC_VERDICTS,
  STAGES,
  type CandidateRow,
  type CommitteeDivision,
  type DocKind,
  type EditionInfo,
  type RecEvent,
  type Viewer,
  type ViewerKind,
} from "../../src/lib/recruitment/types.js";
import { handleS3 } from "../_lib/recruitment-s3.js";
import { bolehDuduk } from "../../src/lib/recruitment/rights.js";
import { standing } from "../../src/lib/recruitment/standing.js";
import { kunciRekrutmen } from "../../src/lib/tp-r2.js";
import {
  adaEdisiDraft,
  hitungDokumen,
  kandidatSendiri,
  muatAmplop,
  muatDokumen,
  muatEdisiHidup,
  muatEvents,
  muatBerkas,
  muatKandidat,
  muatKursi,
  muatKolam,
  muatKursiSemua,
  muatEventSendiri,
  muatHasilBanyak,
  muatStanding,
  muatWaktuGagal,
  eventDariRow,
  tolak,
  wajibEdisi,
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
import { aturanDokumen, bacaSetting } from "../_lib/recruitment-settings.js";
import {
  handleSettingReset,
  handleSettingSave,
  handleSettings,
} from "../_lib/recruitment-settings.js";
import {
  bolehSembunyikan,
  handleTampil,
  jawabTersembunyi,
  oprecTersembunyi,
} from "../_lib/recruitment-sembunyi.js";
import {
  handleDokumenPanitia,
  handleTambahKandidat,
  handleTiketPanitia,
} from "../_lib/recruitment-tambah.js";
import { FORMULIR } from "../../src/lib/recruitment/formulir.js";
import {
  handleAmplop,
  handleAmplopBuka,
  handleBukaKunci,
  handleHasil,
  handleKunci,
  handleUsul,
} from "../_lib/recruitment-cutting.js";
import {
  handleHadir,
  handleHadirManual,
  handleKehadiran,
  handleQrAcara,
  handleQrToken,
} from "../_lib/recruitment-attendance.js";
import {
  handleAtur,
  handleIsiOtomatis,
  handleKeputusan,
  handlePilih,
  handleSlot,
  handleUbah,
} from "../_lib/recruitment-slots.js";
import {
  handleAkun,
  handleBuatAkun,
  handleKeluarAkun,
  handleMasukAkun,
  handleResetAkun,
  namaKandidat,
  sesiOprec,
  wajibOprec,
} from "../_lib/recruitment-akun.js";

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

/**
 * Who is asking and how the calendar sees them. An Asisten by their site
 * session; a candidate only by their oprec account (`o`): a practicum
 * Praktikan session alone is a visitor here (user, 2026-10-24).
 */
async function kenali(
  db: Db,
  edisi: EditionInfo,
  s: SessionPayload | null,
  o: SessionPayload | null,
): Promise<{ kind: ViewerKind; pelaku: PelakuServer | null; viewer: Viewer }> {
  if (s?.role !== "asisten") {
    if (!o) return { kind: "visitor", pelaku: null, viewer: { kind: "visitor" } };
    const k = await muatKandidat(db, edisi.id, o.nim);
    const kind: ViewerKind = k ? "candidate" : "praktikan";
    const sendiri = k ? await muatEventSendiri(db, k.id) : [];
    return { kind, pelaku: null, viewer: { kind, ownEventIds: sendiri } };
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
  let berikutnya: string | null = null;
  const o = s?.role === "asisten" ? null : await sesiOprec(req, db);
  if (o) {
    const k = await muatKandidat(db, edisi.id, o.nim);
    // Their own page never spoils a sealed result: only opened ones count here.
    const lihat = k ? await muatStanding(db, events, k, now, true) : null;
    const amplop = k ? await muatAmplop(db, k.id, now) : null;
    berikutnya = amplop?.pending[0]?.revealAt ?? null;
    viewer = {
      kind: "praktikan",
      candidate: k
        ? {
            status: lihat!.status,
            stage: lihat!.stage,
            cutAt: lihat!.status === "out" ? await muatWaktuGagal(db, k.id, now) : null,
            ownEventIds: await muatEventSendiri(db, k.id),
            envelope: !!amplop?.envelopes.some((a) => !a.opened),
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
  const banner = susunBanner({
    edition: { title: edisi.title, status: "live" },
    segera: false,
    events,
    now,
    viewer,
  });
  // The banner refetches the moment the next locked reveal comes (it counts from this clock).
  res
    .status(200)
    .json(
      banner.kind === "candidate"
        ? { ...banner, nextReveal: berikutnya, now: now.toISOString() }
        : banner,
    );
}

async function handleEdisi(req: ApiRequest, res: ApiResponse) {
  const db = getDb();
  const s = currentSession(req);
  const o = s?.role === "asisten" ? null : await sesiOprec(req, db);
  const edisi = await muatEdisiHidup(db);
  if (!edisi) {
    return void res.status(200).json({
      ok: true,
      edition: null,
      viewer: s?.role === "asisten" ? "asisten" : o ? "praktikan" : "visitor",
      rights: null,
      seat: null,
    });
  }
  const { kind, pelaku } = await kenali(db, edisi, s, o);
  res.status(200).json({
    ok: true,
    edition: edisi,
    viewer: kind,
    rights: pelaku && anggotaPanitia(pelaku) ? pelaku.hak : null,
    seat: pelaku?.kursi ?? null,
    // The documents asked for (Atur Berkas): the candidate page and the Panitia read the same list.
    docs: await bacaSetting(db, "docs"),
    // Only an Asisten gets this far while it is on (the router answers everyone else).
    ...(s?.role === "asisten" && {
      hidden: await oprecTersembunyi(db),
      canHide: bolehSembunyikan(pelaku),
      canAdd: !!pelaku && (pelaku.penuh || pelaku.hak.documents),
    }),
  });
}

async function handleKalender(req: ApiRequest, res: ApiResponse, s: SessionPayload | null) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const o = s?.role === "asisten" ? null : await sesiOprec(req, db);
  const { viewer } = await kenali(db, edisi, s, o);
  const events = await muatEvents(db, edisi.id);
  let tampil = visibleEvents(events, viewer);
  // The fog: a CaAs (or a visitor) gets the dates up to the next stage, never the rest.
  if (viewer.kind === "visitor" || viewer.kind === "praktikan" || viewer.kind === "candidate") {
    const k = o ? await muatKandidat(db, edisi.id, o.nim) : null;
    const lihat = k ? await muatStanding(db, events, k, new Date(), true) : null;
    tampil = fogEvents(tampil, fogLimit(lihat), viewer.ownEventIds ?? []);
  }
  res.status(200).json({
    ok: true,
    edition: edisi,
    events: tampil,
    now: new Date().toISOString(),
  });
}

async function handleSaya(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await muatEdisiHidup(db);
  if (!edisi) {
    return void res.status(200).json({
      ok: true,
      edition: null,
      candidate: null,
      documents: [],
      envelopes: [],
      pending: [],
      daftarOpen: false,
      now: new Date().toISOString(),
    });
  }
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const k = await muatKandidat(db, edisi.id, s.nim);
  const amplop = k ? await muatAmplop(db, k.id, now) : { envelopes: [], pending: [] };
  // Status and stage as the candidate has seen them: an envelope not opened yet changes nothing here.
  const lihat = k ? await muatStanding(db, events, k, now, true) : null;
  res.status(200).json({
    ok: true,
    edition: edisi,
    candidate: k ? { ...kandidatSendiri(k), status: lihat!.status, stage: lihat!.stage } : null,
    // The ids are the candidate's own: berkas answers 404 for anyone else's.
    documents: k ? await muatDokumen(db, k.id) : [],
    envelopes: amplop.envelopes,
    pending: amplop.pending,
    daftarOpen: gateOpen(events, "daftar", now),
    words: await bacaSetting(db, "words"),
    now: now.toISOString(),
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
      nama: namaKandidat,
      status: recCandidate.status,
      stage: recCandidate.currentStage,
      appliedAt: recCandidate.appliedAt,
      biodata: recCandidate.biodata,
    })
    .from(recCandidate)
    .leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))
    .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
    .where(
      and(
        eq(recCandidate.editionId, edisi.id),
        q ? or(ilike(namaKandidat, cocok), ilike(recCandidate.nim, cocok)) : undefined,
      ),
    )
    .orderBy(asc(recCandidate.appliedAt), asc(recCandidate.id));
  const ids = rows.map((r) => r.id);
  const aturan = await aturanDokumen(db);
  const jumlah = await hitungDokumen(db, ids, aturan.required);
  // Stage and status as the results make them (a revealed Lolos moves a
  // candidate on, a revealed Gagal puts them out), so the filters read the same.
  const now = new Date();
  const events = await muatEvents(db, edisi.id);
  const hasil = await muatHasilBanyak(db, ids);
  const candidates: CandidateRow[] = rows
    .map((r) => {
      const st = standing(
        { status: r.status, currentStage: r.stage },
        hasil.get(r.id) ?? [],
        events,
        now,
      );
      return {
        id: r.id,
        nim: r.nim,
        nama: r.nama ?? "",
        kelas: r.biodata?.kelas ?? null,
        angkatan: r.biodata?.angkatan ?? null,
        status: st.status,
        stage: st.stage,
        appliedAt: r.appliedAt.toISOString(),
        docs: jumlah.get(r.id) ?? 0,
      };
    })
    .filter((c) => (!stage || c.stage === stage) && (!status || c.status === status));
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
    .select({ k: recCandidate, nama: namaKandidat, namaRoster: praktikan.nama })
    .from(recCandidate)
    .leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))
    .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
    .where(and(eq(recCandidate.id, id), eq(recCandidate.editionId, edisi.id)))
    .limit(1);
  if (!r) return tolak(res, "tidak_ditemukan", 404);
  const k = r.k;
  const lengkap = !!p?.hak.documents;
  const dokumen = lengkap ? await muatBerkas(db, k.id) : null;
  const aturan = await aturanDokumen(db);
  const st = await muatStanding(db, await muatEvents(db, edisi.id), k, new Date());
  res.status(200).json({
    ok: true,
    candidate: {
      id: k.id,
      nim: k.nim,
      nama: r.nama ?? "",
      // The practicum roster's name for this NIM, if any: a name that differs
      // from the account's is the sign of someone signing up as another (Berkas review).
      namaRoster: r.namaRoster ?? null,
      kelas: k.biodata?.kelas ?? null,
      angkatan: k.biodata?.angkatan ?? null,
      status: st.status,
      stage: st.stage,
      appliedAt: k.appliedAt.toISOString(),
      docs: dokumen ? dokumen.filter((d) => aturan.required.includes(d.kind)).length : 0,
      reviewNote: k.reviewNote,
      reviewedBy: k.reviewedBy,
      reviewedAt: k.reviewedAt ? k.reviewedAt.toISOString() : null,
      berkasScore: lengkap ? k.berkasScore : null,
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
      prevR2Key: recDocument.prevR2Key,
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
  // v=1 is the file a re-upload replaced; there is only one earlier version.
  const lama = req.query.v === "1";
  if (lama && !d.prevR2Key) return tolak(res, "tidak_ditemukan", 404);
  let url: string;
  try {
    url = await urlBaca({
      kunci: lama ? d.prevR2Key! : d.r2Key,
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
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const aturan = await aturanDokumen(db);
  const p = cekParamTiket(jsonBody(req), aturan.batas);
  if (!p.ok) return tolak(res, p.kode);
  const now = new Date();
  const k = await muatKandidat(db, edisi.id, s.nim);
  const buka = gateOpen(await muatEvents(db, edisi.id), "daftar", now);
  // Registration is open, or Admin asked this candidate for a revision.
  if (!buka && k?.status !== "revision") return tolak(res, "jendela_tutup", 409);
  if (!k && !aturan.required.includes(p.kind)) return tolak(res, "format_salah");
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
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  // The team's Google Form is the way in; the Panitia add each candidate (2026-10-25).
  if (FORMULIR) return tolak(res, "daftar_lewat_formulir", 409, { url: FORMULIR.url });
  const b = jsonBody(req);
  if (b.consent !== true) return tolak(res, "data_salah", 400, { field: "consent" });
  const bio = cekBiodata(b.biodata);
  if (!bio.ok) return tolak(res, "data_salah", 400, { field: bio.field });
  const docs = Array.isArray(b.docs) ? b.docs : [];
  const jenis = docs.map((d: unknown) => (d as { kind?: unknown })?.kind);
  const wajib = (await aturanDokumen(db)).required;
  if (
    docs.length !== wajib.length ||
    wajib.some((k) => !jenis.includes(k)) ||
    new Set(jenis).size !== jenis.length
  )
    return tolak(res, "data_salah", 400, { field: "docs" });

  if (!gateOpen(await muatEvents(db, edisi.id), "daftar", new Date()))
    return tolak(res, "jendela_tutup", 409);
  // Anyone with an oprec account may apply, on the practicum roster or not (2026-10-24).
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

  const [lama] = await db
    .select()
    .from(recDocument)
    .where(and(eq(recDocument.candidateId, k.id), eq(recDocument.kind, t.kind)))
    .limit(1);
  const nilai = { r2Key: t.k, size: t.n, sha256: t.s, uploadedAt: new Date(), verdict: null };
  // The file replaced stays reachable for Admin as V1, and the new one starts unchecked.
  const gantian =
    lama && lama.sha256 !== t.s
      ? {
          prevR2Key: lama.r2Key,
          prevSize: lama.size,
          prevSha256: lama.sha256,
          prevUploadedAt: lama.uploadedAt,
        }
      : {};
  const [d] = await db
    .insert(recDocument)
    .values({ candidateId: k.id, kind: t.kind, ...nilai })
    .onConflictDoUpdate({
      target: [recDocument.candidateId, recDocument.kind],
      set: { ...nilai, ...gantian },
    })
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
  // S2: an optional Nilai Berkas, and Sesuai or Perbaiki for each file.
  let skor: number | null | undefined;
  if (b.score !== undefined) {
    if (
      b.score !== null &&
      !(Number.isInteger(b.score) && (b.score as number) >= 0 && (b.score as number) <= 100)
    )
      return tolak(res, "data_salah", 400, { field: "score" });
    skor = b.score as number | null;
  }
  const vonis: [DocKind, "ok" | "fix" | null][] = [];
  if (b.files !== undefined) {
    if (typeof b.files !== "object" || b.files === null || Array.isArray(b.files))
      return tolak(res, "data_salah", 400, { field: "files" });
    for (const [kind, v] of Object.entries(b.files as Record<string, unknown>)) {
      if (
        !(DOC_KINDS as readonly string[]).includes(kind) ||
        (v !== null && !DOC_VERDICTS.includes(v as never))
      )
        return tolak(res, "data_salah", 400, { field: "files" });
      vonis.push([kind as DocKind, v as "ok" | "fix" | null]);
    }
  }

  const [k] = await db
    .select()
    .from(recCandidate)
    .where(and(eq(recCandidate.id, id), eq(recCandidate.editionId, edisi.id)))
    .limit(1);
  if (!k) return tolak(res, "tidak_ditemukan", 404);
  if (!["applied", "revision", "approved"].includes(k.status))
    return tolak(res, "status_salah", 409);
  if (b.decision === "approve") {
    const wajib = (await aturanDokumen(db)).required;
    const n = (await hitungDokumen(db, [k.id], wajib)).get(k.id) ?? 0;
    if (n < wajib.length) return tolak(res, "berkas_kurang", 409);
  }
  const status = b.decision === "approve" ? "approved" : "revision";
  await db
    .update(recCandidate)
    .set({
      status,
      reviewNote: catatan || null,
      reviewedBy: s.nim,
      reviewedAt: new Date(),
      ...(skor !== undefined ? { berkasScore: skor } : {}),
    })
    .where(eq(recCandidate.id, k.id));
  for (const [kind, v] of vonis)
    await db
      .update(recDocument)
      .set({ verdict: v })
      .where(and(eq(recDocument.candidateId, k.id), eq(recDocument.kind, kind)));
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
    const s = sesiku?.role === "asisten" ? sesiku : await sesiOprec(req);
    if (!s) return tolak(res, "belum_masuk", 401);
    return handleBerkas(req, res, s);
  }

  // Oprec accounts: sign up, sign in, sign out, who am I.
  if (aksi === "account") {
    if (!requireMethod(req, res, "GET")) return;
    return handleAkun(req, res);
  }
  if (aksi === "account-signup") {
    if (!requireMethod(req, res, "POST")) return;
    return handleBuatAkun(req, res);
  }
  if (aksi === "account-signin") {
    if (!requireMethod(req, res, "POST")) return;
    return handleMasukAkun(req, res);
  }
  if (aksi === "account-signout") {
    if (!requireMethod(req, res, "POST")) return;
    return handleKeluarAkun(req, res);
  }

  // Candidates, by their oprec account only (never the practicum session).
  if (aksi === "me") {
    if (!requireMethod(req, res, "GET")) return;
    const s = await wajibOprec(req, res);
    return s ? handleSaya(req, res, s) : undefined;
  }
  if (aksi === "ticket") {
    if (!requireMethod(req, res, "POST")) return;
    const s = await wajibOprec(req, res);
    return s ? handleTiket(req, res, s) : undefined;
  }
  if (aksi === "apply") {
    if (!requireMethod(req, res, "POST")) return;
    const s = await wajibOprec(req, res);
    return s ? handleDaftar(req, res, s) : undefined;
  }
  if (aksi === "document") {
    if (!requireMethod(req, res, "POST")) return;
    const s = await wajibOprec(req, res);
    return s ? handleDokumen(req, res, s) : undefined;
  }
  if (aksi === "withdraw") {
    if (!requireMethod(req, res, "POST")) return;
    const s = await wajibOprec(req, res);
    return s ? handleMundur(req, res, s) : undefined;
  }
  // S2, candidate side: envelopes, scanning the QR, picking a slot.
  if (aksi === "envelopes") {
    if (!requireMethod(req, res, "GET")) return;
    const s = await wajibOprec(req, res);
    return s ? handleAmplop(req, res, s) : undefined;
  }
  if (aksi === "envelope-open") {
    if (!requireMethod(req, res, "POST")) return;
    const s = await wajibOprec(req, res);
    return s ? handleAmplopBuka(req, res, s) : undefined;
  }
  if (aksi === "attend") {
    if (!requireMethod(req, res, "POST")) return;
    const s = await wajibOprec(req, res);
    return s ? handleHadir(req, res, s) : undefined;
  }
  if (aksi === "slot-pick") {
    if (!requireMethod(req, res, "POST")) return;
    const s = await wajibOprec(req, res);
    return s ? handlePilih(req, res, s) : undefined;
  }
  if (aksi === "slot-change") {
    if (!requireMethod(req, res, "POST")) return;
    const s = await wajibOprec(req, res);
    return s ? handleUbah(req, res, s) : undefined;
  }
  // slots answers a candidate with seat counts and a Panitia member with the board.
  if (aksi === "slots") {
    if (!requireMethod(req, res, "GET")) return;
    const s = sesiku?.role === "asisten" ? sesiku : await sesiOprec(req);
    if (!s) return tolak(res, "belum_masuk", 401);
    return handleSlot(req, res, s);
  }

  // S3, the exam: one table per audience in recruitment-s3.ts.
  if (await handleS3(aksi, req, res)) return;

  // Asisten (the rights check is per action).
  const s = requireRole(req, res, "asisten");
  if (!s) return;
  if (req.method === "GET") {
    if (aksi === "candidates") return handleDaftarKandidat(req, res, s);
    if (aksi === "candidate") return handleKandidatRinci(req, res, s);
    if (aksi === "committee") return handlePanitia(req, res, s);
    if (aksi === "results") return handleHasil(req, res, s);
    if (aksi === "qr-events") return handleQrAcara(req, res, s);
    if (aksi === "qr-token") return handleQrToken(req, res, s);
    if (aksi === "attendance") return handleKehadiran(req, res, s);
    if (aksi === "settings") {
      const e = await wajibEdisi(res, getDb());
      return e ? handleSettings(req, res, s, getDb(), e.id) : undefined;
    }
    return tolak(res, "aksi_tidak_dikenal", 404);
  }
  if (!requireMethod(req, res, "POST")) return;
  if (aksi === "propose") return handleUsul(req, res, s);
  if (aksi === "lock") return handleKunci(req, res, s);
  if (aksi === "unlock") return handleBukaKunci(req, res, s);
  if (aksi === "attend-manual") return handleHadirManual(req, res, s);
  if (aksi === "slot-decide") return handleKeputusan(req, res, s);
  if (aksi === "slot-set") return handleAtur(req, res, s);
  if (aksi === "slot-autofill") return handleIsiOtomatis(req, res, s);
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
  if (aksi === "setting-save" || aksi === "setting-reset") {
    if (!requireMethod(req, res, "POST")) return;
    const e = await wajibEdisi(res, getDb());
    if (!e) return;
    return (aksi === "setting-save" ? handleSettingSave : handleSettingReset)(
      req,
      res,
      s,
      getDb(),
      e.id,
    );
  }
  if (aksi === "account-reset") return handleResetAkun(req, res, s);
  if (aksi === "candidate-add") return handleTambahKandidat(req, res, s);
  if (aksi === "candidate-ticket") return handleTiketPanitia(req, res, s);
  if (aksi === "candidate-document") return handleDokumenPanitia(req, res, s);
  return tolak(res, "aksi_tidak_dikenal", 404);
}

export default denganSiaran("recruitment", handler);
