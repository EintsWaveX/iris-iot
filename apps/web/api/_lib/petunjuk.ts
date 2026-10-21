/**
 * The Konsol's reads of the blanks (2026-10-21). The Asisten and the
 * Praktikan talk face to face in the room, so there is no hint request and no
 * hint written to a group here any more: the hint a group sees comes from
 * the code version itself (Celah.bantuan, opened by its wrong tries) and
 * arrives with its draft.
 *
 * The Blank tab's read (handleBlank) is the only place outside `kunci` that
 * sends answers, and it checks the Asisten role first, like `kunci`.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { anggota, asisten, jawaban, kelompok } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { soalKode } from "../../src/lib/blanks.js";
import { teksUntuk } from "../../src/lib/kode-jurnal.js";
import { bantuanUntuk, kanonik, kodeModul } from "./kode-aktif.js";

const SOAL = /^m(\d)\.([a-z0-9_]+)\.(\d+)$/;
const BLANK_LINE = /^(.*?)_{4,}(.*?)(?:\/\/|#)\s*\((\d+)\)\s*(.*)$/;

function lang(v: unknown): "id" | "en" | "zh" {
  const x = Array.isArray(v) ? v[0] : v;
  return x === "en" || x === "zh" ? x : "id";
}

/** First names for Praktikan, codes for Asisten. */
async function namaPendek(nims: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (nims.length === 0) return out;
  const db = getDb();
  const [ang, as] = await Promise.all([
    db
      .select({ nim: anggota.nim, nama: anggota.nama })
      .from(anggota)
      .where(inArray(anggota.nim, nims)),
    db
      .select({ nim: asisten.nim, nama: asisten.nama, kode: asisten.kode })
      .from(asisten)
      .where(inArray(asisten.nim, nims)),
  ]);
  for (const a of ang) out.set(a.nim, a.nama.split(" ")[0]);
  for (const a of as) out.set(a.nim, a.kode ? a.kode.toUpperCase() : a.nama.split(" ")[0]);
  return out;
}

/* ------------------------------------------------- the Konsol's Blank tab */

/** One blank of one group, for the Asisten. */
export interface BlankAsisten {
  nomor: number;
  /** 1-based line in the Praktikan file of the reader's language. */
  baris: number;
  /** The line's code before the comment, the blank as ________. */
  kode: string;
  petunjuk: string;
  kunci: string;
  juga: string[];
  kenapa: string;
  /** The hint the group has open (bantuanKe 1 to 3), or the first one
   *  while none is (bantuanKe 0). */
  bantuan: string;
  bantuanKe: number;
  isi: string;
  benar: boolean;
  percobaan: number;
  salah: number;
  oleh: string | null;
  pada: string | null;
}

/** Where each blank sits in a Praktikan file: its line and code. */
function letakBlank(
  templat: string,
): Map<number, { baris: number; kode: string; petunjuk: string }> {
  const out = new Map<number, { baris: number; kode: string; petunjuk: string }>();
  templat.split("\n").forEach((line, i) => {
    const m = BLANK_LINE.exec(line);
    if (!m) return;
    const komentar = line.search(/\s*(\/\/|#)\s*\(\d+\)/);
    out.set(Number(m[3]), {
      baris: i + 1,
      kode: (komentar === -1 ? line : line.slice(0, komentar)).trimEnd(),
      petunjuk: m[4].trim(),
    });
  });
  return out;
}

export async function handleBlank(req: ApiRequest, res: ApiResponse) {
  const kelompokId = Number(
    Array.isArray(req.query.kelompok) ? req.query.kelompok[0] : req.query.kelompok,
  );
  const l = lang(req.query.lang);
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: false, kode: "tidak_ada_sesi" });
    return;
  }
  const db = getDb();
  const [g] = Number.isInteger(kelompokId)
    ? await db
        .select({ id: kelompok.id, nomor: kelompok.nomor })
        .from(kelompok)
        .where(eq(kelompok.id, kelompokId))
        .limit(1)
    : [];
  if (!g) {
    res.status(200).json({ ok: false, kode: "kelompok_tidak_diketahui" });
    return;
  }

  const kode = await kodeModul(running.modul);
  const rows = await db
    .select({
      soalKode: jawaban.soalKode,
      isi: jawaban.isi,
      benar: jawaban.benar,
      percobaan: jawaban.percobaan,
      salah: jawaban.salah,
      oleh: jawaban.diubahOleh,
      pada: jawaban.diubahPada,
    })
    .from(jawaban)
    .where(
      and(
        eq(jawaban.sesiId, running.id),
        eq(jawaban.kelompokId, g.id),
        like(jawaban.soalKode, `m${running.modul}.%`),
      ),
    );
  const per = new Map(rows.map((r) => [r.soalKode, r]));
  const nama = await namaPendek([
    ...new Set(rows.map((r) => r.oleh).filter((x): x is string => !!x)),
  ]);
  const bahasa = l === "id" ? "id" : "en";

  const berkas = [...kode.berkas.values()].map((b) => {
    const letak = letakBlank(b.templat[bahasa]);
    const blank: BlankAsisten[] = b.urut.map((c) => {
      const r = per.get(soalKode(running.modul, b.berkas.slug, c.nomor));
      const at = letak.get(c.nomor);
      return {
        nomor: c.nomor,
        baris: at?.baris ?? 0,
        kode: at?.kode ?? "",
        petunjuk: at?.petunjuk ?? teksUntuk(c.petunjuk, bahasa),
        kunci: kanonik(kode, b.berkas.slug, c.nomor, g.nomor) ?? c.jawaban,
        juga: c.juga,
        kenapa: teksUntuk(c.kenapa, l),
        ...(() => {
          const buka = r?.benar
            ? null
            : bantuanUntuk(kode, b.berkas.slug, c.nomor, l, r?.salah ?? 0, g.nomor);
          return buka
            ? { bantuan: buka.teks, bantuanKe: buka.tingkat }
            : { bantuan: teksUntuk(c.bantuan1, l), bantuanKe: 0 };
        })(),
        isi: r?.isi ?? "",
        benar: r?.benar ?? false,
        percobaan: r?.percobaan ?? 0,
        salah: r?.salah ?? 0,
        oleh: r?.oleh ? (nama.get(r.oleh) ?? null) : null,
        pada: r ? r.pada.toISOString() : null,
      };
    });
    return { slug: b.berkas.slug, path: b.berkas.path, blank };
  });

  res.status(200).json({
    ok: true,
    modul: running.modul,
    kelompok: g,
    berkas,
  });
}

