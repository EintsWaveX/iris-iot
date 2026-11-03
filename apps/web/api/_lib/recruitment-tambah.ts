/**
 * Tambah CaAs (user, 2026-10-25): while the team's Google Form is the way in
 * (src/lib/recruitment/formulir.ts), the Pencipta and the Admin tier
 * (hakPenuh) add each candidate by hand: the oprec account with a password
 * they choose and hand over, the form's answers as the biodata, then each
 * PDF downloaded from the form's Drive and uploaded again here. The candidate
 * then signs in on /recruitment with that NIM and password like anyone else.
 *
 * POST /api/recruitment/candidate-add       { nim, nama, sandi, biodata, ubah? }
 * POST /api/recruitment/candidate-ticket    { id, kind, ukuran, sha256, halaman? }
 * POST /api/recruitment/candidate-document  { id, kind, tiket }
 * POST /api/recruitment/candidate-delete    { id }  a CaAs added by mistake (nothing opened yet)
 *
 * No calendar window: the Panitia keep typing in late arrivals of the form
 * after registration closes. The PDFs go through the same tickets, relay and
 * byte check as a candidate's own upload, keyed under the candidate's NIM.
 */
import { and, eq, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, pgErrorCode } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { hashPassword, writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import {
  asisten,
  recAccount,
  recAcceptance,
  recCandidate,
  recDocument,
  recStageResult,
} from "../../src/lib/schema.js";
import { cekNama, cekNimOprec, cekSandi } from "../../src/lib/recruitment/akun.js";
import { cekBiodataFormulir } from "../../src/lib/recruitment/validate.js";
import { DOC_KINDS, type CandidateStatus, type DocKind } from "../../src/lib/recruitment/types.js";
import { kunciRekrutmen } from "../../src/lib/tp-r2.js";
import { tolak, wajibEdisi, muatKandidat, type Db } from "./recruitment-data.js";
import { muatPelaku, wajibHak, type PelakuServer } from "./recruitment-rights.js";
import { aturanDokumen } from "./recruitment-settings.js";
import { bacaTiketRek, buatTiketRek, cekParamTiket, periksaBerkas } from "./recruitment-unggah.js";
import { SimpanGalat, simpanSiap, tiketUnggah } from "./tp-simpan.js";

function rahasia(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set");
  return s;
}

/**
 * Who may add and correct a CaAs by hand (user, 2026-10-28): the Ketua and
 * Admin seats (the documents right) and hakPenuh. Otherwise a 403 written here.
 */
async function wajibPenuh(
  res: ApiResponse,
  db: Db,
  edisiId: number,
  s: SessionPayload,
): Promise<PelakuServer | null> {
  const p = await muatPelaku(db, edisiId, s.nim);
  if (p && (p.penuh || p.hak.documents)) return p;
  tolak(res, "tanpa_hak", 403);
  return null;
}

interface KandidatRingkas {
  id: number;
  nim: string;
  status: CandidateStatus;
}

async function kandidatId(db: Db, edisiId: number, id: unknown): Promise<KandidatRingkas | null> {
  if (!Number.isInteger(id) || (id as number) <= 0) return null;
  const [k] = await db
    .select({ id: recCandidate.id, nim: recCandidate.nim, status: recCandidate.status })
    .from(recCandidate)
    .where(and(eq(recCandidate.id, id as number), eq(recCandidate.editionId, edisiId)))
    .limit(1);
  return k ?? null;
}

/**
 * Take a CaAs out of the edition, for one added by mistake (a typo in the NIM,
 * a double entry). Everything of theirs goes with them (documents, slots, seats,
 * sheets, results). Refused once they are an Asisten, or once an envelope of
 * theirs was opened, since that is a decision a person already saw. The PDFs in
 * R2 are removed with the edition's cleanup. The oprec account goes too when it
 * was made by hand for this CaAs (never signed in to, and no other edition row
 * holds the NIM), so the same NIM can be added again; an account somebody used
 * stays (Reset Akun is its own thing).
 */
export async function handleHapusKandidat(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  if (!(await wajibPenuh(res, db, edisi.id, s))) return;
  const k = await kandidatId(db, edisi.id, jsonBody(req).id);
  if (!k) return tolak(res, "tidak_ditemukan", 404);
  if (k.status === "accepted") return tolak(res, "sudah_jadi_asisten", 409);
  const [dibuka] = await db
    .select({ id: recStageResult.id })
    .from(recStageResult)
    .where(and(eq(recStageResult.candidateId, k.id), sql`${recStageResult.openedAt} is not null`))
    .limit(1);
  const [jadi] = await db
    .select({ id: recAcceptance.candidateId })
    .from(recAcceptance)
    .where(and(eq(recAcceptance.candidateId, k.id), sql`${recAcceptance.promotedAt} is not null`))
    .limit(1);
  if (dibuka || jadi) return tolak(res, "sudah_ada_hasil", 409);
  await db.delete(recCandidate).where(eq(recCandidate.id, k.id));
  const [lain] = await db
    .select({ id: recCandidate.id })
    .from(recCandidate)
    .where(eq(recCandidate.nim, k.nim))
    .limit(1);
  let akunDihapus = false;
  if (!lain) {
    const [akun] = await db
      .select({ masuk: recAccount.lastSigninAt })
      .from(recAccount)
      .where(eq(recAccount.nim, k.nim))
      .limit(1);
    if (akun && akun.masuk === null) {
      await db.delete(recAccount).where(eq(recAccount.nim, k.nim));
      akunDihapus = true;
    }
  }
  await writeAudit(s.nim, "rec_kandidat_hapus", {
    id: k.id,
    nim: k.nim,
    status: k.status,
    akun: akunDihapus,
  });
  return void res.status(200).json({ ok: true });
}

/**
 * Take one uploaded file off a CaAs (a wrong PDF put in by hand). Full rights only.
 * Their approval stands only while the required files are all there, so removing a
 * required one sends an approved CaAs at the document check back to waiting.
 * The PDF in R2 stays until the edition's cleanup (the key is its hash, and a
 * twin upload may share it).
 */
export async function handleHapusBerkas(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  if (!(await wajibPenuh(res, db, edisi.id, s))) return;
  const b = jsonBody(req);
  const k = await kandidatId(db, edisi.id, b.id);
  if (!k) return tolak(res, "tidak_ditemukan", 404);
  if (typeof b.kind !== "string" || !(DOC_KINDS as readonly string[]).includes(b.kind))
    return tolak(res, "data_salah", 400, { field: "kind" });
  const kind = b.kind as DocKind;
  const [ada] = await db
    .select({ id: recDocument.id })
    .from(recDocument)
    .where(and(eq(recDocument.candidateId, k.id), eq(recDocument.kind, kind)))
    .limit(1);
  if (!ada) return tolak(res, "tidak_ditemukan", 404);
  await db.delete(recDocument).where(eq(recDocument.id, ada.id));
  let status: CandidateStatus = k.status;
  if (k.status === "approved" && (await aturanDokumen(db)).required.includes(kind)) {
    const [c] = await db
      .select({ stage: recCandidate.currentStage })
      .from(recCandidate)
      .where(eq(recCandidate.id, k.id))
      .limit(1);
    if (c?.stage === "berkas") {
      await db
        .update(recCandidate)
        .set({ status: "applied", reviewNote: null, reviewedBy: null, reviewedAt: null })
        .where(eq(recCandidate.id, k.id));
      status = "applied";
    }
  }
  await writeAudit(s.nim, "rec_berkas_hapus", { id: k.id, nim: k.nim, kind, status });
  return void res.status(200).json({ ok: true, status });
}

/** Catatan Panitia: a free note on a candidate that only the Panitia read. An empty text clears it. */
export async function handleCatatanKandidat(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "candidates")) return;
  const b = jsonBody(req);
  const k = await kandidatId(db, edisi.id, b.id);
  if (!k) return tolak(res, "tidak_ditemukan", 404);
  const teks = typeof b.note === "string" ? b.note.trim() : "";
  if (teks.length > 2000) return tolak(res, "data_salah", 400, { field: "note" });
  await db
    .update(recCandidate)
    .set({ panitiaNote: teks || null })
    .where(eq(recCandidate.id, k.id));
  await writeAudit(s.nim, "rec_kandidat_catatan", { id: k.id, kosong: !teks });
  return void res.status(200).json({ ok: true });
}

