/**
 * Penerimaan, Jadikan Asisten and closing the edition (Open Recruitment R8).
 * Only the Ketua confirms the final list; everyone on the Panitia may read it.
 *
 * GET  /api/recruitment/pn-list      the CaAs who passed Mengajar, with every stage's score, a proposed code, and the closing state
 * POST /api/recruitment/pn-codes     { items: [{ id, code?, decision? }] }  save codes and who is accepted (Ketua)
 * POST /api/recruitment/pn-confirm   {}  Jadikan Asisten: new Asisten rows, the final envelopes, audited, idempotent (Ketua)
 * POST /api/recruitment/pn-close     { confirm: true }  close the edition by hand (Ketua)
 *
 * A confirmed list creates each new Asisten once (a second run makes nobody),
 * with no division, status aktif and their Praktikan history untouched, and
 * locks the Penerimaan results so the envelopes open at the announcement.
 * Once the edition is closed (by hand, or N days after the reveal) every
 * Panitia write is refused (guardTutup in the router); reads still work.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { SessionPayload } from "../../src/lib/auth.js";
import { writeAudit } from "../../src/lib/auth.js";
import { konteksLatihan } from "./recruitment-latihan-ctx.js";
import { pastikanHasil, perbaikiKode } from "./recruitment-latihan-contoh.js";
import { bebas } from "../../src/lib/recruitment/bebas.js";
import { getDb } from "../../src/lib/db.js";
import {
  ACCEPT_REASON,
  asisten,
  audit,
  praktikan,
  recAccount,
  recAcceptance,
  recCandidate,
  recEdition,
  recStageResult,
} from "../../src/lib/schema.js";
import { revealAtFor } from "../../src/lib/recruitment/cutting.js";
import {
  cekKode,
  normKode,
  simpanSampai,
  tutupOtomatis,
  usulKode,
} from "../../src/lib/recruitment/penerimaan.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatEvents, muatKolam, tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { namaKandidat } from "./recruitment-akun.js";
import { muatNilaiTahap } from "./recruitment-s4.js";
import { anggotaPanitia, muatPelaku, wajibHak } from "./recruitment-rights.js";
import { muatNilaiCutting } from "./recruitment-score.js";
import { bacaSetting } from "./recruitment-settings.js";

type H = (req: ApiRequest, res: ApiResponse, s: SessionPayload) => unknown;

interface PoolRow {
  id: number;
  nim: string;
  nama: string;
  kelas: string | null;
  berkas: number | null;
  /** Also on the Praktikan list (their history stays with them) */
  alsoPraktikan: boolean;
}

/** The CaAs who passed Mengajar: a locked Mengajar result that says Lolos. */
/**
 * The final list. Free mode (Mode Latihan): when nobody has passed Mengajar, every approved CaAs is given a
 * sample Lolos for it first, so Penerimaan always has a list to work on.
 */
async function muatKolamAkhir(db: Db, edisiId: number): Promise<PoolRow[]> {
  const hasil = await bacaKolamAkhir(db, edisiId);
  if (!bebas() || hasil.length > 0) return hasil;
  const calon = await db
    .select({ id: recCandidate.id })
    .from(recCandidate)
    .where(and(eq(recCandidate.editionId, edisiId), eq(recCandidate.status, "approved")));
  for (const c of calon) await pastikanHasil(db, c.id, "mengajar", "latihan");
  return bacaKolamAkhir(db, edisiId);
}

async function bacaKolamAkhir(db: Db, edisiId: number): Promise<PoolRow[]> {
  const rows = await db
    .select({
      id: recCandidate.id,
      nim: recCandidate.nim,
      nama: namaKandidat,
      bio: recCandidate.biodata,
      berkas: recCandidate.berkasScore,
      prak: praktikan.nim,
    })
    .from(recStageResult)
    .innerJoin(recCandidate, eq(recCandidate.id, recStageResult.candidateId))
    .leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))
    .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
    .where(
      and(
        eq(recCandidate.editionId, edisiId),
        eq(recStageResult.stage, "mengajar"),
        eq(recStageResult.locked, true),
        eq(recStageResult.proposal, "lolos"),
      ),
    );
  return rows
    .map((r) => ({
      id: r.id,
      nim: r.nim,
      nama: r.nama ?? r.nim,
      kelas: r.bio?.kelas ?? null,
      berkas: r.berkas,
      alsoPraktikan: r.prak !== null,
    }))
    .sort((a, b) => (a.nim < b.nim ? -1 : 1));
}

