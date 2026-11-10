/**
 * Tubes (Open Recruitment R5), the rules, pure and browser safe: teams, the
 * lab evening a team picks, the topics, the submission and its deadline.
 * The pages and the API both call these, so a rule lives in one place.
 *
 * Decided with the user, 1 Nov 2026:
 * - A CaAs works in a team, never alone. The leader makes it, invites
 *   members by NIM, the members accept; the team locks at Techmeet and
 *   Panitia can still change it afterwards.
 * - There is no daily report. A team picks ONE lab evening of the Pengerjaan
 *   (18.30 to 22.00 at Lab IRIS) and its members scan the QR that evening.
 * - One topic, one submission, one Presentasi and one score per team; every
 *   member carries the team's score into the Cutting.
 * - The submission closes when the Presentasi starts. The Ketua can let a
 *   late one through, with a note.
 * Everything a number or a name here can be is a default the Akademik edits
 * (`TubesSetting`, the topics, the interview template of stage "tubes").
 */
import { bebas } from "./bebas.js";
import type { Bi } from "./interview.js";
import type { RecEvent } from "./types.js";
import { isObj } from "../guards.js";

/**
 * Whether the Tubes tile on the CaAs page opens: they are at Tubes and the first day of its window came.
 * Free mode (Mode Latihan) drops the date (a practicing CaAs at Tubes has no window to wait for), not the stage.
 */
export const tubesDibuka = (
  stage: string | undefined,
  awal: string | null,
  hariIni: string,
): boolean => stage === "tubes" && (bebas() || (awal !== null && hariIni >= awal));

/* ------------------------------------------------------------ time */

const WIB = (tanggal: string, jam: string) => new Date(`${tanggal}T${jam}:00+07:00`);

/** The instant an event starts: its first day at its daily window's start, or at the fallback hour. */
export function eventStart(e: Pick<RecEvent, "startsOn" | "dayStart">, fallback = "18:30"): Date {
  return WIB(e.startsOn, e.dayStart ?? fallback);
}

const tubesEvent = (events: readonly RecEvent[], pick: (e: RecEvent) => boolean) =>
  events.find((e) => e.stage === "tubes" && pick(e)) ?? null;

/** The Techmeet: the topics are published here and the teams lock. */
export const techmeetEvent = (events: readonly RecEvent[]) =>
  tubesEvent(events, (e) => e.kind === "meeting");
/** The work evenings (Pengerjaan). */
export const workEvent = (events: readonly RecEvent[]) =>
  tubesEvent(events, (e) => e.kind === "work");
/** The Presentasi evening. */
export const presentasiEvent = (events: readonly RecEvent[]) =>
  tubesEvent(events, (e) => e.kind === "presentation");

/** The teams lock at the start of the Techmeet unless Panitia forced it open or closed. */
export function teamsLockAt(events: readonly RecEvent[]): Date | null {
  const t = techmeetEvent(events);
  return t ? eventStart(t) : null;
}

export function teamsLocked(
  events: readonly RecEvent[],
  forced: "open" | "closed" | null | undefined,
  now: Date,
): boolean {
  // Free mode (Mode Latihan): teams are never locked.
  if (bebas()) return false;
  if (forced === "open") return false;
  if (forced === "closed") return true;
  const at = teamsLockAt(events);
  return !!at && now >= at;
}

/** The submission closes when the Presentasi starts. */
export function submissionCloseAt(events: readonly RecEvent[]): Date | null {
  const p = presentasiEvent(events);
  return p ? eventStart(p) : null;
}

/** The WIB date of an instant, "YYYY-MM-DD". */
export const tanggalDari = (d: Date): string =>
  new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

/** A team may pick or change its evening until the end of the day before it (H-1 23.59). */
export const sessionCutoff = (startsAt: Date): Date => WIB(tanggalDari(startsAt), "00:00");

/** Picking opens when Tubes starts for the CaAs; the server also needs the CaAs to be in the stage. */
export const sessionChangeOpen = (startsAt: Date, now: Date): boolean =>
  now < sessionCutoff(startsAt);

/* ------------------------------------------------------------ settings */

export interface TubesPart {
  key: string;
  label: Bi;
  /** Accepted extensions, lower case with the dot */
  ext: string[];
  mb: number;
  required: boolean;
  /** A link may stand in for the file */
  link: boolean;
}

export type TubesAssign = "ditetapkan" | "undi";

export interface TubesSetting {
  teamMin: number;
  teamMax: number;
  assign: TubesAssign;
  parts: TubesPart[];
}

/** The most the file store takes for one upload (the relay's limit); a part's limit can only go lower. */
export const TUBES_MAX_MB = 16;

const b = (id: string, en: string): Bi => ({ id, en });

