/**
 * TP uploaded in IRIS (2026-10-14). The LMS can refuse a student's upload
 * until they fill the iGracias survey, so a Praktikan may upload their TP
 * here instead. The newer of the two counts (tp.ts lmsMenang): an upload
 * here takes over tp_kiriman until the LMS gets a later submission.
 *
 * IRIS then puts a copy in the LMS as a feedback file under that student's
 * grade: on Telkom's LMS no role may edit another student's submission
 * (mod/assign:editothersubmission, checked live), so this is as close to
 * "uploaded there too" as a Teacher's account gets. The bytes wait in
 * tp_unggah until the LMS holds the copy, then go; the file streams from
 * the LMS like any other. A failed copy is tried again on the server's
 * heartbeat, further apart each time.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { lmsPeserta, praktikan, tpKiriman, tpUnggah, type BerkasTp } from "../../src/lib/schema.js";
import { keadaanJendela } from "../../src/lib/tp.js";
import {
  LmsGalat,
  ambilBerkas,
  bukaToken,
  nilaiSatu,
  simpanUmpanBerkas,
  umpanBerkas,
  umpanBerkasNyala,
  unggahDraf,
} from "./lms.js";
import { nyalakanUmpanBerkas } from "./lms-web.js";
import { bacaSet, catatJejak, jendelaUntuk, webLms, type SetTp } from "./tp.js";
import { siarkan } from "./siaran.js";

type Db = ReturnType<typeof getDb>;

/** Under Vercel's 4.5 MB request body once base64. */
export const UNGGAH_MAKS = 3 * 1024 * 1024;

/** At most this many uploads per Praktikan and module in ten minutes. */
const UNGGAH_PER_10_MENIT = 10;

/** How many times a copy to the LMS is tried before it waits for a hand. */
const COBA_MAKS = 20;

export const awalanIris = "iris:";

/** The name the file gets, here and in the LMS. */
export const namaUnggah = (modul: number, nim: string) => `TP_Modul_${modul}_${nim}.pdf`;

/** The page's PDF: base64 bytes that start like a PDF. Null when not one. */
export function pdfUnggah(v: unknown): Uint8Array | null {
  if (typeof v !== "string" || v.length > UNGGAH_MAKS * 1.4) return null;
  const isi = new Uint8Array(Buffer.from(v, "base64"));
  if (
    isi.length < 8 ||
    isi.length > UNGGAH_MAKS ||
    Buffer.from(isi.subarray(0, 5)).toString() !== "%PDF-"
  )
    return null;
  return isi;
}

/* ========================================================== the upload */

export type HasilUnggah =
  | { ok: true; id: number; sama: boolean }
  | { ok: false; kode: "jendela_tutup" | "bukan_praktikan" | "terlalu_sering" };

/**
 * A Praktikan's TP uploaded here: kept, made their current file, and its
 * copy to the LMS queued (the caller starts it). The same bytes as the file
 * they already have here change nothing.
 */
export async function terimaUnggah(
  db: Db,
  set: SetTp,
  nim: string,
  modul: number,
  isi: Uint8Array,
): Promise<HasilUnggah> {
  if (keadaanJendela(jendelaUntuk(set, modul)) !== "buka")
    return { ok: false, kode: "jendela_tutup" };
  const [p] = await db
    .select({ nim: praktikan.nim })
    .from(praktikan)
    .where(and(eq(praktikan.semester, set.semester), eq(praktikan.nim, nim)))
    .limit(1);
  if (!p) return { ok: false, kode: "bukan_praktikan" };

  const sha256 = createHash("sha256").update(isi).digest("hex");
  const [kini] = await db
    .select({ sumber: tpKiriman.sumber, unggahId: tpKiriman.unggahId })
    .from(tpKiriman)
    .where(
      and(eq(tpKiriman.semester, set.semester), eq(tpKiriman.modul, modul), eq(tpKiriman.nim, nim)),
    )
    .limit(1);
  if (kini?.sumber === "iris" && kini.unggahId) {
    const [u] = await db
      .select({ sha256: tpUnggah.sha256 })
      .from(tpUnggah)
      .where(eq(tpUnggah.id, kini.unggahId))
      .limit(1);
    if (u?.sha256 === sha256) return { ok: true, id: kini.unggahId, sama: true };
  }
  const [n] = await db
    .select({ n: sql<number>`count(*)::int` })
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

  const nama = namaUnggah(modul, nim);
  const [row] = await db
    .insert(tpUnggah)
    .values({
      semester: set.semester,
      modul,
      nim,
      nama,
      ukuran: isi.length,
      sha256,
      isi: Buffer.from(isi).toString("base64"),
    })
    .returning({ id: tpUnggah.id });
  // An older copy not yet in the LMS is not sent any more.
  await db
    .update(tpUnggah)
    .set({ lmsStatus: "batal", isi: null })
    .where(
      and(
        eq(tpUnggah.semester, set.semester),
        eq(tpUnggah.modul, modul),
        eq(tpUnggah.nim, nim),
        ne(tpUnggah.id, row.id),
        inArray(tpUnggah.lmsStatus, ["menunggu", "gagal", "tanpa_lms"]),
      ),
    );
  // Its LMS class, so the per-class counts include it.
  const [pes] = await db
    .select({ lmsKursus: lmsPeserta.lmsKursus })
    .from(lmsPeserta)
    .where(and(eq(lmsPeserta.semester, set.semester), eq(lmsPeserta.nim, nim)))
    .limit(1);
  const now = new Date();
  const berkas: BerkasTp[] = [
    { nama, ukuran: isi.length, mime: "application/pdf", url: `${awalanIris}${row.id}` },
  ];
  const baris = {
    sumber: "iris" as const,
    unggahId: row.id,
    ...(pes ? { lmsKursus: pes.lmsKursus } : {}),
    berkas,
    statusLms: null,
    lmsKiriman: null,
    dikirimPada: now,
    diambilPada: now,
    sinkronPada: now,
    // A file now: an earlier "did not submit" mark no longer holds.
    tanda: null,
    ditandaiOleh: null,
    terimaTelat: null,
  };
  await db
    .insert(tpKiriman)
    .values({ semester: set.semester, modul, nim, ...baris })
    .onConflictDoUpdate({
      target: [tpKiriman.semester, tpKiriman.modul, tpKiriman.nim],
      set: baris,
    });
  await catatJejak(db, [
    {
      semester: set.semester,
      modul,
      nim,
      jenis: "unggah",
      sumber: "iris",
      lmsKursus: pes?.lmsKursus ?? null,
      berkas,
      dikirimPada: now,
    },
  ]);
  await siarkan(["tp"]);
  return { ok: true, id: row.id, sama: false };
}

