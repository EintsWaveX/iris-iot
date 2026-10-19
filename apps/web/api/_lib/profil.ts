/**
 * The Lab Profile's data and writes (Phase 23), served from
 * /api/profil/[aksi].ts.
 *
 * GET  baca  anyone, signed in or not: the whole profile Home shows, built
 *            by bacaProfil(). People carry name, code, position and photo,
 *            never a NIM (src/lib/profil.ts).
 * POST (the "profil" right, src/lib/hak.ts: ADC, DEV and Admins)
 *   divisi-simpan  { divisi, baris, deskripsi, foto? }  divisi is one of
 *                  the six or "INTI", the Inti as a group
 *   foto-asisten   { kode, foto }            the photo of an Asisten the
 *                                            profile shows
 *   nonaktif-daftar {}                      the inactive Asisten, each with
 *                                            whether the profile shows them
 *   tampil-asisten { kode, tampil }          show or hide an inactive one
 *   bersama-simpan { id?, tahun, keterangan, foto? }
 *   bersama-hapus  { id }
 *   acara-simpan   { id?, jenis, judul, tempat, ringkasan, tanggal,
 *                    sampul?, foto: [{ id?, besar, kecil, alt? }] }  the
 *                  edition with its whole photo list in order; a photo
 *                  left out is removed
 *   acara-hapus    { id }
 *
 * `foto` is { besar, kecil }, two Vercel Blob URLs the browser uploaded
 * (unggah token in the route), or null to remove the photo; left out, the
 * photo stays. A replaced or removed photo's blobs are deleted, best effort.
 */
import { del } from "@vercel/blob";
import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  jabatanPemegang,
  profilAcara,
  profilAcaraFoto,
  profilDivisi,
  profilFotoBersama,
} from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { DIVISI, INTI, divisiKepala, isDivisi, isKategori } from "../../src/lib/hak.js";
import {
  FOTO_PER_ACARA,
  INFO_DIVISI,
  INFO_INTI,
  KUNCI_INTI,
  TEKS_MAKS,
  bacaTeks,
  bacaTeksOpsional,
  isJenisAcara,
  tahunValid,
  tanggalValid,
  urutOrang,
  urutTahun,
  type Acara,
  type DivisiProfil,
  type Foto,
  type FieldTeks,
  type NonaktifProfil,
  type OrangProfil,
  type ProfilData,
  type TeksTiga,
} from "../../src/lib/profil.js";

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

function tolak(res: ApiResponse, kode: string, extra: Record<string, unknown> = {}) {
  res.status(200).json({ ok: false, kode, ...extra });
}