export interface TutupInfo {
  closed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  /** The day it closes by itself, once the final envelopes have a reveal time */
  closeAt: string | null;
  /** When the documents and answers are purged, once a closing day is known */
  keepUntil: string | null;
  closeDays: number;
  retentionMonths: number;
  /** Whether it closes by itself at closeAt */
  autoClose: boolean;
}

async function muatTutup(db: Db, edisiId: number, now: Date): Promise<TutupInfo> {
  const cfg = await bacaSetting(db, "penerimaan");
  const [e] = await db
    .select({ closedAt: recEdition.closedAt, closedBy: recEdition.closedBy })
    .from(recEdition)
    .where(eq(recEdition.id, edisiId))
    .limit(1);
  const [akhir] = await db
    .select({ at: recStageResult.revealAt })
    .from(recStageResult)
    .innerJoin(recCandidate, eq(recCandidate.id, recStageResult.candidateId))
    .where(
      and(
        eq(recCandidate.editionId, edisiId),
        eq(recStageResult.stage, "penerimaan"),
        eq(recStageResult.locked, true),
      ),
    )
    .limit(1);
  const auto = cfg.autoClose ? tutupOtomatis(akhir?.at ?? null, cfg.closeDays) : null;
  const tutup = e?.closedAt ?? (auto && auto <= now ? auto : null);
  const dasar = e?.closedAt ?? auto;
  return {
    closed: tutup !== null,
    closedAt: e?.closedAt?.toISOString() ?? null,
    closedBy: e?.closedBy ?? null,
    closeAt: auto?.toISOString() ?? null,
    keepUntil: dasar ? simpanSampai(dasar, cfg.retentionMonths).toISOString() : null,
    closeDays: cfg.closeDays,
    retentionMonths: cfg.retentionMonths,
    autoClose: cfg.autoClose,
  };
}

/** The runs of Jadikan Asisten, newest first: who pressed it, when, and what it did. */
async function muatRuns(db: Db) {
  const rows = await db
    .select({ at: audit.pada, by: audit.aktorNim, detail: audit.detail })
    .from(audit)
    .where(eq(audit.aksi, "rec_pn_konfirmasi"))
    .orderBy(desc(audit.pada))
    .limit(20);
  return rows.map((r) => {
    let d: { dibuat?: number; sudahAda?: number; tolak?: number } = {};
    try {
      d = JSON.parse(r.detail ?? "{}");
    } catch {
      /* an entry without detail still shows its time and who */
    }
    return {
      at: r.at.toISOString(),
      by: r.by,
      created: d.dibuat ?? 0,
      skipped: d.sudahAda ?? 0,
      rejected: d.tolak ?? 0,
    };
  });
}

/**
 * True (and the refusal sent) when the live edition is closed: every Panitia
 * write waits behind this in the router, except closing itself.
 */
export async function guardTutup(res: ApiResponse): Promise<boolean> {
  // Practice never closes: the Ketua tries Tutup Edisi there without ending the live one.
  if (konteksLatihan()) return false;
  const db = getDb();
  const [e] = await db
    .select({ id: recEdition.id })
    .from(recEdition)
    .where(eq(recEdition.status, "live"))
    .limit(1);
  if (!e) return false;
  const t = await muatTutup(db, e.id, new Date());
  if (!t.closed) return false;
  tolak(res, "edisi_ditutup", 423);
  return true;
}

/* ---------------------------------------------------------------- list */

