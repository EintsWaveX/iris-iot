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
import { pengaturan } from "../../src/lib/schema.js";
import { safeEqual } from "../../src/lib/auth.js";
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
  };
}

export type HasilTerbit =
  | { ok: true; kode: "baru" | "sudah_ada" }
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

  const meta: BundelTerbit & { tanda: string } = {
    aso,
    iot,
    sha256,
    ukuran: zip.length,
    dibuat: new Date().toISOString(),
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
