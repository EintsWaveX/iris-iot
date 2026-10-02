/**
 * The Tim page's data and actions (Phase 9 Stage 2), served from
 * /api/session/tim so the function count stays under Vercel's cap.
 *
 * GET  every Asisten with position, tier, badges, status and SeeLabs
 *      account; the ten head-role holders; handovers; slots this week.
 *      Every Asisten can read it.
 * POST { aksi }:
 *   tambah       add an Asisten (needs the Tim right)
 *   ubah         change division, position, status, SeeLabs account or
 *                rights (Tim right; anyone may set their own SeeLabs)
 *   serah_minta  ask to move a head role to someone (Tim right or holder)
 *   serah_putus  accept or decline a handover (the holder or Tim right)
 *   serah_batal  withdraw a handover (whoever asked, or Tim right)
 *
 * A head role has one holder. Taking a role someone holds is never a plain
 * save: it becomes a handover request, and the holder keeps the role until
 * it is accepted. Accepting closes the old holding and opens the new one in
 * one transaction, and recomputes both tiers.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatOrang, petaHak } from "./hak.js";
import { getDb } from "../../src/lib/db.js";
import { asisten, audit, jabatanPemegang, jadwal, serahTerima } from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import {
  HAK,
  STATUS_ORANG,
  boleh,
  divisiKepala,
  isDivisi,
  isKategori,
  isPencipta,
  tierUntuk,
  type Kategori,
} from "../../src/lib/hak.js";
import { hariIniWib } from "../../src/lib/jadwal.js";
import { semesterDariTanggal } from "../../src/lib/jadwal-parser.js";

const NIM_RE = /^\d{8,15}$/;
const KODE_RE = /^[A-Z]{3}$/;

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function tolak(res: ApiResponse, kode: string, extra: Record<string, unknown> = {}) {
  res.status(200).json({ ok: false, kode, ...extra });
}

/* ------------------------------------------------------------------ GET */

export async function handleTimGet(_req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const db = getDb();
  const [orang, pemegang, serah, saya, slots] = await Promise.all([
    db
      .select({
        nim: asisten.nim,
        nama: asisten.nama,
        kode: asisten.kode,
        divisi: asisten.divisi,
        tier: asisten.tier,
        badges: asisten.badges,
        status: asisten.status,
        seelabsAkun: asisten.seelabsAkun,
        hakOverride: asisten.hakOverride,
      })
      .from(asisten)
      .orderBy(asc(asisten.kode)),
    db
      .select({
        kategori: jabatanPemegang.kategori,
        nim: jabatanPemegang.nim,
        mulai: jabatanPemegang.mulai,
      })
      .from(jabatanPemegang)
      .where(isNull(jabatanPemegang.selesai)),
    db.select().from(serahTerima).orderBy(desc(serahTerima.dibuatPada)).limit(20),
    muatOrang(session.nim),
    db
      .select({ asisten: jadwal.asisten, status: jadwal.status })
      .from(jadwal)
      .where(eq(jadwal.semester, semesterDariTanggal(hariIniWib()))),
  ]);

  // Slots a week per code, from the weekly schedule.
  const slotMinggu: Record<string, number> = {};
  for (const j of slots) {
    if (j.status !== "aktif") continue;
    for (const k of new Set(j.asisten.map((x) => x.toUpperCase()))) {
      slotMinggu[k] = (slotMinggu[k] ?? 0) + 1;
    }
  }

  res.status(200).json({
    ok: true,
    orang: orang.map((o) => ({ ...o, hak: petaHak(o) })),
    pemegang,
    serahTerima: serah,
    slotMinggu,
    saya: saya ? { nim: saya.nim, hak: petaHak(saya) } : null,
  });
}

/** The audit trail of one person (Tim edits about them). */
export async function handleTimJejak(req: ApiRequest, res: ApiResponse) {
  const nim = typeof req.query.nim === "string" ? req.query.nim : "";
  if (!NIM_RE.test(nim)) return tolak(res, "format_salah");
  const rows = await getDb()
    .select()
    .from(audit)
    .where(inArray(audit.aksi, ["tim_tambah", "tim_ubah", "tim_serah_terima"]))
    .orderBy(desc(audit.pada))
    .limit(300);
  const mine = rows.filter((r) => {
    try {
      const d = JSON.parse(r.detail ?? "{}") as { nim?: string; ke?: string; dari?: string };
      return d.nim === nim || d.ke === nim || d.dari === nim;
    } catch {
      return false;
    }
  });
  res.status(200).json({ ok: true, jejak: mine.slice(0, 30) });
}

