/**
 * Tubes, the Panitia's side (Open Recruitment R5): the board, edits to teams,
 * topics (set, share, draw, publish), the lab evenings, the Ketua's override
 * and the Presentasi order. The CaAs's side is recruitment-s7.ts.
 *
 * Rights (no new ones): topics follow `bank` (Ketua, Akademik), teams,
 * evenings and the order follow `plotting` (Ketua, Akademik, Admin), the
 * override is the Ketua's (`cuttingLock`). Anyone on the committee reads the
 * board. Examiners of the Presentasi tables are set with iv-crew-set (stage
 * "tubes"), the rubric in the Template tab, the scores through the interview
 * engine.
 */
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { SessionPayload } from "../../src/lib/auth.js";
import { writeAudit } from "../../src/lib/auth.js";
import {
  recAttendance,
  recSlot,
  recSlotAssignment,
  recTeam,
  recTeamMember,
  recTubesSession,
  recTubesState,
  recTubesTopic,
} from "../../src/lib/schema.js";
import {
  dealTeams,
  defaultSessions,
  drawTopic,
  eventStart,
  groupLeftovers,
  presentasiEvent,
  shareEvenly,
  submissionStatus,
  teamSizeProblem,
  workEvent,
} from "../../src/lib/recruitment/tubes.js";
import type {
  TubesBoard,
  TubesBoardTable,
  TubesBoardTeam,
} from "../../src/lib/recruitment/tubes-api.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { tolak } from "./recruitment-data.js";
import { konteksLatihan } from "./recruitment-latihan-ctx.js";
import { muatPelaku, wajibHak, anggotaPanitia } from "./recruitment-rights.js";
import { bacaSetting } from "./recruitment-settings.js";
import { joined, muatKelayakan, muatTim, namaTim, type Tim } from "./recruitment-tim.js";
import {
  handleBacaFile,
  kursiTerpakai,
  muatFile,
  muatKonteks,
  overrideDari,
  waktu,
  type H,
  type Konteks,
} from "./recruitment-s7.js";

const nomor = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const teks = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null;

/** The Presentasi tables: the slots of stage tubes (the presentation event's), each with its teams in order. */
async function muatMeja(
  c: Konteks,
  tims: readonly Tim[],
): Promise<(TubesBoardTable & { ids: number[] })[]> {
  const slots = await c.db
    .select()
    .from(recSlot)
    .where(and(eq(recSlot.editionId, c.edisiId), eq(recSlot.stage, "tubes")))
    .orderBy(asc(recSlot.room), asc(recSlot.id));
  if (!slots.length) return [];
  const asg = await c.db
    .select()
    .from(recSlotAssignment)
    .where(
      and(
        inArray(
          recSlotAssignment.slotId,
          slots.map((s) => s.id),
        ),
        eq(recSlotAssignment.stage, "tubes"),
      ),
    )
    .orderBy(asc(recSlotAssignment.id));
  const timDariPemimpin = new Map(tims.map((t) => [t.team.leaderId, t.team.id]));
  return slots.map((s) => {
    const ids = asg
      .filter((a) => a.slotId === s.id)
      .map((a) => timDariPemimpin.get(a.candidateId))
      .filter((x): x is number => x !== undefined);
    return {
      slotId: s.id,
      room: s.room,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      capacity: s.capacity,
      teamIds: ids,
      ids,
    };
  });
}

