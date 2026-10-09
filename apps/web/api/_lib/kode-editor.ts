/**
 * The ASO code editor's server side (2026-10-05), behind /api/modul/:aksi
 * (one function, the Hobby plan's ceiling). Every action needs the `kode`
 * right: the ASO division and Admins (src/lib/hak.ts).
 *
 * GET  kode-edit?modul=        published version, the shared draft, history,
 *                              whether a session of the module is running.
 *                              The first visit stores version 1 (the bundle).
 * POST kode-simpan  { modul, berkas, dasar }   save the shared draft.
 * POST kode-terbit  { modul, catatan, dasar }  publish the draft (refused while
 *                              a session of the module runs, or with problems).
 * POST kode-buang   { modul }                  drop the draft.
 * POST kode-pulihkan { modul, id, dasar }      an older version becomes the draft.
 *
 * `dasar` is the draft's diubahPada the editor started from (null: none):
 * a draft someone else saved since answers draf_berubah, never overwrites.
 */
import { and, desc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, pgErrorCode } from "./http.js";
import { cekHak } from "./hak.js";
import { BERKAS_MODUL, kodeV1, lengkapiDariV1, lupakanKode } from "./kode-aktif.js";
import { getDb } from "../../src/lib/db.js";
import { asisten, kodeVersi } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { writeAudit } from "../../src/lib/auth.js";
import { personalize } from "../../src/lib/group-identity.js";
import {
  BAHASA_KODE,
  buatTemplat,
  MAKS_JAWABAN,
  MAKS_SUMBER,
  periksaBerkas,
  type Celah,
  type KodeBerkas,
  type Masalah,
  type Rentang,
  type TeksKode,
} from "../../src/lib/kode-jurnal.js";
import type { SessionPayload } from "../../src/lib/auth.js";

const MAKS_CELAH = 40;
const MAKS_TEKS = 400;

function modulDari(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
}

function teks(v: unknown, maks: number): string | null {
  return typeof v === "string" && v.length <= maks ? v : null;
}

function rentang(v: unknown, panjang: number): Rentang | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== "object") return undefined;
  const { awal, akhir } = v as Record<string, unknown>;
  if (!Number.isInteger(awal) || !Number.isInteger(akhir)) return undefined;
  const a = awal as number;
  const b = akhir as number;
  return a >= 0 && b > a && b <= panjang ? { awal: a, akhir: b } : undefined;
}

function duaBahasa(v: unknown, maks: number): Record<"id" | "en", string> | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = teks(o.id ?? "", maks);
  const en = teks(o.en ?? "", maks);
  return id === null || en === null ? null : { id, en };
}

/** Help text: id and en, plus the Mandarin a version carries over. */
function teksBantu(v: unknown, maks: number): TeksKode | null {
  const dua = duaBahasa(v, maks);
  if (!dua) return null;
  const zh = teks((v as Record<string, unknown>).zh ?? "", maks);
  if (zh === null) return null;
  return zh ? { ...dua, zh } : dua;
}

/** The editor's files, checked for shape only (publishing checks content). */
export function bacaBerkas(modul: number, v: unknown): KodeBerkas[] | null {
  const paths = BERKAS_MODUL[modul] ?? [];
  if (!Array.isArray(v) || v.length !== paths.length) return null;
  const out: KodeBerkas[] = [];
  for (const [i, raw] of v.entries()) {
    if (!raw || typeof raw !== "object") return null;
    const b = raw as Record<string, unknown>;
    if (b.path !== paths[i]) return null;
    const sumber = duaBahasa(b.sumber, MAKS_SUMBER);
    if (!sumber || !Array.isArray(b.celah) || b.celah.length > MAKS_CELAH) return null;
    const celah: Celah[] = [];
    for (const cr of b.celah) {
      if (!cr || typeof cr !== "object") return null;
      const c = cr as Record<string, unknown>;
      const p = (c.posisi ?? {}) as Record<string, unknown>;
      const id = teks(c.id, 40);
      const jawaban = teks(c.jawaban, MAKS_JAWABAN);
      const pid = rentang(p.id ?? null, sumber.id.length);
      const pen = rentang(p.en ?? null, sumber.en.length);
      const petunjuk = duaBahasa(c.petunjuk, MAKS_TEKS);
      const kenapa = teksBantu(c.kenapa, MAKS_TEKS);
      const bantuan =
        c.bantuan === undefined ? { id: "", en: "" } : teksBantu(c.bantuan, MAKS_TEKS);
      const juga = Array.isArray(c.juga) ? c.juga : null;
      const perKelompok =
        c.perKelompok === null || c.perKelompok === undefined
          ? null
          : teks(c.perKelompok, MAKS_JAWABAN);
      if (
        !id ||
        jawaban === null ||
        !Number.isInteger(c.nomor) ||
        pid === undefined ||
        pen === undefined ||
        !petunjuk ||
        !kenapa ||
        !bantuan ||
        !juga ||
        juga.length > 10 ||
        !juga.every((j) => teks(j, MAKS_JAWABAN) !== null) ||
        (c.perKelompok != null && perKelompok === null)
      )
        return null;
      celah.push({
        id,
        nomor: c.nomor as number,
        posisi: { id: pid, en: pen },
        jawaban,
        juga: juga as string[],
        perKelompok,
        petunjuk,
        kenapa,
        bantuan,
      });
    }
    out.push({ slug: paths[i].replace(/\.(ino|py)$/, ""), path: paths[i], sumber, celah });
  }
  return out;
}