/* ----------------------------------------------------------------- POST */

export async function handleTimPost(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const aksi = body.aksi;
  const saya = await muatOrang(session.nim);
  if (!saya) return tolak(res, "tanpa_hak");
  const admin = boleh(saya, "tim");

  if (aksi === "tambah") {
    if (!admin) return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "tim" });
    return tambah(res, body, session.nim);
  }
  if (aksi === "ubah") return ubah(res, body, session.nim, admin);
  if (aksi === "serah_minta") return serahMinta(res, body, session.nim, admin);
  if (aksi === "serah_putus") return serahPutus(res, body, session.nim, admin);
  if (aksi === "serah_batal") return serahBatal(res, body, session.nim, admin);
  tolak(res, "format_salah");
}

async function pemegangDari(db: Db | Tx, kategori: Kategori) {
  const [row] = await db
    .select()
    .from(jabatanPemegang)
    .where(and(eq(jabatanPemegang.kategori, kategori), isNull(jabatanPemegang.selesai)))
    .limit(1);
  return row ?? null;
}

/** Gives `nim` the head role (or none), closing what they held, and sets the
 *  tier and division that follow. The role must be free (checked by the
 *  caller inside the same transaction). */
async function pasangJabatan(tx: Tx, nim: string, kategori: Kategori | null, oleh: string) {
  const sekarang = new Date();
  await tx
    .update(jabatanPemegang)
    .set({ selesai: sekarang })
    .where(and(eq(jabatanPemegang.nim, nim), isNull(jabatanPemegang.selesai)));
  if (kategori) {
    await tx
      .insert(jabatanPemegang)
      .values({ kategori, nim, mulai: sekarang, diberikanOleh: oleh });
  }
  const div = kategori ? divisiKepala(kategori) : null;
  await tx
    .update(asisten)
    .set({ tier: tierUntuk(kategori), ...(div ? { divisi: div } : {}) })
    .where(eq(asisten.nim, nim));
}

async function tambah(res: ApiResponse, body: Record<string, unknown>, oleh: string) {
  const nim = typeof body.nim === "string" ? body.nim.trim() : "";
  const nama = typeof body.nama === "string" ? body.nama.trim().replace(/\s+/g, " ") : "";
  const kode = typeof body.kode === "string" ? body.kode.trim().toUpperCase() : "";
  const divisi = body.divisi === null || body.divisi === "" ? null : body.divisi;
  const jabatan = body.jabatan === "anggota" || body.jabatan == null ? null : body.jabatan;
  const seelabs = typeof body.seelabs === "string" ? body.seelabs.trim().slice(0, 80) : "";
  const mintaSerah = body.mintaSerah === true;

  if (!NIM_RE.test(nim) || nama.length < 3 || nama.length > 120 || !KODE_RE.test(kode)) {
    return tolak(res, "format_salah");
  }
  if (divisi !== null && !isDivisi(divisi)) return tolak(res, "format_salah");
  if (jabatan !== null && !isKategori(jabatan)) return tolak(res, "format_salah");

  const db = getDb();
  const hasil = await db.transaction(async (tx) => {
    const [ada] = await tx
      .select({ nim: asisten.nim, kode: asisten.kode })
      .from(asisten)
      .where(eq(asisten.kode, kode))
      .limit(1);
    if (ada) return { ok: false as const, kode: "kode_dipakai" };
    const [adaNim] = await tx
      .select({ nim: asisten.nim })
      .from(asisten)
      .where(eq(asisten.nim, nim))
      .limit(1);
    if (adaNim) return { ok: false as const, kode: "nim_dipakai" };

    const holder = jabatan ? await pemegangDari(tx, jabatan) : null;
    if (holder && !mintaSerah)
      return { ok: false as const, kode: "jabatan_dipegang", pemegang: holder.nim };

    const div = jabatan ? (divisiKepala(jabatan) ?? divisi) : divisi;
    await tx.insert(asisten).values({
      nim,
      nama,
      kode,
      divisi: div,
      divisiId: div ? `Anggota Divisi ${div}` : "Inti",
      divisiEn: div ? `Member of ${div} Division` : "Core",
      badges: div === "ASO" || div === "ARM" ? ["dev"] : [],
      seelabsAkun: seelabs || null,
    });
    if (jabatan && !holder) await pasangJabatan(tx, nim, jabatan, oleh);
    if (jabatan && holder) {
      await tx
        .insert(serahTerima)
        .values({ kategori: jabatan, dariNim: holder.nim, keNim: nim, dimintaOleh: oleh });
    }
    return { ok: true as const };
  });
  if (!hasil.ok) return res.status(200).json(hasil);
  await writeAudit(oleh, "tim_tambah", { nim, kode, jabatan, mintaSerah });
  res.status(200).json({ ok: true });
}

