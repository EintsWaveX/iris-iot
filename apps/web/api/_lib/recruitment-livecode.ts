/**
 * Live Coding (Phase 2 of the exam, prompt 12, EXAM-ENGINE 9 and 10.3). The
 * table in recruitment-s3.ts sends every `lc-*` action here; this file tells
 * them apart and leaves each area to its own module:
 *
 *   recruitment-lc-deal.ts     spins, the automatic deal, the re-roll, the room hooks
 *   recruitment-lc-compile.ts  compile, flash, the image, Finish
 *   recruitment-lc-grade.ts    the grading list and sheets
 *   recruitment-lc-pool.ts     topics, templates and rubric in the bank
 *   recruitment-lc-agent.ts    the PC agent's jobs
 *
 * and keeps the seat's editor state here (lc, lc-code, lc-board, lc-variant),
 * the gateway ticket (lc-ticket) and the Master's hotspot move (lc-hotspot).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { SessionPayload } from "../../src/lib/auth.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody, noStore } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import {
  recCompileJob,
  recExamRoom,
  recExamSeat,
  recKitLoan,
  recLcTopic,
  recLivecode,
  recSlotExaminer,
} from "../../src/lib/schema.js";
import { answerOpen } from "../../src/lib/recruitment/room.js";
import { canMoveBoard } from "../../src/lib/recruitment/hotspot.js";
import {
  CHIPS,
  CODE_MAX,
  templateKey,
  type Chip,
  type LcBoard,
} from "../../src/lib/recruitment/lc-types.js";
import { endpointsFor, elideToken, signLcWeb } from "../../src/lib/recruitment/lc-gateway.js";
import { queueChips } from "../../src/lib/recruitment/lc-queue.js";
import type { LiveCodeSelf, SelfBoard, SelfJob } from "../../src/lib/recruitment/lc-api.js";
import { acakId } from "../../src/lib/tanda.js";
import { tolak, wajibEdisi } from "./recruitment-data.js";
import { muatPelaku } from "./recruitment-rights.js";
import { aksiKolam, muatTemplate } from "./recruitment-lc-pool.js";
import { GalatLc, pasangKait, putar } from "./recruitment-lc-deal.js";
import { aksiKompilasi, jobTerakhir, tutupLc } from "./recruitment-lc-compile.js";
import { aksiNilai } from "./recruitment-lc-grade.js";
import { antreanRuang, hangatkan, waktuBiasa } from "./recruitment-lc-agent.js";
import {
  agenSiap,
  faseLc,
  gatewaySecret,
  headerPapan,
  muatKonteksSeat,
  nomorKursi,
  papanDi,
  rencanaRuang,
  tokenKursi,
  tolakLc,
  type KonteksLc,
} from "./recruitment-lc-common.js";
import { antreUjian } from "./recruitment-room.js";
import { positionOf } from "../../src/lib/recruitment/lc-queue.js";

pasangKait(tutupLc);

const SEAT_GET = new Set(["lc"]);
const SEAT_POST = new Set(["lc-spin", "lc-code", "lc-board", "lc-variant"]);
const KOMPILASI = new Set(["lc-compile", "lc-flash", "lc-bin"]);
const NILAI = new Set(["lc-room", "lc-rubric", "lc-grade", "lc-grade-withdraw"]);
const KOLAM = new Set([
  "lc-topics",
  "lc-topic-save",
  "lc-topic-delete",
  "lc-templates",
  "lc-template-save",
  "lc-rubric-save",
]);

export async function handleLiveCode(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  const aksi = String(req.query.aksi ?? "");
  try {
    if (aksi === "lc-ticket") return await tiket(req, res, s);
    if (aksi === "lc-hotspot") return await pindahPapan(req, res, s);
    if (NILAI.has(aksi)) return await aksiNilai(req, res, s, aksi);
    if (KOLAM.has(aksi)) return await aksiKolam(req, res, s, aksi);
    if (KOMPILASI.has(aksi)) return await aksiKompilasi(req, res, s, aksi);
    if (SEAT_GET.has(aksi) || SEAT_POST.has(aksi)) return await aksiKursi(req, res, s, aksi);
  } catch (e) {
    if (e instanceof GalatLc) return void tolak(res, e.kode, e.status);
    throw e;
  }
  tolak(res, "aksi_tidak_dikenal", 404);
}

/* ------------------------------------------------------------- the seat */

