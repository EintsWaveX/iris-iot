/**
 * Rollback for the Oprec panel (5 Nov 2026), for testing and quick fixes of a
 * slip. The Ketua, Akademik and Admin seats (and hakPenuh) hold it: the
 * cuttingLock right for Cutting and CaAs, the accept right for Penerimaan.
 *
 * A candidate's standing is derived from their stage results (standing.ts),
 * so rolling a stage back edits those rows and deletes what hung off the
 * stages after it: results, slot picks, attendance, sheets, makeups, exam
 * seats, Tubes teams, the acceptance. Every cascading action takes
 * `preview: true` (counts only, nothing written) and, to run, a typed
 * `confirm` (the stage key, or the CaAs's NIM). Each runs in one transaction
 * and audits what it did. Practice is scoped by wajibEdisi like every route.
 *
 *   POST cut-unlock-force   { stage, confirm, preview? }   unlock a stage, even after its reveal
 *   POST cut-clear          { stage, confirm }             empty the proposals of an unlocked stage
 *   POST envelope-reset     { stage, candidateId? }        seal an opened envelope again
 *   POST pn-undo            { confirm, preview?, force? }  Batalkan Jadikan Asisten
 *   POST pn-reopen          { confirm: true }              Buka Kembali Edisi
 *   POST candidate-reinstate{ id }                         a withdrawn CaAs back in
 *   POST candidate-reset    { id, toStage, confirm, preview? }  one CaAs back to a stage
 */
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  audit,
  jabatanPemegang,
  recAcceptance,
  recAttendance,
  recCandidate,
  recCommittee,
  recEdition,
  recEvent,
  recExamRoom,
  recExamSeat,
  recKitLoan,
  recMakeup,
  recScoreFreeze,
  recSeatNote,
  recSheet,
  recSheetShared,
  recSlotAssignment,
  recSlotChange,
  recSlotExaminer,
  recStageResult,
  recTeam,
  recTeamMember,
} from "../../src/lib/schema.js";
import {
  CUT_STAGES,
  STAGES,
  type CutStage,
  type RecRights,
  type StageKey,
} from "../../src/lib/recruitment/types.js";
import {
  HITUNGAN_KOSONG,
  asistenBelumDipakai,
  konfirmasiCocok,
  tahapMulai,
  tahapSesudah,
  type Blokir,
  type HitunganRollback,
} from "../../src/lib/recruitment/rollback.js";
import { tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { muatPelaku, wajibHak } from "./recruitment-rights.js";
import { konteksLatihan } from "./recruitment-latihan-ctx.js";
import { muatTutup } from "./recruitment-s5.js";
import { bacaSetting, tulisSetting } from "./recruitment-settings.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Q = Db | Tx;

const N = sql<number>`count(*)::int`;
const hitung = async (q: Promise<{ n: number }[]>): Promise<number> => (await q)[0]?.n ?? 0;
/** `col in (…)`, and false for an empty list instead of an error. */
const dalam = (col: Parameters<typeof inArray>[0], nilai: readonly (string | number)[]) =>
  nilai.length ? inArray(col, nilai as never[]) : sql`false`;

const tahapCut = (v: unknown): CutStage | null =>
  typeof v === "string" && (CUT_STAGES as readonly string[]).includes(v) ? (v as CutStage) : null;
const tahapApa = (v: unknown): StageKey | null =>
  typeof v === "string" && (STAGES as readonly string[]).includes(v) ? (v as StageKey) : null;

/** The edition, the actor's rights and the JSON body, or the refusal already sent and null. */
async function awal(req: ApiRequest, res: ApiResponse, s: SessionPayload, hak: keyof RecRights) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return null;
  const p = await muatPelaku(db, edisi.id, s.nim);
  if (!wajibHak(res, p, hak)) return null;
  return { db, edisi, b: jsonBody(req) };
}

