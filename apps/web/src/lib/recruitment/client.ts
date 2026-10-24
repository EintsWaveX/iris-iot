/**
 * The recruitment pages' way to /api/recruitment/:aksi (prompt 03). Unlike
 * getJson and postJson, which throw on any non-2xx, a refusal here comes back
 * as a value ({ ok:false, kode, status }) because the pages act on the kode:
 * a closed gate, a 409 that asks to confirm, a field error. A dead network
 * is { kode: "offline", status: 0 }.
 *
 * The hooks refetch at once on the three siaran topics (recedition,
 * reccalendar, reccandidates) and never poll on a timer of their own.
 */
import { usePoll } from "../hooks";
import type { Topik } from "../siaran";
import type {
  AttendanceResponse,
  BannerResponse,
  CalendarResponse,
  CandidateSlotsResponse,
  CandidatesResponse,
  CommitteeResponse,
  CutBoardResponse,
  CutStage,
  EditionResponse,
  MeResponse,
  PlotBoardResponse,
  QrEventsResponse,
  RecError,
  StageKey,
} from "./types";

export interface RecFail {
  ok: false;
  kode: RecError | "offline";
  status: number;
  /** The server's field name on a data_salah, and any other extras */
  [extra: string]: unknown;
}

export type RecResult<T> = T | RecFail;

export const isFail = <T extends { ok: true }>(r: RecResult<T>): r is RecFail => r.ok === false;

const TIMEOUT_MS = 15_000;

async function call<T>(aksi: string, init: RequestInit, query = ""): Promise<RecResult<T>> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`/api/recruitment/${aksi}${query}`, { ...init, signal: ctl.signal });
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.ok && body.ok !== false) return body as T;
    return { ...body, ok: false, kode: (body.kode as RecError) ?? "data_salah", status: r.status };
  } catch {
    return { ok: false, kode: "offline", status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export function recGet<T>(aksi: string, query: Record<string, string> = {}) {
  const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== ""));
  return call<T>(aksi, { headers: { Accept: "application/json" } }, q.size ? `?${q}` : "");
}

export function recPost<T>(aksi: string, body: unknown = {}) {
  return call<T>(aksi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Refusals a page expects (signed out, not Panitia, no edition) read as "no data"; a lost network throws so the poller retries. */
async function leaf<T extends { ok: true }>(p: Promise<RecResult<T>>): Promise<T | null> {
  const r = await p;
  if (!isFail(r)) return r;
  if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
  return null;
}

const TOPIK_EDISI: Topik[] = ["recedition"];
const TOPIK_KAL: Topik[] = ["recedition", "reccalendar"];

export function useRecBanner(enabled = true) {
  return usePoll(
    () => leaf(recGet<BannerResponse>("banner")),
    300_000,
    enabled,
    ["recedition", "reccalendar", "reccandidates", "reccutting", "recplotting"],
    5_000,
  );
}

export function useRecEdition(enabled = true) {
  return usePoll(() => leaf(recGet<EditionResponse>("edition")), 300_000, enabled, TOPIK_EDISI);
}

export function useRecCalendar(enabled = true) {
  return usePoll(() => leaf(recGet<CalendarResponse>("calendar")), 300_000, enabled, TOPIK_KAL);
}

export function useRecMe(enabled = true) {
  return usePoll(
    () => leaf(recGet<MeResponse>("me")),
    300_000,
    enabled,
    ["recedition", "reccalendar", "reccandidates", "reccutting", "recplotting"],
    2_000,
  );
}

export function useRecCandidates(enabled: boolean) {
  return usePoll(
    () => leaf(recGet<CandidatesResponse>("candidates")),
    300_000,
    enabled,
    ["reccandidates"],
    2_000,
  );
}

export function useRecCommittee(enabled: boolean) {
  return usePoll(() => leaf(recGet<CommitteeResponse>("committee")), 300_000, enabled, TOPIK_EDISI);
}

/* ------------------------------------------------------------------- S2 */

/** The candidate's own Pilih Jadwal: seat counts per stage, live on recplotting. */
export function useRecSlots(enabled: boolean) {
  return usePoll(
    () => leaf(recGet<CandidateSlotsResponse>("slots")),
    300_000,
    enabled,
    ["recplotting", "reccalendar", "reccandidates"],
    1_000,
  );
}

/** The Panitia's plotting board for one stage. */
export function useRecBoard(stage: StageKey, enabled: boolean) {
  return usePoll(
    () => leaf(recGet<PlotBoardResponse>("slots", { stage })),
    300_000,
    enabled,
    ["recplotting", "reccandidates", "reccalendar"],
    1_000,
    stage,
  );
}

/** The Cutting board of one stage. */
export function useRecCut(stage: CutStage, enabled: boolean) {
  return usePoll(
    () => leaf(recGet<CutBoardResponse>("results", { stage })),
    300_000,
    enabled,
    ["reccutting", "reccandidates", "reccalendar"],
    1_000,
    stage,
  );
}

/** What the projector may show right now, with the counts. */
export function useRecQrEvents(enabled: boolean) {
  return usePoll(
    () => leaf(recGet<QrEventsResponse>("qr-events")),
    300_000,
    enabled,
    ["reccandidates", "reccalendar"],
    1_000,
  );
}

/** The Kehadiran drawer's list for one event. */
export function useRecAttendance(eventId: number | null, enabled: boolean) {
  return usePoll(
    () => leaf(recGet<AttendanceResponse>("attendance", { event: String(eventId) })),
    300_000,
    enabled && eventId !== null,
    ["reccandidates"],
    1_000,
    eventId,
  );
}