async function handleBoard(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const c = await muatKonteks(res);
  if (!c) return;
  const p = await muatPelaku(c.db, c.edisiId, s.nim);
  if (!anggotaPanitia(p)) return void tolak(res, "tanpa_hak", 403);
  const [layak, tims, sesi, topik] = await Promise.all([
    muatKelayakan(c.db, c.edisiId, c.events, c.now),
    muatTim(c.db, c.edisiId),
    c.db
      .select()
      .from(recTubesSession)
      .where(eq(recTubesSession.editionId, c.edisiId))
      .orderBy(asc(recTubesSession.startsAt)),
    c.db
      .select()
      .from(recTubesTopic)
      .where(eq(recTubesTopic.editionId, c.edisiId))
      .orderBy(asc(recTubesTopic.sort), asc(recTubesTopic.id)),
  ]);
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
      // A test scan (via "uji", from the QR wall's test mode) is never real attendance
      .where(and(eq(recAttendance.eventId, work.id), ne(recAttendance.via, "uji"))))
      hadir.add(h.id);
  const meja = await muatMeja(c, tims);
  const letak = new Map<number, { slotId: number; pos: number }>();
  for (const m of meja) m.ids.forEach((id, pos) => letak.set(id, { slotId: m.slotId, pos }));
  const pakai = kursiTerpakai(tims);
  const teamsBoard: TubesBoardTeam[] = tims.map((t) => {
    const berkas = files.filter((f) => f.teamId === t.team.id);
    const ov = overrideDari(t);
    const times = waktu(c, ov ? { until: ov.until ? new Date(ov.until) : null } : null);
    return {
      id: t.team.id,
      name: namaTim(t),
      members: t.members.map((m) => ({
        candidateId: m.id,
        nim: m.nim,
        nama: m.nama,
        status: m.status,
        leader: m.id === t.team.leaderId,
        attended: hadir.has(m.id),
      })),
      size: joined(t).length,
      problem: teamSizeProblem(joined(t).length, c.setting),
      topicId: t.team.topicId,
      drawn: !!t.team.drawnAt,
      sessionId: t.team.sessionId,
      files: berkas.map((f) => ({
        part: f.part,
        kind: f.kind,
        name: f.name,
        size: f.size,
        url: f.kind === "link" ? f.url : null,
        at: f.at.toISOString(),
        by: f.by,
      })),
      status: submissionStatus(new Set(berkas.map((f) => f.part)), c.setting, times.submit, !!ov),
      override: ov,
      table: letak.get(t.team.id) ?? null,
    };
  });
  const dalamTim = new Map<number, { teamId: number; status: "invited" | "joined" }>();
  for (const t of tims)
    for (const m of t.members) {
      const lama = dalamTim.get(m.id);
      if (!lama || m.status === "joined")
        dalamTim.set(m.id, { teamId: t.team.id, status: m.status });
    }
  const pres = presentasiEvent(c.events);
  const body: TubesBoard = {
    ok: true,
    setting: c.setting,
    times: waktu(c, null),
    teamsLock: c.state?.teamsLock ?? null,
    rights: {
      topics: !!p?.hak.bank,
      teams: !!p?.hak.plotting,
      sessions: !!p?.hak.plotting,
      attend: !!p?.hak.attendance,
      override: !!p?.hak.cuttingLock,
      config: !!p && (p.penuh || ["ketua", "akademik"].includes(p.kursi?.division ?? "")),
      order: !!p?.hak.plotting,
    },
    candidates: layak.map((x) => ({
      id: x.id,
      nim: x.nim,
      nama: x.nama,
      kelas: x.kelas,
      teamId: dalamTim.get(x.id)?.teamId ?? null,
      status: dalamTim.get(x.id)?.status ?? "none",
    })),
    teams: teamsBoard,
    topics: topik.map((x) => ({
      id: x.id,
      title: x.title,
      brief: x.brief,
      cap: x.cap,
      used: tims.filter((t) => t.team.topicId === x.id).length,
    })),
    sessions: sesi.map((x) => ({
      id: x.id,
      startsAt: x.startsAt.toISOString(),
      endsAt: x.endsAt.toISOString(),
      place: x.place,
      capacity: x.capacity,
      used: pakai.get(x.id) ?? 0,
      teams: tims.filter((t) => t.team.sessionId === x.id).length,
    })),
    tables: meja.map(({ ids: _ids, ...m }) => m),
    workEventId: work?.id ?? null,
    presentasiEventId: pres?.id ?? null,
    practice: !!konteksLatihan(),
  };
  res.status(200).json(body);
}

/* ------------------------------------------------------------ teams */

async function wajibHakPlot(res: ApiResponse, s: SessionPayload) {
  const c = await muatKonteks(res);
  if (!c) return null;
  const p = await muatPelaku(c.db, c.edisiId, s.nim);
  if (!wajibHak(res, p, "plotting")) return null;
  return c;
}