/* ====================================================== the LMS's copy */

/** The assignment and LMS user a Praktikan's copy goes to, or why not. */
async function tujuan(db: Db, set: SetTp, nim: string, modul: number) {
  const [pes] = await db
    .select({ lmsUser: lmsPeserta.lmsUser, lmsKursus: lmsPeserta.lmsKursus })
    .from(lmsPeserta)
    .where(and(eq(lmsPeserta.semester, set.semester), eq(lmsPeserta.nim, nim)))
    .limit(1);
  if (!pes) return null;
  const k = set.kelas?.kursus.find((x) => x.id === pes.lmsKursus);
  const t = k?.tugas[String(modul)];
  if (!k || !t)
    throw new LmsGalat("tugas_tidak_ada", `no TP Modul ${modul} in course ${pes.lmsKursus}`);
  return { userid: pes.lmsUser, kursus: k.id, tugas: t.id, cmid: t.cmid };
}

/**
 * Puts one upload in the LMS as the student's feedback file and reads it
 * back. Claims the row first, so a page's call and a heartbeat's retry
 * never send the same copy twice. Never throws.
 */
export async function kirimUnggahKeLms(db: Db, id: number): Promise<string> {
  const [row] = await db
    .update(tpUnggah)
    .set({ lmsPada: new Date() })
    .where(
      and(
        eq(tpUnggah.id, id),
        inArray(tpUnggah.lmsStatus, ["menunggu", "gagal"]),
        or(isNull(tpUnggah.lmsPada), lt(tpUnggah.lmsPada, new Date(Date.now() - 2 * 60_000))),
      ),
    )
    .returning();
  if (!row) return "sibuk";
  try {
    if (!row.isi) throw new LmsGalat("isi_hilang", "the bytes are gone");
    const set = await bacaSet(db);
    const token = set.token ? bukaToken(set.token) : null;
    if (!token) throw new LmsGalat("belum_tersambung", "no LMS token");
    const t = await tujuan(db, set, row.nim, row.modul);
    if (!t) {
      await db
        .update(tpUnggah)
        .set({ lmsStatus: "tanpa_lms", lmsGalat: null })
        .where(eq(tpUnggah.id, id));
      return "tanpa_lms";
    }
    // Assignments IRIS made before 2026-10-14 have feedback files off.
    if (!(await umpanBerkasNyala(token, t.kursus, t.tugas)))
      await nyalakanUmpanBerkas(webLms(db, set), t.cmid);
    const nilai = await nilaiSatu(token, t.tugas, t.userid);
    const draf = await unggahDraf(token, row.nama, new Uint8Array(Buffer.from(row.isi, "base64")));
    await simpanUmpanBerkas(token, t.tugas, t.userid, draf, nilai);
    const f = (await umpanBerkas(token, t.tugas, t.userid)).find((x) => x.filename === row.nama);
    if (!f)
      throw new LmsGalat("umpan_tidak_terbaca", "the feedback file is not there after the save");
    await db
      .update(tpUnggah)
      .set({
        lmsStatus: "terkirim",
        lmsGalat: null,
        lmsCoba: row.lmsCoba + 1,
        lmsPada: new Date(),
        lmsUrl: f.fileurl.replace(/[?&]token=[^&]*/, ""),
        isi: null,
      })
      // A newer upload may have cancelled it meanwhile; the LMS copy is
      // replaced by that one's own.
      .where(and(eq(tpUnggah.id, id), ne(tpUnggah.lmsStatus, "batal")));
    await siarkan(["tp"]);
    return "terkirim";
  } catch (e) {
    const kode = e instanceof LmsGalat ? e.kode : "galat";
    if (!(e instanceof LmsGalat)) console.error("[api/tp unggah] LMS copy failed:", e);
    const rinci = e instanceof Error ? e.message.slice(0, 200) : String(e);
    await db
      .update(tpUnggah)
      .set({
        lmsStatus: "gagal",
        lmsGalat: `${kode}: ${rinci}`,
        lmsCoba: row.lmsCoba + 1,
        lmsPada: new Date(),
      })
      .where(and(eq(tpUnggah.id, id), ne(tpUnggah.lmsStatus, "batal")));
    await siarkan(["tp"]);
    return "gagal";
  }
}