async function handleList(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!anggotaPanitia(p)) return void tolak(res, "tanpa_hak", 403);
  const pool = await muatKolamAkhir(db, edisi.id);
  const ids = pool.map((r) => r.id);
  const acc = ids.length
    ? await db.select().from(recAcceptance).where(inArray(recAcceptance.candidateId, ids))
    : [];
  const kolam = await muatKolam(db);
  const dipakai = new Set(kolam.map((a) => a.kode));
  const tes = (await muatNilaiCutting(db, edisi.id)).byCandidate;
  const waw = new Map((await muatNilaiTahap(db, edisi.id, "wawancara")).map((x) => [x.id, x]));
  const meng = new Map((await muatNilaiTahap(db, edisi.id, "mengajar")).map((x) => [x.id, x]));
  const now = new Date();
  // Proposed codes avoid the Asisten's and each other's, in list order.
  const ambil = new Set(dipakai);
  for (const a of acc) if (a.code) ambil.add(a.code);
  const rows = pool.map((r) => {
    const a = acc.find((x) => x.candidateId === r.id) ?? null;
    const usul = a?.code ? null : usulKode(r.nama, ambil);
    if (usul) ambil.add(usul);
    return {
      id: r.id,
      nim: r.nim,
      nama: r.nama,
      kelas: r.kelas,
      alsoPraktikan: r.alsoPraktikan,
      scores: {
        berkas: r.berkas,
        tes: tes.get(r.id)?.total ?? null,
        wawancara: waw.get(r.id)?.mean != null ? Math.round(waw.get(r.id)!.mean!) : null,
        wawancaraVerdict: waw.get(r.id)?.verdict ?? null,
        mengajar: meng.get(r.id)?.mean != null ? Math.round(meng.get(r.id)!.mean!) : null,
        mengajarVerdict: meng.get(r.id)?.verdict ?? null,
      },
      code: a?.code ?? usul,
      proposedCode: a?.code ? null : usul,
      saved: !!a?.code,
      decision: a?.decision ?? "terima",
      reason: (a?.decision ?? "terima") === "tolak" ? (a?.reason ?? "Kuota") : null,
      promotedNim: a?.promotedNim ?? null,
    };
  });
  const [akhir] = ids.length
    ? await db
        .select({ at: recStageResult.revealAt, locked: recStageResult.locked })
        .from(recStageResult)
        .where(
          and(inArray(recStageResult.candidateId, ids), eq(recStageResult.stage, "penerimaan")),
        )
        .limit(1)
    : [];
  const cfg = await bacaSetting(db, "penerimaan");
  return void res.status(200).json({
    ok: true,
    rows,
    taken: [...dipakai],
    takenNames: kolam.map((a) => ({ kode: a.kode, nama: a.nama })),
    quota: cfg.quota,
    canConfirm: p?.penuh === true || p?.kursi?.division === "ketua",
    done: rows.length > 0 && rows.every((r) => r.decision === "tolak" || r.promotedNim !== null),
    locked: akhir?.locked === true,
    revealAt: akhir?.at?.toISOString() ?? null,
    revealed: !!akhir?.at && akhir.at <= now,
    close: await muatTutup(db, edisi.id, now),
    runs: await muatRuns(db),
  });
}

/* ---------------------------------------------------------------- codes */

