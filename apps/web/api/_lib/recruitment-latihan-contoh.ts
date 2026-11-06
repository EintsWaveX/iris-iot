/**
 * Mode Latihan sample-makers (6 Nov 2026): when an action needs data that does not exist yet, practice makes
 * a sample so the action goes through and the screen can be seen. Each maker fills a gap and never replaces a
 * row, is safe to call twice, and does nothing at all outside a practice context.
 */
import { and, eq, inArray } from "drizzle-orm";
import { recMakeup, recStageResult, recTeam, recTeamMember } from "../../src/lib/schema.js";
import { cekKode, usulKode } from "../../src/lib/recruitment/penerimaan.js";
import type { MakeupStage } from "../../src/lib/recruitment/makeup.js";
import type { CutStage } from "../../src/lib/recruitment/types.js";
import type { Db } from "./recruitment-data.js";
import { konteksLatihan } from "./recruitment-latihan-ctx.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Q = Db | Tx;

/**
 * One CaAs's result for a stage, so their envelope exists: a locked, revealed Lolos when there is no row;
 * an unlocked row is locked as it stands (its proposal and note stay). A locked row, and `openedAt`, are
 * never touched.
 */
export async function pastikanHasil(
  db: Q,
  kandidatId: number,
  stage: CutStage,
  oleh: string,
): Promise<void> {
  if (!konteksLatihan()) return;
  const now = new Date();
  const [ada] = await db
    .select({
      id: recStageResult.id,
      proposal: recStageResult.proposal,
      proposedBy: recStageResult.proposedBy,
      locked: recStageResult.locked,
    })
    .from(recStageResult)
    .where(and(eq(recStageResult.candidateId, kandidatId), eq(recStageResult.stage, stage)))
    .limit(1);
  if (!ada) {
    await db
      .insert(recStageResult)
      .values({
        candidateId: kandidatId,
        stage,
        proposal: "lolos",
        proposedBy: oleh,
        locked: true,
        lockedBy: oleh,
        lockedAt: now,
        revealAt: now,
      })
      .onConflictDoNothing();
    return;
  }
  if (ada.locked) return;
  await db
    .update(recStageResult)
    .set({
      proposal: ada.proposal ?? "lolos",
      ...(ada.proposedBy ? {} : { proposedBy: oleh }),
      locked: true,
      lockedBy: oleh,
      lockedAt: now,
      revealAt: now,
    })
    .where(eq(recStageResult.id, ada.id));
}

/**
 * The proposals a lock lacks: every listed CaAs with no proposal for the stage gets a Lolos. A proposal
 * that exists, whatever it says, stays.
 */
export async function lengkapiUsulan(
  db: Q,
  stage: CutStage,
  kandidatIds: number[],
  oleh: string,
): Promise<void> {
  if (!konteksLatihan() || kandidatIds.length === 0) return;
  const ada = await db
    .select({
      id: recStageResult.id,
      candidateId: recStageResult.candidateId,
      proposal: recStageResult.proposal,
    })
    .from(recStageResult)
    .where(and(inArray(recStageResult.candidateId, kandidatIds), eq(recStageResult.stage, stage)));
  const peta = new Map(ada.map((r) => [r.candidateId, r]));
  for (const id of kandidatIds) {
    const r = peta.get(id);
    if (!r)
      await db
        .insert(recStageResult)
        .values({ candidateId: id, stage, proposal: "lolos", proposedBy: oleh })
        .onConflictDoNothing();
    else if (!r.proposal)
      await db
        .update(recStageResult)
        .set({ proposal: "lolos", proposedBy: oleh })
        .where(eq(recStageResult.id, r.id));
  }
}

