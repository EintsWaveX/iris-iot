/**
 * The Pi bundle the Updates card installs (2026-10-07). CI builds it from
 * both repositories, signs it with a key only CI holds, and publishes it
 * here (POST /api/agen { tipe: "bundel_terbit" }, see the agent route);
 * the agent fetches it when someone presses Update, and root on the Pi
 * checks the same signature before installing anything. The site is only
 * the road: it checks the signature too, so it never even stores junk.
 *
 * Kept in `pengaturan` under two keys, so reading what is newest (every
 * Server page) never loads the ~1 MB zip itself.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { pengaturan, server } from "../../src/lib/schema.js";
import { safeEqual } from "../../src/lib/auth.js";
import { sha256 as hashToken } from "../../src/lib/server-lib.js";
import type { BundelTerbit } from "../../src/lib/server-shared.js";

/** The public half of BUNDEL_KUNCI_TANDA; the same file as IRIS ASO's
 *  orangepi/agent/bundel.pub, which the Pi checks against. */
export const BUNDEL_PUB = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAFQ2KYNT9tPyJC52+GY5cGnNESAHH00MiEqvMb4xXhdM=
-----END PUBLIC KEY-----`;

const KUNCI_META = "bundel_pi";
const KUNCI_ISI = "bundel_pi_isi";
/** A bundle is about 1 MB; Vercel takes request bodies up to 4.5 MB. */
const UKURAN_MAKS = 3 * 1024 * 1024;
const SHA_RE = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{7,40}$/;

export function tandaSah(isi: Buffer, tanda: Buffer, pem: string = BUNDEL_PUB): boolean {
  try {
    return verify(null, isi, createPublicKey(pem), tanda);
  } catch {
    return false;
  }
}

/** The newest published bundle's details (no zip), or null. */
export async function bundelTerbaru(): Promise<BundelTerbit | null> {
  const [r] = await getDb()
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_META))
    .limit(1);
  const n = r?.nilai as Partial<BundelTerbit> | undefined;
  if (!n || typeof n.sha256 !== "string" || typeof n.aso !== "string" || typeof n.iot !== "string")
    return null;
  return {
    aso: n.aso,
    iot: n.iot,
    sha256: n.sha256,
    ukuran: typeof n.ukuran === "number" ? n.ukuran : 0,
    dibuat: typeof n.dibuat === "string" ? n.dibuat : "",
    dibangun: typeof n.dibangun === "string" ? n.dibangun : "",
  };
}

export type HasilTerbit =
  | { ok: true; kode: "baru" | "sudah_ada" | "lebih_lama" }
  | {
      ok: false;
      kode: "rahasia_salah" | "format_salah" | "terlalu_besar" | "sha_beda" | "tanda_tidak_sah";
    };

/** CI's upload. `rahasia` is the Bearer token it sent. */
export async function terbitkan(
  body: Record<string, unknown>,
  rahasia: string,
  rahasiaBenar: string | undefined,
): Promise<HasilTerbit> {
  if (!rahasiaBenar || !safeEqual(rahasia, rahasiaBenar))
    return { ok: false, kode: "rahasia_salah" };
  const { aso, iot, sha256, isi, tanda } = body;
  const dibangun = typeof body.dibangun === "string" ? body.dibangun : "";
  if (
    typeof aso !== "string" ||
    !COMMIT_RE.test(aso) ||
    typeof iot !== "string" ||
    !COMMIT_RE.test(iot) ||
    typeof sha256 !== "string" ||
    !SHA_RE.test(sha256) ||
    typeof isi !== "string" ||
    typeof tanda !== "string"
  )
    return { ok: false, kode: "format_salah" };
  const zip = Buffer.from(isi, "base64");
  if (zip.length > UKURAN_MAKS) return { ok: false, kode: "terlalu_besar" };
  if (createHash("sha256").update(zip).digest("hex") !== sha256)
    return { ok: false, kode: "sha_beda" };
  if (!tandaSah(zip, Buffer.from(tanda, "base64"))) return { ok: false, kode: "tanda_tidak_sah" };

  const lama = await bundelTerbaru();
  if (lama && lama.aso === aso && lama.iot === iot) return { ok: true, kode: "sudah_ada" };
  // Both repositories' CI jobs publish; one that retried while the site
  // deployed may land after a newer build. The later build wins.
  const t = Date.parse(dibangun);
  const tLama = lama ? Date.parse(lama.dibangun) : NaN;
  if (Number.isFinite(t) && Number.isFinite(tLama) && t < tLama)
    return { ok: true, kode: "lebih_lama" };

  const meta: BundelTerbit & { tanda: string } = {
    aso,
    iot,
    sha256,
    ukuran: zip.length,
    dibuat: new Date().toISOString(),
    dibangun,
    tanda,
  };
  const db = getDb();
  // The zip first: a Pi told about the new details always finds its file.
  for (const [kunci, nilai] of [
    [KUNCI_ISI, { sha256, isi }],
    [KUNCI_META, meta],
  ] as const) {
    await db
      .insert(pengaturan)
      .values({ kunci, nilai, diubahOleh: "ci" })
      .onConflictDoUpdate({
        target: pengaturan.kunci,
        set: { nilai, diubahOleh: "ci", diubahPada: new Date() },
      });
  }
  return { ok: true, kode: "baru" };
}

/** The zip and signature for the agent, only if `sha256` is still newest. */
export async function ambilBundel(
  sha256: string,
): Promise<{ isi: string; tanda: string } | "tidak_ada" | "sudah_berganti"> {
  const db = getDb();
  const [m] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_META))
    .limit(1);
  const meta = m?.nilai as { sha256?: string; tanda?: string } | undefined;
  if (!meta?.sha256 || typeof meta.tanda !== "string") return "tidak_ada";
  if (meta.sha256 !== sha256) return "sudah_berganti";
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_ISI))
    .limit(1);
  const isi = r?.nilai as { sha256?: string; isi?: string } | undefined;
  if (!isi || isi.sha256 !== sha256 || typeof isi.isi !== "string") return "tidak_ada";
  return { isi: isi.isi, tanda: meta.tanda };
}

export type HasilPasang =
  | {
      ok: true;
      /** The server this token registers, so a Pi already reporting to it
       *  only re-registers, and one reporting elsewhere is asked first. */
      serverId: number;
      relay: string | null;
      waktu: number;
      /** The bundle, left out when the Pi only asked who it would report to. */
      isi?: string;
      tanda?: string;
      sha256?: string;
      aso?: string;
      iot?: string;
    }
  | {
      ok: false;
      kode: "format_salah" | "tidak_ditemukan" | "token_tidak_sah" | "bundel_belum_ada";
    };

/** The one-line install (public/pasang-pi.sh, 2026-10-07), for whoever holds
 *  a server's one-time enrol token. The token is only checked here;
 *  enrolment uses it up a minute later. `ringkas` answers which server it
 *  is (a Pi that already has an agent only switches servers); otherwise
 *  the newest bundle comes too, for a fresh Pi. Both carry the Konsol relay
 *  and the site's clock, which a fresh Pi lacks. */
export async function bundelUntukPasang(
  kodeMentah: unknown,
  tokenMentah: unknown,
  ringkas = false,
): Promise<HasilPasang> {
  const kode = typeof kodeMentah === "string" ? kodeMentah.trim().toLowerCase() : "";
  const token = typeof tokenMentah === "string" ? tokenMentah.trim() : "";
  if (!kode || !token) return { ok: false, kode: "format_salah" };
  const db = getDb();
  const [row] = await db
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
  const relay = process.env.KONSOL_RELAY_URL?.trim() ?? "";
  const dasar = {
    ok: true as const,
    serverId: row.id,
    relay: /^wss:\/\//.test(relay) ? relay : null,
    waktu: Date.now() / 1000,
  };
  if (ringkas) return dasar;
  const terbit = await bundelTerbaru();
  if (!terbit) return { ok: false, kode: "bundel_belum_ada" };
  const b = await ambilBundel(terbit.sha256);
  if (typeof b === "string") return { ok: false, kode: "bundel_belum_ada" };
  return { ...dasar, ...b, sha256: terbit.sha256, aso: terbit.aso, iot: terbit.iot };
}