async function handleCodes(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const items = Array.isArray(b.items) ? b.items : null;
  if (!items || !items.length || items.length > 300)
    return void tolak(res, "data_salah", 400, { field: "items" });
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "accept")) return;
  const kolamAkhir = await muatKolamAkhir(db, edisi.id);
  const pool = new Set(kolamAkhir.map((r) => r.id));
  const bersih: {
    id: number;
    code: string | null;
    decision?: "terima" | "tolak";
    reason?: (typeof ACCEPT_REASON)[number];
  }[] = [];
  for (const it of items) {
    const x = it as Record<string, unknown>;
    const id = Number(x.id);
    if (!Number.isInteger(id) || !pool.has(id)) return void tolak(res, "kandidat_tidak_ada", 404);
    const decision = x.decision === "terima" || x.decision === "tolak" ? x.decision : undefined;
    if (x.decision !== undefined && !decision)
      return void tolak(res, "data_salah", 400, { field: "decision" });
    const code = x.code === undefined || x.code === null || x.code === "" ? null : normKode(x.code);
    const reason = ACCEPT_REASON.find((r) => r === x.reason);
    if (x.reason !== undefined && x.reason !== null && !reason)
      return void tolak(res, "data_salah", 400, { field: "reason" });
    bersih.push({ id, code, decision, reason });
  }
  const ids = bersih.map((i) => i.id);
  const sudah = await db
    .select()
    .from(recAcceptance)
    .where(inArray(recAcceptance.candidateId, ids));
  // Free mode (Mode Latihan): the list can still be edited after Jadikan Asisten.
  if (sudah.some((a) => a.promotedNim) && !bebas()) return void tolak(res, "sudah_dijadikan", 409);
  const kolam = new Set((await muatKolam(db)).map((a) => a.kode));
  // The other rows' saved codes count as taken too.
  const lain = await db
    .select({ id: recAcceptance.candidateId, code: recAcceptance.code })
    .from(recAcceptance)
    .where(eq(recAcceptance.editionId, edisi.id));
  const dalam = new Set(ids);
  const ambil = new Set(kolam);
  for (const l of lain) if (l.code && !dalam.has(l.id)) ambil.add(l.code);
  const cek = cekKode(
    bersih.filter((i) => i.code !== null),
    ambil,
  );
  let masalah = cek.filter((c) => c.problem && c.problem !== "kosong");
  // Free mode: a code that is badly shaped, repeated or taken is swapped for a fresh one instead of refused.
  if (masalah.length && bebas()) {
    const nama = new Map(kolamAkhir.map((r) => [r.id, r.nama]));
    const fix = perbaikiKode(
      bersih
        .filter((i) => i.code !== null)
        .map((i) => ({ id: i.id, nama: nama.get(i.id) ?? "", code: i.code })),
      ambil,
    );
    for (const i of bersih) {
      const baru = fix.get(i.id);
      if (baru) i.code = baru;
    }
    masalah = [];
  }
  if (masalah.length) return void tolak(res, "kode_bermasalah", 409, { masalah });
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const i of bersih) {
      await tx
        .insert(recAcceptance)
        .values({
          candidateId: i.id,
          editionId: edisi.id,
          code: i.code,
          decision: i.decision ?? "terima",
          reason: i.decision === "tolak" ? (i.reason ?? "Kuota") : null,
          updatedBy: s.nim,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: recAcceptance.candidateId,
          set: {
            code: i.code,
            ...(i.decision
              ? {
                  decision: i.decision,
                  reason: i.decision === "tolak" ? (i.reason ?? "Kuota") : null,
                }
              : {}),
            updatedBy: s.nim,
            updatedAt: now,
          },
        });
    }
  });
  await writeAudit(s.nim, "rec_pn_kode", { n: bersih.length });
  return void res.status(200).json({ ok: true });
}

/* ---------------------------------------------------------------- confirm */