async function handleTimAdmin(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const op = String(b.op ?? "");
  const c = await wajibHakPlot(res, s);
  if (!c) return;
  const tims = await muatTim(c.db, c.edisiId);
  const layak = await muatKelayakan(c.db, c.edisiId, c.events, c.now);
  const orang = (id: unknown) => layak.find((x) => x.id === nomor(id));
  const tim = (id: unknown) => tims.find((t) => t.team.id === nomor(id));
  const sudah = (id: number) =>
    tims.find((t) => t.members.some((m) => m.id === id && m.status === "joined"));
  const diurutkan = async (leaderId: number) => {
    const [a] = await c.db
      .select({ id: recSlotAssignment.id })
      .from(recSlotAssignment)
      .where(and(eq(recSlotAssignment.candidateId, leaderId), eq(recSlotAssignment.stage, "tubes")))
      .limit(1);
    return !!a;
  };

  if (op === "make") {
    const o = orang(b.candidateId);
    if (!o) return void tolak(res, "tidak_ada", 404);
    if (sudah(o.id)) return void tolak(res, "sudah_punya_tim", 409);
    const id = await c.db.transaction(async (tx) => {
      const [t] = await tx
        .insert(recTeam)
        .values({ editionId: c.edisiId, leaderId: o.id })
        .returning({ id: recTeam.id });
      await tx
        .delete(recTeamMember)
        .where(and(eq(recTeamMember.candidateId, o.id), eq(recTeamMember.status, "invited")));
      await tx
        .insert(recTeamMember)
        .values({ teamId: t.id, candidateId: o.id, status: "joined", by: s.nim });
      return t.id;
    });
    await writeAudit(s.nim, "rec_tim_admin", { op, team: id, id: o.id });
    return void res.status(200).json({ ok: true, teamId: id });
  }
  const t = tim(b.teamId);
  if (!t) return void tolak(res, "tidak_ada", 404);
  if (op === "rename") {
    const nama = typeof b.name === "string" ? b.name.trim() : null;
    if (nama === null || nama.length > 40)
      return void tolak(res, "data_salah", 400, { field: "name" });
    await c.db.update(recTeam).set({ name: nama }).where(eq(recTeam.id, t.team.id));
  } else if (op === "add") {
    const o = orang(b.candidateId);
    if (!o) return void tolak(res, "tidak_ada", 404);
    if (sudah(o.id)) return void tolak(res, "sudah_punya_tim", 409);
    // Panitia may go past the size the Akademik set (the board warns); never past what a table of this size can seat.
    if (joined(t).length >= 8) return void tolak(res, "penuh", 409);
    await c.db.transaction(async (tx) => {
      await tx
        .delete(recTeamMember)
        .where(and(eq(recTeamMember.candidateId, o.id), eq(recTeamMember.status, "invited")));
      await tx
        .insert(recTeamMember)
        .values({ teamId: t.team.id, candidateId: o.id, status: "joined", by: s.nim });
    });
  } else if (op === "remove") {
    const id = nomor(b.candidateId);
    if (!id || !t.members.some((m) => m.id === id)) return void tolak(res, "tidak_ada", 404);
    if (id === t.team.leaderId) return void tolak(res, "bukan_pemimpin", 409);
    await c.db
      .delete(recTeamMember)
      .where(and(eq(recTeamMember.teamId, t.team.id), eq(recTeamMember.candidateId, id)));
  } else if (op === "leader") {
    const id = nomor(b.candidateId);
    if (!id || !joined(t).some((m) => m.id === id)) return void tolak(res, "tidak_ada", 404);
    // The sheets and the table are kept under the leader's id; once a table is dealt the leader stays.
    if (await diurutkan(t.team.leaderId)) return void tolak(res, "sudah_diurutkan", 409);
    await c.db.update(recTeam).set({ leaderId: id }).where(eq(recTeam.id, t.team.id));
  } else if (op === "disband") {
    await c.db
      .delete(recSlotAssignment)
      .where(
        and(
          eq(recSlotAssignment.candidateId, t.team.leaderId),
          eq(recSlotAssignment.stage, "tubes"),
        ),
      );
    await c.db.delete(recTeam).where(eq(recTeam.id, t.team.id));
  } else return void tolak(res, "data_salah", 400, { field: "op" });
  await writeAudit(s.nim, "rec_tim_admin", { op, team: t.team.id, id: b.candidateId ?? null });
  res.status(200).json({ ok: true });
}