async function aksiKursi(req: ApiRequest, res: ApiResponse, s: SessionPayload, aksi: string) {
  const c = await muatKonteksSeat(req, res, s);
  if (!c) return;
  noStore(res);
  if (aksi === "lc") return bacaLc(c, res);
  if (aksi === "lc-spin") {
    const fase = faseLc(c.room.state, c.now);
    if (fase !== "spin" && fase !== "kerja")
      return void tolakLc(res, fase === "selesai" ? "ruang_selesai" : "belum_dibuka");
    const what = jsonBody(req).what;
    if (what !== "topic" && what !== "protocol")
      return void tolak(res, "data_salah", 400, { field: "what" });
    return void res.status(200).json(await putar(c, what));
  }
  if (aksi === "lc-code") return simpanKode(c, req, res);
  if (aksi === "lc-board") return aturPapan(c, req, res);
  if (aksi === "lc-variant") return gantiVarian(c, req, res);
}

async function bacaLc(c: KonteksLc, res: ApiResponse) {
  const fase = faseLc(c.room.state, c.now);
  if (fase === "belum") return void tolakLc(res, "belum_dibuka");
  if (fase === "selesai") return void tolakLc(res, "ruang_selesai");
  const { db, lc } = c;

  const topikRows = lc?.topicId
    ? await db.select().from(recLcTopic).where(eq(recLcTopic.id, lc.topicId)).limit(1)
    : [];
  const topik = topikRows[0] ?? null;
  const [nomor, antre, biasa, agen] = await Promise.all([
    nomorKursi(db, c.room),
    antreanRuang(db, c.room.id),
    waktuBiasa(db, c.room.id),
    agenSiap(db),
  ]);
  if (fase === "spin") {
    const libs = topik ? [topik.libs] : [];
    await hangatkan(db, c.room.id, libs).catch((e) => console.error("[lc] warm-up:", e));
  }

  const jobs: SelfJob[] = [];
  const boards: SelfBoard[] = [];
  if (lc && lc.protocol) {
    const rencana = await rencanaRuang(db, c.room);
    const token = await tokenKursi(c.room, c.slot, c.seat.id);
    for (const b of lc.boards) {
      const tempat = lc.protocol === "ble" ? null : papanDi(rencana, c.room.id, c.seat.id, b.n);
      const baik = await jobTerakhir(db, c.seat.id, b.n);
      const header = await headerPapan(c, rencana, b.n);
      const ep = endpointsFor(token || "…", c.seat.id, b.n);
      boards.push({
        n: b.n,
        chip: b.chip,
        code: b.code,
        rev: b.rev,
        hotspot: {
          ssid: tempat?.ssid ?? null,
          own: tempat?.own ?? false,
          needed: lc.protocol !== "ble",
        },
        endpoints: {
          ...ep,
          ws: elideToken(ep.ws, token || "…"),
          http: elideToken(ep.http, token || "…"),
          mqtt: { ...ep.mqtt, host: elideToken(ep.mqtt.host, token || "…") },
        },
        stale: !!baik && baik.header !== header,
      });
      const [j] = await db
        .select()
        .from(recCompileJob)
        .where(and(eq(recCompileJob.seatId, c.seat.id), eq(recCompileJob.board, b.n)))
        .orderBy(desc(recCompileJob.id))
        .limit(1);
      if (j)
        jobs.push({
          id: j.id,
          board: b.n,
          status: j.status,
          position: positionOf(antre, j.id),
          ok: j.ok,
          kode: (j.kode as SelfJob["kode"]) ?? null,
          log: j.log,
          ms: j.ms,
          size: j.binSize,
          requestedAt: j.requestedAt.getTime(),
          finishedAt: j.finishedAt?.getTime() ?? null,
        });
    }
  }

  const spinTerakhir = (what: "topic" | "protocol") => {
    const e = [...(lc?.spins ?? [])].reverse().find((x) => x.what === what);
    return e ? { at: e.at, by: e.by, ...(e.reason ? { reason: e.reason } : {}) } : null;
  };
  const out: LiveCodeSelf & { ok: true } = {
    ok: true,
    now: c.now,
    seatId: c.seat.id,
    seatNo: nomor.get(c.seat.id) ?? 0,
    phase: fase === "spin" ? "spin" : "work",
    topic: topik
      ? {
          id: topik.id,
          title: topik.title,
          brief: topik.brief,
          parts: topik.parts,
          icon: topik.icon,
        }
      : null,
    protocol: lc?.protocol ?? null,
    variant: lc?.variant ?? null,
    landed: { topic: spinTerakhir("topic"), protocol: spinTerakhir("protocol") },
    protocols: c.config.livecode.protocols,
    boards,
    runs: [...(lc?.runs ?? [])].reverse(),
    jobs,
    queue: queueChips(antre, nomor, c.seat.id),
    typicalMs: biasa,
    agent: agen,
    gateway: !!gatewaySecret(),
    editable: fase === "kerja" && answerOpen(c.room.state, c.seat.id, "livecode", c.now),
  };
  res.status(200).json(out);
}

