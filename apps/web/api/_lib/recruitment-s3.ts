/**
 * The exam's actions (Open Recruitment S3, EXAM-ENGINE 10.3): which action
 * goes to which area's handler, and who may call it. One table per audience
 * and method; each handler reads `req.query.aksi` to tell its own actions
 * apart and checks its own rights (the table only settles who is signed in).
 *
 *   09  recruitment-bank.ts       the bank and the config
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
import { handleLcc } from "./recruitment-lcc.js";
import { handleRoom } from "./recruitment-room.js";
import { handleScore } from "./recruitment-score.js";
import { S4_GET, S4_POST } from "./recruitment-s4.js";
import { S5_GET, S5_POST, guardTutup } from "./recruitment-s5.js";
import { S6_GET, S6_OPREC_GET, S6_OPREC_POST, S6_POST } from "./recruitment-s6.js";
import { S7_OPREC_GET, S7_OPREC_POST } from "./recruitment-s7.js";
import { S7_BERSAMA_GET, S7_GET, S7_POST } from "./recruitment-s7-panel.js";
import { handleSeat } from "./recruitment-seat.js";

export type S3Handler = (req: ApiRequest, res: ApiResponse, s: SessionPayload) => unknown;

/** A candidate's seat, signed in with an oprec account (never the practicum session). */
const OPREC_GET: Record<string, S3Handler> = {
  test: handleSeat,
  "test-ticket": handleSeat,
  lcc: handleLcc,
  ...S6_OPREC_GET,
  ...S7_OPREC_GET,
};
const OPREC_POST: Record<string, S3Handler> = {
  "test-checkin": handleSeat,
  "test-answer": handleSeat,
  "test-strike": handleSeat,
  "test-submit": handleSeat,
  "test-hotspot": handleSeat,
  "test-bonus": handleSeat,
  "lcc-send": handleLcc,
  "lcc-bonus": handleLcc,
  "lcc-done": handleLcc,
  ...S6_OPREC_POST,
  ...S7_OPREC_POST,
};

/** A seat during its part or a Panitia member: the handler tells them apart. */
const BERSAMA_GET: Record<string, S3Handler> = {
  media: handleBank,
  ...S7_BERSAMA_GET,
};

/** The Panitia (an Asisten session); each handler checks the right. */
const ASISTEN_GET: Record<string, S3Handler> = {
  "exam-config": handleBank,
  questions: handleBank,
  question: handleBank,
  problems: handleBank,
  problem: handleBank,
  "bank-export": handleBank,
  rooms: handleRoom,
  room: handleRoom,
  "room-ticket": handleRoom,
  "room-log": handleRoom,
  "lcc-room": handleLcc,
  "lcc-judge": handleLcc,
  scores: handleScore,
  "score-stats": handleScore,
  ...S4_GET,
  ...S5_GET,
  ...S6_GET,
  ...S7_GET,
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
  "room-setup": handleRoom,
  "room-delete": handleRoom,
  "room-act": handleRoom,
  "room-master": handleRoom,
  "room-note": handleRoom,
  "room-kit": handleRoom,
  "room-move": handleRoom,
  "question-void": handleScore,
  "question-unvoid": handleScore,
  "score-finalize": handleScore,
  "score-unfreeze": handleScore,
  ...S4_POST,
  ...S5_POST,
  ...S6_POST,
  ...S7_POST,
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
  // A closed edition is read-only for the Panitia (closing itself is the one write left).
  if (
    s &&
    jalur.siapa === "asisten" &&
    jalur.method === "POST" &&
    aksi !== "pn-close" &&
    (await guardTutup(res))
  )
    return true;
  if (s) await jalur.tabel[aksi](req, res, s);
  return true;
}