/** Everyone in Tubes without a team is grouped into teams of the size the Akademik set. */
async function handleTimOtomatis(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const c = await wajibHakPlot(res, s);
  if (!c) return;
  const tims = await muatTim(c.db, c.edisiId);
  const layak = await muatKelayakan(c.db, c.edisiId, c.events, c.now);
  const punya = new Set(tims.flatMap((t) => joined(t).map((m) => m.id)));
  const bebas = layak.filter((x) => !punya.has(x.id)).sort((a, b) => (a.nim < b.nim ? -1 : 1));
  if (!bebas.length) return void res.status(200).json({ ok: true, made: 0 });
  const rnd = () => Math.random();
  const urut = bebas.slice();
  for (let i = urut.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [urut[i], urut[j]] = [urut[j], urut[i]];
  }
  const grup = groupLeftovers(
    urut.map((x) => x.id),
    c.setting.teamMin,
    c.setting.teamMax,
  );
  await c.db.transaction(async (tx) => {
    for (const g of grup) {
      const [t] = await tx
        .insert(recTeam)
        .values({ editionId: c.edisiId, leaderId: g[0] })
        .returning({ id: recTeam.id });
      await tx
        .delete(recTeamMember)
        .where(and(inArray(recTeamMember.candidateId, g), eq(recTeamMember.status, "invited")));
      await tx
        .insert(recTeamMember)
        .values(
          g.map((id) => ({ teamId: t.id, candidateId: id, status: "joined" as const, by: s.nim })),
        );
    }
  });
  await writeAudit(s.nim, "rec_tim_otomatis", { teams: grup.length, people: bebas.length });
  res.status(200).json({ ok: true, made: grup.length });
}

async function handleKunciTim(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const mode =
    b.mode === null ? null : b.mode === "open" || b.mode === "closed" ? b.mode : undefined;
  if (mode === undefined) return void tolak(res, "data_salah", 400, { field: "mode" });
  const c = await wajibHakPlot(res, s);
  if (!c) return;
  await c.db
    .insert(recTubesState)
    .values({ editionId: c.edisiId, teamsLock: mode })
    .onConflictDoUpdate({ target: recTubesState.editionId, set: { teamsLock: mode } });
  await writeAudit(s.nim, "rec_tim_kunci", { mode });
  res.status(200).json({ ok: true });
}

/* ------------------------------------------------------------ topics */

async function wajibHakTopik(res: ApiResponse, s: SessionPayload) {
  const c = await muatKonteks(res);
  if (!c) return null;
  const p = await muatPelaku(c.db, c.edisiId, s.nim);
  if (!wajibHak(res, p, "bank")) return null;
  return c;
}

async function handleTopikSimpan(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const title = teks(b.title, 80);
  const brief = teks(b.brief, 2000);
  const cap = Number(b.cap);
  if (!title) return void tolak(res, "data_salah", 400, { field: "title" });
  if (!brief) return void tolak(res, "data_salah", 400, { field: "brief" });
  if (!Number.isInteger(cap) || cap < 1 || cap > 40)
    return void tolak(res, "data_salah", 400, { field: "cap" });
  const c = await wajibHakTopik(res, s);
  if (!c) return;
  const id = b.id === undefined ? null : nomor(b.id);
  if (id) {
    const r = await c.db
      .update(recTubesTopic)
      .set({ title, brief, cap })
      .where(and(eq(recTubesTopic.id, id), eq(recTubesTopic.editionId, c.edisiId)))
      .returning({ id: recTubesTopic.id });
    if (!r.length) return void tolak(res, "tidak_ada", 404);
  } else {
    const [m] = await c.db
      .select({ n: sql<number>`coalesce(max(${recTubesTopic.sort}), 0)::int` })
      .from(recTubesTopic)
      .where(eq(recTubesTopic.editionId, c.edisiId));
    await c.db
      .insert(recTubesTopic)
      .values({ editionId: c.edisiId, title, brief, cap, sort: (m?.n ?? 0) + 1 });
  }
  await writeAudit(s.nim, "rec_tubes_topik", { id, title });
  res.status(200).json({ ok: true });
}

async function handleTopikHapus(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const id = nomor(jsonBody(req).id);
  if (!id) return void tolak(res, "data_salah", 400, { field: "id" });
  const c = await wajibHakTopik(res, s);
  if (!c) return;
  await c.db
    .delete(recTubesTopic)
    .where(and(eq(recTubesTopic.id, id), eq(recTubesTopic.editionId, c.edisiId)));
  await writeAudit(s.nim, "rec_tubes_topik_hapus", { id });
  res.status(200).json({ ok: true });
}

async function handleTopikAtur(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const teamId = nomor(b.teamId);
  const topicId = b.topicId === null ? null : nomor(b.topicId);
  if (!teamId || (b.topicId !== null && !topicId)) return void tolak(res, "data_salah", 400);
  const c = await wajibHakTopik(res, s);
  if (!c) return;
  if (topicId) {
    const [x] = await c.db
      .select({ id: recTubesTopic.id })
      .from(recTubesTopic)
      .where(and(eq(recTubesTopic.id, topicId), eq(recTubesTopic.editionId, c.edisiId)));
    if (!x) return void tolak(res, "tidak_ada", 404);
  }
  const r = await c.db
    .update(recTeam)
    .set({ topicId, drawnAt: null })
    .where(and(eq(recTeam.id, teamId), eq(recTeam.editionId, c.edisiId)))
    .returning({ id: recTeam.id });
  if (!r.length) return void tolak(res, "tidak_ada", 404);
  await writeAudit(s.nim, "rec_tubes_topik_atur", { teamId, topicId });
  res.status(200).json({ ok: true });
}