/**
 * IPK and Potensi Cut on a candidate (the sheet's IPK column and POTENSI-CUT status).
 * Either may be sent alone. IPK is a number from 0 to 4 with at most two decimals, or null to clear it.
 */
export async function handleMetaKandidat(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "candidates")) return;
  const b = jsonBody(req);
  const k = await kandidatId(db, edisi.id, b.id);
  if (!k) return tolak(res, "tidak_ditemukan", 404);
  const set: { ipkX100?: number | null; potensiCut?: boolean } = {};
  if (b.ipk !== undefined) {
    if (b.ipk === null) set.ipkX100 = null;
    else {
      const n = typeof b.ipk === "number" ? b.ipk : Number.NaN;
      const x100 = Math.round(n * 100);
      if (!Number.isFinite(n) || n < 0 || n > 4 || Math.abs(n * 100 - x100) > 1e-6)
        return tolak(res, "data_salah", 400, { field: "ipk" });
      set.ipkX100 = x100;
    }
  }
  if (b.potensiCut !== undefined) {
    if (typeof b.potensiCut !== "boolean")
      return tolak(res, "data_salah", 400, { field: "potensiCut" });
    set.potensiCut = b.potensiCut;
  }
  if (!Object.keys(set).length) return tolak(res, "data_salah", 400, { field: "ipk" });
  await db.update(recCandidate).set(set).where(eq(recCandidate.id, k.id));
  await writeAudit(s.nim, "rec_kandidat_meta", { id: k.id, ...set });
  return void res.status(200).json({ ok: true });
}

