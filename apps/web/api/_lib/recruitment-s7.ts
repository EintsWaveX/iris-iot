/**
 * Tubes, the CaAs's side and what the Panitia's side shares (Open Recruitment
 * R5). The rules are in src/lib/recruitment/tubes.ts; the answers' shapes in
 * tubes-api.ts. The Panitia's board and writes are in recruitment-s7-panel.ts.
 *
 * A CaAs works in a team (never alone):
 *   GET  tubes                the CaAs's team, invites, evenings, topic and submission
 *   POST tubes-team-make      start a team (the leader)
 *   POST tubes-team-name      { name }
 *   POST tubes-invite         { nim }          the leader asks another CaAs
 *   POST tubes-invite-cancel  { candidateId }  take an invite back
 *   POST tubes-answer         { teamId, accept }  a CaAs answers an invite
 *   POST tubes-leave          a member leaves
 *   POST tubes-kick           { candidateId }  the leader removes a member
 *   POST tubes-disband        the leader ends the team
 *   POST tubes-session-pick   { sessionId | null }  the leader picks the lab evening
 *   POST tubes-file-ticket    { part, name, size, sha256 }  where to PUT one file
 *   POST tubes-file-save      { part, ticket } or { part, link }
 *   POST tubes-file-delete    { part }
 *   GET  tubes-file           ?team=&part=  a read link (the team's members, or Panitia)
 * Teams lock at the Techmeet; Panitia can still change them (panel file).
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { SessionPayload } from "../../src/lib/auth.js";
import { writeAudit } from "../../src/lib/auth.js";
import { getDb } from "../../src/lib/db.js";
import {
  recAttendance,
  recSlot,
  recSlotAssignment,
  recTeam,
  recTeamMember,
  recTubesFile,
  recTubesSession,
  recTubesState,
  recTubesTopic,
  type RecTubesStateRow,
} from "../../src/lib/schema.js";
import { bacaTanda, tandaiJson } from "../../src/lib/tanda.js";
import { kunciTubes, TP_MIME } from "../../src/lib/tp-r2.js";
import {
  asking,
  canInviteMore,
  checkFile,
  checkLink,
  joinedCount,
  nimBersih,
  sessionChangeOpen,
  sessionPickProblem,
  submissionCloseAt,
  submissionStatus,
  submitAllowed,
  submitState,
  teamSizeProblem,
  teamsLocked,
  teamsLockAt,
  techmeetEvent,
  workEvent,
  presentasiEvent,
  eventStart,
  type TubesPart,
  type TubesSetting,
} from "../../src/lib/recruitment/tubes.js";
import type {
  TubesFileLink,
  TubesInvite,
  TubesMine,
  TubesSessionView,
  TubesTeamView,
  TubesTimes,
} from "../../src/lib/recruitment/tubes-api.js";
import type { RecEvent } from "../../src/lib/recruitment/types.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, pgErrorCode } from "./http.js";
import { muatEvents, muatKandidat, tolak, wajibEdisi, type Db } from "./recruitment-data.js";
import { muatPelaku } from "./recruitment-rights.js";
import { bacaSetting } from "./recruitment-settings.js";
import { depNyata } from "./recruitment-unggah.js";
import { SimpanGalat, simpanSiap, tiketUnggah, urlBaca } from "./tp-simpan.js";
import { joined, labelTim, muatKelayakan, muatTim, namaTim, type Tim } from "./recruitment-tim.js";

export type H = (req: ApiRequest, res: ApiResponse, s: SessionPayload) => unknown;

function rahasia(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set");
  return s;
}

/* ------------------------------------------------------------ shared reading */

export interface Konteks {
  db: Db;
  edisiId: number;
  events: RecEvent[];
  now: Date;
  setting: TubesSetting;
  state: RecTubesStateRow | null;
}

export async function muatState(db: Db, edisiId: number): Promise<RecTubesStateRow | null> {
  const [r] = await db.select().from(recTubesState).where(eq(recTubesState.editionId, edisiId));
  return r ?? null;
}

export async function muatKonteks(res: ApiResponse): Promise<Konteks | null> {
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return null;
  const [events, setting, state] = await Promise.all([
    muatEvents(db, edisi.id),
    bacaSetting(db, "tim"),
    muatState(db, edisi.id),
  ]);
  return { db, edisiId: edisi.id, events, now: new Date(), setting, state };
}

