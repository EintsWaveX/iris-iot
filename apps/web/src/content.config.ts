import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * One entry per module per language (src/content/modules/{id,en}/{1..4}.json),
 * the parallel id/en layout the practicum journals themselves use. The data
 * here is curated from jurnal/{id,en}/*.typ and kode_praktikum/{id,en}/* in
 * the practicum repo (Downloads/IRIS ASO), which stays the source of truth --
 * this collection is a web-facing copy, not a generator, so a real change to
 * a module's hardware, pins or procedure has to be applied here by hand too.
 */
const modules = defineCollection({
  loader: glob({ pattern: "*/*.json", base: "./src/content/modules" }),
  schema: z.object({
    modul: z.number().int().min(1).max(4),
    bahasa: z.enum(["id", "en"]),
    judul: z.string(),
    topik: z.string(),
    ringkasan: z.array(z.string()),
    permainan: z.array(z.string()).optional(),
    toolchain: z.array(
      z.object({
        label: z.string(),
        alat: z.string(),
      }),
    ),
    perangkat: z.array(
      z.object({
        nama: z.string(),
        jumlah: z.string(),
      }),
    ),
    skema: z.string(),
    pin: z.object({
      judul: z.string(),
      kolom: z.array(z.string()),
      baris: z.array(z.array(z.string())),
      catatan: z.array(z.string()),
    }),
    persiapan: z.array(z.string()),
    berkas: z.array(
      z.object({
        path: z.string(),
        judul: z.string(),
        bahasaKode: z.enum(["cpp", "python"]),
      }),
    ),
    ladder: z.object({
      jalur: z.number().int().min(2).max(3),
    }),
    lapisan: z.array(
      z.object({
        nama: z.string(),
        nilai: z.string(),
      }),
    ),
  }),
});

export const collections = { modules };