/** Bagi Rata: teams without a topic take the topics in turn, the emptiest first. */
async function handleTopikBagi(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const c = await wajibHakTopik(res, s);
  if (!c) return;
  const [tims, topik] = await Promise.all([
    muatTim(c.db, c.edisiId),
    c.db
      .select()
      .from(recTubesTopic)
      .where(eq(recTubesTopic.editionId, c.edisiId))
      .orderBy(asc(recTubesTopic.sort)),
  ]);
  if (!topik.length) return void tolak(res, "tidak_ada", 404);
  const peta = shareEvenly(
    tims.filter((t) => joined(t).length > 0).map((t) => t.team.id),
    topik.map((t) => t.id),
  );
  await c.db.transaction(async (tx) => {
    for (const [teamId, topicId] of peta)
      await tx.update(recTeam).set({ topicId, drawnAt: null }).where(eq(recTeam.id, teamId));
  });
  await writeAudit(s.nim, "rec_tubes_bagi", { teams: peta.size });
  res.status(200).json({ ok: true, teams: peta.size });
}

/** Undi: the server picks (never the page), one team or every team still waiting. */
async function handleUndi(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const c = await wajibHakTopik(res, s);
  if (!c) return;
  const [tims, topik] = await Promise.all([
    muatTim(c.db, c.edisiId),
    c.db
      .select()
      .from(recTubesTopic)
      .where(eq(recTubesTopic.editionId, c.edisiId))
      .orderBy(asc(recTubesTopic.sort)),
  ]);
  if (!topik.length) return void tolak(res, "tidak_ada", 404);
  const target =
    b.teamId === undefined
      ? tims.filter((t) => !t.team.drawnAt)
      : tims.filter((t) => t.team.id === nomor(b.teamId));
  if (!target.length) return void res.status(200).json({ ok: true, drawn: [] });
  const dipakai = new Map<number, number>();
  for (const t of tims)
    if (t.team.topicId && t.team.drawnAt)
      dipakai.set(t.team.topicId, (dipakai.get(t.team.topicId) ?? 0) + 1);
  const hasil: { teamId: number; topicId: number }[] = [];
  for (const t of target) {
    const id = drawTopic(topik, dipakai, Math.random());
    if (id === null) continue;
    dipakai.set(id, (dipakai.get(id) ?? 0) + 1);
    hasil.push({ teamId: t.team.id, topicId: id });
  }
  await c.db.transaction(async (tx) => {
    for (const h of hasil)
      await tx
        .update(recTeam)
        .set({ topicId: h.topicId, drawnAt: new Date() })
        .where(eq(recTeam.id, h.teamId));
  });
  await writeAudit(s.nim, "rec_tubes_undi", { count: hasil.length });
  res.status(200).json({ ok: true, drawn: hasil });
}

async function handleUndiUlang(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const c = await wajibHakTopik(res, s);
  if (!c) return;
  await c.db
    .update(recTeam)
    .set({ topicId: null, drawnAt: null })
    .where(eq(recTeam.editionId, c.edisiId));
  await writeAudit(s.nim, "rec_tubes_undi_ulang", {});
  res.status(200).json({ ok: true });
}

async function handleTerbit(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  if (typeof b.publish !== "boolean")
    return void tolak(res, "data_salah", 400, { field: "publish" });
  const c = await wajibHakTopik(res, s);
  if (!c) return;
  if (b.publish) {
    const tims = await muatTim(c.db, c.edisiId);
    const topik = await c.db
      .select()
      .from(recTubesTopic)
      .where(eq(recTubesTopic.editionId, c.edisiId));
    const tanpa = tims.filter((t) => joined(t).length > 0 && !t.team.topicId).length;
    const lebih = topik.filter(
      (x) => tims.filter((t) => t.team.topicId === x.id).length > x.cap,
    ).length;
    if (tanpa > 0 || lebih > 0) return void tolak(res, "topik_penuh", 409, { tanpa, lebih });
  }
  await c.db
    .insert(recTubesState)
    .values({
      editionId: c.edisiId,
      topicsPublishedAt: b.publish ? new Date() : null,
      topicsPublishedBy: b.publish ? s.nim : null,
    })
    .onConflictDoUpdate({
      target: recTubesState.editionId,
      set: {
        topicsPublishedAt: b.publish ? new Date() : null,
        topicsPublishedBy: b.publish ? s.nim : null,
      },
    });
  await writeAudit(s.nim, "rec_tubes_terbit", { publish: b.publish });
  res.status(200).json({ ok: true });
}

