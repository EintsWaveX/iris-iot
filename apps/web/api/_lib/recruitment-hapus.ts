/**
 * Emptying exam rooms before something above them is deleted (7 Nov 2026).
 *
 * What hangs off an exam room (strikes, judge jobs, Live Coding, submissions, seats) has a foreign key on the
 * room with NO cascade. Deleting a slot or a whole edition reaches the room through a cascade, and Postgres
 * checks that NO ACTION key before it has cascaded the same rows away through the seats, so the whole delete
 * fails ("update or delete on table rec_exam_room violates foreign key constraint") as soon as a room has a
 * strike or a job. Deleting a single room in Plotting already clears these in order; this is the same order for
 * a delete that comes in from above.
 */
import { eq, inArray } from "drizzle-orm";
import type { getDb } from "../../src/lib/db.js";
import {
  recCompileJob,
  recCSubmission,
  recExamRoom,
  recExamSeat,
  recLivecode,
  recMqttJob,
  recStrike,
} from "../../src/lib/schema.js";

type Db = ReturnType<typeof getDb>;
/** What a transaction handle is cast to, so a caller inside db.transaction can pass its own tx. */
export type RuangDb = Db;

/** Every exam room of an edition, or of the given slots. Children first: strikes, submissions, Live Coding,
 *  judge jobs, then the seats (their answers go with them). The rooms themselves are left to the caller's delete. */
export async function kosongkanRuang(
  db: Db,
  by: { editionId: number } | { slotIds: number[] },
): Promise<void> {
  if ("slotIds" in by && !by.slotIds.length) return;
  const ruang = await db
    .select({ id: recExamRoom.id })
    .from(recExamRoom)
    .where(
      "editionId" in by
        ? eq(recExamRoom.editionId, by.editionId)
        : inArray(recExamRoom.slotId, by.slotIds),
    );
  if (!ruang.length) return;
  const ids = ruang.map((r) => r.id);
  await db.delete(recStrike).where(inArray(recStrike.roomId, ids));
  await db.delete(recCSubmission).where(inArray(recCSubmission.roomId, ids));
  await db.delete(recLivecode).where(inArray(recLivecode.roomId, ids));
  await db.delete(recCompileJob).where(inArray(recCompileJob.roomId, ids));
  await db.delete(recMqttJob).where(inArray(recMqttJob.roomId, ids));
  await db.delete(recExamSeat).where(inArray(recExamSeat.roomId, ids));
}