const idKandidat = async (q: Q, edisiId: number): Promise<number[]> =>
  (
    await q
      .select({ id: recCandidate.id })
      .from(recCandidate)
      .where(eq(recCandidate.editionId, edisiId))
  ).map((r) => r.id);

/* ------------------------------------------------------- the cascade */

interface Rencana {
  counts: HitunganRollback;
  blokir: Blokir[];
  /** Deletes everything counted; call it inside the transaction, and only with no blokir */
  jalankan: (tx: Tx) => Promise<void>;
}

const ruangBerjalan = (st: { stage?: string; runs?: Record<string, unknown> }): boolean =>
  st.stage === "parts" ||
  st.stage === "spin" ||
  st.stage === "finished" ||
  Object.keys(st.runs ?? {}).length > 0;

/**
 * What it takes to put `ids` back before the stages after them. `hasilDari`
 * are the stages whose result rows go; `peranDari` the stages whose
 * participation goes (picks, attendance, sheets, makeups, the exam seat, the
 * Tubes team, the acceptance). `edisiPenuh` is a whole-stage rollback, which
 * also lifts the Tes Tulis score freeze.
 */
async function rencanakan(
  q: Q,
  edisiId: number,
  ids: number[],
  hasilDari: readonly StageKey[],
  peranDari: readonly StageKey[],
  edisiPenuh: boolean,
): Promise<Rencana> {
  const c: HitunganRollback = { ...HITUNGAN_KOSONG };
  const blokir: Blokir[] = [];
  const langkah: ((tx: Tx) => Promise<void>)[] = [];
  if (!ids.length) return { counts: c, blokir, jalankan: async () => {} };

  // Results.
  const hasil = and(
    inArray(recStageResult.candidateId, ids),
    dalam(recStageResult.stage, hasilDari),
  );
  c.results = await hitung(q.select({ n: N }).from(recStageResult).where(hasil));
  c.opened = await hitung(
    q
      .select({ n: N })
      .from(recStageResult)
      .where(and(hasil, isNotNull(recStageResult.openedAt))),
  );
  langkah.push(async (tx) => void (await tx.delete(recStageResult).where(hasil)));

  if (peranDari.length) {
    // Slot picks and change requests.
    const pick = and(
      inArray(recSlotAssignment.candidateId, ids),
      dalam(recSlotAssignment.stage, peranDari),
    );
    c.picks = await hitung(q.select({ n: N }).from(recSlotAssignment).where(pick));
    langkah.push(async (tx) => void (await tx.delete(recSlotAssignment).where(pick)));
    const minta = and(
      inArray(recSlotChange.candidateId, ids),
      dalam(recSlotChange.stage, peranDari),
    );
    c.pickRequests = await hitung(q.select({ n: N }).from(recSlotChange).where(minta));
    langkah.push(async (tx) => void (await tx.delete(recSlotChange).where(minta)));

    // Attendance at events of those stages.
    const acara = q
      .select({ id: recEvent.id })
      .from(recEvent)
      .where(and(eq(recEvent.editionId, edisiId), dalam(recEvent.stage, peranDari)));
    const hadir = and(
      inArray(recAttendance.candidateId, ids),
      inArray(recAttendance.eventId, acara),
    );
    // A test scan (via "uji") is never real attendance, so it is not counted; it goes with the rest.
    c.attendance = await hitung(
      q
        .select({ n: N })
        .from(recAttendance)
        .where(and(hadir, ne(recAttendance.via, "uji"))),
    );
    langkah.push(async (tx) => void (await tx.delete(recAttendance).where(hadir)));

    // Interview and teaching sheets, makeups.
    const lembar = and(inArray(recSheet.candidateId, ids), dalam(recSheet.stage, peranDari));
    const bersama = and(
      inArray(recSheetShared.candidateId, ids),
      dalam(recSheetShared.stage, peranDari),
    );
    c.sheets =
      (await hitung(q.select({ n: N }).from(recSheet).where(lembar))) +
      (await hitung(q.select({ n: N }).from(recSheetShared).where(bersama)));
    langkah.push(async (tx) => {
      await tx.delete(recSheet).where(lembar);
      await tx.delete(recSheetShared).where(bersama);
    });
    const susulan = and(inArray(recMakeup.candidateId, ids), dalam(recMakeup.stage, peranDari));
    c.makeups = await hitung(q.select({ n: N }).from(recMakeup).where(susulan));
    langkah.push(async (tx) => void (await tx.delete(recMakeup).where(susulan)));
  }

  // The written test: seats (answers, strikes and Live Coding go with them), kit loans, notes.
  if (peranDari.includes("tes_tulis")) {
    const kursi = and(
      eq(recExamSeat.editionId, edisiId),
      inArray(recExamSeat.candidateId, ids),
      eq(recExamSeat.rehearsal, false),
    );
    const baris = await q.select({ room: recExamSeat.roomId }).from(recExamSeat).where(kursi);
    c.examSeats = baris.length;
    const ruangIds = [...new Set(baris.map((b) => b.room).filter((r): r is number => r !== null))];
    if (ruangIds.length) {
      const ruang = await q
        .select({ id: recExamRoom.id, state: recExamRoom.state, rehearsal: recExamRoom.rehearsal })
        .from(recExamRoom)
        .where(inArray(recExamRoom.id, ruangIds));
      const berjalan = ruang.filter((r) => !r.rehearsal && ruangBerjalan(r.state as never));
      if (berjalan.length) blokir.push({ kode: "ruang_sudah_dipakai", n: berjalan.length });
      const ruangNyata = ruang.filter((r) => !r.rehearsal).map((r) => r.id);
      if (ruangNyata.length) {
        const pinjam = and(
          inArray(recKitLoan.candidateId, ids),
          inArray(recKitLoan.roomId, ruangNyata),
        );
        c.kitLoans = await hitung(q.select({ n: N }).from(recKitLoan).where(pinjam));
        langkah.push(async (tx) => void (await tx.delete(recKitLoan).where(pinjam)));
        const catat = and(
          inArray(recSeatNote.candidateId, ids),
          inArray(recSeatNote.roomId, ruangNyata),
        );
        c.seatNotes = await hitung(q.select({ n: N }).from(recSeatNote).where(catat));
        langkah.push(async (tx) => void (await tx.delete(recSeatNote).where(catat)));
      }
    }
    langkah.push(async (tx) => void (await tx.delete(recExamSeat).where(kursi)));
    if (edisiPenuh) {
      const beku = and(
        eq(recScoreFreeze.editionId, edisiId),
        eq(recScoreFreeze.stage, "tes_tulis"),
      );
      c.freezes = await hitung(q.select({ n: N }).from(recScoreFreeze).where(beku));
      langkah.push(async (tx) => void (await tx.delete(recScoreFreeze).where(beku)));
    }
  }

  // Tubes teams: a member leaves; a team with nobody left (or led by someone going, alone) goes.
  if (peranDari.includes("tubes")) {
    const ada = new Set(ids);
    const tim = await q
      .select({ id: recTeam.id, pemimpin: recTeam.leaderId })
      .from(recTeam)
      .where(eq(recTeam.editionId, edisiId));
    const anggota = tim.length
      ? await q
          .select({ tim: recTeamMember.teamId, cid: recTeamMember.candidateId })
          .from(recTeamMember)
          .where(
            inArray(
              recTeamMember.teamId,
              tim.map((t) => t.id),
            ),
          )
      : [];
    const hapusTim: number[] = [];
    let pemimpinTertahan = 0;
    for (const t of tim) {
      const dia = anggota.filter((a) => a.tim === t.id);
      const masuk = dia.filter((a) => ada.has(a.cid));
      const keluar = dia.filter((a) => !ada.has(a.cid));
      if (!masuk.length && !ada.has(t.pemimpin)) continue;
      if (!keluar.length) {
        hapusTim.push(t.id);
        c.teams += 1;
        c.teamMembers += dia.length;
      } else if (ada.has(t.pemimpin)) {
        pemimpinTertahan += 1;
      } else {
        c.teamMembers += masuk.length;
      }
    }
    if (pemimpinTertahan) blokir.push({ kode: "pemimpin_tim", n: pemimpinTertahan });
    langkah.push(async (tx) => {
      if (hapusTim.length) await tx.delete(recTeam).where(inArray(recTeam.id, hapusTim));
      await tx.delete(recTeamMember).where(inArray(recTeamMember.candidateId, ids));
    });
  }

  // The acceptance: it cannot go once the CaAs was made an Asisten (Batalkan Jadikan Asisten first).
  if (peranDari.includes("penerimaan") || hasilDari.includes("penerimaan")) {
    const terima = inArray(recAcceptance.candidateId, ids);
    c.acceptance = await hitung(q.select({ n: N }).from(recAcceptance).where(terima));
    const dijadikan = await hitung(
      q
        .select({ n: N })
        .from(recAcceptance)
        .where(and(terima, isNotNull(recAcceptance.promotedNim))),
    );
    if (dijadikan) blokir.push({ kode: "sudah_dijadikan", n: dijadikan });
    langkah.push(async (tx) => void (await tx.delete(recAcceptance).where(terima)));
  }

  return {
    counts: c,
    blokir,
    jalankan: async (tx) => {
      for (const l of langkah) await l(tx);
    },
  };
}