/** Content problems plus the group identity line every download rewrites. */
export function masalahVersi(berkas: KodeBerkas[]): (Masalah & { berkas: string })[] {
  const out: (Masalah & { berkas: string })[] = [];
  for (const b of berkas) {
    for (const m of periksaBerkas(b)) out.push({ ...m, berkas: b.slug });
    for (const bahasa of BAHASA_KODE) {
      try {
        for (const n of [1, 2, 5]) {
          personalize(b.slug, b.sumber[bahasa], n);
          personalize(b.slug, buatTemplat(b, bahasa), n);
        }
      } catch {
        out.push({ kode: "identitas", berat: true, bahasa, berkas: b.slug });
      }
    }
  }
  return out;
}

async function bolehKode(res: ApiResponse, session: SessionPayload) {
  return cekHak(res, session.nim, "kode");
}

/** Stores version 1 for a module that has no version yet. */
async function pastikanV1(modul: number, nim: string) {
  const db = getDb();
  const [ada] = await db
    .select({ id: kodeVersi.id })
    .from(kodeVersi)
    .where(eq(kodeVersi.modul, modul))
    .limit(1);
  if (ada) return;
  try {
    await db.insert(kodeVersi).values({
      modul,
      nomor: 1,
      status: "terbit",
      berkas: kodeV1(modul),
      catatan: "Diimpor dari berkas repo",
      dibuatOleh: nim,
      diubahOleh: nim,
      terbitOleh: nim,
      terbitPada: new Date(),
    });
  } catch (err) {
    // Two editors opened it at once; the other insert won.
    if (pgErrorCode(err) !== "23505") throw err;
  }
  lupakanKode(modul);
}

async function namaPer(nims: string[]): Promise<Map<string, string>> {
  const u = [...new Set(nims.filter(Boolean))];
  if (!u.length) return new Map();
  const rows = await getDb()
    .select({ nim: asisten.nim, nama: asisten.nama, kode: asisten.kode })
    .from(asisten)
    .where(inArray(asisten.nim, u));
  return new Map(rows.map((r) => [r.nim, r.kode ? `${r.nama} (${r.kode.toUpperCase()})` : r.nama]));
}

async function sesiModulBerjalan(modul: number): Promise<boolean> {
  const s = await currentSesi();
  return !!s && s.modul === modul;
}

export async function handleKodeEdit(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  if (!(await bolehKode(res, session))) return;
  const modul = modulDari(req.query.modul);
  if (!modul) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  await pastikanV1(modul, session.nim);
  const db = getDb();
  const rows = await db
    .select()
    .from(kodeVersi)
    .where(eq(kodeVersi.modul, modul))
    .orderBy(desc(kodeVersi.nomor));
  const nama = await namaPer(rows.flatMap((r) => [r.diubahOleh, r.terbitOleh ?? ""]));
  const terbit = rows.find((r) => r.status === "terbit") ?? null;
  const draf = rows.find((r) => r.status === "draf") ?? null;
  const lengkap = (b: KodeBerkas) => lengkapiDariV1(modul, b);
  const ringkas = (r: (typeof rows)[number]) => ({
    id: r.id,
    nomor: r.nomor,
    status: r.status,
    catatan: r.catatan,
    diubahOleh: nama.get(r.diubahOleh) ?? r.diubahOleh,
    diubahPada: r.diubahPada.toISOString(),
    terbitOleh: r.terbitOleh ? (nama.get(r.terbitOleh) ?? r.terbitOleh) : null,
    terbitPada: r.terbitPada?.toISOString() ?? null,
  });
  res.status(200).json({
    ok: true,
    modul,
    // Versions saved before hints existed show version 1's hints, as served.
    terbit: terbit ? { ...ringkas(terbit), berkas: terbit.berkas.map(lengkap) } : null,
    draf: draf ? { ...ringkas(draf), berkas: draf.berkas.map(lengkap) } : null,
    riwayat: rows.filter((r) => r.status !== "draf").map(ringkas),
    terkunci: await sesiModulBerjalan(modul),
  });
}

async function drafSekarang(modul: number) {
  const [row] = await getDb()
    .select({ id: kodeVersi.id, diubahPada: kodeVersi.diubahPada, oleh: kodeVersi.diubahOleh })
    .from(kodeVersi)
    .where(and(eq(kodeVersi.modul, modul), eq(kodeVersi.status, "draf")))
    .limit(1);
  return row ?? null;
}

