/**
 * Phase 9 Stage 7f, on /api/session/:aksi:
 *
 * GET  tangkapan?modul=N            Praktikan: their group's saved captures for module N.
 * GET  tangkapan?sesi=S[&kelompok=K] Asisten: one session's captures.
 * POST tangkapan { modul, jenis, baris } Praktikan in that module's running session.
 * POST cermin { baris: [{ sumber, teks, t }] } Praktikan in a running session.
 * GET  cermin?kelompok=K&sesudah=ID Asisten: the running session's mirrored lines.
 */
import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { anggota, jurnalTangkapan, kelompok, serialCermin } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { sesiDiikuti } from "./phase8.js";
import { statusRiwayat } from "../../src/lib/akses.js";

const BARIS_MAKS = { paket: 5, jarak: 3 } as const;
/** First key of the per-group lock that serialises capture saves. */
const KUNCI_TANGKAPAN = 7101;
const SUMBER = /^(b0|b1)$/;
const CERMIN_PER_PANGGIL = 60;
const CERMIN_SIMPAN = 600;

type Sel = string | number | boolean | null;

/** A capture row: up to 12 short keys, each a short string, a finite
 *  number, a boolean or null. Anything else rejects the whole save. */
export function barisValid(v: unknown): v is Record<string, Sel> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const e = Object.entries(v);
  if (e.length === 0 || e.length > 12) return false;
  return e.every(
    ([k, x]) =>
      /^[a-zA-Z]{1,16}$/.test(k) &&
      (x === null ||
        typeof x === "boolean" ||
        (typeof x === "number" && Number.isFinite(x)) ||
        (typeof x === "string" && x.length <= 40)),
  );
}

async function sesiPraktikan(res: ApiResponse, who: SessionPayload) {
  const running = await currentSesi();
  if (!running || who.sesiId !== running.id || !who.kelompokId || !who.kelompokNomor) {
    res.status(200).json({ ok: false, kode: "tidak_ada_sesi" });
    return null;
  }
  return running;
}

