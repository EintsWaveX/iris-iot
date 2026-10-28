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
import { asisten, recAccount, recCandidate, recDocument } from "../../src/lib/schema.js";
import { cekNama, cekNimOprec, cekSandi } from "../../src/lib/recruitment/akun.js";
import { cekBiodataFormulir } from "../../src/lib/recruitment/validate.js";
import {
  DOC_OPTIONAL,
  DOC_REQUIRED,
  type CandidateStatus,
} from "../../src/lib/recruitment/types.js";
import { kunciRekrutmen } from "../../src/lib/tp-r2.js";
import { tolak, wajibEdisi, muatKandidat, type Db } from "./recruitment-data.js";
import { muatPelaku, type PelakuServer } from "./recruitment-rights.js";
import { bacaTiketRek, buatTiketRek, cekParamTiket, periksaBerkas } from "./recruitment-unggah.js";
import { SimpanGalat, simpanSiap, tiketUnggah } from "./tp-simpan.js";

function rahasia(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set");
  return s;
}

/** The kinds the Panitia may upload for a candidate: the form's list. */
const JENIS_PANITIA = [...DOC_REQUIRED, ...DOC_OPTIONAL];

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
  const p = cekParamTiket(b);
  if (!p.ok) return tolak(res, p.kode);
  if (!JENIS_PANITIA.includes(p.kind)) return tolak(res, "format_salah");
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