async function ubah(res: ApiResponse, body: Record<string, unknown>, oleh: string, admin: boolean) {
  const nim = typeof body.nim === "string" ? body.nim : "";
  if (!NIM_RE.test(nim)) return tolak(res, "format_salah");
  const target = await muatOrang(nim);
  if (!target) return tolak(res, "tidak_ditemukan");

  const sendiri = nim === oleh;
  const mau = Object.keys(body).filter((k) => !["aksi", "nim"].includes(k));
  // Without the Tim right, a person may only set their own SeeLabs account.
  if (!admin && !(sendiri && mau.every((k) => k === "seelabs"))) {
    return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "tim" });
  }

  const set: Partial<typeof asisten.$inferInsert> = {};
  if ("seelabs" in body) {
    const v = typeof body.seelabs === "string" ? body.seelabs.trim().slice(0, 80) : "";
    set.seelabsAkun = v || null;
  }
  if ("status" in body) {
    if (!(STATUS_ORANG as readonly unknown[]).includes(body.status))
      return tolak(res, "format_salah");
    set.status = body.status as (typeof STATUS_ORANG)[number];
  }
  if ("divisi" in body) {
    if (body.divisi !== null && !isDivisi(body.divisi)) return tolak(res, "format_salah");
    set.divisi = body.divisi as string | null;
  }
  if ("hakOverride" in body) {
    const raw = body.hakOverride;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
      return tolak(res, "format_salah");
    const bersih: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw)) {
      if ((HAK as readonly string[]).includes(k) && typeof v === "boolean") bersih[k] = v;
    }
    // The Pencipta holds every right; overrides on them mean nothing.
    if (!isPencipta(target)) set.hakOverride = bersih;
  }

  let jabatan: Kategori | null | undefined;
  if ("jabatan" in body) {
    if (body.jabatan === "anggota" || body.jabatan === null) jabatan = null;
    else if (isKategori(body.jabatan)) jabatan = body.jabatan;
    else return tolak(res, "format_salah");
  }

  const db = getDb();
  const hasil = await db.transaction(async (tx) => {
    if (jabatan !== undefined) {
      const sekarang = await tx
        .select({ kategori: jabatanPemegang.kategori })
        .from(jabatanPemegang)
        .where(and(eq(jabatanPemegang.nim, nim), isNull(jabatanPemegang.selesai)))
        .limit(1);
      const punya = (sekarang[0]?.kategori as Kategori | undefined) ?? null;
      if (punya !== jabatan) {
        if (jabatan) {
          const holder = await pemegangDari(tx, jabatan);
          if (holder && holder.nim !== nim) {
            return { ok: false as const, kode: "jabatan_dipegang", pemegang: holder.nim };
          }
        }
        await pasangJabatan(tx, nim, jabatan, oleh);
      }
    }
    if (Object.keys(set).length) await tx.update(asisten).set(set).where(eq(asisten.nim, nim));
    return { ok: true as const };
  });
  if (!hasil.ok) return res.status(200).json(hasil);
  await writeAudit(oleh, "tim_ubah", {
    nim,
    ...set,
    ...(jabatan !== undefined ? { jabatan: jabatan ?? "anggota" } : {}),
  });
  res.status(200).json({ ok: true });
}

