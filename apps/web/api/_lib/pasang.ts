/**
 * The one-line install's own reports (2026-10-08). public/pasang-pi.sh posts
 * { tipe: "pasang_kabar", kode, token, tahap, ulang?, gagal? } as it starts
 * each step, with the same one-time token it installs with, so the
 * Register a Server wizard shows the install going on the Pi and nobody
 * reads its terminal. One record per server in `pengaturan`; a new token
 * starts over, and enrolment (which uses the token up) is read from the
 * server row instead.
 */
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { pengaturan, server } from "../../src/lib/schema.js";
import { safeEqual } from "../../src/lib/auth.js";
import { sha256 as hashToken } from "../../src/lib/server-lib.js";
import {
  TAHAP_PASANG,
  bacaPasang,
  type Pasang,
  type TahapPasang,
} from "../../src/lib/server-shared.js";

const GAGAL_MAKS = 300;
const PERPANJANG_MS = 60 * 60 * 1000;

export function kunciPasang(serverId: number): string {
  return `pasang_server_${serverId}`;
}

/** The server a still-valid enrol token belongs to, without using it up. */
export async function cekTokenPasang(
  kodeMentah: unknown,
  tokenMentah: unknown,
): Promise<{ ok: true; serverId: number } | { ok: false; kode: "format_salah" | "tidak_ditemukan" | "token_tidak_sah" }> {
  const kode = typeof kodeMentah === "string" ? kodeMentah.trim().toLowerCase() : "";
  const token = typeof tokenMentah === "string" ? tokenMentah.trim() : "";
  if (!kode || !token) return { ok: false, kode: "format_salah" };
  const [row] = await getDb()
    .select({ id: server.id, hash: server.daftarTokenHash, exp: server.daftarTokenExp })
    .from(server)
    .where(eq(server.kode, kode))
    .limit(1);
  if (!row) return { ok: false, kode: "tidak_ditemukan" };
  if (
    !row.hash ||
    !row.exp ||
    row.exp.getTime() < Date.now() ||
    !safeEqual(hashToken(token), row.hash)
  )
    return { ok: false, kode: "token_tidak_sah" };
  return { ok: true, serverId: row.id };
}

/** Records one report from the installer. */
export async function catatKabar(
  body: Record<string, unknown>,
): Promise<{ ok: true; serverId: number } | { ok: false; kode: string }> {
  const tahap = body.tahap as TahapPasang;
  if (!TAHAP_PASANG.includes(tahap)) return { ok: false, kode: "format_salah" };
  const cek = await cekTokenPasang(body.kode, body.token);
  if (!cek.ok) return cek;

  const db = getDb();
  const kunci = kunciPasang(cek.serverId);
  const lama = await bacaRekamPasang(cek.serverId);
  const kini = new Date().toISOString();
  const gagal = typeof body.gagal === "string" ? body.gagal.trim().slice(0, GAGAL_MAKS) : "";
  // A new run with the same token (after a failure) starts at "mulai" again.
  const nilai: Pasang = {
    tahap,
    ulang: body.ulang === true || (tahap !== "mulai" && !!lama?.ulang),
    gagal: gagal || null,
    mulai: lama && tahap !== "mulai" ? lama.mulai : kini,
    pada: kini,
  };
  await db
    .insert(pengaturan)
    .values({ kunci, nilai, diubahOleh: "pi" })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai, diubahOleh: "pi", diubahPada: new Date() },
    });
  // Provisioning on a slow microSD outlasts the token's 30 minutes, and the
  // token is only used up at enrolment: an install that keeps reporting
  // keeps it alive for another hour.
  await db
    .update(server)
    .set({ daftarTokenExp: new Date(Date.now() + PERPANJANG_MS) })
    .where(and(eq(server.id, cek.serverId), gt(server.daftarTokenExp, new Date())));
  return { ok: true, serverId: cek.serverId };
}

export async function bacaRekamPasang(serverId: number): Promise<Pasang | null> {
  const [r] = await getDb()
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, kunciPasang(serverId)))
    .limit(1);
  return bacaPasang(r?.nilai);
}

/** A new token (or a removed server) starts the install record over. */
export async function hapusRekamPasang(serverId: number): Promise<void> {
  await getDb().delete(pengaturan).where(eq(pengaturan.kunci, kunciPasang(serverId)));
}
