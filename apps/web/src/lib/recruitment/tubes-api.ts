/**
 * What the Tubes routes answer (R5), shared by the API and the pages.
 *
 * GET  tubes             a CaAs: their team, invites, evenings, topic, submission
 * GET  tubes-board       Panitia: everything of the stage
 * GET  tubes-file        a link to read one submitted part (the team, or Panitia)
 * POST tubes-team-make | tubes-team-name | tubes-invite | tubes-invite-cancel | tubes-answer
 *      tubes-leave | tubes-kick | tubes-disband            a CaAs's team
 * POST tubes-session-pick                                   the leader picks the evening
 * POST tubes-file-ticket | tubes-file-save | tubes-file-delete   the submission
 * POST tubes-team-admin | tubes-team-lock                   Panitia edits teams
 * POST tubes-topic-save | tubes-topic-delete | tubes-topic-set | tubes-topic-share
 *      tubes-draw | tubes-draw-reset | tubes-publish        topics
 * POST tubes-session-save | tubes-session-delete | tubes-session-seed | tubes-session-set   evenings
 * POST tubes-override | tubes-override-clear               the Ketua lets a late submission in
 * POST tubes-order-deal | tubes-order-set                   the Presentasi order
 */
import type {
  PickProblem,
  SubmissionStatus,
  SubmitState,
  TeamProblem,
  TubesSetting,
} from "./tubes.js";

export type TubesGalat =
  | "bukan_tahap"
  | "terkunci"
  | "sudah_punya_tim"
  | "belum_punya_tim"
  | "bukan_pemimpin"
  | "penuh"
  | "lewat"
  | "belum_buka"
  | "tutup"
  | "nim_tidak_ada"
  | "sudah_diundang"
  | "tidak_ada_undangan"
  | "ukuran_tim"
  | "bagian_salah"
  | "ekstensi"
  | "terlalu_besar"
  | "kosong"
  | "link_salah"
  | "berkas_hilang"
  | "berkas_beda"
  | "belum_diatur"
  | "topik_penuh"
  | "tidak_ada";

export interface TubesMemberView {
  candidateId: number;
  nim: string;
  nama: string;
  kelas: string;
  status: "invited" | "joined";
  leader: boolean;
  me: boolean;
}

export interface TubesTopicView {
  id: number;
  title: string;
  brief: string;
}

export interface TubesFileView {
  part: string;
  kind: "file" | "link";
  name: string;
  size: number;
  /** Only for a link */
  url: string | null;
  at: string;
  by: string;
}

export interface TubesOverrideView {
  note: string;
  by: string;
  until: string | null;
  at: string;
}

export interface TubesTimes {
  now: string;
  lockAt: string | null;
  locked: boolean;
  /** The first work evening starts */
  workStart: string | null;
  /** The submission closes (the Presentasi starts) */
  closeAt: string | null;
  submit: SubmitState;
  published: boolean;
  techmeetAt: string | null;
  presentasiAt: string | null;
}

export interface TubesSessionView {
  id: number;
  startsAt: string;
  endsAt: string;
  place: string;
  capacity: number;
  /** People already seated (members of the teams that picked it) */
  used: number;
  left: number;
  mine: boolean;
  /** Why this team cannot take it now, null when it can */
  problem: PickProblem;
}

export interface TubesTeamView {
  id: number;
  name: string;
  members: TubesMemberView[];
  size: number;
  problem: TeamProblem;
  leader: boolean;
  topic: TubesTopicView | null;
  /** The topic exists but is not shown yet (published at Techmeet, or drawn there) */
  topicPending: boolean;
  sessionId: number | null;
  files: TubesFileView[];
  status: SubmissionStatus;
  override: TubesOverrideView | null;
  /** The Presentasi turn, once Panitia dealt the order: table name and start */
  turn: { table: string; startsAt: string; place: string } | null;
}

export interface TubesInvite {
  teamId: number;
  teamName: string;
  leaderNama: string;
  size: number;
  max: number;
}

export interface TubesMine {
  ok: true;
  /** In the Tubes stage and still going */
  eligible: boolean;
  setting: TubesSetting;
  times: TubesTimes;
  team: TubesTeamView | null;
  invites: TubesInvite[];
  sessions: TubesSessionView[];
  /** The CaAs scanned the QR on their evening */
  attended: boolean;
}

/* ------------------------------------------------------------ the Panitia board */

export interface TubesBoardMember {
  candidateId: number;
  nim: string;
  nama: string;
  status: "invited" | "joined";
  leader: boolean;
  attended: boolean;
}

export interface TubesBoardTeam {
  id: number;
  name: string;
  members: TubesBoardMember[];
  size: number;
  problem: TeamProblem;
  topicId: number | null;
  drawn: boolean;
  sessionId: number | null;
  files: TubesFileView[];
  status: SubmissionStatus;
  override: TubesOverrideView | null;
  /** The Presentasi table (slot id) and place in its order, 0 based */
  table: { slotId: number; pos: number } | null;
}

export interface TubesBoardCandidate {
  id: number;
  nim: string;
  nama: string;
  kelas: string;
  teamId: number | null;
  status: "none" | "invited" | "joined";
}

export interface TubesBoardTopic {
  id: number;
  title: string;
  brief: string;
  cap: number;
  /** Teams holding it */
  used: number;
}

export interface TubesBoardSession {
  id: number;
  startsAt: string;
  endsAt: string;
  place: string;
  capacity: number;
  used: number;
  teams: number;
}

export interface TubesBoardTable {
  slotId: number;
  room: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  teamIds: number[];
}

export interface TubesBoardRights {
  topics: boolean;
  teams: boolean;
  sessions: boolean;
  attend: boolean;
  override: boolean;
  config: boolean;
  order: boolean;
}

export interface TubesBoard {
  ok: true;
  setting: TubesSetting;
  times: TubesTimes;
  teamsLock: "open" | "closed" | null;
  rights: TubesBoardRights;
  candidates: TubesBoardCandidate[];
  teams: TubesBoardTeam[];
  topics: TubesBoardTopic[];
  sessions: TubesBoardSession[];
  tables: TubesBoardTable[];
  /** The event ids the QR attendance of the work evenings and the Presentasi hang on */
  workEventId: number | null;
  presentasiEventId: number | null;
  /** Practice edition */
  practice: boolean;
}

export interface TubesFileLink {
  ok: true;
  url: string;
  kind: "file" | "link";
  name: string;
  mime: string | null;
}

export interface TubesTicket {
  ok: true;
  /** True when R2 already holds these exact bytes */
  sama: boolean;
  url: string | null;
  ticket: string;
  key: string;
}