async function serahMinta(
  res: ApiResponse,
  body: Record<string, unknown>,
  oleh: string,
  admin: boolean,
) {
  const kategori = body.kategori;
  const keNim = typeof body.keNim === "string" ? body.keNim : "";
  if (!isKategori(kategori) || !NIM_RE.test(keNim)) return tolak(res, "format_salah");
  const db = getDb();
  const holder = await pemegangDari(db, kategori);
  if (!holder) return tolak(res, "jabatan_kosong");
  if (holder.nim === keNim) return tolak(res, "sudah_memegang");
  if (!admin && holder.nim !== oleh)
    return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "tim" });
  if (!(await muatOrang(keNim))) return tolak(res, "tidak_ditemukan");
  try {
    await db
      .insert(serahTerima)
      .values({ kategori, dariNim: holder.nim, keNim, dimintaOleh: oleh });
  } catch {
    return tolak(res, "sudah_ada_permintaan");
  }
  await writeAudit(oleh, "tim_serah_terima", {
    kategori,
    dari: holder.nim,
    ke: keNim,
    status: "menunggu",
  });
  res.status(200).json({ ok: true });
}

async function serahPutus(
  res: ApiResponse,
  body: Record<string, unknown>,
  oleh: string,
  admin: boolean,
) {
  const id = Number(body.id);
  const terima = body.terima === true;
  if (!Number.isInteger(id) || id <= 0) return tolak(res, "format_salah");
  const db = getDb();
  const hasil = await db.transaction(async (tx) => {
    const [st] = await tx.select().from(serahTerima).where(eq(serahTerima.id, id)).limit(1);
    if (!st || st.status !== "menunggu") return { ok: false as const, kode: "tidak_menunggu" };
    if (!admin && st.dariNim !== oleh) return { ok: false as const, kode: "tanpa_hak" };
    const kategori = st.kategori as Kategori;
    const holder = await pemegangDari(tx, kategori);
    const sekarang = new Date();
    // The role moved some other way meanwhile: this request is moot.
    if (!holder || holder.nim !== st.dariNim) {
      await tx
        .update(serahTerima)
        .set({ status: "dibatalkan", diputusOleh: oleh, diputusPada: sekarang })
        .where(eq(serahTerima.id, id));
      return { ok: false as const, kode: "sudah_berubah" };
    }
    if (terima) {
      // The old holder becomes a member of their division; the new holder
      // leaves any head role they had and takes this one.
      await pasangJabatan(tx, st.dariNim, null, oleh);
      await pasangJabatan(tx, st.keNim, kategori, oleh);
    }
    await tx
      .update(serahTerima)
      .set({ status: terima ? "diterima" : "ditolak", diputusOleh: oleh, diputusPada: sekarang })
      .where(eq(serahTerima.id, id));
    return { ok: true as const, st };
  });
  if (!hasil.ok) return res.status(200).json(hasil);
  await writeAudit(oleh, "tim_serah_terima", {
    kategori: hasil.st.kategori,
    dari: hasil.st.dariNim,
    ke: hasil.st.keNim,
    status: terima ? "diterima" : "ditolak",
  });
  res.status(200).json({ ok: true });
}

async function serahBatal(
  res: ApiResponse,
  body: Record<string, unknown>,
  oleh: string,
  admin: boolean,
) {
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return tolak(res, "format_salah");
  const db = getDb();
  const [st] = await db.select().from(serahTerima).where(eq(serahTerima.id, id)).limit(1);
  if (!st || st.status !== "menunggu") return tolak(res, "tidak_menunggu");
  if (!admin && st.dimintaOleh !== oleh)
    return res.status(403).json({ ok: false, kode: "tanpa_hak", hak: "tim" });
  await db
    .update(serahTerima)
    .set({ status: "dibatalkan", diputusOleh: oleh, diputusPada: new Date() })
    .where(eq(serahTerima.id, id));
  await writeAudit(oleh, "tim_serah_terima", {
    kategori: st.kategori,
    dari: st.dariNim,
    ke: st.keNim,
    status: "dibatalkan",
  });
  res.status(200).json({ ok: true });
}
