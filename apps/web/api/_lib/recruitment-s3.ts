/**
 * The exam's actions (Open Recruitment S3, EXAM-ENGINE 10.3): which action
 * goes to which area's handler, and who may call it. One table per audience
 * and method; each handler reads `req.query.aksi` to tell its own actions
 * apart and checks its own rights (the table only settles who is signed in).
 *
 *   09  recruitment-bank.ts       the bank, the config, the references
 *   10  recruitment-seat.ts       the runner, a candidate's seat
 *   11  recruitment-room.ts       rooms, the console, the Master
 *   12  recruitment-livecode.ts   Live Coding (seat, graders, topic pool)
 *   13  recruitment-score.ts      scores, voids, Finalkan
 *
 * To add an action: put its name in the right table below (the siaran test
 * then asks for its entry in src/lib/siaran-topik.ts).
 */
import type { SessionPayload } from "../../src/lib/auth.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { requireMethod } from "./http.js";
import { currentSession, requireRole } from "./session.js";
import { sesiOprec, wajibOprec } from "./recruitment-akun.js";
import { handleBank } from "./recruitment-bank.js";
import { handleLiveCode } from "./recruitment-livecode.js";
import { handleLcc } from "./recruitment-lcc.js";
import { handleRoom } from "./recruitment-room.js";
import { handleScore } from "./recruitment-score.js";
import { handleSeat } from "./recruitment-seat.js";

export type S3Handler = (req: ApiRequest, res: ApiResponse, s: SessionPayload) => unknown;

/** A candidate's seat, signed in with an oprec account (never the practicum session). */
const OPREC_GET: Record<string, S3Handler> = {
  test: handleSeat,
  "test-ticket": handleSeat,
  lc: handleLiveCode,
  "lc-bin": handleLiveCode,
  lcc: handleLcc,
};
const OPREC_POST: Record<string, S3Handler> = {
  "test-checkin": handleSeat,
  "test-answer": handleSeat,
  "test-strike": handleSeat,
  "test-submit": handleSeat,
  "test-hotspot": handleSeat,
  "lc-spin": handleLiveCode,
  "lcc-send": handleLcc,
  "lc-code": handleLiveCode,
  "lc-board": handleLiveCode,
  "lc-variant": handleLiveCode,
  "lc-compile": handleLiveCode,
  "lc-flash": handleLiveCode,
};

/** A seat during its part or a Panitia member: the handler tells them apart. */
const BERSAMA_GET: Record<string, S3Handler> = {
  media: handleBank,
  ref: handleBank,
  "lc-ticket": handleLiveCode,
};

/** The Panitia (an Asisten session); each handler checks the right. */
const ASISTEN_GET: Record<string, S3Handler> = {
  "exam-config": handleBank,
  questions: handleBank,
  question: handleBank,
  problems: handleBank,
  problem: handleBank,
  "bank-export": handleBank,
  references: handleBank,
  rooms: handleRoom,
  room: handleRoom,
  "room-ticket": handleRoom,
  "room-log": handleRoom,
  "lc-room": handleLiveCode,
  "lcc-room": handleLcc,
  "lc-rubric": handleLiveCode,
  "lc-topics": handleLiveCode,
  "lc-templates": handleLiveCode,
  scores: handleScore,
  "score-stats": handleScore,
};
const ASISTEN_POST: Record<string, S3Handler> = {
  "exam-config-save": handleBank,
  "question-save": handleBank,
  "question-delete": handleBank,
  "problem-save": handleBank,
  "problem-check": handleBank,
  "problem-delete": handleBank,
  "bank-import": handleBank,
  "bank-seed": handleBank,
  "media-ticket": handleBank,
  "reference-add": handleBank,
  "reference-refetch": handleBank,
  "reference-upload": handleBank,
  "reference-delete": handleBank,
  "reference-attach": handleBank,
  "room-setup": handleRoom,
  "room-act": handleRoom,
  "room-master": handleRoom,
  "room-note": handleRoom,
  "room-kit": handleRoom,
  "room-move": handleRoom,
  "lc-hotspot": handleLiveCode,
  "lc-grade": handleLiveCode,
  "lc-grade-withdraw": handleLiveCode,
  "lc-topic-save": handleLiveCode,
  "lc-topic-delete": handleLiveCode,
  "lc-template-save": handleLiveCode,
  "lc-rubric-save": handleLiveCode,
  "question-void": handleScore,
  "question-unvoid": handleScore,
  "score-finalize": handleScore,
  "score-unfreeze": handleScore,
};

type Jalur = {
  tabel: Record<string, S3Handler>;
  method: "GET" | "POST";
  siapa: "oprec" | "bersama" | "asisten";
};
const JALUR: Jalur[] = [
  { tabel: OPREC_GET, method: "GET", siapa: "oprec" },
  { tabel: OPREC_POST, method: "POST", siapa: "oprec" },
  { tabel: BERSAMA_GET, method: "GET", siapa: "bersama" },
  { tabel: ASISTEN_GET, method: "GET", siapa: "asisten" },
  { tabel: ASISTEN_POST, method: "POST", siapa: "asisten" },
];

/** True when `aksi` is an S3 action and has been answered here, false to let the route go on. */
export async function handleS3(aksi: unknown, req: ApiRequest, res: ApiResponse): Promise<boolean> {
  if (typeof aksi !== "string") return false;
  const jalur = JALUR.find((j) => Object.hasOwn(j.tabel, aksi));
  if (!jalur) return false;
  if (!requireMethod(req, res, jalur.method)) return true;
  let s: SessionPayload | null;
  if (jalur.siapa === "oprec") s = await wajibOprec(req, res);
  else if (jalur.siapa === "asisten") s = requireRole(req, res, "asisten");
  else {
    const sesiku = currentSession(req);
    s = sesiku?.role === "asisten" ? sesiku : await sesiOprec(req);
    if (!s) res.status(401).json({ ok: false, kode: "belum_masuk" });
  }
  if (s) await jalur.tabel[aksi](req, res, s);
  return true;
}