async function handleConfirm(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "accept")) return;
  const pool = await muatKolamAkhir(db, edisi.id);
  if (!pool.length) return void tolak(res, "tanpa_kandidat", 409);
  const ids = pool.map((r) => r.id);
  const acc = await db.select().from(recAcceptance).where(inArray(recAcceptance.candidateId, ids));
  const kolam = new Set((await muatKolam(db)).map((a) => a.kode));
  const ambil = new Set(kolam);
  for (const a of acc) if (a.code) ambil.add(a.code);
  // Every CaAs gets a decision and, when accepted, a code (the proposal when none was saved).
  const rencana = pool.map((r) => {
    const a = acc.find((x) => x.candidateId === r.id) ?? null;
    const code = a?.code ?? usulKode(r.nama, ambil);
    if (code) ambil.add(code);
    return { r, a, code, terima: (a?.decision ?? "terima") === "terima", sudah: !!a?.promotedNim };
  });
  const perlu = rencana.filter((x) => x.terima && !x.sudah);
  const cek = cekKode(
    perlu.map((x) => ({ id: x.r.id, code: x.code })),
    kolam,
  );
  let masalah = cek.filter((c) => c.problem);
  // Free mode: a bad, repeated or taken code is swapped for a fresh one instead of refused.
  if (masalah.length && bebas()) {
    const fix = perbaikiKode(
      perlu.map((x) => ({ id: x.r.id, nama: x.r.nama, code: x.code })),
      kolam,
    );
    for (const x of perlu) {
      const baru = fix.get(x.r.id);
      if (baru) x.code = baru;
    }
    masalah = [];
  }
  if (masalah.length) return void tolak(res, "kode_bermasalah", 409, { masalah });
  const events = await muatEvents(db, edisi.id);
  const now = new Date();
  const buka = revealAtFor(events, "penerimaan") ?? now;
  const dibuat: { nim: string; nama: string; kode: string }[] = [];
  const sudahAda: { nim: string; kode: string }[] = [];
  await db.transaction(async (tx) => {
    for (const x of rencana) {
      if (x.terima && !x.sudah) {
        const [ada] = await tx
          .select({ nim: asisten.nim, kode: asisten.kode })
          .from(asisten)
          .where(eq(asisten.nim, x.r.nim))
          .limit(1);
        if (ada) sudahAda.push({ nim: ada.nim, kode: ada.kode });
        // Practice never makes an Asisten: the code stays on the acceptance row only.
        else if (konteksLatihan()) sudahAda.push({ nim: x.r.nim, kode: x.code! });
        else {
          await tx.insert(asisten).values({
            nim: x.r.nim,
            nama: x.r.nama,
            kode: x.code!,
            divisi: null,
            divisiId: "Inti",
            divisiEn: "Core",
            badges: [],
            seelabsAkun: x.r.nim,
          });
          dibuat.push({ nim: x.r.nim, nama: x.r.nama, kode: x.code! });
        }
        await tx
          .insert(recAcceptance)
          .values({
            candidateId: x.r.id,
            editionId: edisi.id,
            code: ada ? ada.kode : x.code,
            decision: "terima",
            promotedNim: x.r.nim,
            promotedAt: now,
            promotedBy: s.nim,
            updatedBy: s.nim,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: recAcceptance.candidateId,
            set: {
              code: ada ? ada.kode : x.code,
              decision: "terima",
              promotedNim: x.r.nim,
              promotedAt: now,
              promotedBy: s.nim,
              updatedBy: s.nim,
              updatedAt: now,
            },
          });
      } else if (!x.terima) {
        await tx
          .insert(recAcceptance)
          .values({
            candidateId: x.r.id,
            editionId: edisi.id,
            code: null,
            decision: "tolak",
            updatedBy: s.nim,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: recAcceptance.candidateId,
            set: { decision: "tolak", code: null, updatedBy: s.nim, updatedAt: now },
          });
      }
      // The final envelope for everyone on the list: Lolos if accepted, Gagal if not.
      await tx
        .insert(recStageResult)
        .values({
          candidateId: x.r.id,
          stage: "penerimaan",
          proposal: x.terima ? "lolos" : "gagal",
          proposedBy: s.nim,
          locked: true,
          lockedBy: s.nim,
          lockedAt: now,
          revealAt: buka,
        })
        .onConflictDoUpdate({
          target: [recStageResult.candidateId, recStageResult.stage],
          set: {
            proposal: x.terima ? "lolos" : "gagal",
            proposedBy: s.nim,
            locked: true,
            lockedBy: s.nim,
            lockedAt: now,
            revealAt: buka,
          },
        });
    }
  });
  for (const d of dibuat) await writeAudit(s.nim, "rec_pn_asisten", { nim: d.nim, kode: d.kode });
  await writeAudit(s.nim, "rec_pn_konfirmasi", {
    dibuat: dibuat.length,
    sudahAda: sudahAda.length,
    tolak: rencana.filter((x) => !x.terima).length,
    revealAt: buka.toISOString(),
  });
  return void res.status(200).json({
    ok: true,
    created: dibuat,
    already: sudahAda,
    rejected: rencana.filter((x) => !x.terima).length,
    again: dibuat.length === 0 && sudahAda.length === 0,
    revealAt: buka.toISOString(),
  });
}

/* ---------------------------------------------------------------- close */

async function handleClose(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  if (b.confirm !== true) return void tolak(res, "perlu_konfirmasi", 400);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, "accept")) return;
  const now = new Date();
  const [e] = await db
    .select({ closedAt: recEdition.closedAt })
    .from(recEdition)
    .where(eq(recEdition.id, edisi.id))
    .limit(1);
  if (e?.closedAt) return void tolak(res, "sudah_ditutup", 409);
  await db
    .update(recEdition)
    .set({ closedAt: now, closedBy: s.nim })
    .where(eq(recEdition.id, edisi.id));
  await writeAudit(s.nim, "rec_edisi_tutup", { year: edisi.year });
  return void res.status(200).json({ ok: true, close: await muatTutup(db, edisi.id, now) });
}

/** GET pn-state: only whether the edition is closed and who may confirm, for the banner on every tab. */
async function handleState(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!anggotaPanitia(p)) return void tolak(res, "tanpa_hak", 403);
  return void res.status(200).json({
    ok: true,
    canConfirm: p?.penuh === true || p?.kursi?.division === "ketua",
    close: await muatTutup(db, edisi.id, new Date()),
  });
}

export const S5_GET: Record<string, H> = {
  "pn-list": handleList,
  "pn-state": handleState,
};
export const S5_POST: Record<string, H> = {
  "pn-codes": handleCodes,
  "pn-confirm": handleConfirm,
  "pn-close": handleClose,
};
