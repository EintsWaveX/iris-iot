/**
 * Bringing every TP file into IRIS (2026-10-21), once, before the LMS goes.
 * Until then a file handed in on the LMS, or an IRIS upload whose copy the
 * LMS held, had its bytes only there. Each minute's relay beat moves a few:
 *
 * - a file still in the LMS, or a row's own base64, is put in R2 (bytes
 *   checked by their SHA-256 on the relay); an LMS file gets a tp_unggah
 *   row of its own (asal "lms") and the entry points at it ("iris:<id>");
 * - the LMS's record of extensions becomes tp_perpanjang rows;
 * - a module whose window came from the LMS assignments' dates keeps
 *   those dates as its own.
 *
 * Progress is in pengaturan tp_pindah. Never throws.
 */
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import {
  pengaturan,
  tpKiriman,
  tpPerpanjang,
  tpUnggah,
  type BerkasTp,
} from "../../src/lib/schema.js";
import { kunciTp, sha256Hex } from "../../src/lib/tp-r2.js";
import { LmsGalat, ambilBerkas, bukaToken } from "./lms.js";
import { KUNCI_TP, bacaSet, jendelaUntuk, tulisSet, type SetTp } from "./tp.js";
import { awalanIris, type IsiTp } from "./tp-unggah.js";
import { simpan, simpanSiap } from "./tp-simpan.js";

type Db = ReturnType<typeof getDb>;

export const KUNCI_PINDAH = "tp_pindah";

/** Files per beat: well inside a minute through the relay. */
const PER_DETAK = 20;

export interface StatusPindah {
  selesai: number;
  sisa: number;
  gagal: { id: number; i: number; galat: string }[];
  perpanjang: boolean;
  jendela: boolean;
  pada: string;
}

async function bacaStatus(db: Db): Promise<StatusPindah> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_PINDAH))
    .limit(1);
  const v = (r?.nilai ?? {}) as Partial<StatusPindah>;
  return {
    selesai: v.selesai ?? 0,
    sisa: v.sisa ?? -1,
    gagal: v.gagal ?? [],
    perpanjang: v.perpanjang ?? false,
    jendela: v.jendela ?? false,
    pada: v.pada ?? "",
  };
}

/** An entry whose bytes are not in R2 yet. */
async function belumPindah(db: Db, b: BerkasTp): Promise<{ unggah: number | null } | null> {
  if (!b.url.startsWith(awalanIris)) return { unggah: null };
  const id = Number(b.url.slice(awalanIris.length));
  const [u] = await db
    .select({ kunci: tpUnggah.kunci })
    .from(tpUnggah)
    .where(eq(tpUnggah.id, id))
    .limit(1);
  return u && !u.kunci ? { unggah: id } : null;
}