function blobUrlValid(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** undefined: not sent (keep); null: remove; a Foto: set; false: invalid. */
function bacaFoto(v: unknown): Foto | null | undefined | false {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const o = v as { besar?: unknown; kecil?: unknown };
  if (!o || typeof o !== "object" || !blobUrlValid(o.besar) || !blobUrlValid(o.kecil)) return false;
  return { besar: o.besar, kecil: o.kecil };
}

function fotoDari(besar: string | null, kecil: string | null): Foto | null {
  return besar && kecil ? { besar, kecil } : null;
}

/** Best effort: a blob already gone must not fail the save. */
async function hapusBlob(urls: (string | null | undefined)[], asal: string): Promise<void> {
  for (const url of urls) {
    if (!url || !blobUrlValid(url)) continue;
    try {
      await del(url);
    } catch (err) {
      console.warn(`[WARN] profil/${asal}: blob delete failed, row changed anyway`, err);
    }
  }
}

type Teks<K extends FieldTeks> = Record<K, TeksTiga>;

/** Reads the required texts of a body; on a missing language answers
 *  { kode: "teks_kurang", field, kurang } and returns null. */
function bacaSemuaTeks<K extends FieldTeks>(
  res: ApiResponse,
  body: Record<string, unknown>,
  fields: readonly K[],
): Teks<K> | null {
  const out = {} as Teks<K>;
  for (const f of fields) {
    const h = bacaTeks(body[f], TEKS_MAKS[f]);
    if (!h.ok) {
      tolak(res, h.kode === "kurang" ? "teks_kurang" : "teks_panjang", {
        field: f,
        ...(h.kode === "kurang" ? { kurang: h.kurang } : { bahasa: h.bahasa }),
      });
      return null;
    }
    out[f] = h.teks;
  }
  return out;
}

function idValid(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* ================================================================ read */

/** The whole public profile: active Asisten and the inactive ones an editor
 *  chose to show; never a NIM. */
export async function bacaProfil(): Promise<ProfilData> {
  const db = getDb();
  const [orang, pemegang, divisi, bersama, acara, foto] = await Promise.all([
    db
      .select({
        nim: asisten.nim,
        nama: asisten.nama,
        kode: asisten.kode,
        divisi: asisten.divisi,
        fotoUrl: asisten.fotoUrl,
        fotoKecilUrl: asisten.fotoKecilUrl,
        status: asisten.status,
        tampilProfil: asisten.tampilProfil,
      })
      .from(asisten)
      .where(or(eq(asisten.status, "aktif"), eq(asisten.tampilProfil, true))),
    db
      .select({ nim: jabatanPemegang.nim, kategori: jabatanPemegang.kategori })
      .from(jabatanPemegang)
      .where(isNull(jabatanPemegang.selesai)),
    db.select().from(profilDivisi),
    db.select().from(profilFotoBersama),
    db.select().from(profilAcara).orderBy(asc(profilAcara.tanggal), asc(profilAcara.id)),
    db.select().from(profilAcaraFoto).orderBy(asc(profilAcaraFoto.urutan), asc(profilAcaraFoto.id)),
  ]);

  // The NIM only joins the position here and goes no further.
  const posisi = new Map<string, OrangProfil["peran"]>();
  for (const p of pemegang) {
    if (!isKategori(p.kategori)) continue;
    posisi.set(p.nim, divisiKepala(p.kategori) ? "kepala" : (p.kategori as OrangProfil["peran"]));
  }
  const inti: OrangProfil[] = [];
  const perDivisi = new Map<string, OrangProfil[]>();
  for (const o of orang) {
    const aktif = o.status === "aktif";
    if (!aktif && !o.tampilProfil) continue;
    const peran = posisi.get(o.nim) ?? "anggota";
    const p: OrangProfil = {
      nama: o.nama,
      kode: o.kode,
      peran,
      foto: fotoDari(o.fotoUrl, o.fotoKecilUrl),
      ...(aktif ? {} : { nonaktif: true as const }),
    };
    if ((INTI as readonly string[]).includes(peran)) inti.push(p);
    else if (isDivisi(o.divisi)) perDivisi.set(o.divisi, [...(perDivisi.get(o.divisi) ?? []), p]);
  }

  const simpanan = new Map(divisi.map((d) => [d.divisi, d]));
  const divisiProfil: DivisiProfil[] = DIVISI.map((kode) => {
    const d = simpanan.get(kode);
    return {
      kode,
      foto: fotoDari(d?.fotoUrl ?? null, d?.fotoKecilUrl ?? null),
      baris: d?.baris ?? INFO_DIVISI[kode].baris,
      deskripsi: d?.deskripsi ?? INFO_DIVISI[kode].deskripsi,
      anggota: urutOrang(perDivisi.get(kode) ?? []),
    };
  });

  const fotoPer = new Map<number, Acara["foto"]>();
  for (const f of foto) {
    fotoPer.set(f.acaraId, [
      ...(fotoPer.get(f.acaraId) ?? []),
      { id: f.id, besar: f.fotoUrl, kecil: f.fotoKecilUrl, alt: f.alt ?? null },
    ]);
  }

  const intiRow = simpanan.get(KUNCI_INTI);
  return {
    ok: true,
    inti: urutOrang(inti),
    intiGrup: {
      foto: fotoDari(intiRow?.fotoUrl ?? null, intiRow?.fotoKecilUrl ?? null),
      baris: intiRow?.baris ?? INFO_INTI.baris,
      deskripsi: intiRow?.deskripsi ?? INFO_INTI.deskripsi,
    },
    divisi: divisiProfil,
    bersama: urutTahun(bersama).map((b) => ({
      id: b.id,
      tahun: b.tahun,
      foto: { besar: b.fotoUrl, kecil: b.fotoKecilUrl },
      keterangan: b.keterangan,
    })),
    acara: acara.map((a) => ({
      id: a.id,
      jenis: a.jenis,
      judul: a.judul,
      tempat: a.tempat,
      ringkasan: a.ringkasan,
      tanggal: a.tanggal,
      sampulId: a.sampulId,
      foto: fotoPer.get(a.id) ?? [],
    })),
  };
}

export async function handleBaca(_req: ApiRequest, res: ApiResponse) {
  // Public and the same for everyone: the edge may keep it a short while.
  // Pages that heard a "profil" write ask with ?v= and get it fresh.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=300");
  res.status(200).json(await bacaProfil());
}

/* =============================================================== writes */

export type Post = (req: ApiRequest, res: ApiResponse, s: SessionPayload) => Promise<void>;

export const handleDivisiSimpan: Post = async (req, res, s) => {
  const body = jsonBody(req);
  if (!isDivisi(body.divisi) && body.divisi !== KUNCI_INTI) return tolak(res, "format_salah");
  const foto = bacaFoto(body.foto);
  if (foto === false) return tolak(res, "foto_salah");
  const teks = bacaSemuaTeks(res, body, ["baris", "deskripsi"] as const);
  if (!teks) return;

  const db = getDb();
  const [lama] = await db.select().from(profilDivisi).where(eq(profilDivisi.divisi, body.divisi));
  const fotoBaru =
    foto === undefined
      ? { fotoUrl: lama?.fotoUrl ?? null, fotoKecilUrl: lama?.fotoKecilUrl ?? null }
      : { fotoUrl: foto?.besar ?? null, fotoKecilUrl: foto?.kecil ?? null };
  const nilai = { ...teks, ...fotoBaru, diubahOleh: s.nim, diubahPada: new Date() };
  await db
    .insert(profilDivisi)
    .values({ divisi: body.divisi, ...nilai })
    .onConflictDoUpdate({ target: profilDivisi.divisi, set: nilai });
  if (foto !== undefined && lama?.fotoUrl !== fotoBaru.fotoUrl)
    await hapusBlob([lama?.fotoUrl, lama?.fotoKecilUrl], "divisi");
  await writeAudit(s.nim, "profil_divisi", { divisi: body.divisi, foto: foto !== undefined });
  res.status(200).json({ ok: true });
};

export const handleFotoAsisten: Post = async (req, res, s) => {
  const body = jsonBody(req);
  const foto = bacaFoto(body.foto);
  if (typeof body.kode !== "string" || foto === false || foto === undefined)
    return tolak(res, "format_salah");
  const db = getDb();
  const cocok = await db
    .select({ nim: asisten.nim, fotoUrl: asisten.fotoUrl, fotoKecilUrl: asisten.fotoKecilUrl })
    .from(asisten)
    .where(
      and(
        eq(asisten.kode, body.kode),
        or(eq(asisten.status, "aktif"), eq(asisten.tampilProfil, true)),
      ),
    );
  if (cocok.length !== 1) return tolak(res, "tidak_ditemukan");
  const [o] = cocok;
  await db
    .update(asisten)
    .set({ fotoUrl: foto?.besar ?? null, fotoKecilUrl: foto?.kecil ?? null })
    .where(eq(asisten.nim, o.nim));
  if (o.fotoUrl !== (foto?.besar ?? null)) await hapusBlob([o.fotoUrl, o.fotoKecilUrl], "asisten");
  await writeAudit(s.nim, "profil_foto", { kode: body.kode, hapus: foto === null });
  res.status(200).json({ ok: true });
};

export const handleNonaktif: Post = async (_req, res) => {
  const rows = await getDb()
    .select({
      kode: asisten.kode,
      nama: asisten.nama,
      divisi: asisten.divisi,
      tampil: asisten.tampilProfil,
    })
    .from(asisten)
    .where(ne(asisten.status, "aktif"))
    .orderBy(asc(asisten.nama));
  res.status(200).json({ ok: true, nonaktif: rows satisfies NonaktifProfil[] });
};

export const handleTampilAsisten: Post = async (req, res, s) => {
  const body = jsonBody(req);
  if (typeof body.kode !== "string" || typeof body.tampil !== "boolean")
    return tolak(res, "format_salah");
  const ubah = await getDb()
    .update(asisten)
    .set({ tampilProfil: body.tampil })
    .where(and(eq(asisten.kode, body.kode), ne(asisten.status, "aktif")))
    .returning({ kode: asisten.kode });
  if (ubah.length !== 1) return tolak(res, "tidak_ditemukan");
  await writeAudit(s.nim, "profil_tampil", { kode: body.kode, tampil: body.tampil });
  res.status(200).json({ ok: true });
};

export const handleBersamaSimpan: Post = async (req, res, s) => {
  const body = jsonBody(req);
  const id = body.id === undefined || body.id === null ? null : idValid(body.id);
  if (body.id != null && !id) return tolak(res, "format_salah");
  if (!tahunValid(body.tahun)) return tolak(res, "tahun_salah");
  const foto = bacaFoto(body.foto);
  if (foto === false || foto === null) return tolak(res, "foto_salah");
  if (!id && !foto) return tolak(res, "foto_wajib");
  const teks = bacaSemuaTeks(res, body, ["keterangan"] as const);
  if (!teks) return;

  const db = getDb();
  const [sama] = await db
    .select({ id: profilFotoBersama.id })
    .from(profilFotoBersama)
    .where(eq(profilFotoBersama.tahun, body.tahun));
  if (sama && sama.id !== id) return tolak(res, "tahun_ada");

  if (!id) {
    const [row] = await db
      .insert(profilFotoBersama)
      .values({
        tahun: body.tahun,
        fotoUrl: foto!.besar,
        fotoKecilUrl: foto!.kecil,
        keterangan: teks.keterangan,
        diubahOleh: s.nim,
      })
      .returning({ id: profilFotoBersama.id });
    await writeAudit(s.nim, "profil_bersama", { id: row.id, tahun: body.tahun, baru: true });
    return void res.status(200).json({ ok: true, id: row.id });
  }

  const [lama] = await db.select().from(profilFotoBersama).where(eq(profilFotoBersama.id, id));
  if (!lama) return tolak(res, "tidak_ditemukan");
  await db
    .update(profilFotoBersama)
    .set({
      tahun: body.tahun,
      keterangan: teks.keterangan,
      ...(foto ? { fotoUrl: foto.besar, fotoKecilUrl: foto.kecil } : {}),
      diubahOleh: s.nim,
      diubahPada: new Date(),
    })
    .where(eq(profilFotoBersama.id, id));
  if (foto && foto.besar !== lama.fotoUrl)
    await hapusBlob([lama.fotoUrl, lama.fotoKecilUrl], "bersama");
  await writeAudit(s.nim, "profil_bersama", { id, tahun: body.tahun });
  res.status(200).json({ ok: true, id });
};

export const handleBersamaHapus: Post = async (req, res, s) => {
  const id = idValid(jsonBody(req).id);
  if (!id) return tolak(res, "format_salah");
  const [lama] = await getDb()
    .delete(profilFotoBersama)
    .where(eq(profilFotoBersama.id, id))
    .returning();
  if (!lama) return tolak(res, "tidak_ditemukan");
  await hapusBlob([lama.fotoUrl, lama.fotoKecilUrl], "bersama");
  await writeAudit(s.nim, "profil_bersama_hapus", { id, tahun: lama.tahun });
  res.status(200).json({ ok: true });
};

/** A photo id that belongs to another edition (acara-simpan). */
class FotoAsing extends Error {}

interface FotoMasuk extends Foto {
  id: number | null;
  alt: TeksTiga | null;
}

export const handleAcaraSimpan: Post = async (req, res, s) => {
  const body = jsonBody(req);
  const id = body.id === undefined || body.id === null ? null : idValid(body.id);
  if (body.id != null && !id) return tolak(res, "format_salah");
  if (!isJenisAcara(body.jenis)) return tolak(res, "format_salah");
  if (!tanggalValid(body.tanggal)) return tolak(res, "tanggal_salah");
  const teks = bacaSemuaTeks(res, body, ["judul", "tempat", "ringkasan"] as const);
  if (!teks) return;

  const masuk = Array.isArray(body.foto) ? body.foto : [];
  if (masuk.length > FOTO_PER_ACARA) return tolak(res, "foto_banyak", { maks: FOTO_PER_ACARA });
  const foto: FotoMasuk[] = [];
  for (const [i, f] of masuk.entries()) {
    const o = (f ?? {}) as Record<string, unknown>;
    const fid = o.id == null ? null : idValid(o.id);
    if (o.id != null && !fid) return tolak(res, "format_salah");
    if (!blobUrlValid(o.besar) || !blobUrlValid(o.kecil)) return tolak(res, "foto_salah");
    const alt = bacaTeksOpsional(o.alt, TEKS_MAKS.alt);
    if (!alt.ok)
      return tolak(res, alt.kode === "kurang" ? "teks_kurang" : "teks_panjang", {
        field: "alt",
        foto: i,
        ...(alt.kode === "kurang" ? { kurang: alt.kurang } : { bahasa: alt.bahasa }),
      });
    foto.push({ id: fid, besar: o.besar, kecil: o.kecil, alt: alt.teks });
  }
  // The cover: an index into the list as sent (new photos have no id yet).
  const sampulIdx = Number.isInteger(body.sampul) ? Number(body.sampul) : 0;

  const db = getDb();
  let hasil: { acaraId: number; buang: (typeof profilAcaraFoto.$inferSelect)[] } | null;
  try {
    hasil = await db.transaction(async (tx) => {
      let acaraId = id;
      const nilai = {
        jenis: body.jenis as Acara["jenis"],
        ...teks,
        tanggal: body.tanggal as string,
        diubahOleh: s.nim,
        diubahPada: new Date(),
      };
      if (acaraId) {
        const [ada] = await tx
          .update(profilAcara)
          .set(nilai)
          .where(eq(profilAcara.id, acaraId))
          .returning({ id: profilAcara.id });
        if (!ada) return null;
      } else {
        const [row] = await tx.insert(profilAcara).values(nilai).returning({ id: profilAcara.id });
        acaraId = row.id;
      }

      const lama = await tx
        .select()
        .from(profilAcaraFoto)
        .where(eq(profilAcaraFoto.acaraId, acaraId));
      const milik = new Set(lama.map((f) => f.id));
      // Thrown, not returned: the transaction must roll the edition back too.
      if (foto.some((f) => f.id && !milik.has(f.id))) throw new FotoAsing();
      const tetap = new Set(foto.flatMap((f) => (f.id ? [f.id] : [])));
      const buang = lama.filter((f) => !tetap.has(f.id));
      if (buang.length)
        await tx.delete(profilAcaraFoto).where(
          inArray(
            profilAcaraFoto.id,
            buang.map((f) => f.id),
          ),
        );

      const ids: number[] = [];
      for (const [urutan, f] of foto.entries()) {
        const isi = { fotoUrl: f.besar, fotoKecilUrl: f.kecil, alt: f.alt, urutan };
        if (f.id) {
          await tx.update(profilAcaraFoto).set(isi).where(eq(profilAcaraFoto.id, f.id));
          ids.push(f.id);
        } else {
          const [row] = await tx
            .insert(profilAcaraFoto)
            .values({ acaraId, ...isi })
            .returning({ id: profilAcaraFoto.id });
          ids.push(row.id);
        }
      }
      await tx
        .update(profilAcara)
        .set({ sampulId: ids[sampulIdx] ?? ids[0] ?? null })
        .where(eq(profilAcara.id, acaraId));
      // A photo whose address changed under the same id lost its old blobs too.
      const ganti = lama.filter((l) => foto.some((f) => f.id === l.id && f.besar !== l.fotoUrl));
      return { acaraId, buang: [...buang, ...ganti] };
    });
  } catch (err) {
    if (err instanceof FotoAsing) return tolak(res, "format_salah");
    throw err;
  }
  if (hasil === null) return tolak(res, "tidak_ditemukan");
  await hapusBlob(
    hasil.buang.flatMap((f) => [f.fotoUrl, f.fotoKecilUrl]),
    "acara",
  );
  await writeAudit(s.nim, "profil_acara", {
    id: hasil.acaraId,
    jenis: body.jenis,
    tanggal: body.tanggal,
    foto: foto.length,
    baru: !id,
  });
  res.status(200).json({ ok: true, id: hasil.acaraId });
};

export const handleAcaraHapus: Post = async (req, res, s) => {
  const id = idValid(jsonBody(req).id);
  if (!id) return tolak(res, "format_salah");
  const db = getDb();
  const foto = await db.select().from(profilAcaraFoto).where(eq(profilAcaraFoto.acaraId, id));
  const [lama] = await db.delete(profilAcara).where(eq(profilAcara.id, id)).returning();
  if (!lama) return tolak(res, "tidak_ditemukan");
  await hapusBlob(
    foto.flatMap((f) => [f.fotoUrl, f.fotoKecilUrl]),
    "acara",
  );
  await writeAudit(s.nim, "profil_acara_hapus", {
    id,
    jenis: lama.jenis,
    tanggal: lama.tanggal,
  });
  res.status(200).json({ ok: true });
};