/** The Susulan offer a CaAs has none of yet, so an answer, a record or a retract has something to work on. */
export async function pastikanTawaran(
  db: Q,
  kandidatId: number,
  stage: MakeupStage,
  oleh: string,
): Promise<void> {
  if (!konteksLatihan()) return;
  const [ada] = await db
    .select({ id: recMakeup.id })
    .from(recMakeup)
    .where(and(eq(recMakeup.candidateId, kandidatId), eq(recMakeup.stage, stage)))
    .limit(1);
  if (ada) return;
  await db
    .insert(recMakeup)
    .values({ candidateId: kandidatId, stage, offeredBy: oleh })
    .onConflictDoNothing();
}

/** The first three-letter code nobody holds (AAA, AAB, ...), for a name that offers no suggestion. */
function kodeCadangan(dipakai: ReadonlySet<string>): string {
  for (let n = 0; n < 26 ** 3; n++) {
    const k =
      String.fromCharCode(65 + Math.floor(n / 676)) +
      String.fromCharCode(65 + (Math.floor(n / 26) % 26)) +
      String.fromCharCode(65 + (n % 26));
    if (!dipakai.has(k)) return k;
  }
  return "AAA";
}

/**
 * The codes Penerimaan would refuse (empty, badly shaped, repeated, or held by an Asisten) swapped for fresh ones,
 * so practice never stops at "kode bermasalah". Returns only the rows that change, by CaAs id. Pure.
 */
export function perbaikiKode(
  items: readonly { id: number; nama: string; code: string | null }[],
  taken: ReadonlySet<string>,
): Map<number, string> {
  const cek = cekKode(
    items.map((i) => ({ id: i.id, code: i.code })),
    taken,
  );
  const dipakai = new Set(taken);
  for (const c of cek) if (!c.problem && c.code) dipakai.add(c.code);
  const out = new Map<number, string>();
  for (const c of cek) {
    if (!c.problem) continue;
    const nama = items.find((i) => i.id === c.id)?.nama ?? "";
    const baru = usulKode(nama, dipakai) ?? kodeCadangan(dipakai);
    dipakai.add(baru);
    out.set(c.id, baru);
  }
  return out;
}

/**
 * Takes a CaAs out of the Tubes team they are in, so making or joining another is never refused. A team they
 * lead goes with them (its members and files follow); a plain member just leaves.
 */
export async function lepasTimLama(db: Q, kandidatId: number): Promise<void> {
  if (!konteksLatihan()) return;
  const milik = await db
    .select({ teamId: recTeamMember.teamId })
    .from(recTeamMember)
    .where(and(eq(recTeamMember.candidateId, kandidatId), eq(recTeamMember.status, "joined")));
  for (const { teamId } of milik) {
    const [t] = await db
      .select({ leaderId: recTeam.leaderId })
      .from(recTeam)
      .where(eq(recTeam.id, teamId))
      .limit(1);
    if (t?.leaderId === kandidatId) await db.delete(recTeam).where(eq(recTeam.id, teamId));
    else
      await db
        .delete(recTeamMember)
        .where(and(eq(recTeamMember.teamId, teamId), eq(recTeamMember.candidateId, kandidatId)));
  }
}

/**
 * The CaAs's Tubes team: the one they have joined, or a new one they lead when they have none.
 * Returns its id (0 outside practice, where nothing is made).
 */
export async function pastikanTim(
  db: Q,
  edisiId: number,
  kandidatId: number,
  oleh: string,
): Promise<number> {
  if (!konteksLatihan()) return 0;
  const [ada] = await db
    .select({ teamId: recTeamMember.teamId })
    .from(recTeamMember)
    .where(and(eq(recTeamMember.candidateId, kandidatId), eq(recTeamMember.status, "joined")))
    .limit(1);
  if (ada) return ada.teamId;
  const [t] = await db
    .insert(recTeam)
    .values({ editionId: edisiId, leaderId: kandidatId })
    .returning({ id: recTeam.id });
  await db
    .insert(recTeamMember)
    .values({ teamId: t.id, candidateId: kandidatId, status: "joined", by: oleh });
  return t.id;
}