const ringkas = (c: HitunganRollback) =>
  Object.fromEntries(Object.entries(c).filter(([, v]) => v > 0));

/* ---------------------------------------------------------- Cutting */

/** POST cut-unlock-force { stage, confirm, preview? }: unlock a locked stage at any time. */
export async function handleBukaPaksa(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const a = await awal(req, res, s, "cuttingLock");
  if (!a) return;
  const { db, edisi, b } = a;
  const stage = tahapCut(b.stage);
  if (!stage) return void tolak(res, "data_salah", 400, { field: "stage" });
  // Penerimaan made Asisten rows: that one has its own undo.
  if (stage === "penerimaan") return void tolak(res, "pakai_pn_undo", 409);
  const semua = await idKandidat(db, edisi.id);
  const kunci = semua.length
    ? await db
        .select({
          id: recStageResult.id,
          cid: recStageResult.candidateId,
          buka: recStageResult.openedAt,
        })
        .from(recStageResult)
        .where(
          and(
            inArray(recStageResult.candidateId, semua),
            eq(recStageResult.stage, stage),
            eq(recStageResult.locked, true),
          ),
        )
    : [];
  if (!kunci.length) return void tolak(res, "belum_dikunci", 409);
  const ids = kunci.map((r) => r.cid);
  const rencana = await rencanakan(
    db,
    edisi.id,
    ids,
    tahapSesudah(stage),
    tahapSesudah(stage),
    true,
  );
  rencana.counts.opened += kunci.filter((r) => r.buka).length;
  if (b.preview === true)
    return void res.status(200).json({
      ok: true,
      preview: true,
      stage,
      locked: kunci.length,
      counts: rencana.counts,
      blocked: rencana.blokir,
    });
  if (!konfirmasiCocok(b.confirm, stage)) return void tolak(res, "perlu_konfirmasi", 400);
  if (rencana.blokir.length) return void tolak(res, "terblokir", 409, { blocked: rencana.blokir });
  await db.transaction(async (tx) => {
    await rencana.jalankan(tx);
    await tx
      .update(recStageResult)
      .set({ locked: false, lockedBy: null, lockedAt: null, revealAt: null, openedAt: null })
      .where(
        inArray(
          recStageResult.id,
          kunci.map((r) => r.id),
        ),
      );
  });
  await writeAudit(s.nim, "rec_rollback_buka", {
    stage,
    n: kunci.length,
    counts: ringkas(rencana.counts),
  });
  res.status(200).json({ ok: true, stage, unlocked: kunci.length, counts: rencana.counts });
}

