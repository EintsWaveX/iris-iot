/**
 * The bank on the page (prompt 09): the config, the list and one question
 * through the recruitment API, all refetched at once on the
 * `recbank` siaran topic and never on a timer of their own.
 */
import { usePoll } from "../hooks";
import { isFail, recGet, type RecResult } from "./client";
import type {
  ExamConfigResponse,
  QuestionResponse,
  QuestionsResponse,
} from "./bank-api";

async function leaf<T extends { ok: true }>(p: Promise<RecResult<T>>): Promise<T | null> {
  const r = await p;
  if (!isFail(r)) return r;
  if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
  return null;
}

/** The parts config, whether it is locked, and the pool counters. */
export function useBankConfig(enabled: boolean) {
  return usePoll(
    () => leaf(recGet<ExamConfigResponse>("exam-config")),
    300_000,
    enabled,
    ["recbank"],
    500,
  );
}

/** Every question of the edition, without bodies or keys. */
export function useBankQuestions(enabled: boolean) {
  return usePoll(
    () => leaf(recGet<QuestionsResponse>("questions")),
    300_000,
    enabled,
    ["recbank"],
    500,
  );
}

/** One question with its key and its log. */
export function useBankQuestion(id: number | null, enabled: boolean) {
  return usePoll(
    () => leaf(recGet<QuestionResponse>("question", { id: String(id) })),
    300_000,
    enabled && id !== null,
    ["recbank"],
    500,
    id,
  );
}
