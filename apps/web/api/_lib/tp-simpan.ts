/**
 * Where TP files are kept (2026-10-21): Cloudflare R2 behind the relay
 * (apps/relay/src/tp.ts), reached with tickets this side signs
 * (src/lib/tp-r2.ts). Nothing here holds a file in memory longer than one
 * call; reads go to the browser straight from the relay.
 */
import {
  TP_BACA_DETIK,
  TP_PUT_DETIK,
  TP_SRV_DETIK,
  relayHttps,
  sekarangDetik,
  sha256Hex,
  tandaiTp,
  type OpSrv,
} from "../../src/lib/tp-r2.js";
import { konsolEnv } from "./konsol.js";

export class SimpanGalat extends Error {
  constructor(
    public kode: "belum_diatur" | "tak_terjangkau" | "ditolak" | "hilang",
    pesan: string,
  ) {
    super(pesan);
  }
}

function env() {
  const e = konsolEnv();
  if (!e) throw new SimpanGalat("belum_diatur", "KONSOL_RELAY_URL/SECRET not set");
  return { base: relayHttps(e.relay), secret: e.secret };
}

export const simpanSiap = () => konsolEnv() !== null;

/** The browser's PUT address for one file (15 minutes). */
export async function tiketUnggah(o: {
  kunci: string;
  ukuran: number;
  sha256: string;
  halaman: number;
}): Promise<{ url: string; sampai: number }> {
  const { base, secret } = env();
  const e = sekarangDetik() + TP_PUT_DETIK;
  const t = await tandaiTp(
    { j: "tp-put", k: o.kunci, n: o.ukuran, s: o.sha256, h: o.halaman, e },
    secret,
  );
  return { url: `${base}/tp/unggah?t=${encodeURIComponent(t)}`, sampai: e };
}

/** A 10-minute read link for a viewer the caller already allowed. */
export async function urlBaca(o: {
  kunci: string;
  nama: string;
  mime: string;
  unduh?: boolean;
}): Promise<string> {
  const { base, secret } = env();
  const t = await tandaiTp(
    {
      j: "tp-baca",
      k: o.kunci,
      e: sekarangDetik() + TP_BACA_DETIK,
      d: o.unduh ? "u" : "i",
      nm: o.nama,
      m: o.mime,
    },
    secret,
  );
  return `${base}/tp/berkas?t=${encodeURIComponent(t)}`;
}

async function srv(
  op: OpSrv,
  kunci: string,
  isi?: Uint8Array,
  extra: Record<string, string> = {},
): Promise<Response> {
  const { base, secret } = env();
  const s = isi ? await sha256Hex(isi) : "";
  const t = await tandaiTp(
    { j: "tp-srv", op, k: kunci, s, e: sekarangDetik() + TP_SRV_DETIK },
    secret,
  );
  let r: Response;
  try {
    r = await fetch(`${base}/tp/srv`, {
      method: "POST",
      headers: { "x-tp-tiket": t, ...extra },
      body: isi ? (isi as BodyInit) : undefined,
      signal: AbortSignal.timeout(op === "get" || op === "put" ? 60_000 : 15_000),
    });
  } catch (e) {
    throw new SimpanGalat("tak_terjangkau", e instanceof Error ? e.message : String(e));
  }
  if (r.status === 404) throw new SimpanGalat("hilang", `${op} ${kunci}: not there`);
  if (!r.ok) throw new SimpanGalat("ditolak", `${op} ${kunci}: ${r.status} ${await r.text()}`);
  return r;
}

export interface Kepala {
  ada: boolean;
  ukuran?: number;
  sha256?: string | null;
  halaman?: number | null;
}

/** What R2 holds under a key. */
export async function kepala(kunci: string): Promise<Kepala> {
  return (await (await srv("head", kunci)).json()) as Kepala;
}

/** Keeps bytes under a key (the import, and any server-side write). */
export async function simpan(
  kunci: string,
  isi: Uint8Array,
  mime: string,
  halaman?: number | null,
): Promise<void> {
  await srv("put", kunci, isi, {
    "x-tp-mime": mime,
    ...(halaman ? { "x-tp-halaman": String(halaman) } : {}),
  });
}

/** A file's bytes, streamed (the PC mirror's copy). */
export async function ambil(kunci: string): Promise<Response> {
  return srv("get", kunci);
}

/** Deletes everything under a semester's prefix; the count gone. */
export async function hapusAwalan(awalan: string): Promise<number> {
  return ((await (await srv("hapus-awalan", awalan)).json()) as { hapus: number }).hapus;
}