async function bytesDari(db: Db, set: SetTp, b: BerkasTp, unggah: number | null) {
  let url = b.url;
  if (unggah !== null) {
    const [u] = await db
      .select({ isi: tpUnggah.isi, lmsUrl: tpUnggah.lmsUrl })
      .from(tpUnggah)
      .where(eq(tpUnggah.id, unggah))
      .limit(1);
    if (u?.isi) return new Uint8Array(Buffer.from(u.isi, "base64"));
    if (!u?.lmsUrl) throw new Error("no bytes and no LMS copy");
    url = u.lmsUrl;
  }
  const token = set.token ? bukaToken(set.token) : null;
  if (!token) throw new Error("LMS not connected");
  const r = await ambilBerkas(token, url);
  const jenis = r.headers.get("content-type") ?? "";
  if (!r.ok || /json|html/i.test(jenis)) throw new Error(`LMS answered ${r.status} ${jenis}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Moves one tp_kiriman row's files; true when all of them are in R2. */
async function pindahBaris(
  db: Db,
  set: SetTp,
  k: typeof tpKiriman.$inferSelect,
  st: StatusPindah,
): Promise<boolean> {
  const berkas = [...k.berkas];
  let ubah = false;
  let semua = true;
  for (let i = 0; i < berkas.length; i++) {
    const b = berkas[i];
    const perlu = await belumPindah(db, b);
    if (!perlu) continue;
    try {
      const isi = await bytesDari(db, set, b, perlu.unggah);
      const sha = await sha256Hex(isi);
      const mime = (b.mime || "application/octet-stream").split(";")[0].trim().toLowerCase();
      const kunci = kunciTp(k.semester, k.modul, k.nim, sha, mime);
      await simpan(kunci, isi, mime);
      if (perlu.unggah !== null) {
        await db
          .update(tpUnggah)
          .set({ kunci, mime, isi: null })
          .where(eq(tpUnggah.id, perlu.unggah));
      } else {
        const [row] = await db
          .insert(tpUnggah)
          .values({
            semester: k.semester,
            modul: k.modul,
            nim: k.nim,
            nama: b.nama,
            ukuran: isi.length,
            sha256: sha,
            kunci,
            mime,
            asal: "lms",
            lmsStatus: "tanpa_lms",
            dibuatPada: k.dikirimPada ?? new Date(),
          })
          .returning({ id: tpUnggah.id });
        berkas[i] = { ...b, ukuran: isi.length, url: `${awalanIris}${row.id}` };
        ubah = true;
      }
      st.selesai++;
    } catch (e) {
      semua = false;
      const galat = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      st.gagal = [...st.gagal.filter((g) => !(g.id === k.id && g.i === i)), { id: k.id, i, galat }];
    }
  }
  if (ubah) {
    const pertama = Number(berkas[0]?.url.slice(awalanIris.length)) || null;
    // "iris" from here on: the LMS sync (until it goes) no longer replaces
    // or takes back a file IRIS now holds itself.
    await db
      .update(tpKiriman)
      .set({ berkas, sumber: "iris", unggahId: pertama, sinkronPada: new Date() })
      .where(eq(tpKiriman.id, k.id));
  }
  if (semua) st.gagal = st.gagal.filter((g) => g.id !== k.id);
  return semua;
}

/** The LMS's extensions as IRIS's own. */
async function pindahPerpanjang(db: Db, set: SetTp) {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, "lms_perpanjang"))
    .limit(1);
  const v = r?.nilai as
    | {
        semester?: string;
        isi?: { tugas: number; nim: string; sampai: string; alasan?: string; oleh?: string }[];
      }
    | undefined;
  if (!v || v.semester !== set.semester) return;
  const modulOf = new Map<number, number>();
  for (const k of set.kelas?.kursus ?? [])
    for (const [m, t] of Object.entries(k.tugas)) if (t) modulOf.set(t.id, Number(m));
  for (const p of v.isi ?? []) {
    const m = modulOf.get(p.tugas);
    if (!m || !p.nim || Number.isNaN(Date.parse(p.sampai))) continue;
    await db
      .insert(tpPerpanjang)
      .values({
        semester: set.semester,
        modul: m,
        nim: p.nim,
        sampai: new Date(p.sampai),
        alasan: p.alasan || null,
        oleh: p.oleh || "lms",
      })
      .onConflictDoNothing();
  }
}

/** Windows that followed the LMS dates become IRIS's own. */
async function pindahJendela(db: Db, set: SetTp) {
  const modul = { ...set.jendela.modul };
  let ubah = false;
  for (const m of [1, 2, 3, 4]) {
    const j = jendelaUntuk(set, m);
    if (j?.sumber !== "lms") continue;
    modul[String(m)] = { buka: j.buka, tutup: j.tutup };
    ubah = true;
  }
  if (ubah) await tulisSet(db, KUNCI_TP.jendela, { ...set.jendela, modul }, "pindah");
}

/** Until the move is done, a file not in R2 yet still streams from the LMS. */
export function lmsCadangan(set: SetTp) {
  return async (url: string, range?: string): Promise<IsiTp> => {
    const token = set.token ? bukaToken(set.token) : null;
    if (!token) return { ok: false, kode: "lms_terputus", status: 503 };
    let r: Response;
    try {
      r = await ambilBerkas(token, url, range);
    } catch (e) {
      return {
        ok: false,
        kode: e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau",
        status: 502,
      };
    }
    const jenis = r.headers.get("content-type") ?? "";
    if (!r.ok || !r.body || /json|html/i.test(jenis))
      return { ok: false, kode: r.status === 404 ? "berkas_hilang" : "lms_menolak", status: 502 };
    return { ok: true, jenis: "lms", res: r };
  };
}

/** One beat's share of the move. */
export async function pindahBilaPerlu(db: Db): Promise<void> {
  try {
    if (!simpanSiap()) return;
    const st = await bacaStatus(db);
    const set = await bacaSet(db);
    if (!st.jendela) {
      await pindahJendela(db, set);
      st.jendela = true;
    }
    if (!st.perpanjang) {
      await pindahPerpanjang(db, set);
      st.perpanjang = true;
    }
    // Rows with an entry not on R2: an LMS address, or an upload without a key.
    const ids = (
      await db.execute<{ id: number }>(sql`
        select k.id from ${tpKiriman} k
        where exists (
          select 1 from jsonb_array_elements(k.berkas) e
          where case when e->>'url' like 'iris:%'
            then not exists (
              select 1 from ${tpUnggah} u
              where u.id::text = substring(e->>'url' from 6) and u.kunci is not null
            )
            else true end
        )`)
    ).rows.map((r) => Number(r.id));
    const tunggu = ids.length
      ? await db.select().from(tpKiriman).where(inArray(tpKiriman.id, ids))
      : [];
    // The ones that failed before go last, so one bad file can't stall the rest.
    const gagalId = new Set(st.gagal.map((g) => g.id));
    tunggu.sort((a, b) => Number(gagalId.has(a.id)) - Number(gagalId.has(b.id)));
    let sisa = tunggu.length;
    let n = 0;
    for (const k of tunggu) {
      if (n >= PER_DETAK) break;
      n += k.berkas.length;
      if (await pindahBaris(db, set, k, st)) sisa--;
    }
    // Uploads whose row no longer points at them still hold base64.
    const lepas = await db
      .select({ id: tpUnggah.id })
      .from(tpUnggah)
      .where(and(isNull(tpUnggah.kunci), isNotNull(tpUnggah.isi)))
      .limit(PER_DETAK);
    for (const u of lepas) {
      const [x] = await db.select().from(tpUnggah).where(eq(tpUnggah.id, u.id)).limit(1);
      if (!x?.isi) continue;
      try {
        const isi = new Uint8Array(Buffer.from(x.isi, "base64"));
        const kunci = kunciTp(x.semester, x.modul, x.nim, await sha256Hex(isi), x.mime);
        await simpan(kunci, isi, x.mime);
        await db.update(tpUnggah).set({ kunci, isi: null }).where(eq(tpUnggah.id, x.id));
      } catch (e) {
        console.error("[tp pindah] an old upload was not moved:", e);
      }
    }
    st.sisa = sisa + (lepas.length === PER_DETAK ? 1 : 0);
    st.pada = new Date().toISOString();
    await tulisSet(db, KUNCI_PINDAH, st, null);
  } catch (e) {
    console.error("[tp pindah] failed:", e);
  }
}
