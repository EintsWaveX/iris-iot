import { beforeEach, describe, expect, it, vi } from "vitest";

const masuk: Record<string, unknown>[] = [];
const hapus: unknown[] = [];
vi.mock("../../../src/lib/db.js", () => ({
  getDb: () => ({
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        masuk.push(v);
      },
    }),
    delete: () => ({
      where: async (w: unknown) => {
        hapus.push(w);
      },
    }),
  }),
}));

import {
  hapusBerkas,
  idDariUrl,
  isiCocok,
  namaBersih,
  simpanBerkas,
  terimaUnggah,
  urlBerkasValid,
  urlBlobLama,
} from "../berkas.js";
import type { ApiRequest, ApiResponse } from "../http.js";

const ID = "AAAAAAAAAAAAAAAAAAAAAA";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]);
const PDF = Buffer.from("%PDF-1.7\n...");
const BLOB = "https://x.public.blob.vercel-storage.com";

beforeEach(() => {
  masuk.length = 0;
  hapus.length = 0;
});

describe("file addresses", () => {
  it("reads the id out of our address, with or without the name", () => {
    expect(idDariUrl(`/f/${ID}`)).toBe(ID);
    expect(idDariUrl(`/f/${ID}/foto%20a.webp`)).toBe(ID);
    expect(idDariUrl(`/f/${ID}?x=1`)).toBe(ID);
    expect(idDariUrl("/f/short/x")).toBeNull();
    expect(idDariUrl(`/g/${ID}/x`)).toBeNull();
    expect(idDariUrl(`https://evil.example/f/${ID}/x`)).toBeNull();
    expect(idDariUrl(null)).toBeNull();
  });

  it("accepts our address and, for the move, an old Blob address; nothing else", () => {
    expect(urlBerkasValid(`/f/${ID}/a.pdf`)).toBe(true);
    expect(urlBerkasValid(`${BLOB}/profil/a.webp`)).toBe(true);
    expect(urlBerkasValid("http://x.public.blob.vercel-storage.com/a")).toBe(false);
    expect(urlBerkasValid("https://evil.example/a.pdf")).toBe(false);
    expect(urlBerkasValid("javascript:alert(1)")).toBe(false);
    expect(urlBlobLama(`${BLOB}/a`)).toBe(true);
  });

  it("cleans a name: no path, no control characters, bounded", () => {
    expect(namaBersih("../../etc/passwd")).toBe("passwd");
    expect(namaBersih("C:\\Users\\x\\a.pdf")).toBe("a.pdf");
    expect(namaBersih('a"b<c>.pdf')).toBe("abc.pdf");
    expect(namaBersih("")).toBe("berkas");
    expect(namaBersih(42)).toBe("berkas");
    expect(namaBersih("x".repeat(500))).toHaveLength(120);
  });
});

describe("isiCocok: the first bytes must be what the type says", () => {
  it("accepts a real PNG, JPEG, WebP and PDF", () => {
    expect(isiCocok("image/png", PNG)).toBe(true);
    expect(isiCocok("image/jpeg", JPG)).toBe(true);
    expect(isiCocok("image/webp", WEBP)).toBe(true);
    expect(isiCocok("application/pdf", PDF)).toBe(true);
  });
  it("refuses a mismatch, an unknown type and a script dressed as an image", () => {
    expect(isiCocok("image/png", JPG)).toBe(false);
    expect(isiCocok("application/pdf", PNG)).toBe(false);
    expect(isiCocok("image/jpeg", Buffer.from("<script>alert(1)</script>"))).toBe(false);
    expect(isiCocok("text/html", Buffer.from("<h1>"))).toBe(false);
  });
});

