/**
 * Recruitment documents in R2, two steps like TP (_lib/tp-unggah.ts) so a PDF
 * never squeezes through the API's request body:
 *
 * 1. POST ticket: the page says the file's kind, size, SHA-256 and page
 *    count; IRIS checks them and answers with a PUT address on the relay
 *    (src/lib/tp-r2.ts) plus its own ticket for step 2.
 * 2. The page PUTs the PDF to the relay, which keeps it only if it matches
 *    byte for byte and starts with %PDF-. Then POST document (or apply)
 *    carries IRIS's ticket back: IRIS asks R2 again and checks the size, the
 *    hash and the first bytes before it records the file.
 *
 * The key is content addressed, so a retry lands on the same object.
 */
import { bacaTanda, tandaiJson } from "../../src/lib/tanda.js";
import { DOC_KINDS, DOC_MAX_BYTES, type DocKind } from "../../src/lib/recruitment/types.js";
import { ambil, kepala } from "./tp-simpan.js";

/** Step 2's ticket outlives the relay's 15 minute PUT ticket. */
export const TIKET_REK_DETIK = 25 * 60;

const SHA_RE = /^[0-9a-f]{64}$/;
const PDF_AWAL = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export interface TiketRek {
  j: "rec-ok";
  /** The R2 key */
  k: string;
  /** Size in bytes, SHA-256 hex, page count */
  n: number;
  s: string;
  h: number;
  nim: string;
  /** Edition id */
  ed: number;
  kind: DocKind;
  /** Handed out at, unix seconds */
  t: number;
}

export type IsiTiketRek = Omit<TiketRek, "j" | "t">;

export function buatTiketRek(
  rahasia: string,
  isi: IsiTiketRek,
  kini = Math.floor(Date.now() / 1000),
): Promise<string> {
  const t: TiketRek = { j: "rec-ok", ...isi, t: kini };
  return tandaiJson(t, rahasia);
}

/** A signed, unexpired ticket, or null. Callers still compare nim, edition and kind. */
export async function bacaTiketRek(
  token: unknown,
  rahasia: string,
  kini = Math.floor(Date.now() / 1000),
): Promise<TiketRek | null> {
  if (typeof token !== "string" || !token) return null;
  const r = await bacaTanda(token, rahasia);
  if (!r.ok || !r.isi || typeof r.isi !== "object") return null;
  const t = r.isi as Partial<TiketRek>;
  if (t.j !== "rec-ok" || typeof t.t !== "number" || kini - t.t > TIKET_REK_DETIK) return null;
  if (
    typeof t.k !== "string" ||
    typeof t.n !== "number" ||
    typeof t.s !== "string" ||
    typeof t.h !== "number" ||
    typeof t.nim !== "string" ||
    typeof t.ed !== "number" ||
    !(DOC_KINDS as readonly unknown[]).includes(t.kind)
  )
    return null;
  return t as TiketRek;
}

export type ParamTiket =
  | { ok: true; kind: DocKind; ukuran: number; sha256: string; halaman: number }
  | { ok: false; kode: "format_salah" | "terlalu_besar" };

/** What a page may ask a PUT address for. */
export function cekParamTiket(
  b: Record<string, unknown>,
  batas: (kind: DocKind) => number = () => DOC_MAX_BYTES,
): ParamTiket {
  const gagal = { ok: false, kode: "format_salah" } as const;
  if (!(DOC_KINDS as readonly unknown[]).includes(b.kind)) return gagal;
  const ukuran = b.ukuran;
  if (typeof ukuran !== "number" || !Number.isInteger(ukuran) || ukuran < 8) return gagal;
  const sha256 = typeof b.sha256 === "string" ? b.sha256.toLowerCase() : "";
  if (!SHA_RE.test(sha256)) return gagal;
  const halaman = b.halaman === undefined ? 1 : b.halaman;
  if (typeof halaman !== "number" || !Number.isInteger(halaman) || halaman < 1 || halaman > 200)
    return gagal;
  if (ukuran > batas(b.kind as DocKind)) return { ok: false, kode: "terlalu_besar" };
  return { ok: true, kind: b.kind as DocKind, ukuran, sha256, halaman };
}

export interface DepR2 {
  kepala(kunci: string): Promise<{ ada: boolean; ukuran?: number; sha256?: string | null }>;
  /** The first bytes of the object (at least five when it has that many) */
  awal(kunci: string): Promise<Uint8Array>;
}

export const depNyata: DepR2 = {
  kepala: (k) => kepala(k),
  async awal(k) {
    const r = await ambil(k);
    const baca = r.body?.getReader();
    if (!baca) return new Uint8Array(0);
    const kumpul: number[] = [];
    while (kumpul.length < PDF_AWAL.length) {
      const { done, value } = await baca.read();
      if (done) break;
      kumpul.push(...value);
    }
    await baca.cancel().catch(() => undefined);
    return Uint8Array.from(kumpul);
  },
};

export type HasilPeriksa = "ok" | "hilang" | "beda" | "bukan_pdf";

/** R2 holds exactly what the ticket says, and it is a PDF. */
export async function periksaBerkas(
  t: Pick<TiketRek, "k" | "n" | "s">,
  dep: DepR2 = depNyata,
): Promise<HasilPeriksa> {
  const h = await dep.kepala(t.k);
  if (!h.ada) return "hilang";
  if (h.ukuran !== t.n || h.sha256 !== t.s) return "beda";
  const awal = await dep.awal(t.k);
  return PDF_AWAL.every((c, i) => awal[i] === c) ? "ok" : "bukan_pdf";
}