/** A candidate from the Google Form, or a correction of one already added (`ubah`). */
export async function handleTambahKandidat(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  if (!(await wajibPenuh(res, db, edisi.id, s))) return;
  const b = jsonBody(req);
  const nim = typeof b.nim === "string" ? b.nim.trim() : b.nim;
  if (!cekNimOprec(nim)) return tolak(res, "data_salah", 400, { field: "nim" });
  const nama = cekNama(b.nama);
  if (!nama) return tolak(res, "data_salah", 400, { field: "nama" });
  const ubah = b.ubah === true;
  // A new candidate needs a password; a correction keeps the old one unless a new one comes.
  const sandiAda = typeof b.sandi === "string" && b.sandi.length > 0;
  if ((!ubah || sandiAda) && !cekSandi(b.sandi))
    return tolak(res, "data_salah", 400, { field: "sandi" });
  const bio = cekBiodataFormulir(b.biodata);
  if (!bio.ok) return tolak(res, "data_salah", 400, { field: bio.field });

  // Asisten are never candidates.
  const [a] = await db
    .select({ nim: asisten.nim })
    .from(asisten)
    .where(eq(asisten.nim, nim))
    .limit(1);
  if (a) return tolak(res, "nim_asisten", 409);

  const lama = await muatKandidat(db, edisi.id, nim);
  if (ubah && !lama) return tolak(res, "tidak_ditemukan", 404);
  if (!ubah && lama) return tolak(res, "sudah_daftar", 409, { id: lama.id });
  const [akun] = await db.select().from(recAccount).where(eq(recAccount.nim, nim)).limit(1);
  // Someone's own account (made before the form took over) is theirs: not overwritten by a new add.
  if (!ubah && akun?.passHash) return tolak(res, "akun_ada", 409);

  const hash = sandiAda ? hashPassword(b.sandi as string) : null;
  let baris: { id: number };
  try {
    baris = await db.transaction(async (tx) => {
      if (!akun) {
        await tx.insert(recAccount).values({ nim, nama, passHash: hash });
      } else {
        // A new password signs every device out (versi), like Reset Akun.
        await tx
          .update(recAccount)
          .set({
            nama,
            ...(hash
              ? { passHash: hash, klaimHash: null, versi: sql`${recAccount.versi} + 1` }
              : {}),
          })
          .where(eq(recAccount.nim, nim));
      }
      if (lama) {
        await tx
          .update(recCandidate)
          .set({ biodata: { ...lama.biodata, ...bio.biodata } })
          .where(eq(recCandidate.id, lama.id));
        return { id: lama.id };
      }
      const [k] = await tx
        .insert(recCandidate)
        .values({ editionId: edisi.id, nim, biodata: bio.biodata })
        .returning({ id: recCandidate.id });
      return k;
    });
  } catch (e) {
    if (pgErrorCode(e) === "23505") return tolak(res, "sudah_daftar", 409);
    throw e;
  }
  // Never the password, not even its length.
  await writeAudit(s.nim, ubah ? "rec_kandidat_ubah" : "rec_kandidat_tambah", {
    nim,
    id: baris.id,
    sandiBaru: !!hash,
  });
  res.status(200).json({ ok: true, candidate: { id: baris.id, nim, nama } });
}