/** Saves a board's code (the editor's autosave): optimistic on the board's revision. */
async function simpanKode(c: KonteksLc, req: ApiRequest, res: ApiResponse) {
  const b = jsonBody(req);
  const fase = faseLc(c.room.state, c.now);
  if (fase !== "kerja" || !answerOpen(c.room.state, c.seat.id, "livecode", c.now))
    return void tolakLc(
      res,
      fase === "selesai"
        ? "ruang_selesai"
        : fase === "kerja" || fase === "usai"
          ? "waktu_habis"
          : "belum_dibuka",
    );
  if (typeof b.code !== "string") return void tolak(res, "data_salah", 400, { field: "code" });
  if (new TextEncoder().encode(b.code).length > CODE_MAX)
    return void tolak(res, "terlalu_besar", 400);
  const n = Number(b.board);
  const hasil = await c.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(recLivecode)
      .where(eq(recLivecode.seatId, c.seat.id))
      .for("update");
    const papan = row?.boards.find((x) => x.n === n);
    if (!row || !papan) return { kode: "data_salah" as const };
    if (papan.rev !== b.rev) return { kode: "versi_lama" as const, rev: papan.rev };
    if (papan.code === b.code) return { rev: papan.rev };
    const boards = row.boards.map((x) =>
      x.n === n ? { ...x, code: b.code as string, rev: x.rev + 1 } : x,
    );
    await tx
      .update(recLivecode)
      .set({ boards, updatedAt: new Date() })
      .where(eq(recLivecode.seatId, c.seat.id));
    return { rev: papan.rev + 1 };
  });
  if (hasil.kode)
    return void tolak(
      res,
      hasil.kode,
      hasil.kode === "versi_lama" ? 409 : 400,
      hasil.rev !== undefined ? { rev: hasil.rev } : {},
    );
  res.status(200).json({ ok: true, rev: hasil.rev });
}

