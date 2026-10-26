/**
 * Grading Live Coding (EXAM-ENGINE 9.8, 11.3 item 1). Graders are the room's
 * plotted pengawas, Akademik and the Ketua. Each seat needs two sheets from
 * two different people; a grader sees who else sheeted a seat and when, never
 * their values, until Finalkan (13 opens that for the bank right).
 *
 * GET  lc-room?id=       the seats of a room with topic, protocol, last compile and flash, and who has sheeted
 * GET  lc-rubric?seat=   the rubric, my sheet and the others' names
 * POST lc-grade          { seatId, values, note }
 * POST lc-grade-withdraw { seatId }
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, noStore } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  recCandidate,
  recExamRoom,
  recExamSeat,
  recLcTopic,
  recLivecode,
  recRubricScore,
  recSlotExaminer,
  type RecExamRoomRow,
} from "../../src/lib/schema.js";
import {
  canSubmit,
  peerView,
  runTerakhir,
  validateSheet,
  type StoredSheet,
} from "../../src/lib/recruitment/lc-grade.js";
import type { GradeRoom, GradeSeat, RubricView } from "../../src/lib/recruitment/lc-api.js";
import type { Protocol } from "../../src/lib/recruitment/exam-types.js";
import { tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { muatPelaku, type PelakuServer } from "./recruitment-rights.js";
import { namaKandidat } from "./recruitment-akun.js";
import { nomorKursi } from "./recruitment-lc-common.js";
import { muatRubrik, semaiKolam } from "./recruitment-lc-pool.js";
import { denganKunciNilai, nilaiBeku } from "./recruitment-score.js";
import { recAccount, praktikan } from "../../src/lib/schema.js";

const NOTE_MAX = 1000;

async function bolehMenilai(
  db: Db,
  room: RecExamRoomRow,
  p: PelakuServer | null,
  nim: string,
): Promise<boolean> {
  if (!p) return false;
  if (p.penuh || p.hak.bank) return true;
  if (room.slotId === null) return false;
  const [r] = await db
    .select({ n: recSlotExaminer.asistenNim })
    .from(recSlotExaminer)
    .where(
      and(
        eq(recSlotExaminer.slotId, room.slotId),
        eq(recSlotExaminer.asistenNim, nim),
        eq(recSlotExaminer.role, "pengawas"),
      ),
    )
    .limit(1);
  return !!r;
}

async function ruangDinilai(
  db: Db,
  edisiId: number,
  id: number,
  p: PelakuServer | null,
  nim: string,
): Promise<RecExamRoomRow | null> {
  const [room] = await db
    .select()
    .from(recExamRoom)
    .where(and(eq(recExamRoom.id, id), eq(recExamRoom.editionId, edisiId)))
    .limit(1);
  if (!room) return null;
  return (await bolehMenilai(db, room, p, nim)) ? room : null;
}

/** Grading opens when the Live Coding timer starts. */
const terbuka = (room: RecExamRoomRow): boolean => !!room.state.runs.livecode;

async function lembar(db: Db, rubricId: number, seatIds: number[]) {
  if (!seatIds.length) return [];
  return db
    .select({
      subjectId: recRubricScore.subjectId,
      grader: recRubricScore.graderNim,
      name: asisten.nama,
      values: recRubricScore.values,
      note: recRubricScore.note,
      at: recRubricScore.at,
    })
    .from(recRubricScore)
    .leftJoin(asisten, eq(asisten.nim, recRubricScore.graderNim))
    .where(and(eq(recRubricScore.rubricId, rubricId), inArray(recRubricScore.subjectId, seatIds)))
    .orderBy(asc(recRubricScore.at));
}

const sheetDari = (r: Awaited<ReturnType<typeof lembar>>[number]): StoredSheet => ({
  grader: r.grader,
  name: r.name ?? r.grader,
  at: r.at.getTime(),
  values: r.values,
  note: r.note,
});