/** POST cut-clear { stage, confirm }: empty every proposal of a stage that is not locked. */
export async function handleKosongkan(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const a = await awal(req, res, s, "cuttingLock");
  if (!a) return;
  const { db, edisi, b } = a;
  const stage = tahapCut(b.stage);
  if (!stage) return void tolak(res, "data_salah", 400, { field: "stage" });
  if (!konfirmasiCocok(b.confirm, stage)) return void tolak(res, "perlu_konfirmasi", 400);
  const semua = await idKandidat(db, edisi.id);
  const di = semua.length
    ? await db
        .select({
          id: recStageResult.id,
          locked: recStageResult.locked,
          p: recStageResult.proposal,
        })
        .from(recStageResult)
        .where(and(inArray(recStageResult.candidateId, semua), eq(recStageResult.stage, stage)))
    : [];
  if (di.some((r) => r.locked)) return void tolak(res, "terkunci", 409);
  const isi = di.filter((r) => r.p !== null);
  if (isi.length)
    await db
      .update(recStageResult)
      .set({ proposal: null, proposedBy: null, note: null })
      .where(
        inArray(
          recStageResult.id,
          isi.map((r) => r.id),
        ),
      );
  await writeAudit(s.nim, "rec_rollback_kosong", { stage, n: isi.length });
  res.status(200).json({ ok: true, stage, cleared: isi.length });
}