/** Tambah Papan, remove Papan 2, or change a board's chip (9.3a). */
async function aturPapan(c: KonteksLc, req: ApiRequest, res: ApiResponse) {
  const b = jsonBody(req);
  const fase = faseLc(c.room.state, c.now);
  if (fase === "selesai") return void tolakLc(res, "ruang_selesai");
  if (
    fase !== "spin" &&
    !(fase === "kerja" && answerOpen(c.room.state, c.seat.id, "livecode", c.now))
  )
    return void tolakLc(res, fase === "belum" ? "belum_dibuka" : "waktu_habis");
  const lc = c.lc;
  if (!lc?.protocol) return void tolakLc(res, "belum_diundi");
  const kode = await c.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(recLivecode)
      .where(eq(recLivecode.seatId, c.seat.id))
      .for("update");
    let boards = [...row.boards];
    if (b.add === true) {
      if (boards.length >= 2) return "papan_penuh";
      const kit = await tx.select().from(recKitLoan).where(eq(recKitLoan.roomId, c.room.id));
      const chip: Chip =
        kit.find((k) => k.candidateId === c.seat.candidateId)?.boards.find((x) => x.n === 2)
          ?.chip ?? "esp32";
      const code = await muatTemplate(c.db, c.edisiId, templateKey(lc.protocol!, lc.variant));
      boards.push({ n: 2, chip, code, rev: 0 });
    } else if (b.remove === 2) {
      const [ada] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(recCompileJob)
        .where(and(eq(recCompileJob.seatId, c.seat.id), eq(recCompileJob.board, 2)));
      if (ada.n > 0) return "sudah_dikompilasi";
      boards = boards.filter((x) => x.n !== 2);
    } else if (typeof b.chip === "string") {
      const n = Number(b.board);
      if (!(CHIPS as readonly string[]).includes(b.chip) || !boards.some((x) => x.n === n))
        return "data_salah";
      boards = boards.map((x): LcBoard => (x.n === n ? { ...x, chip: b.chip as Chip } : x));
    } else return "data_salah";
    await tx
      .update(recLivecode)
      .set({ boards, updatedAt: new Date() })
      .where(eq(recLivecode.seatId, c.seat.id));
    return null;
  });
  if (kode) return void tolak(res, kode, kode === "data_salah" ? 400 : 409);
  const [baru] = await c.db
    .select()
    .from(recLivecode)
    .where(eq(recLivecode.seatId, c.seat.id))
    .limit(1);
  res.status(200).json({
    ok: true,
    boards: baru.boards.map((x) => ({ n: x.n, chip: x.chip, rev: x.rev, code: x.code })),
  });
}

/** HTTP/WebSocket seats choose which of the two to write (9.1). */
async function gantiVarian(c: KonteksLc, req: ApiRequest, res: ApiResponse) {
  const b = jsonBody(req);
  const lc = c.lc;
  if (lc?.protocol !== "httpws") return void tolak(res, "bukan_httpws", 409);
  if (b.variant !== "http" && b.variant !== "ws")
    return void tolak(res, "data_salah", 400, { field: "variant" });
  const fase = faseLc(c.room.state, c.now);
  if (
    fase !== "spin" &&
    !(fase === "kerja" && answerOpen(c.room.state, c.seat.id, "livecode", c.now))
  )
    return void tolakLc(
      res,
      fase === "selesai" ? "ruang_selesai" : fase === "belum" ? "belum_dibuka" : "waktu_habis",
    );
  if (lc.variant === b.variant)
    return void res.status(200).json({
      ok: true,
      variant: b.variant,
      boards: lc.boards.map((x) => ({ n: x.n, code: x.code, rev: x.rev })),
    });
  const lama = await muatTemplate(c.db, c.edisiId, templateKey("httpws", lc.variant));
  const baru = await muatTemplate(c.db, c.edisiId, templateKey("httpws", b.variant));
  const diubah = lc.boards.some((x) => x.code !== lama && x.code !== "");
  if (diubah && b.replace !== true) return void tolak(res, "kode_berubah", 409);
  const boards = lc.boards.map((x) => ({ ...x, code: baru, rev: x.rev + 1 }));
  await c.db
    .update(recLivecode)
    .set({ variant: b.variant, boards, updatedAt: new Date() })
    .where(eq(recLivecode.seatId, c.seat.id));
  res.status(200).json({
    ok: true,
    variant: b.variant,
    boards: boards.map((x) => ({ n: x.n, code: x.code, rev: x.rev })),
  });
}

/* ------------------------------------------------------- gateway tickets */