export const TUBES_DEFAULT: TubesSetting = {
  teamMin: 2,
  teamMax: 3,
  assign: "ditetapkan",
  parts: [
    {
      key: "code",
      label: b("Kode (zip)", "Code (zip)"),
      ext: [".zip"],
      mb: 15,
      required: true,
      link: false,
    },
    {
      key: "report",
      label: b("Laporan (PDF)", "Report (PDF)"),
      ext: [".pdf"],
      mb: 10,
      required: true,
      link: false,
    },
    {
      key: "demo",
      label: b("Video demo (link atau mp4)", "Demo video (a link or mp4)"),
      ext: [".mp4"],
      mb: TUBES_MAX_MB,
      required: true,
      link: true,
    },
  ],
};

const int = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
const txt = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null;

/** The cleaned setting, or null when something in it cannot be used. */
export function checkTubes(v: unknown): TubesSetting | null {
  if (!isObj(v)) return null;
  const teamMin = int(v.teamMin, 2, 8);
  const teamMax = int(v.teamMax, 2, 8);
  if (teamMin === null || teamMax === null || teamMin > teamMax) return null;
  const assign = v.assign === "undi" ? "undi" : v.assign === "ditetapkan" ? "ditetapkan" : null;
  if (!assign) return null;
  if (!Array.isArray(v.parts) || v.parts.length < 1 || v.parts.length > 6) return null;
  const keys = new Set<string>();
  const parts: TubesPart[] = [];
  for (const raw of v.parts) {
    if (!isObj(raw)) return null;
    const key =
      typeof raw.key === "string" && /^[a-z][a-z0-9_]{1,15}$/.test(raw.key) ? raw.key : null;
    const id = isObj(raw.label) ? txt(raw.label.id, 60) : null;
    const en = isObj(raw.label) ? txt(raw.label.en, 60) : null;
    const mb = int(raw.mb, 1, TUBES_MAX_MB);
    if (!key || keys.has(key) || !id || !en || mb === null) return null;
    keys.add(key);
    if (!Array.isArray(raw.ext) || raw.ext.length < 1 || raw.ext.length > 6) return null;
    const ext = raw.ext.map((e) => String(e).toLowerCase());
    if (ext.some((e) => !/^\.[a-z0-9]{1,6}$/.test(e))) return null;
    parts.push({
      key,
      label: { id, en },
      ext: [...new Set(ext)],
      mb,
      required: raw.required === true,
      link: raw.link === true,
    });
  }
  return { teamMin, teamMax, assign, parts };
}

/* ------------------------------------------------------------ teams */

export interface TeamMemberLite {
  status: "invited" | "joined";
}

export const joinedCount = (m: readonly TeamMemberLite[]) =>
  m.filter((x) => x.status === "joined").length;
/** Joined plus the ones still being asked: the seats a team will take if everybody says yes. */
export const asking = (m: readonly TeamMemberLite[]) => m.length;

export type TeamProblem = "kurang" | "lebih" | null;

/** Whether the joined members fit the size the Akademik set. */
export function teamSizeProblem(
  joined: number,
  s: Pick<TubesSetting, "teamMin" | "teamMax">,
): TeamProblem {
  if (bebas()) return null;
  if (joined < s.teamMin) return "kurang";
  if (joined > s.teamMax) return "lebih";
  return null;
}

/** Whether another invite fits (joined plus waiting never goes past the maximum). */
export const canInviteMore = (
  members: readonly TeamMemberLite[],
  s: Pick<TubesSetting, "teamMax">,
) => bebas() || asking(members) < s.teamMax;

/** A NIM as people write it: trimmed, upper case. */
export const nimBersih = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const n = v.trim().toUpperCase();
  return /^[0-9A-Z]{4,20}$/.test(n) ? n : null;
};

/* ------------------------------------------------------------ the lab evenings */

export interface SessionLite {
  id: number;
  startsAt: string;
  endsAt: string;
  capacity: number;
}

/** Seats left once `used` people (members of the teams that picked it) sit there. */
export const seatsLeft = (s: Pick<SessionLite, "capacity">, used: number) =>
  Math.max(0, s.capacity - used);

export type PickProblem = "penuh" | "lewat" | "terkunci_kurang" | null;

/**
 * Whether a team of `size` people may take a session now: the evening has not
 * passed its H-1 cutoff and has room for all of them. `ownSeats` are the seats
 * the team already holds there (a team changing nothing keeps its own).
 */
export function sessionPickProblem(
  s: SessionLite,
  used: number,
  size: number,
  ownSeats: number,
  now: Date,
): PickProblem {
  if (bebas()) return null;
  if (!sessionChangeOpen(new Date(s.startsAt), now)) return "lewat";
  if (size > seatsLeft(s, used - ownSeats)) return "penuh";
  return null;
}