export async function handleTangkapanPost(req: ApiRequest, res: ApiResponse, who: SessionPayload) {
  const running = await sesiPraktikan(res, who);
  if (!running) return;
  const b = jsonBody(req);
  const modul = Number(b.modul);
  const jenis = b.jenis === "jarak" ? "jarak" : b.jenis === "paket" ? "paket" : null;
  const baris = Array.isArray(b.baris) ? b.baris : null;
  if (
    !jenis ||
    modul !== running.modul ||
    (jenis === "jarak" && modul !== 4) ||
    !baris ||
    baris.length === 0 ||
    baris.length > BARIS_MAKS[jenis] ||
    !baris.every(barisValid)
  ) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  // The same rows again from this group within a minute (a double click, or
  // two members saving one capture) keep the first save (2026-10-07). The
  // group's lock makes two saves at the same moment take turns.
  const row = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${KUNCI_TANGKAPAN}, ${who.kelompokId!})`);
    const [sama] = await tx
      .select({ id: jurnalTangkapan.id, dibuatPada: jurnalTangkapan.dibuatPada })
      .from(jurnalTangkapan)
      .where(
        and(
          eq(jurnalTangkapan.sesiId, running.id),
          eq(jurnalTangkapan.kelompokId, who.kelompokId!),
          eq(jurnalTangkapan.jenis, jenis),
          gt(jurnalTangkapan.dibuatPada, new Date(Date.now() - 60_000)),
          sql`${jurnalTangkapan.baris} = ${JSON.stringify(baris)}::jsonb`,
        ),
      )
      .limit(1);
    if (sama) return sama;
    const [baru] = await tx
      .insert(jurnalTangkapan)
      .values({
        sesiId: running.id,
        kelompokId: who.kelompokId!,
        modul,
        jenis,
        baris: baris as Record<string, Sel>[],
        nim: who.nim,
      })
      .returning({ id: jurnalTangkapan.id, dibuatPada: jurnalTangkapan.dibuatPada });
    return baru;
  });
  res.status(200).json({ ok: true, id: row.id, dibuatPada: row.dibuatPada });
}

export async function handleTangkapanGet(req: ApiRequest, res: ApiResponse, who: SessionPayload) {
  const db = getDb();
  const cols = {
    id: jurnalTangkapan.id,
    sesiId: jurnalTangkapan.sesiId,
    kelompokNomor: kelompok.nomor,
    modul: jurnalTangkapan.modul,
    jenis: jurnalTangkapan.jenis,
    baris: jurnalTangkapan.baris,
    nim: jurnalTangkapan.nim,
    dibuatPada: jurnalTangkapan.dibuatPada,
  };
  if (who.role === "praktikan") {
    const modul = Number(req.query.modul);
    if (!Number.isInteger(modul) || modul < 1 || modul > 4) {
      res.status(200).json({ ok: false, kode: "format_salah" });
      return;
    }
    // Part of the journal, so the same rule (akses.ts statusRiwayat): their
    // running session, else the module's history once it is open.
    if (!(await statusRiwayat(who)).jurnal.includes(modul)) {
      res.status(200).json({ ok: true, tangkapan: [], terkunci: true });
      return;
    }
    // Their group's captures from the sessions of this module they attended.
    // Rosters belong to the weekly slot, so the group stays the same.
    const [a] = await db
      .select({ kelompokId: anggota.kelompokId })
      .from(anggota)
      .where(eq(anggota.nim, who.nim))
      .limit(1);
    const kelompokId = who.kelompokId ?? a?.kelompokId ?? null;
    const ikut = (await sesiDiikuti(who.nim)).filter((x) => x.modul === modul).map((x) => x.id);
    if (!kelompokId || !ikut.length) {
      res.status(200).json({ ok: true, tangkapan: [] });
      return;
    }
    const rows = await db
      .select(cols)
      .from(jurnalTangkapan)
      .innerJoin(kelompok, eq(kelompok.id, jurnalTangkapan.kelompokId))
      .where(
        and(
          eq(jurnalTangkapan.kelompokId, kelompokId),
          eq(jurnalTangkapan.modul, modul),
          inArray(jurnalTangkapan.sesiId, ikut),
        ),
      )
      .orderBy(desc(jurnalTangkapan.id))
      .limit(50);
    res.status(200).json({ ok: true, tangkapan: rows });
    return;
  }
  const sesiId = Number(req.query.sesi);
  const k = req.query.kelompok === undefined ? null : Number(req.query.kelompok);
  if (!Number.isInteger(sesiId) || sesiId < 1 || (k !== null && !Number.isInteger(k))) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const rows = await db
    .select(cols)
    .from(jurnalTangkapan)
    .innerJoin(kelompok, eq(kelompok.id, jurnalTangkapan.kelompokId))
    .where(and(eq(jurnalTangkapan.sesiId, sesiId), k === null ? undefined : eq(kelompok.nomor, k)))
    .orderBy(desc(jurnalTangkapan.id))
    .limit(200);
  res.status(200).json({ ok: true, tangkapan: rows });
}

export async function handleCerminPost(req: ApiRequest, res: ApiResponse, who: SessionPayload) {
  const running = await sesiPraktikan(res, who);
  if (!running) return;
  const raw = jsonBody(req).baris;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > CERMIN_PER_PANGGIL) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const rows = [];
  for (const x of raw as Record<string, unknown>[]) {
    const sumber = typeof x?.sumber === "string" && SUMBER.test(x.sumber) ? x.sumber : null;
    const teks = typeof x?.teks === "string" ? x.teks.slice(0, 300) : "";
    const t = Number(x?.t);
    if (!sumber || !teks.trim() || !Number.isInteger(t) || t < 0 || t >= 86_400_000) continue;
    rows.push({ sesiId: running.id, kelompokNomor: who.kelompokNomor!, sumber, teks, t });
  }
  if (!rows.length) {
    res.status(200).json({ ok: true, diterima: 0 });
    return;
  }
  const db = getDb();
  const inserted = await db.insert(serialCermin).values(rows).returning({ id: serialCermin.id });
  // Keep each group's newest lines only; trimmed now and then, not every call.
  if (Math.random() < 0.15) {
    const batas = inserted[inserted.length - 1].id - CERMIN_SIMPAN;
    await db
      .delete(serialCermin)
      .where(
        and(
          eq(serialCermin.sesiId, running.id),
          eq(serialCermin.kelompokNomor, who.kelompokNomor!),
          lt(serialCermin.id, batas),
        ),
      );
  }
  res.status(200).json({ ok: true, diterima: rows.length });
}

export async function handleCerminGet(req: ApiRequest, res: ApiResponse) {
  const k = Number(req.query.kelompok);
  const sesudah = Number(req.query.sesudah ?? 0);
  if (!Number.isInteger(k) || k < 1 || !Number.isInteger(sesudah)) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const running = await currentSesi();
  if (!running) {
    res.status(200).json({ ok: true, baris: [] });
    return;
  }
  // The first call (sesudah 0) gets the newest lines; later calls page on.
  const rows = await getDb()
    .select({
      id: serialCermin.id,
      sumber: serialCermin.sumber,
      teks: serialCermin.teks,
      t: serialCermin.t,
    })
    .from(serialCermin)
    .where(
      and(
        eq(serialCermin.sesiId, running.id),
        eq(serialCermin.kelompokNomor, k),
        gt(serialCermin.id, sesudah),
      ),
    )
    .orderBy(sesudah > 0 ? asc(serialCermin.id) : desc(serialCermin.id))
    .limit(300);
  res.status(200).json({ ok: true, baris: sesudah > 0 ? rows : rows.reverse() });
}