/** POST envelope-reset { stage, candidateId? }: seal opened envelopes again, one CaAs or the whole stage. */
export async function handleResetAmplop(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const a = await awal(req, res, s, "cuttingLock");
  if (!a) return;
  const { db, edisi, b } = a;
  const stage = tahapCut(b.stage);
  if (!stage) return void tolak(res, "data_salah", 400, { field: "stage" });
  let ids = await idKandidat(db, edisi.id);
  if (b.candidateId !== undefined) {
    const id = Number(b.candidateId);
    if (!Number.isInteger(id) || !ids.includes(id)) return void tolak(res, "tidak_ditemukan", 404);
    ids = [id];
  }
  const buka = ids.length
    ? await db
        .update(recStageResult)
        .set({ openedAt: null })
        .where(
          and(
            inArray(recStageResult.candidateId, ids),
            eq(recStageResult.stage, stage),
            isNotNull(recStageResult.openedAt),
          ),
        )
        .returning({ id: recStageResult.id })
    : [];
  await writeAudit(s.nim, "rec_rollback_amplop", {
    stage,
    candidateId: b.candidateId ?? null,
    n: buka.length,
  });
  res.status(200).json({ ok: true, stage, sealed: buka.length });
}

/* ------------------------------------------------------ Penerimaan */