/* ------------------------------------------------------------ the lab evenings */

const waktuIso = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

async function handleSesiSimpan(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const startsAt = waktuIso(b.startsAt);
  const endsAt = waktuIso(b.endsAt);
  const capacity = Number(b.capacity);
  const place = teks(b.place ?? "Lab IRIS", 60);
  if (!startsAt || !endsAt || endsAt <= startsAt)
    return void tolak(res, "data_salah", 400, { field: "startsAt" });
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 500)
    return void tolak(res, "data_salah", 400, { field: "capacity" });
  if (!place) return void tolak(res, "data_salah", 400, { field: "place" });
  const c = await wajibHakPlot(res, s);
  if (!c) return;
  const id = b.id === undefined ? null : nomor(b.id);
  if (id) {
    const r = await c.db
      .update(recTubesSession)
      .set({ startsAt, endsAt, capacity, place })
      .where(and(eq(recTubesSession.id, id), eq(recTubesSession.editionId, c.edisiId)))
      .returning({ id: recTubesSession.id });
    if (!r.length) return void tolak(res, "tidak_ada", 404);
  } else {
    await c.db
      .insert(recTubesSession)
      .values({ editionId: c.edisiId, startsAt, endsAt, capacity, place });
  }
  await writeAudit(s.nim, "rec_tubes_sesi", { id, capacity });
  res.status(200).json({ ok: true });
}

async function handleSesiHapus(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const id = nomor(jsonBody(req).id);
  if (!id) return void tolak(res, "data_salah", 400, { field: "id" });
  const c = await wajibHakPlot(res, s);
  if (!c) return;
  await c.db
    .delete(recTubesSession)
    .where(and(eq(recTubesSession.id, id), eq(recTubesSession.editionId, c.edisiId)));
  await writeAudit(s.nim, "rec_tubes_sesi_hapus", { id });
  res.status(200).json({ ok: true });
}

/** One evening per day of the Pengerjaan, from the calendar, when none exist yet. */
async function handleSesiBibit(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const capacity = Number(jsonBody(req).capacity ?? 12);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)
    return void tolak(res, "data_salah", 400, { field: "capacity" });
  const c = await wajibHakPlot(res, s);
  if (!c) return;
  const work = workEvent(c.events);
  if (!work) return void tolak(res, "tidak_ada", 404);
  const [ada] = await c.db
    .select({ n: sql<number>`count(*)::int` })
    .from(recTubesSession)
    .where(eq(recTubesSession.editionId, c.edisiId));
  if ((ada?.n ?? 0) > 0) return void tolak(res, "sudah_ada", 409);
  const rows = defaultSessions(work, capacity).map((x) => ({
    editionId: c.edisiId,
    ...x,
    place: work.place ?? "Lab IRIS",
  }));
  if (rows.length) await c.db.insert(recTubesSession).values(rows);
  await writeAudit(s.nim, "rec_tubes_sesi_bibit", { n: rows.length, capacity });
  res.status(200).json({ ok: true, made: rows.length });
}

/** Panitia moves a team to an evening, past the CaAs's own cutoff; a full evening needs `force`. */
async function handleSesiAtur(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const teamId = nomor(b.teamId);
  const sessionId = b.sessionId === null ? null : nomor(b.sessionId);
  if (!teamId || (b.sessionId !== null && !sessionId)) return void tolak(res, "data_salah", 400);
  const c = await wajibHakPlot(res, s);
  if (!c) return;
  const tims = await muatTim(c.db, c.edisiId);
  const t = tims.find((x) => x.team.id === teamId);
  if (!t) return void tolak(res, "tidak_ada", 404);
  if (sessionId) {
    const [x] = await c.db
      .select()
      .from(recTubesSession)
      .where(and(eq(recTubesSession.id, sessionId), eq(recTubesSession.editionId, c.edisiId)));
    if (!x) return void tolak(res, "tidak_ada", 404);
    const used =
      (kursiTerpakai(tims).get(x.id) ?? 0) - (t.team.sessionId === x.id ? joined(t).length : 0);
    if (used + joined(t).length > x.capacity && b.force !== true)
      return void tolak(res, "penuh", 409, { left: Math.max(0, x.capacity - used) });
  }
  await c.db.update(recTeam).set({ sessionId }).where(eq(recTeam.id, teamId));
  await writeAudit(s.nim, "rec_tubes_sesi_atur", { teamId, sessionId });
  res.status(200).json({ ok: true });
}