/* ------------------------------------------ every group, every blank */

/** One cell of the Blank Matrix: a group's answer to one blank. */
export interface SelMatriks {
  isi: string;
  benar: boolean;
  percobaan: number;
  salah: number;
  oleh: string | null;
  /** Who filled it, by NIM (first names can repeat in a group). */
  olehNim: string | null;
  pada: string | null;
  /** This group's key (Module 4 files differ per group). */
  kunci: string;
}

/**
 * GET /api/modul/matriks (Phase 10, mockup c12-run): the running session's
 * every group against every blank, for the
 * Konsol's Blank Matrix, its group rail and its room feed. Asisten only,
 * like `blank`: keys are in it, the page shows them behind a switch.
 */
export async function handleMatriks(req: ApiRequest, res: ApiResponse) {
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: false, kode: "tidak_ada_sesi" });
    return;
  }
  const l = lang(req.query.lang);
  const bahasa = l === "id" ? "id" : "en";
  const db = getDb();
  const kode = await kodeModul(running.modul);
  const rows = await db
    .select({
      kelompokId: jawaban.kelompokId,
      soalKode: jawaban.soalKode,
      isi: jawaban.isi,
      benar: jawaban.benar,
      percobaan: jawaban.percobaan,
      salah: jawaban.salah,
      oleh: jawaban.diubahOleh,
      pada: jawaban.diubahPada,
    })
    .from(jawaban)
    .where(and(eq(jawaban.sesiId, running.id), like(jawaban.soalKode, `m${running.modul}.%`)));
  const ids = [...new Set(rows.map((r) => r.kelompokId))];
  const grup = ids.length
    ? await db
        .select({ id: kelompok.id, nomor: kelompok.nomor })
        .from(kelompok)
        .where(inArray(kelompok.id, ids))
    : [];
  const nomorOf = new Map(grup.map((g) => [g.id, g.nomor]));
  const nama = await namaPendek([
    ...new Set(rows.map((r) => r.oleh).filter((x): x is string => !!x)),
  ]);

  const berkas = [...kode.berkas.values()].map((b) => {
    const letak = letakBlank(b.templat[bahasa]);
    return {
      slug: b.berkas.slug,
      path: b.berkas.path,
      blank: b.urut.map((c) => ({
        nomor: c.nomor,
        soal: soalKode(running.modul, b.berkas.slug, c.nomor),
        baris: letak.get(c.nomor)?.baris ?? 0,
        kode: letak.get(c.nomor)?.kode ?? "",
      })),
    };
  });

  const sel: Record<string, Record<string, SelMatriks>> = {};
  for (const r of rows) {
    const m = SOAL.exec(r.soalKode);
    const nomor = nomorOf.get(r.kelompokId) ?? 0;
    const b = m ? kode.berkas.get(m[2]) : undefined;
    const c = b?.urut.find((x) => x.nomor === Number(m?.[3]));
    (sel[r.kelompokId] ??= {})[r.soalKode] = {
      isi: r.isi,
      benar: r.benar,
      percobaan: r.percobaan,
      salah: r.salah ?? 0,
      oleh: r.oleh ? (nama.get(r.oleh) ?? null) : null,
      olehNim: r.oleh,
      pada: r.pada.toISOString(),
      kunci: (m && kanonik(kode, m[2], Number(m[3]), nomor)) ?? c?.jawaban ?? "",
    };
  }

  res.status(200).json({
    ok: true,
    modul: running.modul,
    berkas,
    sel,
  });
}