/** Step 1 of a Panitia upload: where to PUT one PDF for this candidate. */
export async function handleTiketPanitia(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  if (!(await wajibPenuh(res, db, edisi.id, s))) return;
  const b = jsonBody(req);
  const k = await kandidatId(db, edisi.id, b.id);
  if (!k) return tolak(res, "tidak_ditemukan", 404);
  const aturan = await aturanDokumen(db);
  const p = cekParamTiket(b, aturan.batas);
  if (!p.ok) return tolak(res, p.kode);
  if (!aturan.semua.includes(p.kind)) return tolak(res, "format_salah");
  if (!simpanSiap()) return tolak(res, "penyimpanan_mati", 503);

  const [ada] = await db
    .select({ sha256: recDocument.sha256 })
    .from(recDocument)
    .where(and(eq(recDocument.candidateId, k.id), eq(recDocument.kind, p.kind)))
    .limit(1);
  if (ada?.sha256 === p.sha256) return void res.status(200).json({ ok: true, sama: true });
  const kunci = kunciRekrutmen(edisi.id, k.nim, p.kind, p.sha256);
  const put = await tiketUnggah({ kunci, ukuran: p.ukuran, sha256: p.sha256, halaman: p.halaman });
  const tiket = await buatTiketRek(rahasia(), {
    k: kunci,
    n: p.ukuran,
    s: p.sha256,
    h: p.halaman,
    nim: k.nim,
    ed: edisi.id,
    kind: p.kind,
  });
  res.status(200).json({ ok: true, sama: false, url: put.url, tiket });
}

/** Step 2: the uploaded PDF becomes the candidate's document of that kind. */
export async function handleDokumenPanitia(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  if (!(await wajibPenuh(res, db, edisi.id, s))) return;
  const b = jsonBody(req);
  const k = await kandidatId(db, edisi.id, b.id);
  if (!k) return tolak(res, "tidak_ditemukan", 404);
  const t = await bacaTiketRek(b.tiket, rahasia());
  if (!t || t.nim !== k.nim || t.ed !== edisi.id || t.kind !== b.kind)
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
  // A changed file needs a fresh look from Admin, as when the candidate sends it.
  let status = k.status;
  if (k.status === "revision" || k.status === "approved") {
    await db.update(recCandidate).set({ status: "applied" }).where(eq(recCandidate.id, k.id));
    status = "applied";
  }
  await writeAudit(s.nim, "rec_dokumen_panitia", { nim: k.nim, kind: t.kind, ukuran: t.n });
  res.status(200).json({
    ok: true,
    document: {
      id: d.id,
      kind: d.kind,
      size: d.size,
      uploadedAt: d.uploadedAt.toISOString(),
      note: d.note,
    },
    status,
  });
}