export async function aksiNilai(
  req: ApiRequest,
  res: ApiResponse,
  s: SessionPayload,
  aksi: string,
) {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  noStore(res);
  const p = await muatPelaku(db, edisi.id, s.nim);
  await semaiKolam(db, edisi.id);
  const rubrik = await muatRubrik(db, edisi.id);

  if (aksi === "lc-room") {
    const room = await ruangDinilai(db, edisi.id, Number(req.query.id), p, s.nim);
    if (!room) return void tolak(res, "tanpa_hak", 403);
    const seats = await db.select().from(recExamSeat).where(eq(recExamSeat.roomId, room.id));
    const ids = seats.map((x) => x.id);
    const [lcs, sheets, nomor, kand] = await Promise.all([
      ids.length ? db.select().from(recLivecode).where(inArray(recLivecode.seatId, ids)) : [],
      lembar(db, rubrik.id, ids),
      nomorKursi(db, room),
      ids.length
        ? db
            .select({ id: recCandidate.id, nama: namaKandidat })
            .from(recCandidate)
            .leftJoin(recAccount, eq(recAccount.nim, recCandidate.nim))
            .leftJoin(praktikan, eq(praktikan.nim, recCandidate.nim))
            .where(
              inArray(
                recCandidate.id,
                seats.map((x) => x.candidateId),
              ),
            )
        : [],
    ]);
    const topikIds = [...new Set(lcs.map((l) => l.topicId).filter((x): x is number => !!x))];
    const topik = topikIds.length
      ? await db.select().from(recLcTopic).where(inArray(recLcTopic.id, topikIds))
      : [];
    const rows: GradeSeat[] = seats
      .map((x): GradeSeat => {
        const lc = lcs.find((l) => l.seatId === x.id);
        const runs = lc?.runs ?? [];
        const mine = sheets.filter((h) => h.subjectId === x.id);
        return {
          seatId: x.id,
          no: nomor.get(x.id) ?? 0,
          nama: kand.find((k) => k.id === x.candidateId)?.nama ?? "",
          topic: topik.find((t) => t.id === lc?.topicId)?.title ?? null,
          protocol: (lc?.protocol as Protocol | null) ?? null,
          lastCompile: runTerakhir(runs, "compile"),
          lastFlash: runTerakhir(runs, "flash"),
          sheets: mine.map((h) => ({
            grader: h.grader,
            name: h.name ?? h.grader,
            at: h.at.getTime(),
          })),
          mine: mine.some((h) => h.grader === s.nim),
        };
      })
      .sort((a, b) => a.no - b.no);
    const out: GradeRoom & { ok: true } = {
      ok: true,
      roomId: room.id,
      title: room.title,
      seats: rows,
      open: terbuka(room),
      me: { nim: s.nim },
    };
    return void res.status(200).json(out);
  }

  const b = req.method === "GET" ? {} : jsonBody(req);
  const seatId = Number(req.method === "GET" ? req.query.seat : b.seatId);
  if (!Number.isInteger(seatId)) return void tolak(res, "data_salah", 400, { field: "seat" });
  const [seat] = await db
    .select()
    .from(recExamSeat)
    .where(and(eq(recExamSeat.id, seatId), eq(recExamSeat.editionId, edisi.id)))
    .limit(1);
  const [room = null] = seat
    ? await db.select().from(recExamRoom).where(eq(recExamRoom.id, seat.roomId)).limit(1)
    : [];
  if (!seat || !room) return void tolak(res, "tidak_ditemukan", 404);
  if (!(await bolehMenilai(db, room, p, s.nim))) return void tolak(res, "tanpa_hak", 403);

  const semua = (await lembar(db, rubrik.id, [seatId])).map(sheetDari);

  if (aksi === "lc-rubric") {
    const [lc = null] = await db
      .select()
      .from(recLivecode)
      .where(eq(recLivecode.seatId, seatId))
      .limit(1);
    const [t = null] = lc?.topicId
      ? await db.select().from(recLcTopic).where(eq(recLcTopic.id, lc.topicId)).limit(1)
      : [];
    const v = peerView(semua, s.nim, false);
    const out: RubricView & { ok: true } = {
      ok: true,
      rows: rubrik.rows,
      seatId,
      mine: v.mine,
      others: v.others,
      open: terbuka(room),
      topic: t
        ? { id: t.id, title: t.title, brief: t.brief, parts: t.parts, icon: t.icon, hints: t.hints }
        : null,
    };
    return void res.status(200).json(out);
  }

  if (!terbuka(room)) return void tolak(res, "belum_dibuka", 409);

  if (aksi === "lc-grade") {
    const values =
      b.values && typeof b.values === "object" ? (b.values as Record<string, number>) : null;
    if (!values) return void tolak(res, "data_salah", 400, { field: "values" });
    const salah = validateSheet(rubrik, values);
    if (salah.length) return void tolak(res, "nilai_salah", 400, { galat: salah });
    const note = typeof b.note === "string" ? b.note.slice(0, NOTE_MAX) : "";
    // Finalkan froze the sheets with the scores: nothing is added, changed or taken back until it is opened.
    // The freeze is read under the score lock, and the sheets are read again under it.
    const hasil = await denganKunciNilai(db, edisi.id, async (tx) => {
      if (await nilaiBeku(tx, edisi.id)) return { kode: "nilai_final", mine: undefined };
      const boleh = canSubmit((await lembar(tx, rubrik.id, [seatId])).map(sheetDari), s.nim);
      if (!boleh.ok) return { kode: boleh.kode, mine: undefined };
      await tx
        .insert(recRubricScore)
        .values({ rubricId: rubrik.id, subjectId: seatId, graderNim: s.nim, values, note })
        .onConflictDoUpdate({
          target: [recRubricScore.rubricId, recRubricScore.subjectId, recRubricScore.graderNim],
          set: { values, note, updatedAt: new Date() },
        });
      return { mine: (await lembar(tx, rubrik.id, [seatId])).filter((h) => h.grader === s.nim)[0] };
    });
    if (hasil.kode) return void tolak(res, hasil.kode, 409);
    await writeAudit(s.nim, "rec_lc_nilai", { seatId, room: room.id });
    return void res
      .status(200)
      .json({ ok: true, sheet: hasil.mine ? sheetDari(hasil.mine) : null });
  }

  if (aksi === "lc-grade-withdraw") {
    const beku = await denganKunciNilai(db, edisi.id, async (tx) => {
      if (await nilaiBeku(tx, edisi.id)) return true;
      await tx
        .delete(recRubricScore)
        .where(
          and(
            eq(recRubricScore.rubricId, rubrik.id),
            eq(recRubricScore.subjectId, seatId),
            eq(recRubricScore.graderNim, s.nim),
          ),
        );
      return false;
    });
    if (beku) return void tolak(res, "nilai_final", 409);
    await writeAudit(s.nim, "rec_lc_nilai_tarik", { seatId, room: room.id });
    return void res.status(200).json({ ok: true });
  }

  tolak(res, "aksi_tidak_dikenal", 404);
}