describe("storing and deleting", () => {
  it("stores the bytes under a random 22-character id and returns the address", async () => {
    const a = await simpanBerkas({
      nama: "Slide é.pdf",
      tipe: "application/pdf",
      isi: PDF,
      pemilik: "n1",
    });
    const b = await simpanBerkas({ nama: "Slide é.pdf", tipe: "application/pdf", isi: PDF });
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a.id).not.toBe(b.id);
    expect(a.url).toBe(`/f/${a.id}/Slide%20%C3%A9.pdf`);
    expect(masuk[0]).toMatchObject({
      id: a.id,
      tipe: "application/pdf",
      ukuran: PDF.length,
      pemilik: "n1",
    });
    expect(masuk[1]).toMatchObject({ pemilik: null });
  });

  it("deletes only the addresses that are ours", async () => {
    await hapusBerkas([`${BLOB}/a`, null, "https://canva.com/x"], "t");
    expect(hapus).toHaveLength(0);
    await hapusBerkas([`/f/${ID}/a.pdf`, undefined], "t");
    expect(hapus).toHaveLength(1);
  });
});

function minta(over: { type?: string; body?: unknown; nama?: string; query?: string }) {
  const hasil: { status: number; json: unknown } = { status: 0, json: null };
  const req = {
    headers: {
      "content-type": over.type ?? "application/pdf",
      ...(over.nama ? { "x-nama": over.nama } : {}),
    },
    body: "body" in over ? over.body : PDF,
    query: over.query ? { nama: over.query } : {},
  } as unknown as ApiRequest;
  const res = {
    status(k: number) {
      hasil.status = k;
      return res;
    },
    json(j: unknown) {
      hasil.json = j;
    },
  } as unknown as ApiResponse;
  return { req, res, hasil };
}

describe("terimaUnggah", () => {
  const o = { tipe: ["application/pdf"], maks: 100, asal: "t" };

  it("stores a valid file and answers with its address and size", async () => {
    const { req, res, hasil } = minta({ nama: encodeURIComponent("Modul 1.pdf") });
    await terimaUnggah(req, res, "n1", o);
    expect(hasil.status).toBe(200);
    expect(hasil.json).toMatchObject({
      ok: true,
      nama: "Modul 1.pdf",
      tipe: "application/pdf",
      ukuran: PDF.length,
    });
    expect((hasil.json as { url: string }).url).toMatch(/^\/f\/[A-Za-z0-9_-]{22}\/Modul%201\.pdf$/);
    expect(masuk).toHaveLength(1);
  });

  it("takes the name from ?nama= when there is no header", async () => {
    const { req, res, hasil } = minta({ query: "dari-query.pdf" });
    await terimaUnggah(req, res, "n1", o);
    expect((hasil.json as { nama: string }).nama).toBe("dari-query.pdf");
  });

  it("refuses the wrong type (415), no bytes (400), too big (413) and a fake file (400)", async () => {
    const salah = minta({ type: "text/html" });
    await terimaUnggah(salah.req, salah.res, "n1", o);
    expect([salah.hasil.status, salah.hasil.json]).toEqual([
      415,
      { ok: false, kode: "tipe_salah" },
    ]);

    const kosong = minta({ body: Buffer.alloc(0) });
    await terimaUnggah(kosong.req, kosong.res, "n1", o);
    expect(kosong.hasil.status).toBe(400);
    const json = minta({ body: { a: 1 } });
    await terimaUnggah(json.req, json.res, "n1", o);
    expect(json.hasil.json).toEqual({ ok: false, kode: "kosong" });

    const besar = minta({ body: Buffer.concat([PDF, Buffer.alloc(200)]) });
    await terimaUnggah(besar.req, besar.res, "n1", o);
    expect(besar.hasil.status).toBe(413);

    const palsu = minta({ type: "application/pdf", body: Buffer.from("<html>not a pdf</html>") });
    await terimaUnggah(palsu.req, palsu.res, "n1", o);
    expect(palsu.hasil.json).toEqual({ ok: false, kode: "isi_tidak_cocok" });
    expect(masuk).toHaveLength(0);
  });
});