export function waktu(c: Konteks, override: { until: Date | null } | null): TubesTimes {
  const lock = teamsLockAt(c.events);
  const work = workEvent(c.events);
  const tm = techmeetEvent(c.events);
  const pres = presentasiEvent(c.events);
  const close = submissionCloseAt(c.events);
  const workStart = work ? eventStart(work) : null;
  return {
    now: c.now.toISOString(),
    lockAt: lock ? lock.toISOString() : null,
    locked: teamsLocked(c.events, c.state?.teamsLock, c.now),
    workStart: workStart ? workStart.toISOString() : null,
    closeAt: close ? close.toISOString() : null,
    submit: submitState(close, workStart, c.now, override),
    published: !!c.state?.topicsPublishedAt,
    techmeetAt: tm ? eventStart(tm).toISOString() : null,
    presentasiAt: pres ? eventStart(pres).toISOString() : null,
  };
}

/** People seated per session: the joined members of the teams that picked it. */
export function kursiTerpakai(tims: readonly Tim[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const t of tims)
    if (t.team.sessionId !== null)
      out.set(t.team.sessionId, (out.get(t.team.sessionId) ?? 0) + joined(t).length);
  return out;
}

export async function muatFile(db: Db, teamIds: number[]) {
  if (!teamIds.length) return [];
  return db.select().from(recTubesFile).where(inArray(recTubesFile.teamId, teamIds));
}

export const overrideDari = (t: Tim) =>
  t.team.overrideNote && t.team.overrideBy && t.team.overrideAt
    ? {
        note: t.team.overrideNote,
        by: t.team.overrideBy,
        until: t.team.overrideUntil ? t.team.overrideUntil.toISOString() : null,
        at: t.team.overrideAt.toISOString(),
      }
    : null;

/** The Presentasi turn of a team: its table and the start of its turn. */
export async function giliranTim(
  db: Db,
  edisiId: number,
  leaderId: number,
  menit: number,
): Promise<{ table: string; startsAt: string; place: string; pos: number; slotId: number } | null> {
  const [a] = await db
    .select({ slotId: recSlotAssignment.slotId, id: recSlotAssignment.id })
    .from(recSlotAssignment)
    .innerJoin(recSlot, eq(recSlot.id, recSlotAssignment.slotId))
    .where(
      and(
        eq(recSlotAssignment.candidateId, leaderId),
        eq(recSlotAssignment.stage, "tubes"),
        eq(recSlot.editionId, edisiId),
      ),
    )
    .limit(1);
  if (!a) return null;
  const [slot] = await db.select().from(recSlot).where(eq(recSlot.id, a.slotId));
  const urut = await db
    .select({ id: recSlotAssignment.id })
    .from(recSlotAssignment)
    .where(and(eq(recSlotAssignment.slotId, a.slotId), eq(recSlotAssignment.stage, "tubes")))
    .orderBy(asc(recSlotAssignment.id));
  const pos = Math.max(
    0,
    urut.findIndex((x) => x.id === a.id),
  );
  return {
    table: slot.room,
    startsAt: new Date(slot.startsAt.getTime() + pos * menit * 60_000).toISOString(),
    place: "Lab IRIS",
    pos,
    slotId: slot.id,
  };
}

/**
 * What the Tubes Cutting shows beside the Presentasi mean, by candidate id: the team, its topic, how complete its
 * submission is, and whether the CaAs scanned in on the evening their team picked. Earlier stage totals stay context only.
 */
export async function muatTubesCutting(c: Konteks): Promise<
  Map<
    number,
    {
      team: string | null;
      topic: string | null;
      submission: "none" | "partial" | "complete" | "late" | "over" | null;
      attended: boolean | null;
    }
  >
> {
  const tims = await muatTim(c.db, c.edisiId);
  const topik = await c.db
    .select()
    .from(recTubesTopic)
    .where(eq(recTubesTopic.editionId, c.edisiId));
  const files = await muatFile(
    c.db,
    tims.map((t) => t.team.id),
  );
  const work = workEvent(c.events);
  const hadir = new Set<number>();
  if (work)
    for (const h of await c.db
      .select({ id: recAttendance.candidateId })
      .from(recAttendance)
      .where(eq(recAttendance.eventId, work.id)))
      hadir.add(h.id);
  const out = new Map<
    number,
    {
      team: string | null;
      topic: string | null;
      submission: "none" | "partial" | "complete" | "late" | "over" | null;
      attended: boolean | null;
    }
  >();
  for (const t of tims) {
    const o = overrideDari(t);
    const times = waktu(c, o ? { until: o.until ? new Date(o.until) : null } : null);
    const parts = new Set(files.filter((f) => f.teamId === t.team.id).map((f) => f.part));
    const submission = submissionStatus(parts, c.setting, times.submit, !!o);
    const topic = topik.find((x) => x.id === t.team.topicId)?.title ?? null;
    for (const m of joined(t))
      out.set(m.id, {
        team: namaTim(t),
        topic,
        submission,
        attended: t.team.sessionId === null ? null : hadir.has(m.id),
      });
  }
  return out;
}