/* ------------------------------------------------------------ the Ketua's override */

async function handleOverride(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const teamId = nomor(b.teamId);
  const note = teks(b.note, 300);
  const until = b.until === undefined || b.until === null ? null : waktuIso(b.until);
  if (!teamId) return void tolak(res, "data_salah", 400, { field: "teamId" });
  // The note is required: why this team may still send.
  if (!note || note.length < 5) return void tolak(res, "data_salah", 400, { field: "note" });
  if (b.until !== undefined && b.until !== null && !until)
    return void tolak(res, "data_salah", 400, { field: "until" });
  const c = await muatKonteks(res);
  if (!c) return;
  const p = await muatPelaku(c.db, c.edisiId, s.nim);
  if (!wajibHak(res, p, "cuttingLock")) return;
  const r = await c.db
    .update(recTeam)
    .set({ overrideNote: note, overrideBy: s.nim, overrideUntil: until, overrideAt: new Date() })
    .where(and(eq(recTeam.id, teamId), eq(recTeam.editionId, c.edisiId)))
    .returning({ id: recTeam.id });
  if (!r.length) return void tolak(res, "tidak_ada", 404);
  await writeAudit(s.nim, "rec_tubes_izin", { teamId, until: until?.toISOString() ?? null, note });
  res.status(200).json({ ok: true });
}

async function handleOverrideHapus(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const teamId = nomor(jsonBody(req).teamId);
  if (!teamId) return void tolak(res, "data_salah", 400, { field: "teamId" });
  const c = await muatKonteks(res);
  if (!c) return;
  const p = await muatPelaku(c.db, c.edisiId, s.nim);
  if (!wajibHak(res, p, "cuttingLock")) return;
  await c.db
    .update(recTeam)
    .set({ overrideNote: null, overrideBy: null, overrideUntil: null, overrideAt: null })
    .where(and(eq(recTeam.id, teamId), eq(recTeam.editionId, c.edisiId)));
  await writeAudit(s.nim, "rec_tubes_izin_hapus", { teamId });
  res.status(200).json({ ok: true });
}

/* ------------------------------------------------------------ the Presentasi order */

/** Makes the tables (slots of stage tubes) from the Presentasi event and the turn length. */
async function handleMejaBuat(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const n = Number(b.tables);
  if (!Number.isInteger(n) || n < 1 || n > 12)
    return void tolak(res, "data_salah", 400, { field: "tables" });
  const c = await wajibHakPlot(res, s);
  if (!c) return;
  const pres = presentasiEvent(c.events);
  if (!pres) return void tolak(res, "tidak_ada", 404);
  const t = await bacaSetting(c.db, "tubes");
  const mulai = eventStart(pres);
  const akhir = new Date(`${pres.startsOn}T${pres.dayEnd ?? "21:00"}:00+07:00`);
  const giliran = Math.max(1, Math.floor((akhir.getTime() - mulai.getTime()) / 60_000 / t.minutes));
  const ada = await c.db
    .select({ id: recSlot.id })
    .from(recSlot)
    .where(and(eq(recSlot.editionId, c.edisiId), eq(recSlot.stage, "tubes")));
  if (ada.length && b.force !== true) return void tolak(res, "sudah_ada", 409, { n: ada.length });
  await c.db.transaction(async (tx) => {
    if (ada.length)
      await tx.delete(recSlot).where(
        inArray(
          recSlot.id,
          ada.map((x) => x.id),
        ),
      );
    await tx.insert(recSlot).values(
      Array.from({ length: n }, (_, i) => ({
        editionId: c.edisiId,
        stage: "tubes" as const,
        eventId: pres.id,
        room: `Meja ${i + 1}`,
        startsAt: mulai,
        endsAt: new Date(mulai.getTime() + giliran * t.minutes * 60_000),
        capacity: giliran,
      })),
    );
  });
  await writeAudit(s.nim, "rec_tubes_meja", { tables: n, turns: giliran });
  res.status(200).json({ ok: true, turns: giliran });
}

