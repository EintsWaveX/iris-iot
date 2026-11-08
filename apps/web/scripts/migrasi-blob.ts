/**
 * Copies every Vercel Blob file the database still points at into the
 * `berkas` table and rewrites the rows to the new address (/f/<id>/<name>).
 * The Blob files are public, so no token is needed; nothing is deleted from
 * Blob. Safe to run twice: rows already on /f/ are not touched.
 *
 * Without --jalankan it only reads and reports (counts, never an address).
 *
 * On the PC, with the service's own environment:
 *   sudo systemd-run --pty --wait -p User=iris-web -p EnvironmentFile=/etc/iris-web/env \
 *     -p WorkingDirectory=/opt/iris-web/apps/web /opt/node24/bin/node --import tsx scripts/migrasi-blob.ts [--jalankan]
 */
import { eq, like } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { isiCocok, simpanBerkas, urlBlobLama } from "../api/_lib/berkas.js";
import { getDb } from "../src/lib/db.js";
import {
  asisten,
  laporanLampiran,
  presentasi,
  profilAcaraFoto,
  profilDivisi,
  profilFotoBersama,
  skema,
} from "../src/lib/schema.js";

const keluar = (s: string) => process.stdout.write(`${s}\n`);
const tulis = process.argv.includes("--jalankan");

const TIPE = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const MAKS = 21 * 1024 * 1024;

interface Sasaran {
  tabel: PgTable;
  kolom: PgColumn;
  kunci: string;
}
// Every column that holds an uploaded file's address.
const sasaran: Sasaran[] = [
  { tabel: asisten, kolom: asisten.fotoUrl, kunci: "fotoUrl" },
  { tabel: asisten, kolom: asisten.fotoKecilUrl, kunci: "fotoKecilUrl" },
  { tabel: profilDivisi, kolom: profilDivisi.fotoUrl, kunci: "fotoUrl" },
  { tabel: profilDivisi, kolom: profilDivisi.fotoKecilUrl, kunci: "fotoKecilUrl" },
  { tabel: profilFotoBersama, kolom: profilFotoBersama.fotoUrl, kunci: "fotoUrl" },
  { tabel: profilFotoBersama, kolom: profilFotoBersama.fotoKecilUrl, kunci: "fotoKecilUrl" },
  { tabel: profilAcaraFoto, kolom: profilAcaraFoto.fotoUrl, kunci: "fotoUrl" },
  { tabel: profilAcaraFoto, kolom: profilAcaraFoto.fotoKecilUrl, kunci: "fotoKecilUrl" },
  { tabel: presentasi, kolom: presentasi.url, kunci: "url" },
  { tabel: skema, kolom: skema.url, kunci: "url" },
  { tabel: laporanLampiran, kolom: laporanLampiran.url, kunci: "url" },
];

const db = getDb();
const lama = new Set<string>();
for (const s of sasaran) {
  const rows = (await db
    .selectDistinct({ u: s.kolom })
    .from(s.tabel as PgTable)
    .where(like(s.kolom, "%.public.blob.vercel-storage.com%"))) as { u: string | null }[];
  for (const r of rows) if (urlBlobLama(r.u)) lama.add(r.u);
}
keluar(`${lama.size} Blob addresses are still in the database`);

const baru = new Map<string, string>();
let gagal = 0;
let bytes = 0;
for (const url of lama) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const tipe = (r.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const isi = Buffer.from(await r.arrayBuffer());
    if (!TIPE.has(tipe) || isi.length === 0 || isi.length > MAKS || !isiCocok(tipe, isi)) {
      throw new Error("not an allowed file");
    }
    bytes += isi.length;
    if (tulis) {
      const nama = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "berkas");
      const { url: ke } = await simpanBerkas({ nama, tipe, isi, pemilik: "migrasi-blob" });
      baru.set(url, ke);
    }
  } catch {
    gagal++;
  }
}
keluar(
  `${lama.size - gagal} of ${lama.size} fetched (${(bytes / 1024 / 1024).toFixed(2)} MB), ${gagal} failed`,
);

if (!tulis) {
  keluar("Dry run: nothing written. Run again with --jalankan to copy and rewrite.");
  process.exit(gagal === 0 ? 0 : 1);
}

let baris = 0;
for (const [dari, ke] of baru) {
  for (const s of sasaran) {
    const hasil = await db
      .update(s.tabel as PgTable)
      .set({ [s.kunci]: ke } as never)
      .where(eq(s.kolom, dari))
      .returning();
    baris += hasil.length;
  }
}
keluar(`${baru.size} files stored, ${baris} rows rewritten, ${gagal} left on Blob`);
process.exit(gagal === 0 ? 0 : 1);