/* ------------------------------------------------------------ a CaAs reads */

async function handleMine(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const c = await muatKonteks(res);
  if (!c) return;
  const k = await muatKandidat(c.db, c.edisiId, s.nim);
  const kosong = (eligible: boolean): TubesMine => ({
    ok: true,
    eligible,
    setting: c.setting,
    times: waktu(c, null),
    team: null,
    invites: [],
    sessions: [],
    attended: false,
  });
  if (!k) return void res.status(200).json(kosong(false));
  const layak = await muatKelayakan(c.db, c.edisiId, c.events, c.now);
  if (!layak.some((x) => x.id === k.id)) return void res.status(200).json(kosong(false));

  const tims = await muatTim(c.db, c.edisiId);
  const milik = tims.find((t) => t.members.some((m) => m.id === k.id && m.status === "joined"));
  const undangan: TubesInvite[] = tims
    .filter((t) => t.members.some((m) => m.id === k.id && m.status === "invited"))
    .map((t) => ({
      teamId: t.team.id,
      teamName: namaTim(t),
      leaderNama: t.members.find((m) => m.id === t.team.leaderId)?.nama ?? "",
      size: joined(t).length,
      max: c.setting.teamMax,
    }));

  const sesi = await c.db
    .select()
    .from(recTubesSession)
    .where(eq(recTubesSession.editionId, c.edisiId))
    .orderBy(asc(recTubesSession.startsAt));
  const pakai = kursiTerpakai(tims);
  const ukuran = milik ? joined(milik).length : 0;
  const sessions: TubesSessionView[] = sesi.map((x) => {
    const used = pakai.get(x.id) ?? 0;
    const own = milik?.team.sessionId === x.id ? ukuran : 0;
    return {
      id: x.id,
      startsAt: x.startsAt.toISOString(),
      endsAt: x.endsAt.toISOString(),
      place: x.place,
      capacity: x.capacity,
      used,
      left: Math.max(0, x.capacity - used),
      mine: milik?.team.sessionId === x.id,
      problem: milik
        ? sessionPickProblem(
            {
              id: x.id,
              startsAt: x.startsAt.toISOString(),
              endsAt: x.endsAt.toISOString(),
              capacity: x.capacity,
            },
            used,
            ukuran,
            own,
            c.now,
          )
        : null,
    };
  });

  let team: TubesTeamView | null = null;
  let attended = false;
  let ov: TubesTimes | null = null;
  if (milik) {
    const t = milik;
    const files = await muatFile(c.db, [t.team.id]);
    const parts = new Set(files.map((f) => f.part));
    const o = overrideDari(t);
    const times = waktu(c, o ? { until: o.until ? new Date(o.until) : null } : null);
    ov = times;
    const [tp] = t.team.topicId
      ? await c.db.select().from(recTubesTopic).where(eq(recTubesTopic.id, t.team.topicId))
      : [];
    const tampil =
      !!tp && (c.setting.assign === "undi" ? !!t.team.drawnAt : !!c.state?.topicsPublishedAt);
    const tmpl = await bacaSetting(c.db, "tubes");
    const turn = await giliranTim(c.db, c.edisiId, t.team.leaderId, tmpl.minutes);
    const work = workEvent(c.events);
    if (work) {
      const [h] = await c.db
        .select({ id: recAttendance.id })
        .from(recAttendance)
        .where(and(eq(recAttendance.candidateId, k.id), eq(recAttendance.eventId, work.id)))
        .limit(1);
      attended = !!h;
    }
    team = {
      id: t.team.id,
      name: namaTim(t),
      members: t.members.map((m) => ({
        candidateId: m.id,
        nim: m.nim,
        nama: m.nama,
        kelas: m.kelas,
        status: m.status,
        leader: m.id === t.team.leaderId,
        me: m.id === k.id,
      })),
      size: joined(t).length,
      problem: teamSizeProblem(joined(t).length, c.setting),
      leader: t.team.leaderId === k.id,
      topic: tampil && tp ? { id: tp.id, title: tp.title, brief: tp.brief } : null,
      topicPending: !!t.team.topicId && !tampil,
      sessionId: t.team.sessionId,
      files: files.map((f) => ({
        part: f.part,
        kind: f.kind,
        name: f.name,
        size: f.size,
        url: f.kind === "link" ? f.url : null,
        at: f.at.toISOString(),
        by: f.by,
      })),
      status: submissionStatus(parts, c.setting, times.submit, !!o),
      override: o,
      turn: turn ? { table: turn.table, startsAt: turn.startsAt, place: turn.place } : null,
    };
  }
  res.status(200).json({
    ok: true,
    eligible: true,
    setting: c.setting,
    times: ov ?? waktu(c, null),
    team,
    invites: undangan,
    sessions,
    attended,
  } satisfies TubesMine);
}