/** POST pn-undo { confirm, preview?, force? }: Batalkan Jadikan Asisten. */
export async function handleBatalAsisten(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const a = await awal(req, res, s, "accept");
  if (!a) return;
  const { db, edisi, b } = a;
  const semua = await idKandidat(db, edisi.id);
  const dijadikan = semua.length
    ? await db
        .select({ cid: recAcceptance.candidateId, nim: recAcceptance.promotedNim })
        .from(recAcceptance)
        .where(and(inArray(recAcceptance.candidateId, semua), isNotNull(recAcceptance.promotedNim)))
    : [];
  const akhir = semua.length
    ? await db
        .select({ id: recStageResult.id, buka: recStageResult.openedAt })
        .from(recStageResult)
        .where(
          and(inArray(recStageResult.candidateId, semua), eq(recStageResult.stage, "penerimaan")),
        )
    : [];
  if (!dijadikan.length && !akhir.length) return void tolak(res, "belum_dijadikan", 409);
  const terbuka = akhir.filter((r) => r.buka).length;

  // Which Asisten may go: made by Jadikan Asisten (its audit line), never used, and nothing hangs off them.
  const nims = dijadikan.map((d) => d.nim!).filter(Boolean);
  const dibuatOleh = new Set<string>();
  if (nims.length && !konteksLatihan()) {
    const baris = await db
      .select({ detail: audit.detail })
      .from(audit)
      .where(eq(audit.aksi, "rec_pn_asisten"));
    for (const r of baris)
      try {
        const nim = (JSON.parse(r.detail ?? "{}") as { nim?: string }).nim;
        if (nim) dibuatOleh.add(nim);
      } catch {
        /* a line without detail names nobody */
      }
  }
  const hapus: string[] = [];
  const simpan: { nim: string; alasan: string }[] = [];
  for (const nim of nims) {
    if (konteksLatihan() || !dibuatOleh.has(nim)) {
      simpan.push({ nim, alasan: konteksLatihan() ? "latihan" : "sudah_ada_sebelumnya" });
      continue;
    }
    const [r] = await db.select().from(asisten).where(eq(asisten.nim, nim)).limit(1);
    if (!r) continue;
    const dipakai =
      !asistenBelumDipakai(r) ||
      (await hitung(
        db.select({ n: N }).from(jabatanPemegang).where(eq(jabatanPemegang.nim, nim)),
      )) > 0 ||
      (await hitung(
        db.select({ n: N }).from(recCommittee).where(eq(recCommittee.asistenNim, nim)),
      )) > 0 ||
      (await hitung(
        db.select({ n: N }).from(recSlotExaminer).where(eq(recSlotExaminer.asistenNim, nim)),
      )) > 0;
    if (dipakai) simpan.push({ nim, alasan: "sudah_dipakai" });
    else hapus.push(nim);
  }

  const ringkasan = {
    promoted: dijadikan.length,
    asistenDeleted: hapus.length,
    asistenKept: simpan,
    results: akhir.length,
    opened: terbuka,
  };
  if (b.preview === true)
    return void res.status(200).json({ ok: true, preview: true, ...ringkasan });
  if (!konfirmasiCocok(b.confirm, "penerimaan")) return void tolak(res, "perlu_konfirmasi", 400);
  if (terbuka && b.force !== true)
    return void tolak(res, "amplop_sudah_dibuka", 409, { opened: terbuka });
  await db.transaction(async (tx) => {
    if (hapus.length) await tx.delete(asisten).where(inArray(asisten.nim, hapus));
    await tx
      .update(recAcceptance)
      .set({
        promotedNim: null,
        promotedAt: null,
        promotedBy: null,
        updatedBy: s.nim,
        updatedAt: new Date(),
      })
      .where(and(inArray(recAcceptance.candidateId, semua), isNotNull(recAcceptance.promotedNim)));
    if (akhir.length)
      await tx.delete(recStageResult).where(
        inArray(
          recStageResult.id,
          akhir.map((r) => r.id),
        ),
      );
  });
  await writeAudit(s.nim, "rec_rollback_pn", ringkasan);
  res.status(200).json({ ok: true, ...ringkasan });
}

/** POST pn-reopen { confirm: true }: Buka Kembali Edisi. Exempt from the closed-edition guard. */
export async function handleBukaEdisi(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const a = await awal(req, res, s, "accept");
  if (!a) return;
  const { db, edisi, b } = a;
  if (b.confirm !== true) return void tolak(res, "perlu_konfirmasi", 400);
  const now = new Date();
  const t = await muatTutup(db, edisi.id, now);
  if (!t.closed) return void tolak(res, "belum_ditutup", 409);
  // A close by the clock would shut it again at once: turn automatic closing off as well.
  const otomatis = t.autoClose && t.closeAt !== null && new Date(t.closeAt) <= now;
  const cfg = await bacaSetting(db, "penerimaan");
  await db.transaction(async (tx) => {
    await tx
      .update(recEdition)
      .set({ closedAt: null, closedBy: null })
      .where(eq(recEdition.id, edisi.id));
    if (otomatis) await tulisSetting(tx, "penerimaan", { ...cfg, autoClose: false }, s.nim);
  });
  await writeAudit(s.nim, "rec_rollback_buka_edisi", {
    year: edisi.year,
    wasClosedBy: t.closedBy,
    autoCloseOff: otomatis,
  });
  res
    .status(200)
    .json({ ok: true, close: await muatTutup(db, edisi.id, now), autoCloseOff: otomatis });
}

