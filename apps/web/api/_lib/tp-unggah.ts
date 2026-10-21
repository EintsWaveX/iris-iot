/**
 * A Praktikan's TP uploaded in IRIS, the only place TP is handed in since
 * 2026-10-21. Two steps, so the file never passes through Vercel:
 *
 * 1. POST /api/tp/tiket: the page says the file's size, SHA-256 and page
 *    count; IRIS checks the window, the roster and the pace, and answers
 *    with a PUT address on the relay (src/lib/tp-r2.ts) plus its own
 *    ticket for step 2.
 * 2. The page PUTs the PDF to the relay, which keeps it in R2 only if it
 *    matches byte for byte, then POST /api/tp/unggah with the ticket: IRIS
 *    checks R2 holds exactly that and makes it the Praktikan's file.
 *
 * Step 2 runs under one lock per Praktikan and module, so two tabs (or a
 * retry racing the first try) leave one current file and every row whole.
 * A send started while the window was open still counts if it finishes up
 * to 10 minutes after.
 */
import { and, count, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { praktikan, tpKiriman, tpUnggah, type BerkasTp } from "../../src/lib/schema.js";
import { bacaTanda, tandaiJson } from "../../src/lib/tanda.js";
import { kunciTp } from "../../src/lib/tp-r2.js";
import { jendelaPribadi, keadaanJendela } from "../../src/lib/tp.js";
import { catatJejak, jendelaUntuk, perpanjangTp, type SetTp } from "./tp.js";
import { SimpanGalat, ambil, kepala, tiketUnggah, urlBaca } from "./tp-simpan.js";

type Db = ReturnType<typeof getDb>;

/** The largest TP a Praktikan may send (the relay takes 16 MB). */
export const UNGGAH_MAKS = 15 * 1024 * 1024;

/** At most this many uploads per Praktikan and module in ten minutes. */
const UNGGAH_PER_10_MENIT = 10;

/** A send started before the close may finish this long after it. */
const SUSULAN_MENIT = 10;

/** Step 2's ticket outlives the relay's PUT ticket by the grace. */
const TIKET_MENIT = 15 + SUSULAN_MENIT;

export const awalanIris = "iris:";

/** The name the file gets. */
export const namaUnggah = (modul: number, nim: string) => `TP_Modul_${modul}_${nim}.pdf`;

const SHA_RE = /^[0-9a-f]{64}$/;

function rahasia(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set");
  return s;
}

interface TiketOk {
  j: "tp-ok";
  k: string;
  n: number;
  s: string;
  h: number;
  nim: string;
  m: number;
  /** When it was handed out, unix seconds */
  t: number;
}

/** A Praktikan's own window for a module: open, closed or not yet. */
async function keadaanPribadi(db: Db, set: SetTp, nim: string, modul: number) {
  const umum = jendelaUntuk(set, modul);
  const sampai = umum ? (await perpanjangTp(db, set)).get(modul)?.get(nim) : undefined;
  return keadaanJendela(umum && jendelaPribadi(umum, sampai));
}

/** The file a Praktikan has now for a module, if it was uploaded here. */
async function berkasKini(db: Pick<Db, "select">, semester: string, modul: number, nim: string) {
  const [r] = await db
    .select({ sha256: tpUnggah.sha256, id: tpUnggah.id })
    .from(tpKiriman)
    .innerJoin(tpUnggah, eq(tpUnggah.id, tpKiriman.unggahId))
    .where(
      and(eq(tpKiriman.semester, semester), eq(tpKiriman.modul, modul), eq(tpKiriman.nim, nim)),
    )
    .limit(1);
  return r ?? null;
}

/* =========================================================== step 1 */

export type HasilTiket =
  | { ok: true; sama: true }
  | { ok: true; sama: false; url: string; tiket: string }
  | {
      ok: false;
      kode:
        | "format_salah"
        | "terlalu_besar"
        | "jendela_tutup"
        | "bukan_praktikan"
        | "terlalu_sering"
        | "penyimpanan_mati";
    };

export async function mintaTiket(
  db: Db,
  set: SetTp,
  nim: string,
  modul: number,
  o: { ukuran: unknown; sha256: unknown; halaman: unknown },
): Promise<HasilTiket> {
  const ukuran = Number(o.ukuran);
  const halaman = Number(o.halaman);
  const sha256 = typeof o.sha256 === "string" ? o.sha256.toLowerCase() : "";
  if (!Number.isInteger(ukuran) || ukuran < 8 || !SHA_RE.test(sha256))
    return { ok: false, kode: "format_salah" };
  if (!Number.isInteger(halaman) || halaman < 1 || halaman > 200)
    return { ok: false, kode: "format_salah" };
  if (ukuran > UNGGAH_MAKS) return { ok: false, kode: "terlalu_besar" };
  if ((await keadaanPribadi(db, set, nim, modul)) !== "buka")
    return { ok: false, kode: "jendela_tutup" };
  const [p] = await db
    .select({ nim: praktikan.nim })
    .from(praktikan)
    .where(and(eq(praktikan.semester, set.semester), eq(praktikan.nim, nim)))
    .limit(1);
  if (!p) return { ok: false, kode: "bukan_praktikan" };
  if ((await berkasKini(db, set.semester, modul, nim))?.sha256 === sha256)
    return { ok: true, sama: true };
  const [n] = await db
    .select({ n: count() })
    .from(tpUnggah)
    .where(
      and(
        eq(tpUnggah.semester, set.semester),
        eq(tpUnggah.modul, modul),
        eq(tpUnggah.nim, nim),
        gte(tpUnggah.dibuatPada, new Date(Date.now() - 10 * 60_000)),
      ),
    );
  if ((n?.n ?? 0) >= UNGGAH_PER_10_MENIT) return { ok: false, kode: "terlalu_sering" };

  const k = kunciTp(set.semester, modul, nim, sha256);
  let url: string;
  try {
    url = (await tiketUnggah({ kunci: k, ukuran, sha256, halaman })).url;
  } catch {
    return { ok: false, kode: "penyimpanan_mati" };
  }
  const isi: TiketOk = {
    j: "tp-ok",
    k,
    n: ukuran,
    s: sha256,
    h: halaman,
    nim,
    m: modul,
    t: Math.floor(Date.now() / 1000),
  };
  return { ok: true, sama: false, url, tiket: await tandaiJson(isi, rahasia()) };
}

/* =========================================================== step 2 */

export type HasilUnggah =
  | { ok: true; id: number; sama: boolean; dikirimPada: string; ukuran: number; halaman: number }
  | {
      ok: false;
      kode:
        "tiket_salah" | "jendela_tutup" | "berkas_belum_ada" | "berkas_beda" | "penyimpanan_mati";
    };

/**
 * Makes the file the Praktikan just put in R2 their current TP. The same
 * bytes as the current file change nothing.
 */
export async function terimaUnggah(
  db: Db,
  set: SetTp,
  nim: string,
  modul: number,
  tiket: unknown,
): Promise<HasilUnggah> {
  if (typeof tiket !== "string") return { ok: false, kode: "tiket_salah" };
  const r = await bacaTanda(tiket, rahasia());
  const t = (r.ok ? r.isi : null) as TiketOk | null;
  const kini = Math.floor(Date.now() / 1000);
  if (!t || t.j !== "tp-ok" || t.nim !== nim || t.m !== modul || kini - t.t > TIKET_MENIT * 60)
    return { ok: false, kode: "tiket_salah" };
  const buka = (await keadaanPribadi(db, set, nim, modul)) === "buka";
  if (!buka && kini - t.t > SUSULAN_MENIT * 60) return { ok: false, kode: "jendela_tutup" };

  let h;
  try {
    h = await kepala(t.k);
  } catch {
    return { ok: false, kode: "penyimpanan_mati" };
  }
  if (!h.ada) return { ok: false, kode: "berkas_belum_ada" };
  if (h.ukuran !== t.n || (h.sha256 && h.sha256 !== t.s)) return { ok: false, kode: "berkas_beda" };

  // Finished after the close on the grace: it counts from when it started.
  const dikirim = buka ? new Date() : new Date(t.t * 1000);
  const nama = namaUnggah(modul, nim);
  const hasil = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`tp|${set.semester}|${modul}|${nim}`}))`,
    );
    const ada = await berkasKini(tx, set.semester, modul, nim);
    if (ada?.sha256 === t.s) return { id: ada.id, sama: true, berkas: null };
    const [row] = await tx
      .insert(tpUnggah)
      .values({
        semester: set.semester,
        modul,
        nim,
        nama,
        ukuran: t.n,
        sha256: t.s,
        kunci: t.k,
        mime: "application/pdf",
        halaman: t.h,
        asal: "iris",
        // Never copied anywhere else now.
        lmsStatus: "tanpa_lms",
        dibuatPada: dikirim,
      })
      .returning({ id: tpUnggah.id });
    const berkas: BerkasTp[] = [
      { nama, ukuran: t.n, mime: "application/pdf", url: `${awalanIris}${row.id}` },
    ];
    const baris = {
      sumber: "iris" as const,
      unggahId: row.id,
      berkas,
      statusLms: null,
      lmsKiriman: null,
      dikirimPada: dikirim,
      diambilPada: dikirim,
      sinkronPada: new Date(),
      // A file now: an earlier "did not submit" mark no longer holds.
      tanda: null,
      ditandaiOleh: null,
      terimaTelat: null,
    };
    await tx
      .insert(tpKiriman)
      .values({ semester: set.semester, modul, nim, ...baris })
      .onConflictDoUpdate({
        target: [tpKiriman.semester, tpKiriman.modul, tpKiriman.nim],
        set: baris,
      });
    return { id: row.id, sama: false, berkas };
  });
  if (!hasil.sama && hasil.berkas)
    await catatJejak(db, [
      {
        semester: set.semester,
        modul,
        nim,
        jenis: "unggah",
        sumber: "iris",
        lmsKursus: null,
        berkas: hasil.berkas,
        dikirimPada: dikirim,
      },
    ]);
  return {
    ok: true,
    id: hasil.id,
    sama: hasil.sama,
    dikirimPada: dikirim.toISOString(),
    ukuran: t.n,
    halaman: t.h,
  };
}

/* ============================================================ the bytes */

export type IsiTp =
  | { ok: true; jenis: "r2"; kunci: string; mime: string }
  | { ok: true; jenis: "iris"; isi: Buffer }
  | { ok: true; jenis: "lms"; res: Response }
  | { ok: false; kode: string; status: number };

/**
 * Where one file entry's bytes are: R2 for everything uploaded or moved
 * since 2026-10-21; a row's own base64, or the LMS, only for what the
 * move (tp-pindah.ts) has not reached yet.
 */
export async function ambilIsiTp(
  db: Db,
  b: BerkasTp,
  lms?: (url: string, range?: string) => Promise<IsiTp>,
  range?: string,
): Promise<IsiTp> {
  let url = b.url;
  if (url.startsWith(awalanIris)) {
    const id = Number(url.slice(awalanIris.length));
    const [u] = Number.isInteger(id)
      ? await db
          .select({
            kunci: tpUnggah.kunci,
            mime: tpUnggah.mime,
            isi: tpUnggah.isi,
            lmsUrl: tpUnggah.lmsUrl,
          })
          .from(tpUnggah)
          .where(eq(tpUnggah.id, id))
          .limit(1)
      : [];
    if (!u) return { ok: false, kode: "berkas_hilang", status: 404 };
    if (u.kunci) return { ok: true, jenis: "r2", kunci: u.kunci, mime: u.mime };
    if (u.isi) return { ok: true, jenis: "iris", isi: Buffer.from(u.isi, "base64") };
    if (!u.lmsUrl) return { ok: false, kode: "berkas_hilang", status: 404 };
    url = u.lmsUrl;
  }
  if (!lms) return { ok: false, kode: "berkas_hilang", status: 404 };
  return lms(url, range);
}

/** A read link for an R2 file (the viewer was already allowed). */
export function bacaR2(kunci: string, nama: string, mime: string, unduh: boolean) {
  return urlBaca({ kunci, nama, mime, unduh });
}

/** An R2 file's bytes, for the PC mirror. */
export async function aliranR2(kunci: string): Promise<Response | null> {
  try {
    return await ambil(kunci);
  } catch (e) {
    if (e instanceof SimpanGalat) return null;
    throw e;
  }
}
