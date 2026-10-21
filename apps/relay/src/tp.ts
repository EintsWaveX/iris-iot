/**
 * TP files (2026-10-21): the R2 bucket behind signed tickets from the IRIS
 * API (apps/web/src/lib/tp-r2.ts).
 *
 *   PUT  /tp/unggah?t=...   a Praktikan's browser, one file
 *   GET  /tp/berkas?t=...   a 10-minute read the API redirected to
 *   POST /tp/srv            the IRIS API (x-tp-tiket): head, get, put,
 *                           hapus-awalan (a whole semester)
 *
 * A put is checked against its ticket byte for byte (size, SHA-256, the
 * PDF header) before it is kept, so the API can trust what it confirms.
 */
import {
  TP_BERKAS_MAKS,
  TP_MIME,
  bacaTiketTp,
  sha256Hex,
} from "../../web/src/lib/tp-r2.ts";

export interface EnvTp {
  TP?: R2Bucket;
  KONSOL_RELAY_SECRET: string;
}

/** Pages allowed to call the relay from a browser. */
const ASAL = new Set([
  "https://irisiotlab.com",
  "https://www.irisiotlab.com",
  "https://iris-praktikum-jurnal.vercel.app",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
]);

function cors(req: Request): Record<string, string> {
  const asal = req.headers.get("origin");
  if (!asal || !ASAL.has(asal)) return {};
  return {
    "access-control-allow-origin": asal,
    "access-control-allow-methods": "GET, HEAD, PUT, OPTIONS",
    "access-control-allow-headers": "content-type, range, if-none-match",
    "access-control-expose-headers":
      "content-range, accept-ranges, content-length, etag, content-disposition",
    "access-control-max-age": "600",
    vary: "origin",
  };
}

function jawab(
  req: Request,
  status: number,
  body: string | null,
  h: Record<string, string> = {},
) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...cors(req),
      ...h,
    },
  });
}

function json(req: Request, status: number, isi: unknown) {
  return jawab(req, status, JSON.stringify(isi), {
    "content-type": "application/json",
  });
}

const PDF_AWAL = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** A name safe inside a Content-Disposition header. */
function namaAman(nama: string): string {
  return nama.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "berkas";
}

export async function tp(
  req: Request,
  env: EnvTp,
  jalan: string | undefined,
): Promise<Response> {
  if (req.method === "OPTIONS") return jawab(req, 204, null);
  if (!env.KONSOL_RELAY_SECRET || env.KONSOL_RELAY_SECRET.length < 32)
    return jawab(req, 503, "relay belum diatur");
  if (!env.TP) return jawab(req, 503, "penyimpanan belum diatur");
  const url = new URL(req.url);
  if (jalan === "unggah" && req.method === "PUT")
    return unggah(req, env, env.TP, url);
  if (jalan === "berkas" && (req.method === "GET" || req.method === "HEAD"))
    return baca(req, env, env.TP, url);
  if (jalan === "srv" && req.method === "POST") return srv(req, env, env.TP);
  return jawab(req, 404, "tidak ditemukan");
}

async function unggah(req: Request, env: EnvTp, b: R2Bucket, url: URL) {
  const t = await bacaTiketTp(
    url.searchParams.get("t") ?? "",
    env.KONSOL_RELAY_SECRET,
    "tp-put",
  );
  if (!t) return jawab(req, 403, "tiket ditolak");
  const panjang = Number(req.headers.get("content-length"));
  if (Number.isFinite(panjang) && panjang > 0 && panjang !== t.n)
    return jawab(req, 400, "ukuran salah");
  if (t.n > TP_BERKAS_MAKS) return jawab(req, 413, "terlalu besar");
  const isi = new Uint8Array(await req.arrayBuffer());
  if (isi.length !== t.n) return jawab(req, 400, "ukuran salah");
  if (!PDF_AWAL.every((c, i) => isi[i] === c))
    return jawab(req, 415, "bukan pdf");
  if ((await sha256Hex(isi)) !== t.s) return jawab(req, 400, "isi berubah");
  // The same bytes again (a retry) are already there.
  const ada = await b.head(t.k);
  if (!ada)
    await b.put(t.k, isi, {
      sha256: t.s,
      httpMetadata: { contentType: TP_MIME.pdf },
      customMetadata: { halaman: String(t.h) },
    });
  return json(req, 201, { ok: true, k: t.k });
}