/** Deals every team (with a joined member) over the tables, replacing the order. */
async function handleUrutanBagi(_req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const c = await wajibHakPlot(res, s);
  if (!c) return;
  const slots = await c.db
    .select()
    .from(recSlot)
    .where(and(eq(recSlot.editionId, c.edisiId), eq(recSlot.stage, "tubes")))
    .orderBy(asc(recSlot.room), asc(recSlot.id));
  if (!slots.length) return void tolak(res, "tidak_ada", 404);
  const tims = (await muatTim(c.db, c.edisiId)).filter((t) => joined(t).length > 0);
  const bagi = dealTeams(
    tims.map((t) => t.team.leaderId),
    slots.length,
    Math.random,
  );
  await c.db.transaction(async (tx) => {
    await tx.delete(recSlotAssignment).where(
      inArray(
        recSlotAssignment.slotId,
        slots.map((x) => x.id),
      ),
    );
    for (let i = 0; i < slots.length; i++)
      for (const leaderId of bagi[i])
        await tx.insert(recSlotAssignment).values({
          slotId: slots[i].id,
          candidateId: leaderId,
          stage: "tubes",
          via: "panitia",
          by: s.nim,
        });
  });
  await writeAudit(s.nim, "rec_tubes_urutan_bagi", { teams: tims.length, tables: slots.length });
  res.status(200).json({ ok: true });
}

/** Sets one table's order: the teams in turn. A team named here leaves any other table. */
async function handleUrutanAtur(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const b = jsonBody(req);
  const slotId = nomor(b.slotId);
  const ids = Array.isArray(b.teamIds) ? b.teamIds.map(nomor) : null;
  if (!slotId || !ids || ids.some((x) => !x) || new Set(ids).size !== ids.length)
    return void tolak(res, "data_salah", 400);
  const c = await wajibHakPlot(res, s);
  if (!c) return;
  const [slot] = await c.db
    .select()
    .from(recSlot)
    .where(
      and(eq(recSlot.id, slotId), eq(recSlot.editionId, c.edisiId), eq(recSlot.stage, "tubes")),
    );
  if (!slot) return void tolak(res, "tidak_ada", 404);
  const tims = await muatTim(c.db, c.edisiId);
  const pemimpin = (ids as number[]).map((id) => tims.find((t) => t.team.id === id)?.team.leaderId);
  if (pemimpin.some((x) => x === undefined)) return void tolak(res, "tidak_ada", 404);
  const lead = pemimpin as number[];
  await c.db.transaction(async (tx) => {
    if (lead.length)
      await tx
        .delete(recSlotAssignment)
        .where(
          and(inArray(recSlotAssignment.candidateId, lead), eq(recSlotAssignment.stage, "tubes")),
        );
    await tx.delete(recSlotAssignment).where(eq(recSlotAssignment.slotId, slotId));
    for (const leaderId of lead)
      await tx
        .insert(recSlotAssignment)
        .values({ slotId, candidateId: leaderId, stage: "tubes", via: "panitia", by: s.nim });
  });
  await writeAudit(s.nim, "rec_tubes_urutan", { slotId, teams: lead.length });
  res.status(200).json({ ok: true });
}

/* ------------------------------------------------------------ routes */

export const S7_GET: Record<string, H> = {
  "tubes-board": handleBoard,
};
export const S7_BERSAMA_GET: Record<string, H> = {
  "tubes-file": handleBacaFile,
};
export const S7_POST: Record<string, H> = {
  "tubes-team-admin": handleTimAdmin,
  "tubes-team-auto": handleTimOtomatis,
  "tubes-team-lock": handleKunciTim,
  "tubes-topic-save": handleTopikSimpan,
  "tubes-topic-delete": handleTopikHapus,
  "tubes-topic-set": handleTopikAtur,
  "tubes-topic-share": handleTopikBagi,
  "tubes-draw": handleUndi,
  "tubes-draw-reset": handleUndiUlang,
  "tubes-publish": handleTerbit,
  "tubes-session-save": handleSesiSimpan,
  "tubes-session-delete": handleSesiHapus,
  "tubes-session-seed": handleSesiBibit,
  "tubes-session-set": handleSesiAtur,
  "tubes-override": handleOverride,
  "tubes-override-clear": handleOverrideHapus,
  "tubes-tables-make": handleMejaBuat,
  "tubes-order-deal": handleUrutanBagi,
  "tubes-order-set": handleUrutanAtur,
};
