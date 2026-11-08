/**
 * Sends one file to an upload action of the site (see api/_lib/berkas.ts):
 * the file's bytes as the request body, its name in `x-nama`. Answers the
 * address the file is served at (`/f/<id>/<name>`), which the caller then
 * saves in its own row. Replaces Vercel Blob's `upload()` (9 Nov 2026).
 */
export interface HasilUnggah {
  url: string;
  nama: string;
  tipe: string;
  ukuran: number;
}

export class UnggahGagal extends Error {
  constructor(
    readonly kode: string,
    readonly status: number,
  ) {
    super(kode);
  }
}

export async function unggahBerkas(titik: string, file: Blob, nama: string): Promise<HasilUnggah> {
  let r: Response;
  try {
    r = await fetch(titik, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": file.type, "x-nama": encodeURIComponent(nama) },
      body: file,
    });
  } catch {
    throw new UnggahGagal("jaringan", 0);
  }
  let j: {
    ok?: boolean;
    kode?: string;
    url?: string;
    nama?: string;
    tipe?: string;
    ukuran?: number;
  } | null = null;
  try {
    j = await r.json();
  } catch {
    // an answer that is not JSON is a failure below
  }
  if (!r.ok || !j?.ok || typeof j.url !== "string") {
    throw new UnggahGagal(j?.kode ?? "unggah_gagal", r.status);
  }
  return {
    url: j.url,
    nama: j.nama ?? nama,
    tipe: j.tipe ?? file.type,
    ukuran: j.ukuran ?? file.size,
  };
}
