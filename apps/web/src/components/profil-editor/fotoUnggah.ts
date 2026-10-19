/**
 * A Lab Profile photo goes up in two sizes the browser makes itself: long
 * edge 1600 and 480, WebP where the browser can write it (JPEG otherwise),
 * each uploaded straight to Vercel Blob through the /api/profil/unggah
 * handshake. Nothing larger than FOTO_MAKS_MASUK is read at all.
 */
import { upload } from "@vercel/blob/client";
import {
  FOTO_MAKS_MASUK,
  FOTO_SISI_BESAR,
  FOTO_SISI_KECIL,
  FOTO_TIPE_MASUK,
  type Foto,
} from "../../lib/profil";

export type GagalFoto = "terlaluBesar" | "bukanFoto" | "gagalUnggah";

export class FotoGagal extends Error {
  constructor(readonly kode: GagalFoto) {
    super(kode);
  }
}

/** The photo drawn at most `sisi` px on its long edge. */
async function perkecil(bmp: ImageBitmap, sisi: number): Promise<Blob> {
  const k = Math.min(1, sisi / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new FotoGagal("gagalUnggah");
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, w, h);
  const ke = (tipe: string) =>
    new Promise<Blob | null>((ok) => c.toBlob(ok, tipe, tipe === "image/webp" ? 0.82 : 0.86));
  const webp = await ke("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpg = await ke("image/jpeg");
  if (!jpg) throw new FotoGagal("gagalUnggah");
  return jpg;
}

/** Checks, shrinks and uploads one picked file. */
export async function unggahFoto(file: File, nama: string): Promise<Foto> {
  if (!FOTO_TIPE_MASUK.includes(file.type)) throw new FotoGagal("bukanFoto");
  if (file.size > FOTO_MAKS_MASUK) throw new FotoGagal("terlaluBesar");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new FotoGagal("bukanFoto");
  }
  try {
    const [besar, kecil] = await Promise.all([
      perkecil(bmp, FOTO_SISI_BESAR),
      perkecil(bmp, FOTO_SISI_KECIL),
    ]);
    const ext = besar.type === "image/webp" ? "webp" : "jpg";
    const dasar = nama.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "foto";
    const [b, k] = await Promise.all([
      upload(`profil/${dasar}.${ext}`, besar, {
        access: "public",
        handleUploadUrl: "/api/profil/unggah",
        contentType: besar.type,
      }),
      upload(`profil/${dasar}-kecil.${ext}`, kecil, {
        access: "public",
        handleUploadUrl: "/api/profil/unggah",
        contentType: kecil.type,
      }),
    ]);
    return { besar: b.url, kecil: k.url };
  } catch (err) {
    if (err instanceof FotoGagal) throw err;
    throw new FotoGagal("gagalUnggah");
  } finally {
    bmp.close();
  }
}