/* ------------------------------------------------------------ team writes */

type Dalam = { c: Konteks; k: NonNullable<Awaited<ReturnType<typeof muatKandidat>>>; tims: Tim[] };

/** The CaAs's candidate row, checked to be in Tubes; the 4xx answer is written here. */
async function wajibLayak(res: ApiResponse, s: SessionPayload): Promise<Dalam | null> {
  const c = await muatKonteks(res);
  if (!c) return null;
  const k = await muatKandidat(c.db, c.edisiId, s.nim);
  if (!k) return (void tolak(res, "tidak_ditemukan", 404), null);
  const layak = await muatKelayakan(c.db, c.edisiId, c.events, c.now);
  if (!layak.some((x) => x.id === k.id)) return (void tolak(res, "bukan_tahap", 403), null);
  return { c, k, tims: await muatTim(c.db, c.edisiId) };
}

const milikKu = (tims: readonly Tim[], id: number) =>
  tims.find((t) => t.members.some((m) => m.id === id && m.status === "joined")) ?? null;

async function handleTimBuat(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const d = await wajibLayak(res, s);
  if (!d) return;
  if (teamsLocked(d.c.events, d.c.state?.teamsLock, d.c.now))
    return void tolak(res, "terkunci", 409);
  if (milikKu(d.tims, d.k.id)) return void tolak(res, "sudah_punya_tim", 409);
  try {
    const id = await d.c.db.transaction(async (tx) => {
      const [t] = await tx
        .insert(recTeam)
        .values({ editionId: d.c.edisiId, leaderId: d.k.id })
        .returning({ id: recTeam.id });
      // Their other invites no longer matter: they lead a team now.
      await tx
        .delete(recTeamMember)
        .where(and(eq(recTeamMember.candidateId, d.k.id), eq(recTeamMember.status, "invited")));
      await tx
        .insert(recTeamMember)
        .values({ teamId: t.id, candidateId: d.k.id, status: "joined", by: s.nim });
      return t.id;
    });
    await writeAudit(s.nim, "rec_tim_buat", { team: id });
    res.status(200).json({ ok: true, teamId: id });
  } catch (e) {
    if (pgErrorCode(e) === "23505") return void tolak(res, "sudah_punya_tim", 409);
    throw e;
  }
}

/** The leader's own team, or a refusal written here. */
function wajibPemimpin(res: ApiResponse, d: Dalam): Tim | null {
  const t = milikKu(d.tims, d.k.id);
  if (!t) return (void tolak(res, "belum_punya_tim", 409), null);
  if (t.team.leaderId !== d.k.id) return (void tolak(res, "bukan_pemimpin", 403), null);
  return t;
}

async function handleTimNama(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const d = await wajibLayak(res, s);
  if (!d) return;
  const t = wajibPemimpin(res, d);
  if (!t) return;
  const nama = typeof jsonBody(req).name === "string" ? String(jsonBody(req).name).trim() : null;
  if (nama === null || nama.length > 40)
    return void tolak(res, "data_salah", 400, { field: "name" });
  await d.c.db.update(recTeam).set({ name: nama }).where(eq(recTeam.id, t.team.id));
  res.status(200).json({ ok: true });
}

async function handleUndang(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const nim = nimBersih(jsonBody(req).nim);
  if (!nim) return void tolak(res, "data_salah", 400, { field: "nim" });
  const d = await wajibLayak(res, s);
  if (!d) return;
  if (teamsLocked(d.c.events, d.c.state?.teamsLock, d.c.now))
    return void tolak(res, "terkunci", 409);
  const t = wajibPemimpin(res, d);
  if (!t) return;
  if (!canInviteMore(t.members, d.c.setting)) return void tolak(res, "penuh", 409);
  const layak = await muatKelayakan(d.c.db, d.c.edisiId, d.c.events, d.c.now);
  const target = layak.find((x) => x.nim === nim);
  // The same answer for a NIM that does not exist and one that is not in Tubes: nothing is leaked.
  if (!target) return void tolak(res, "nim_tidak_ada", 404);
  if (milikKu(d.tims, target.id)) return void tolak(res, "sudah_punya_tim", 409);
  if (t.members.some((m) => m.id === target.id)) return void tolak(res, "sudah_diundang", 409);
  try {
    await d.c.db
      .insert(recTeamMember)
      .values({ teamId: t.team.id, candidateId: target.id, status: "invited", by: s.nim });
  } catch (e) {
    if (pgErrorCode(e) === "23505") return void tolak(res, "sudah_diundang", 409);
    throw e;
  }
  await writeAudit(s.nim, "rec_tim_undang", { team: t.team.id, nim });
  res.status(200).json({ ok: true });
}

