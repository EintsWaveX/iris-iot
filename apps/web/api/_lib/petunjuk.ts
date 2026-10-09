/**
 * Hints on code blanks (2026-10-09). A group asks its Asisten for a hint on
 * one blank (Minta Petunjuk on the Code step), and an Asisten answers it or
 * sends a group a hint unasked from the Konsol's Blank tab. The written hint
 * that opens by itself after two wrong tries is not here: it is part of the
 * code version (Celah.bantuan) and comes with the group's draft.
 *
 * The Blank tab's read (handleBlank) is the only place outside `kunci` that
 * sends answers, and it checks the Asisten role first, like `kunci`.
 */
import { and, asc, eq, inArray, isNull, like } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { anggota, asisten, jawaban, kelompok, petunjukMinta } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { soalKode } from "../../src/lib/blanks.js";
import { teksUntuk } from "../../src/lib/kode-jurnal.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { celahKe, kanonik, kodeModul } from "./kode-aktif.js";

const MAKS_CATATAN = 160;
const MAKS_PETUNJUK = 400;
const SOAL = /^m(\d)\.([a-z0-9_]+)\.(\d+)$/;
const BLANK_LINE = /^(.*?)_{4,}(.*?)(?:\/\/|#)\s*\((\d+)\)\s*(.*)$/;

/** One hint request or hint, as the Code step and the Konsol show it. */
export interface MintaKeluar {
  id: number;
  berkas: string;
  nomor: number;
  catatan: string;
  /** When the group asked; null for a hint sent unasked. */
  diminta: string | null;
  oleh: string | null;
  teks: string | null;
  dari: string | null;
  dijawab: string | null;
}

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

/** Requests and hints for one group's blanks in the given sessions, oldest
 *  first. `prefix` narrows to one file (soalKodePrefix) or a module ("m3."). */
export async function daftarMinta(
  kelompokId: number,
  sesiIds: number[],
  prefix: string,
): Promise<MintaKeluar[]> {
  if (sesiIds.length === 0) return [];
  const rows = await getDb()
    .select()
    .from(petunjukMinta)
    .where(
      and(
        eq(petunjukMinta.kelompokId, kelompokId),
        inArray(petunjukMinta.sesiId, sesiIds),
        like(petunjukMinta.soalKode, `${prefix}%`),
        eq(petunjukMinta.batal, false),
      ),
    )
    .orderBy(asc(petunjukMinta.dimintaPada));
  const nama = await namaPendek([
    ...new Set(rows.flatMap((r) => [r.dimintaOleh, r.dijawabOleh]).filter((x): x is string => !!x)),
  ]);
  return rows.map((r) => {
    const m = SOAL.exec(r.soalKode);
    return {
      id: r.id,
      berkas: m?.[2] ?? "",
      nomor: Number(m?.[3] ?? 0),
      catatan: r.catatan,
      diminta: r.dimintaOleh ? r.dimintaPada.toISOString() : null,
      oleh: r.dimintaOleh ? (nama.get(r.dimintaOleh) ?? null) : null,
      teks: r.teks,
      dari: r.dijawabOleh ? (nama.get(r.dijawabOleh) ?? null) : null,
      dijawab: r.dijawabPada ? r.dijawabPada.toISOString() : null,
    };
  });
}

/* -------------------------------------------------------- the group asks */

export async function handleMinta(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const modul = Number(body.modul);
  const berkas = typeof body.berkas === "string" ? body.berkas : "";
  const nomor = Number(body.nomor);
  const catatan = typeof body.catatan === "string" ? body.catatan.trim() : "";
  const running = await currentSesi();
  const kelompokId = session.kelompokId;

  if (!running || running.modul !== modul || session.sesiId !== running.id || session.lihat) {
    res.status(200).json({ ok: false, kode: "riwayat_baca_saja" });
    return;
  }
  if (!kelompokId || catatan.length > MAKS_CATATAN || !/^[a-z0-9_]+$/.test(berkas)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (!celahKe(await kodeModul(modul), berkas, nomor)) {
    res.status(200).json({ ok: false, kode: "soal_tidak_ada" });
    return;
  }

  const db = getDb();
  const soal = soalKode(modul, berkas, nomor);
  const [sudah] = await db
    .select({ benar: jawaban.benar })
    .from(jawaban)
    .where(
      and(
        eq(jawaban.sesiId, running.id),
        eq(jawaban.kelompokId, kelompokId),
        eq(jawaban.soalKode, soal),
      ),
    )
    .limit(1);
  if (sudah?.benar) {
    res.status(200).json({ ok: false, kode: "sudah_benar" });
    return;
  }

  // One waiting request per blank: a second press keeps the first.
  const [buka] = await db
    .select({ id: petunjukMinta.id })
    .from(petunjukMinta)
    .where(
      and(
        eq(petunjukMinta.sesiId, running.id),
        eq(petunjukMinta.kelompokId, kelompokId),
        eq(petunjukMinta.soalKode, soal),
        eq(petunjukMinta.batal, false),
        isNull(petunjukMinta.teks),
      ),
    )
    .limit(1);
  if (buka) {
    res.status(200).json({ ok: true, id: buka.id });
    return;
  }
  const [row] = await db
    .insert(petunjukMinta)
    .values({ sesiId: running.id, kelompokId, soalKode: soal, catatan, dimintaOleh: session.nim })
    .returning({ id: petunjukMinta.id });
  res.status(200).json({ ok: true, id: row.id });
}

export async function handleMintaBatal(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const id = Number(jsonBody(req).id);
  if (!Number.isInteger(id) || !session.kelompokId) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  await getDb()
    .update(petunjukMinta)
    .set({ batal: true })
    .where(
      and(
        eq(petunjukMinta.id, id),
        eq(petunjukMinta.kelompokId, session.kelompokId),
        isNull(petunjukMinta.teks),
      ),
    );
  res.status(200).json({ ok: true });
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
  bantuan: string;
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
        bantuan: teksUntuk(c.bantuan, l),
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
    minta: await daftarMinta(g.id, [running.id], `m${running.modul}.`),
  });
}