/** `lc-ticket`: a 60 second, single use ticket for the gateway's page socket. */
async function tiket(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  noStore(res);
  const secret = gatewaySecret();
  if (!secret) return void res.status(200).json({ ok: false, kode: "gateway_belum_diatur" });
  const base = (process.env.REC_GATEWAY_URL?.trim() || "https://ws.irisiotlab.com")
    .replace(/^http/, "ws")
    .replace(/\/+$/, "");
  const now = Math.floor(Date.now() / 1000);
  if (s.role === "asisten") {
    const db = getDb();
    const edisi = await wajibEdisi(res, db);
    if (!edisi) return;
    const roomId = Number(req.query.id);
    const [room] = Number.isInteger(roomId)
      ? await db
          .select()
          .from(recExamRoom)
          .where(and(eq(recExamRoom.id, roomId), eq(recExamRoom.editionId, edisi.id)))
          .limit(1)
      : [];
    if (!room) return void tolak(res, "tidak_ditemukan", 404);
    const p = await muatPelaku(db, edisi.id, s.nim);
    let boleh = !!p && (p.penuh || p.hak.bank);
    if (!boleh && p && room.slotId !== null) {
      const [x] = await db
        .select({ n: recSlotExaminer.asistenNim })
        .from(recSlotExaminer)
        .where(
          and(
            eq(recSlotExaminer.slotId, room.slotId),
            eq(recSlotExaminer.asistenNim, s.nim),
            eq(recSlotExaminer.role, "pengawas"),
          ),
        )
        .limit(1);
      boleh = !!x;
    }
    if (!boleh) return void tolak(res, "tanpa_hak", 403);
    const t = await signLcWeb(
      { role: "grader", r: room.id, nim: s.nim, jti: acakId() },
      secret,
      now,
    );
    return void res.status(200).json({ ok: true, url: `${base}/rec/web`, tiket: t });
  }
  const c = await muatKonteksSeat(req, res, s);
  if (!c) return;
  const t = await signLcWeb(
    { role: "seat", r: c.room.id, s: c.seat.id, jti: acakId() },
    secret,
    now,
  );
  res.status(200).json({ ok: true, url: `${base}/rec/web`, tiket: t });
}

/* ---------------------------------------------------- the Master's hotspot */

/** `lc-hotspot`: the Master moves one board to another hotspot (9.6a); the seat sees Kompilasi Ulang. */
async function pindahPapan(req: ApiRequest, res: ApiResponse, s: SessionPayload) {
  noStore(res);
  const b = jsonBody(req);
  const db = getDb();
  const edisi = await wajibEdisi(res, db);
  if (!edisi) return;
  const seatId = Number(b.seatId);
  const n = Number(b.board);
  const [seat] = Number.isInteger(seatId)
    ? await db
        .select()
        .from(recExamSeat)
        .where(and(eq(recExamSeat.id, seatId), eq(recExamSeat.editionId, edisi.id)))
        .limit(1)
    : [];
  if (!seat || (n !== 1 && n !== 2)) return void tolak(res, "data_salah", 400);
  const [room] = await db
    .select()
    .from(recExamRoom)
    .where(eq(recExamRoom.id, seat.roomId))
    .limit(1);
  if (!room || room.state.master?.nim !== s.nim) return void tolak(res, "bukan_master", 403);
  const rencana = await rencanaRuang(db, room);
  const lc = rencana.lcs.get(seat.id);
  if (!lc?.boards.some((x) => x.n === n)) return void tolak(res, "data_salah", 400);
  const ke = b.hotspot === null ? null : typeof b.hotspot === "string" ? b.hotspot : undefined;
  if (ke === undefined) return void tolak(res, "data_salah", 400, { field: "hotspot" });
  if (ke !== null) {
    const cek = canMoveBoard(rencana.plan, room.hotspots, rencana.loans, seat.id, n, ke);
    if (!cek.ok) return void tolak(res, cek.kode, 409);
  }
  const boards = lc.boards.map((x) => (x.n === n ? { ...x, moved: ke } : x));
  await db
    .update(recLivecode)
    .set({ boards, updatedAt: new Date() })
    .where(eq(recLivecode.seatId, seat.id));
  antreUjian(res, room.id, [{ j: "kursi", s: seat.id, d: { seq: room.state.seq, lc: true } }]);
  res.status(200).json({ ok: true });
}