async function handleBatalUndang(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const id = Number(jsonBody(req).candidateId);
  if (!Number.isInteger(id) || id <= 0)
    return void tolak(res, "data_salah", 400, { field: "candidateId" });
  const d = await wajibLayak(res, s);
  if (!d) return;
  if (teamsLocked(d.c.events, d.c.state?.teamsLock, d.c.now))
    return void tolak(res, "terkunci", 409);
  const t = wajibPemimpin(res, d);
  if (!t) return;
  await d.c.db
    .delete(recTeamMember)
    .where(
      and(
        eq(recTeamMember.teamId, t.team.id),
        eq(recTeamMember.candidateId, id),
        eq(recTeamMember.status, "invited"),
      ),
    );
  res.status(200).json({ ok: true });
}

async function handleJawab(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const teamId = Number(b.teamId);
  if (!Number.isInteger(teamId) || teamId <= 0 || typeof b.accept !== "boolean")
    return void tolak(res, "data_salah", 400);
  const d = await wajibLayak(res, s);
  if (!d) return;
  const undangan = d.tims
    .find((t) => t.team.id === teamId)
    ?.members.find((m) => m.id === d.k.id && m.status === "invited");
  if (!undangan) return void tolak(res, "tidak_ada_undangan", 404);
  if (!b.accept) {
    await d.c.db
      .delete(recTeamMember)
      .where(and(eq(recTeamMember.teamId, teamId), eq(recTeamMember.candidateId, d.k.id)));
    return void res.status(200).json({ ok: true });
  }
  if (teamsLocked(d.c.events, d.c.state?.teamsLock, d.c.now))
    return void tolak(res, "terkunci", 409);
  if (milikKu(d.tims, d.k.id)) return void tolak(res, "sudah_punya_tim", 409);
  let kode = "ok";
  try {
    await d.c.db.transaction(async (tx) => {
      // The team row lock makes the count below true for this answer alone.
      await tx.select({ id: recTeam.id }).from(recTeam).where(eq(recTeam.id, teamId)).for("update");
      const rows = await tx
        .select({ candidateId: recTeamMember.candidateId, status: recTeamMember.status })
        .from(recTeamMember)
        .where(eq(recTeamMember.teamId, teamId));
      if (joinedCount(rows) >= d.c.setting.teamMax) {
        kode = "penuh";
        return;
      }
      await tx
        .update(recTeamMember)
        .set({ status: "joined", at: new Date() })
        .where(and(eq(recTeamMember.teamId, teamId), eq(recTeamMember.candidateId, d.k.id)));
      await tx
        .delete(recTeamMember)
        .where(and(eq(recTeamMember.candidateId, d.k.id), eq(recTeamMember.status, "invited")));
    });
  } catch (e) {
    if (pgErrorCode(e) === "23505") return void tolak(res, "sudah_punya_tim", 409);
    throw e;
  }
  if (kode !== "ok") return void tolak(res, kode, 409);
  await writeAudit(s.nim, "rec_tim_gabung", { team: teamId });
  res.status(200).json({ ok: true });
}

async function handleKeluar(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const d = await wajibLayak(res, s);
  if (!d) return;
  if (teamsLocked(d.c.events, d.c.state?.teamsLock, d.c.now))
    return void tolak(res, "terkunci", 409);
  const t = milikKu(d.tims, d.k.id);
  if (!t) return void tolak(res, "belum_punya_tim", 409);
  if (t.team.leaderId === d.k.id) return void tolak(res, "bukan_pemimpin", 403);
  await d.c.db
    .delete(recTeamMember)
    .where(and(eq(recTeamMember.teamId, t.team.id), eq(recTeamMember.candidateId, d.k.id)));
  await writeAudit(s.nim, "rec_tim_keluar", { team: t.team.id });
  res.status(200).json({ ok: true });
}

async function handleKeluarkan(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const id = Number(jsonBody(req).candidateId);
  if (!Number.isInteger(id) || id <= 0)
    return void tolak(res, "data_salah", 400, { field: "candidateId" });
  const d = await wajibLayak(res, s);
  if (!d) return;
  if (teamsLocked(d.c.events, d.c.state?.teamsLock, d.c.now))
    return void tolak(res, "terkunci", 409);
  const t = wajibPemimpin(res, d);
  if (!t) return;
  if (id === d.k.id) return void tolak(res, "data_salah", 400, { field: "candidateId" });
  await d.c.db
    .delete(recTeamMember)
    .where(and(eq(recTeamMember.teamId, t.team.id), eq(recTeamMember.candidateId, id)));
  await writeAudit(s.nim, "rec_tim_keluarkan", { team: t.team.id, id });
  res.status(200).json({ ok: true });
}