/**
 * Copies still owed to the LMS, a few per heartbeat: a failed one waits
 * 2, 4, 8 ... up to 60 minutes between tries. Never throws.
 */
export async function kirimTertunda(db: Db, maks = 5): Promise<void> {
  try {
    const rows = await db
      .select({ id: tpUnggah.id })
      .from(tpUnggah)
      .where(
        and(
          inArray(tpUnggah.lmsStatus, ["menunggu", "gagal"]),
          lt(tpUnggah.lmsCoba, COBA_MAKS),
          or(
            isNull(tpUnggah.lmsPada),
            sql`${tpUnggah.lmsPada} < now() - least(60, power(2, ${tpUnggah.lmsCoba})) * interval '1 minute'`,
          ),
        ),
      )
      .orderBy(tpUnggah.id)
      .limit(maks);
    for (const r of rows) await kirimUnggahKeLms(db, r.id);
  } catch (e) {
    console.error("[api/tp] pending LMS copies failed:", e);
  }
}

/** The newest upload of a Praktikan's module, for the pages. */
export async function unggahTerakhir(db: Db, semester: string, modul: number, nim: string) {
  const [u] = await db
    .select({
      id: tpUnggah.id,
      lmsStatus: tpUnggah.lmsStatus,
      lmsPada: tpUnggah.lmsPada,
      lmsGalat: tpUnggah.lmsGalat,
    })
    .from(tpUnggah)
    .where(and(eq(tpUnggah.semester, semester), eq(tpUnggah.modul, modul), eq(tpUnggah.nim, nim)))
    .orderBy(desc(tpUnggah.id))
    .limit(1);
  return u ?? null;
}

/* ============================================================ the bytes */

export type IsiTp =
  | { ok: true; jenis: "lms"; res: Response }
  | { ok: true; jenis: "iris"; isi: Buffer }
  | { ok: false; kode: string; status: number };

/**
 * One file entry's bytes: an LMS address streams from the LMS; an upload
 * in IRIS comes from tp_unggah until the LMS holds its copy, then from
 * there.
 */
export async function ambilIsiTp(db: Db, set: SetTp, b: BerkasTp, range?: string): Promise<IsiTp> {
  let url = b.url;
  if (url.startsWith(awalanIris)) {
    const id = Number(url.slice(awalanIris.length));
    const [u] = Number.isInteger(id)
      ? await db
          .select({ isi: tpUnggah.isi, lmsUrl: tpUnggah.lmsUrl })
          .from(tpUnggah)
          .where(eq(tpUnggah.id, id))
          .limit(1)
      : [];
    if (!u) return { ok: false, kode: "berkas_hilang", status: 404 };
    if (u.isi) return { ok: true, jenis: "iris", isi: Buffer.from(u.isi, "base64") };
    if (!u.lmsUrl) return { ok: false, kode: "berkas_hilang", status: 404 };
    url = u.lmsUrl;
  }
  const token = set.token ? bukaToken(set.token) : null;
  if (!token) return { ok: false, kode: "lms_terputus", status: 503 };
  let r: Response;
  try {
    r = await ambilBerkas(token, url, range);
  } catch (e) {
    return { ok: false, kode: e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau", status: 502 };
  }
  const jenis = r.headers.get("content-type") ?? "";
  // An expired token answers with an HTML or JSON error page, not the file.
  if (!r.ok || !r.body || /json|html/i.test(jenis))
    return { ok: false, kode: r.status === 404 ? "berkas_hilang" : "lms_menolak", status: 502 };
  return { ok: true, jenis: "lms", res: r };
}