/* ---------------------------------------------- the Asisten writes a hint */

export async function handlePetunjuk(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const kelompokId = Number(body.kelompok);
  const soal = typeof body.soal === "string" ? body.soal : "";
  const teks = typeof body.teks === "string" ? body.teks.trim() : "";
  const mintaId = body.minta === undefined || body.minta === null ? null : Number(body.minta);
  const m = SOAL.exec(soal);
  const running = await currentSesi();

  if (!running) {
    res.status(200).json({ ok: false, kode: "tidak_ada_sesi" });
    return;
  }
  if (
    !m ||
    Number(m[1]) !== running.modul ||
    !Number.isInteger(kelompokId) ||
    !teks ||
    teks.length > MAKS_PETUNJUK ||
    (mintaId !== null && !Number.isInteger(mintaId))
  ) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (!celahKe(await kodeModul(running.modul), m[2], Number(m[3]))) {
    res.status(200).json({ ok: false, kode: "soal_tidak_ada" });
    return;
  }

  const db = getDb();
  const sekarang = new Date();
  if (mintaId !== null) {
    const [row] = await db
      .update(petunjukMinta)
      .set({ teks, dijawabOleh: session.nim, dijawabPada: sekarang, batal: false })
      .where(
        and(
          eq(petunjukMinta.id, mintaId),
          eq(petunjukMinta.kelompokId, kelompokId),
          eq(petunjukMinta.sesiId, running.id),
        ),
      )
      .returning({ id: petunjukMinta.id });
    if (row) {
      res.status(200).json({ ok: true, id: row.id });
      return;
    }
  }
  const [row] = await db
    .insert(petunjukMinta)
    .values({
      sesiId: running.id,
      kelompokId,
      soalKode: soal,
      teks,
      dijawabOleh: session.nim,
      dijawabPada: sekarang,
    })
    .returning({ id: petunjukMinta.id });
  res.status(200).json({ ok: true, id: row.id });
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
 * every group against every blank, with the open hint requests, for the
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

  // Waiting requests (not answered, not withdrawn), oldest first.
  const minta = await db
    .select({
      kelompokId: petunjukMinta.kelompokId,
      soal: petunjukMinta.soalKode,
      catatan: petunjukMinta.catatan,
      pada: petunjukMinta.dimintaPada,
    })
    .from(petunjukMinta)
    .where(
      and(
        eq(petunjukMinta.sesiId, running.id),
        eq(petunjukMinta.batal, false),
        isNull(petunjukMinta.dijawabPada),
      ),
    )
    .orderBy(asc(petunjukMinta.dimintaPada));

  res.status(200).json({
    ok: true,
    modul: running.modul,
    berkas,
    sel,
    minta: minta.map((x) => ({
      kelompokId: x.kelompokId,
      soal: x.soal,
      catatan: x.catatan,
      pada: x.pada.toISOString(),
    })),
  });
}