async function handleBubar(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const d = await wajibLayak(res, s);
  if (!d) return;
  if (teamsLocked(d.c.events, d.c.state?.teamsLock, d.c.now))
    return void tolak(res, "terkunci", 409);
  const t = wajibPemimpin(res, d);
  if (!t) return;
  await d.c.db.delete(recTeam).where(eq(recTeam.id, t.team.id));
  await writeAudit(s.nim, "rec_tim_bubar", { team: t.team.id });
  res.status(200).json({ ok: true });
}

/* ------------------------------------------------------------ the lab evening */

async function handlePilihSesi(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const sessionId = b.sessionId === null ? null : Number(b.sessionId);
  if (sessionId !== null && (!Number.isInteger(sessionId) || sessionId <= 0))
    return void tolak(res, "data_salah", 400, { field: "sessionId" });
  const d = await wajibLayak(res, s);
  if (!d) return;
  const t = wajibPemimpin(res, d);
  if (!t) return;
  const ukuran = joined(t).length;
  if (teamSizeProblem(ukuran, d.c.setting)) return void tolak(res, "ukuran_tim", 409);
  let kode = "ok";
  await d.c.db.transaction(async (tx) => {
    if (sessionId === null) {
      // Giving the evening up is allowed until the evening's own cutoff (H-1 23.59).
      if (t.team.sessionId) {
        const [lama] = await tx
          .select()
          .from(recTubesSession)
          .where(eq(recTubesSession.id, t.team.sessionId));
        if (lama && !sessionChangeOpen(lama.startsAt, d.c.now)) {
          kode = "lewat";
          return;
        }
      }
      await tx.update(recTeam).set({ sessionId: null }).where(eq(recTeam.id, t.team.id));
      return;
    }
    // The evening's row lock makes the seat count true for this team alone.
    const [x] = await tx
      .select()
      .from(recTubesSession)
      .where(and(eq(recTubesSession.id, sessionId), eq(recTubesSession.editionId, d.c.edisiId)))
      .for("update");
    if (!x) {
      kode = "tidak_ada";
      return;
    }
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(recTeamMember)
      .innerJoin(recTeam, eq(recTeam.id, recTeamMember.teamId))
      .where(and(eq(recTeam.sessionId, x.id), eq(recTeamMember.status, "joined")));
    const own = t.team.sessionId === x.id ? ukuran : 0;
    // A team that already holds an evening may only change before that evening's own cutoff too.
    if (t.team.sessionId && t.team.sessionId !== x.id) {
      const [lama] = await tx
        .select()
        .from(recTubesSession)
        .where(eq(recTubesSession.id, t.team.sessionId));
      if (lama && !sessionChangeOpen(lama.startsAt, d.c.now)) {
        kode = "lewat";
        return;
      }
    }
    const problem = sessionPickProblem(
      {
        id: x.id,
        startsAt: x.startsAt.toISOString(),
        endsAt: x.endsAt.toISOString(),
        capacity: x.capacity,
      },
      n,
      ukuran,
      own,
      d.c.now,
    );
    if (problem) {
      kode = problem === "penuh" ? "penuh" : "lewat";
      return;
    }
    await tx.update(recTeam).set({ sessionId: x.id }).where(eq(recTeam.id, t.team.id));
  });
  if (kode !== "ok") return void tolak(res, kode, kode === "tidak_ada" ? 404 : 409);
  await writeAudit(s.nim, "rec_tim_sesi", { team: t.team.id, sessionId });
  res.status(200).json({ ok: true, sessionId });
}

/* ------------------------------------------------------------ the submission */

interface TiketTubes {
  j: "tubes-ok";
  k: string;
  n: number;
  s: string;
  team: number;
  ed: number;
  part: string;
  nim: string;
  t: number;
}

const TIKET_TUBES_DETIK = 25 * 60;
const SHA_RE = /^[0-9a-f]{64}$/;