/** False (and answers draf_berubah) when the draft moved since `dasar`. */
async function cocokDasar(
  res: ApiResponse,
  draf: Awaited<ReturnType<typeof drafSekarang>>,
  dasar: unknown,
): Promise<boolean> {
  const sama = draf ? dasar === draf.diubahPada.toISOString() : dasar === null;
  if (sama) return true;
  const nama = draf ? (await namaPer([draf.oleh])).get(draf.oleh) : null;
  res.status(200).json({ ok: false, kode: "draf_berubah", oleh: nama ?? null });
  return false;
}

export async function handleKodeSimpan(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  if (!(await bolehKode(res, session))) return;
  const body = jsonBody(req);
  const modul = modulDari(body.modul);
  const berkas = modul ? bacaBerkas(modul, body.berkas) : null;
  if (!modul || !berkas) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const draf = await drafSekarang(modul);
  if (!(await cocokDasar(res, draf, body.dasar ?? null))) return;
  const db = getDb();
  const now = new Date();
  try {
    if (draf) {
      await db
        .update(kodeVersi)
        .set({ berkas, diubahOleh: session.nim, diubahPada: now })
        .where(eq(kodeVersi.id, draf.id));
    } else {
      await db.insert(kodeVersi).values({
        modul,
        status: "draf",
        berkas,
        dibuatOleh: session.nim,
        diubahOleh: session.nim,
        diubahPada: now,
      });
    }
  } catch (err) {
    if (pgErrorCode(err) === "23505") {
      res.status(200).json({ ok: false, kode: "draf_berubah", oleh: null });
      return;
    }
    throw err;
  }
  res.status(200).json({ ok: true, diubahPada: now.toISOString(), masalah: masalahVersi(berkas) });
}

export async function handleKodeTerbit(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  if (!(await bolehKode(res, session))) return;
  const body = jsonBody(req);
  const modul = modulDari(body.modul);
  const catatan = teks(body.catatan ?? "", MAKS_TEKS);
  if (!modul || catatan === null) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (await sesiModulBerjalan(modul)) {
    res.status(200).json({ ok: false, kode: "sesi_berjalan" });
    return;
  }
  const draf = await drafSekarang(modul);
  if (!draf) {
    res.status(200).json({ ok: false, kode: "tanpa_draf" });
    return;
  }
  if (!(await cocokDasar(res, draf, body.dasar ?? null))) return;
  const db = getDb();
  const [row] = await db
    .select({ berkas: kodeVersi.berkas })
    .from(kodeVersi)
    .where(eq(kodeVersi.id, draf.id));
  const masalah = masalahVersi(row.berkas).filter((m) => m.berat);
  if (masalah.length) {
    res.status(200).json({ ok: false, kode: "masalah", masalah });
    return;
  }
  const [{ n }] = await db
    .select({ n: max(kodeVersi.nomor) })
    .from(kodeVersi)
    .where(and(eq(kodeVersi.modul, modul), isNotNull(kodeVersi.nomor)));
  const nomor = (n ?? 0) + 1;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(kodeVersi)
      .set({ status: "arsip" })
      .where(and(eq(kodeVersi.modul, modul), eq(kodeVersi.status, "terbit")));
    await tx
      .update(kodeVersi)
      .set({
        status: "terbit",
        nomor,
        catatan: catatan.trim() || null,
        terbitOleh: session.nim,
        terbitPada: now,
      })
      .where(eq(kodeVersi.id, draf.id));
  });
  lupakanKode(modul);
  await writeAudit(session.nim, "kode_terbit", { modul, nomor });
  res.status(200).json({ ok: true, nomor });
}

export async function handleKodeBuang(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  if (!(await bolehKode(res, session))) return;
  const modul = modulDari(jsonBody(req).modul);
  if (!modul) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  await getDb()
    .delete(kodeVersi)
    .where(and(eq(kodeVersi.modul, modul), eq(kodeVersi.status, "draf")));
  res.status(200).json({ ok: true });
}

export async function handleKodePulihkan(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  if (!(await bolehKode(res, session))) return;
  const body = jsonBody(req);
  const modul = modulDari(body.modul);
  const id = Number(body.id);
  if (!modul || !Number.isInteger(id)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const db = getDb();
  const [asal] = await db
    .select({ berkas: kodeVersi.berkas, nomor: kodeVersi.nomor })
    .from(kodeVersi)
    .where(
      and(eq(kodeVersi.id, id), eq(kodeVersi.modul, modul), sql`${kodeVersi.status} <> 'draf'`),
    );
  if (!asal) {
    res.status(200).json({ ok: false, kode: "tidak_ditemukan" });
    return;
  }
  const draf = await drafSekarang(modul);
  if (!(await cocokDasar(res, draf, body.dasar ?? null))) return;
  const now = new Date();
  if (draf) {
    await db
      .update(kodeVersi)
      .set({ berkas: asal.berkas, diubahOleh: session.nim, diubahPada: now })
      .where(eq(kodeVersi.id, draf.id));
  } else {
    await db.insert(kodeVersi).values({
      modul,
      status: "draf",
      berkas: asal.berkas,
      dibuatOleh: session.nim,
      diubahOleh: session.nim,
      diubahPada: now,
    });
  }
  res.status(200).json({ ok: true, diubahPada: now.toISOString() });
}