/* ------------------------------------------------------- Candidates */

/** POST candidate-reinstate { id }: a withdrawn CaAs back in, where they were. */
export async function handlePulihkan(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const a = await awal(req, res, s, "cuttingLock");
  if (!a) return;
  const { db, edisi, b } = a;
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return void tolak(res, "data_salah", 400, { field: "id" });
  const [k] = await db
    .select({ id: recCandidate.id, nim: recCandidate.nim, status: recCandidate.status })
    .from(recCandidate)
    .where(and(eq(recCandidate.id, id), eq(recCandidate.editionId, edisi.id)))
    .limit(1);
  if (!k) return void tolak(res, "tidak_ditemukan", 404);
  if (k.status !== "withdrawn") return void tolak(res, "status_salah", 409);
  // One who already holds a locked result was approved on the way; the rest wait for review again.
  const sudahMaju = await hitung(
    db
      .select({ n: N })
      .from(recStageResult)
      .where(and(eq(recStageResult.candidateId, k.id), eq(recStageResult.locked, true))),
  );
  const status = sudahMaju > 0 ? "approved" : "applied";
  await db.update(recCandidate).set({ status }).where(eq(recCandidate.id, k.id));
  await writeAudit(s.nim, "rec_rollback_pulihkan", { id: k.id, nim: k.nim, status });
  res.status(200).json({ ok: true, status });
}

/** POST candidate-reset { id, toStage, confirm, preview? }: one CaAs back to a stage, without its outcome. */
export async function handleResetKandidat(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const a = await awal(req, res, s, "cuttingLock");
  if (!a) return;
  const { db, edisi, b } = a;
  const id = Number(b.id);
  const tahap = tahapApa(b.toStage);
  if (!Number.isInteger(id) || id <= 0) return void tolak(res, "data_salah", 400, { field: "id" });
  if (!tahap) return void tolak(res, "data_salah", 400, { field: "toStage" });
  const [k] = await db
    .select({ id: recCandidate.id, nim: recCandidate.nim })
    .from(recCandidate)
    .where(and(eq(recCandidate.id, id), eq(recCandidate.editionId, edisi.id)))
    .limit(1);
  if (!k) return void tolak(res, "tidak_ditemukan", 404);
  // Their outcome at `tahap` and everything after it goes; what they did AT `tahap` stays.
  const rencana = await rencanakan(
    db,
    edisi.id,
    [k.id],
    tahapMulai(tahap),
    tahapSesudah(tahap),
    false,
  );
  if (b.preview === true)
    return void res.status(200).json({
      ok: true,
      preview: true,
      nim: k.nim,
      toStage: tahap,
      counts: rencana.counts,
      blocked: rencana.blokir,
    });
  if (!konfirmasiCocok(b.confirm, k.nim)) return void tolak(res, "perlu_konfirmasi", 400);
  if (rencana.blokir.length) return void tolak(res, "terblokir", 409, { blocked: rencana.blokir });
  await db.transaction(async (tx) => rencana.jalankan(tx));
  await writeAudit(s.nim, "rec_rollback_kandidat", {
    id: k.id,
    nim: k.nim,
    toStage: tahap,
    counts: ringkas(rencana.counts),
  });
  res.status(200).json({ ok: true, toStage: tahap, counts: rencana.counts });
}

export const ROLLBACK_POST: Record<
  string,
  (req: ApiRequest, res: ApiResponse, s: SessionPayload) => Promise<void>
> = {
  "cut-unlock-force": handleBukaPaksa,
  "cut-clear": handleKosongkan,
  "envelope-reset": handleResetAmplop,
  "pn-undo": handleBatalAsisten,
  "pn-reopen": handleBukaEdisi,
  "candidate-reinstate": handlePulihkan,
  "candidate-reset": handleResetKandidat,
};