async function baca(req: Request, env: EnvTp, b: R2Bucket, url: URL) {
  const t = await bacaTiketTp(
    url.searchParams.get("t") ?? "",
    env.KONSOL_RELAY_SECRET,
    "tp-baca",
  );
  if (!t) return jawab(req, 403, "tiket ditolak");
  const o = await b.get(t.k, { range: req.headers, onlyIf: req.headers });
  if (!o) return jawab(req, 404, "berkas hilang");
  const mime = Object.values(TP_MIME).includes(t.m) ? t.m : TP_MIME.bin;
  const aman = mime === TP_MIME.pdf || mime.startsWith("image/");
  const h: Record<string, string> = {
    "content-type": mime,
    "content-disposition": `${t.d === "u" || !aman ? "attachment" : "inline"}; filename="${namaAman(t.nm)}"`,
    "x-content-type-options": "nosniff",
    "cache-control": "private, max-age=600",
    "accept-ranges": "bytes",
    etag: o.httpEtag,
  };
  if (!aman) h["content-security-policy"] = "sandbox; default-src 'none'";
  // onlyIf failed (If-None-Match matched): no body.
  if (!("body" in o)) return jawab(req, 304, null, h);
  const r = (o as R2ObjectBody).range as
    { offset?: number; length?: number } | undefined;
  if (r && req.headers.has("range") && r.offset !== undefined) {
    const panjang = r.length ?? o.size - r.offset;
    h["content-range"] =
      `bytes ${r.offset}-${r.offset + panjang - 1}/${o.size}`;
    h["content-length"] = String(panjang);
    return new Response(
      req.method === "HEAD" ? null : (o as R2ObjectBody).body,
      {
        status: 206,
        headers: { ...cors(req), ...h },
      },
    );
  }
  h["content-length"] = String(o.size);
  return new Response(req.method === "HEAD" ? null : (o as R2ObjectBody).body, {
    status: 200,
    headers: { ...cors(req), ...h },
  });
}

async function srv(req: Request, env: EnvTp, b: R2Bucket) {
  const t = await bacaTiketTp(
    req.headers.get("x-tp-tiket") ?? "",
    env.KONSOL_RELAY_SECRET,
    "tp-srv",
  );
  if (!t) return jawab(req, 403, "tiket ditolak");
  switch (t.op) {
    case "head": {
      const o = await b.head(t.k);
      if (!o) return json(req, 200, { ada: false });
      return json(req, 200, {
        ada: true,
        ukuran: o.size,
        sha256: o.checksums.sha256
          ? [...new Uint8Array(o.checksums.sha256)]
              .map((x) => x.toString(16).padStart(2, "0"))
              .join("")
          : null,
        halaman: Number(o.customMetadata?.halaman) || null,
      });
    }
    case "get": {
      const o = await b.get(t.k);
      if (!o) return jawab(req, 404, "berkas hilang");
      return new Response(o.body, {
        headers: {
          "content-type": o.httpMetadata?.contentType ?? TP_MIME.bin,
          "content-length": String(o.size),
        },
      });
    }
    case "put": {
      const isi = new Uint8Array(await req.arrayBuffer());
      if (isi.length > TP_BERKAS_MAKS) return jawab(req, 413, "terlalu besar");
      if ((await sha256Hex(isi)) !== t.s) return jawab(req, 400, "isi berubah");
      const mime = req.headers.get("x-tp-mime") ?? TP_MIME.bin;
      await b.put(t.k, isi, {
        sha256: t.s,
        httpMetadata: {
          contentType: Object.values(TP_MIME).includes(mime)
            ? mime
            : TP_MIME.bin,
        },
        customMetadata: { halaman: req.headers.get("x-tp-halaman") ?? "" },
      });
      return json(req, 201, { ok: true });
    }
    case "hapus-awalan": {
      let n = 0;
      let cursor: string | undefined;
      do {
        const l = await b.list({ prefix: t.k, cursor, limit: 1000 });
        if (l.objects.length) await b.delete(l.objects.map((o) => o.key));
        n += l.objects.length;
        cursor = l.truncated ? l.cursor : undefined;
      } while (cursor);
      return json(req, 200, { ok: true, hapus: n });
    }
  }
  return jawab(req, 400, "op tidak dikenal");
}