async function bacaTiketTubes(token: unknown): Promise<TiketTubes | null> {
  if (typeof token !== "string" || !token) return null;
  const r = await bacaTanda(token, rahasia());
  if (!r.ok || !r.isi || typeof r.isi !== "object") return null;
  const t = r.isi as Partial<TiketTubes>;
  if (t.j !== "tubes-ok" || typeof t.t !== "number") return null;
  if (Math.floor(Date.now() / 1000) - t.t > TIKET_TUBES_DETIK) return null;
  if (
    typeof t.k !== "string" ||
    typeof t.n !== "number" ||
    typeof t.s !== "string" ||
    typeof t.team !== "number" ||
    typeof t.ed !== "number" ||
    typeof t.part !== "string" ||
    typeof t.nim !== "string"
  )
    return null;
  return t as TiketTubes;
}

/** The team of the CaAs and whether the submission is open for it; the refusal is written here. */
async function wajibKirim(
  res: ApiResponse,
  s: SessionPayload,
): Promise<{ d: Dalam; t: Tim; part: (key: unknown) => TubesPart | undefined } | null> {
  const d = await wajibLayak(res, s);
  if (!d) return null;
  const t = milikKu(d.tims, d.k.id);
  if (!t) return (void tolak(res, "belum_punya_tim", 409), null);
  const o = overrideDari(t);
  const state = waktu(d.c, o ? { until: o.until ? new Date(o.until) : null } : null).submit;
  if (!submitAllowed(state)) {
    tolak(res, state === "belum" ? "belum_buka" : "tutup", 409);
    return null;
  }
  return { d, t, part: (key) => d.c.setting.parts.find((p) => p.key === key) };
}

async function handleTiketFile(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const w = await wajibKirim(res, s);
  if (!w) return;
  const part = w.part(b.part);
  const name = typeof b.name === "string" ? b.name : "";
  const size = typeof b.size === "number" && Number.isInteger(b.size) ? b.size : -1;
  const sha = typeof b.sha256 === "string" ? b.sha256.toLowerCase() : "";
  if (!SHA_RE.test(sha) || !name || name.length > 160) return void tolak(res, "data_salah", 400);
  const bad = checkFile(part, name, size);
  if (bad) return void tolak(res, bad === "ekstensi" ? "ekstensi" : bad, 400);
  if (!simpanSiap()) return void tolak(res, "belum_diatur", 503);
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  const key = kunciTubes(w.d.c.edisiId, w.t.team.id, part!.key, sha, ext);
  const [ada] = await w.d.c.db
    .select()
    .from(recTubesFile)
    .where(and(eq(recTubesFile.teamId, w.t.team.id), eq(recTubesFile.part, part!.key)));
  if (ada?.sha256 === sha && ada.key === key)
    return void res.status(200).json({ ok: true, sama: true, url: null, ticket: "", key });
  const put = await tiketUnggah({ kunci: key, ukuran: size, sha256: sha, halaman: 1 });
  const tiket = await tandaiJson(
    {
      j: "tubes-ok",
      k: key,
      n: size,
      s: sha,
      team: w.t.team.id,
      ed: w.d.c.edisiId,
      part: part!.key,
      nim: s.nim,
      t: Math.floor(Date.now() / 1000),
    } satisfies TiketTubes,
    rahasia(),
  );
  res.status(200).json({ ok: true, sama: false, url: put.url, ticket: tiket, key });
}

async function handleSimpanFile(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const w = await wajibKirim(res, s);
  if (!w) return;
  const part = w.part(b.part);
  if (!part) return void tolak(res, "bagian_salah", 400);
  const db = w.d.c.db;
  if (b.link !== undefined) {
    if (!part.link) return void tolak(res, "bagian_salah", 400);
    const url = checkLink(b.link);
    if (!url) return void tolak(res, "link_salah", 400);
    await db
      .insert(recTubesFile)
      .values({
        teamId: w.t.team.id,
        part: part.key,
        kind: "link",
        url,
        key: null,
        sha256: null,
        name: new URL(url).hostname,
        size: 0,
        by: s.nim,
      })
      .onConflictDoUpdate({
        target: [recTubesFile.teamId, recTubesFile.part],
        set: {
          kind: "link",
          url,
          key: null,
          sha256: null,
          name: new URL(url).hostname,
          size: 0,
          at: new Date(),
          by: s.nim,
        },
      });
    await writeAudit(s.nim, "rec_tubes_file", { team: w.t.team.id, part: part.key, link: true });
    return void res.status(200).json({ ok: true });
  }
  const t = await bacaTiketTubes(b.ticket);
  if (
    !t ||
    t.nim !== s.nim ||
    t.team !== w.t.team.id ||
    t.ed !== w.d.c.edisiId ||
    t.part !== part.key
  )
    return void tolak(res, "data_salah", 400, { field: "ticket" });
  if (!simpanSiap()) return void tolak(res, "belum_diatur", 503);
  const h = await depNyata
    .kepala(t.k)
    .catch(() => ({ ada: false }) as { ada: boolean; ukuran?: number; sha256?: string | null });
  if (!h.ada) return void tolak(res, "berkas_hilang", 409);
  if (h.ukuran !== t.n || h.sha256 !== t.s) return void tolak(res, "berkas_beda", 409);
  const nama =
    typeof b.name === "string" && b.name.trim()
      ? b.name.trim().slice(0, 160)
      : t.k.split("/").pop()!;
  await db
    .insert(recTubesFile)
    .values({
      teamId: w.t.team.id,
      part: part.key,
      kind: "file",
      key: t.k,
      url: null,
      sha256: t.s,
      name: nama,
      size: t.n,
      by: s.nim,
    })
    .onConflictDoUpdate({
      target: [recTubesFile.teamId, recTubesFile.part],
      set: {
        kind: "file",
        key: t.k,
        url: null,
        sha256: t.s,
        name: nama,
        size: t.n,
        at: new Date(),
        by: s.nim,
      },
    });
  await writeAudit(s.nim, "rec_tubes_file", { team: w.t.team.id, part: part.key, size: t.n });
  res.status(200).json({ ok: true });
}