/** The default evenings for the Pengerjaan event: one per day, with its daily window. */
export function defaultSessions(
  work: Pick<RecEvent, "startsOn" | "endsOn" | "dayStart" | "dayEnd">,
  capacity: number,
): { startsAt: Date; endsAt: Date; capacity: number }[] {
  const out: { startsAt: Date; endsAt: Date; capacity: number }[] = [];
  let d = work.startsOn;
  for (let i = 0; i < 31 && d <= work.endsOn; i++) {
    out.push({
      startsAt: WIB(d, work.dayStart ?? "18:30"),
      endsAt: WIB(d, work.dayEnd ?? "22:00"),
      capacity,
    });
    d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  return out;
}

/* ------------------------------------------------------------ the submission */

export type SubmitState = "belum" | "buka" | "tutup" | "izin";

export interface Override {
  until: Date | null;
}

/**
 * Whether a team may still send files at `now`. Before the Pengerjaan starts
 * nothing is open; after the close only the Ketua's override (until its own
 * time) lets a team through.
 */
export function submitState(
  closeAt: Date | null,
  workStart: Date | null,
  now: Date,
  ov: Override | null,
): SubmitState {
  if (bebas()) return "buka";
  if (workStart && now < workStart) return "belum";
  if (!closeAt || now < closeAt) return "buka";
  if (ov && (!ov.until || now < ov.until)) return "izin";
  return "tutup";
}

export const submitAllowed = (s: SubmitState) => s === "buka" || s === "izin";

export type FileProblem = "ekstensi" | "terlalu_besar" | "kosong" | "bagian_salah";

/** The quick check of a file for a part: its extension, then its size. */
export function checkFile(
  part: TubesPart | undefined,
  name: string,
  size: number,
): FileProblem | null {
  if (!part) return "bagian_salah";
  const i = name.lastIndexOf(".");
  const ext = i >= 0 ? name.slice(i).toLowerCase() : "";
  if (!part.ext.includes(ext)) return "ekstensi";
  if (size < 8) return "kosong";
  if (size > part.mb * 1024 * 1024) return "terlalu_besar";
  return null;
}

/** A link for a demo: https only, no spaces, a sensible length. */
export function checkLink(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length < 10 || t.length > 300 || /\s/.test(t)) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" && u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

export type SubmissionStatus = "none" | "partial" | "complete" | "late" | "over";

/** How complete a submission is, against the parts the Akademik marked required. */
export function submissionStatus(
  have: ReadonlySet<string>,
  s: Pick<TubesSetting, "parts">,
  state: SubmitState,
  overridden: boolean,
): SubmissionStatus {
  const req = s.parts.filter((p) => p.required);
  const got = req.filter((p) => have.has(p.key)).length;
  const full = got === req.length;
  if (overridden && state !== "buka") return "over";
  if (full) return "complete";
  if (state === "tutup") return "late";
  return got === 0 ? "none" : "partial";
}

/* ------------------------------------------------------------ the topics */

export interface TopicLite {
  id: number;
  cap: number;
}

/**
 * The topic a draw lands on: among the topics that still have room, a random
 * one (`rnd` in [0, 1)); when every topic is full, among all of them, so a
 * draw never stalls. `used` counts the teams already holding each topic.
 */
export function drawTopic(
  topics: readonly TopicLite[],
  used: ReadonlyMap<number, number>,
  rnd: number,
): number | null {
  if (!topics.length) return null;
  const open = topics.filter((t) => (used.get(t.id) ?? 0) < t.cap);
  const pool = open.length ? open : topics;
  return pool[Math.min(pool.length - 1, Math.floor(rnd * pool.length))].id;
}

/** Topics given out evenly to teams in order (Bagi Rata): team i gets topic i mod n. */
export function shareEvenly(
  teamIds: readonly number[],
  topicIds: readonly number[],
): Map<number, number> {
  const out = new Map<number, number>();
  if (!topicIds.length) return out;
  teamIds.forEach((t, i) => out.set(t, topicIds[i % topicIds.length]));
  return out;
}

/**
 * Splits people over teams of the size the Akademik set: as few teams as the
 * maximum allows, sizes as even as possible, and never smaller than the
 * minimum unless there are too few people for even one team.
 */
export function groupLeftovers<T>(ids: readonly T[], min: number, max: number): T[][] {
  const n = ids.length;
  if (!n) return [];
  let k = Math.max(1, Math.ceil(n / Math.max(1, max)));
  while (k > 1 && Math.floor(n / k) < min) k--;
  const base = Math.floor(n / k);
  const extra = n % k;
  const out: T[][] = [];
  let at = 0;
  for (let i = 0; i < k; i++) {
    const size = base + (i < extra ? 1 : 0);
    out.push(ids.slice(at, at + size));
    at += size;
  }
  return out;
}

/* ------------------------------------------------------------ the Presentasi order */

/**
 * Deals teams over the tables: shuffled by `rnd` (a seeded generator, so a
 * re-deal is a choice), then round robin, so the tables stay level.
 */
export function dealTeams(
  teamIds: readonly number[],
  tables: number,
  rnd: () => number,
): number[][] {
  const out: number[][] = Array.from({ length: Math.max(1, tables) }, () => []);
  const order = teamIds.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.forEach((t, i) => out[i % out.length].push(t));
  return out;
}
