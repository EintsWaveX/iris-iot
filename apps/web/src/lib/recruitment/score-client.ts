/**
 * The scores on the page (prompt 13): the table and the question statistics
 * through the recruitment API, refetched on the `recscore` siaran topic (a
 * void, a freeze), `recroom` (a room finished) and `reclive` (a sheet came
 * in), never on a timer of their own.
 */
import { usePoll } from "../hooks";
import { isFail, recGet } from "./client";
import type { ScoresResponse, StatsResponse } from "./score-api";

async function leaf<T extends { ok: true }>(p: ReturnType<typeof recGet<T>>): Promise<T | null> {
  const r = await p;
  if (!isFail(r)) return r;
  if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
  return null;
}

/** Every row of the table, with the freeze it comes from; the room filter is the page's. */
export function useScores(enabled: boolean) {
  return usePoll(
    () => leaf(recGet<ScoresResponse>("scores")),
    300_000,
    enabled,
    ["recscore", "recroom", "reclive"],
    500,
  );
}

/** Per question N, M, p, w and the most picked wrong answer (the bank right). */
export function useScoreStats(enabled: boolean) {
  return usePoll(
    () => leaf(recGet<StatsResponse>("score-stats")),
    300_000,
    enabled,
    ["recscore", "recroom"],
    500,
  );
}
