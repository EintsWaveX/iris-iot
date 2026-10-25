/**
 * The runner's calls to the seat API (EXAM-ENGINE 10.3) in one place: this
 * browser tab's id, check-in, saving an answer, Kumpulkan and the phone
 * hotspot. Reads come from usePoll in the page; these are the writes.
 */
import { isFail, recPost } from "../../../lib/recruitment/client";
import type { SaveBody, SaveResult } from "../../../lib/recruitment/seat-answers";
import type { CheckinBody, SeatSelf } from "../../../lib/recruitment/seat-types";

/** Told apart per browser tab, so a second tab or device is noticed (7: ganda) */
function makeTab(): string {
  const mk = () => `t${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  try {
    const k = "iris-rec-tab";
    const old = sessionStorage.getItem(k);
    if (old && /^[A-Za-z0-9_-]{4,64}$/.test(old)) return old;
    const n = mk();
    sessionStorage.setItem(k, n);
    return n;
  } catch {
    return mk();
  }
}
export const TAB = typeof window === "undefined" ? "ssr" : makeTab();

export const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") =>
  (window as unknown as { Toast?: { show: (m: string, t: string) => void } }).Toast?.show(m, tone);

export async function postCheckin(
  step: CheckinBody["step"],
  info?: CheckinBody["info"],
): Promise<{ ok: true; seat: SeatSelf } | { ok: false; kode: string }> {
  const r = await recPost<{ ok: true; seat: SeatSelf }>("test-checkin", { step, tab: TAB, info });
  return isFail(r) ? { ok: false, kode: r.kode } : r;
}

/** The AnswerSaver's `send`: a lost connection and a server error are retried, a refusal is final */
export async function sendAnswer(b: SaveBody): Promise<SaveResult> {
  const r = await recPost<{ ok: true; rev: number; at: number; warn?: "tab_lain" }>(
    "test-answer",
    b,
  );
  if (!isFail(r)) return r;
  if (r.kode === "offline" || r.status >= 500 || r.status === 429)
    return { ok: false, offline: true };
  return { ok: false, kode: r.kode };
}

export async function submitPart(part: string): Promise<{ ok: boolean; kode?: string }> {
  const r = await recPost<{ ok: true; done: number }>("test-submit", { part });
  return isFail(r) ? { ok: false, kode: r.kode } : { ok: true };
}

export async function saveHotspot(
  b: { ssid: string; pass: string } | { clear: true },
): Promise<{ ok: boolean; ssid?: string; kode?: string }> {
  const r = await recPost<{ ok: true; ssid?: string }>("test-hotspot", b);
  return isFail(r) ? { ok: false, kode: r.kode } : r;
}