async function handleHapusFile(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const w = await wajibKirim(res, s);
  if (!w) return;
  const part = w.part(jsonBody(req).part);
  if (!part) return void tolak(res, "bagian_salah", 400);
  await w.d.c.db
    .delete(recTubesFile)
    .where(and(eq(recTubesFile.teamId, w.t.team.id), eq(recTubesFile.part, part.key)));
  await writeAudit(s.nim, "rec_tubes_file_hapus", { team: w.t.team.id, part: part.key });
  res.status(200).json({ ok: true });
}

/** A read link for one part: the team's own members and the Panitia (an Asisten session). */
export async function handleBacaFile(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const teamId = Number(req.query.team);
  const partKey = String(req.query.part ?? "");
  if (!Number.isInteger(teamId) || teamId <= 0 || !partKey)
    return void tolak(res, "data_salah", 400);
  const c = await muatKonteks(res);
  if (!c) return;
  if (s.role === "asisten") {
    const p = await muatPelaku(c.db, c.edisiId, s.nim);
    if (!p || (!p.penuh && !p.kursi)) return void tolak(res, "tanpa_hak", 403);
  } else {
    const k = await muatKandidat(c.db, c.edisiId, s.nim);
    const tims = await muatTim(c.db, c.edisiId);
    const mine = k ? milikKu(tims, k.id) : null;
    if (!mine || mine.team.id !== teamId) return void tolak(res, "tanpa_hak", 403);
  }
  const [f] = await c.db
    .select({ f: recTubesFile, edition: recTeam.editionId })
    .from(recTubesFile)
    .innerJoin(recTeam, eq(recTeam.id, recTubesFile.teamId))
    .where(and(eq(recTubesFile.teamId, teamId), eq(recTubesFile.part, partKey)));
  if (!f || f.edition !== c.edisiId) return void tolak(res, "tidak_ada", 404);
  if (f.f.kind === "link" && f.f.url)
    return void res.status(200).json({
      ok: true,
      url: f.f.url,
      kind: "link",
      name: f.f.name,
      mime: null,
    } satisfies TubesFileLink);
  if (!f.f.key) return void tolak(res, "tidak_ada", 404);
  if (!simpanSiap()) return void tolak(res, "belum_diatur", 503);
  const ext = f.f.name.slice(f.f.name.lastIndexOf(".") + 1).toLowerCase();
  const mime = (TP_MIME as Record<string, string>)[ext] ?? TP_MIME.bin;
  try {
    const url = await urlBaca({ kunci: f.f.key, nama: f.f.name, mime, unduh: true });
    res
      .status(200)
      .json({ ok: true, url, kind: "file", name: f.f.name, mime } satisfies TubesFileLink);
  } catch (e) {
    if (e instanceof SimpanGalat) return void tolak(res, "belum_diatur", 503);
    throw e;
  }
}

export const S7_OPREC_GET: Record<string, H> = { tubes: handleMine };
export const S7_OPREC_POST: Record<string, H> = {
  "tubes-team-make": handleTimBuat,
  "tubes-team-name": handleTimNama,
  "tubes-invite": handleUndang,
  "tubes-invite-cancel": handleBatalUndang,
  "tubes-answer": handleJawab,
  "tubes-leave": handleKeluar,
  "tubes-kick": handleKeluarkan,
  "tubes-disband": handleBubar,
  "tubes-session-pick": handlePilihSesi,
  "tubes-file-ticket": handleTiketFile,
  "tubes-file-save": handleSimpanFile,
  "tubes-file-delete": handleHapusFile,
};
