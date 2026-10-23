/**
 * IRIS Open Recruitment (OPREC 2026): the shared vocabulary and the exact
 * request and response shapes of /api/recruitment/:aksi. Browser safe and
 * pure: the pages (prompt 03 on) build against these types only.
 *
 * Names follow docs/recruitment/PRD.md sections 3 to 6 and ARCHITECTURE.md
 * section 2. Where this file adds to the architecture, the reason is in
 * docs/recruitment/prompts/handoffs/02.md.
 */

/* ------------------------------------------------------------ vocabulary */

/** The journey, in order (PRD 5.2). A candidate's `stage` is one of these. */
export const STAGES = [
  "berkas",
  "first_meet",
  "tes_tulis",
  "wawancara",
  "tubes",
  "mengajar",
  "penerimaan",
] as const;
export type StageKey = (typeof STAGES)[number];

/** What an event is (PRD 3, the Kind column). It picks the colour. */
export const EVENT_KINDS = [
  "registration",
  "review",
  "announcement",
  "meeting",
  "pleno",
  "test",
  "makeup",
  "cutting",
  "interview",
  "work",
  "presentation",
  "teaching",
  "acceptance",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** What an event opens while it runs (PRD 3, the Gates column). */
export const GATES = [
  "daftar",
  "review",
  "qr",
  "exam",
  "cutting",
  "reveal",
  "rubric",
  "topics",
  "checkin",
  "submission",
  "accept",
] as const;
export type GateKey = (typeof GATES)[number];

/**
 * Who sees an event besides the Panitia (PRD 3, the Internal column).
 * all: everyone. own: only candidates plotted into it. offered: only those
 * offered a make-up.
 */
export const AUDIENCES = ["all", "own", "offered"] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Where a stage stands, from its events (gates.ts phaseOf). */
export const PHASES = ["before", "open", "review", "cutting", "announced"] as const;
export type Phase = (typeof PHASES)[number];

export const EDITION_STATUS = ["draft", "live", "closed"] as const;
export type EditionStatus = (typeof EDITION_STATUS)[number];

export const CANDIDATE_STATUS = [
  "applied",
  "revision",
  "approved",
  "withdrawn",
  "out",
  "accepted",
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUS)[number];

export const DOC_KINDS = ["cv", "letter", "vision", "biodata", "other"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/** The three PDFs an application needs (PRD 5.3). */
export const DOC_REQUIRED: readonly DocKind[] = ["cv", "letter", "vision"];

export const DIVISIONS = [
  "ketua",
  "wakil",
  "acara",
  "akademik",
  "logistik",
  "admin",
  "pdd",
] as const;
export type CommitteeDivision = (typeof DIVISIONS)[number];

export const PROPOSALS = ["lolos", "gagal"] as const;
export type Proposal = (typeof PROPOSALS)[number];

export const ATTENDANCE_VIA = ["qr", "manual"] as const;

/** PDF only, 5 MB each (PRD 5.3). */
export const DOC_MAX_BYTES = 5 * 1024 * 1024;

/* ----------------------------------------------------------------- rows */

/** A calendar event as the API and the pure libs see it. Dates are WIB, inclusive. */
export interface RecEvent {
  id: number;
  kind: EventKind;
  title: string;
  /** YYYY-MM-DD */
  startsOn: string;
  /** YYYY-MM-DD, on or after startsOn */
  endsOn: string;
  /** HH:MM WIB; both set or both null */
  dayStart: string | null;
  dayEnd: string | null;
  place: string | null;
  internal: boolean;
  audience: Audience;
  gates: GateKey[];
  /** The journey stage the event belongs to. */
  stage: StageKey | null;
  /** Overrides the kind's colour when set. */
  color: string | null;
  sort: number;
}

export interface Biodata {
  /** Entry year, e.g. 2025 */
  angkatan: number;
  kelas: string;
  /** Digits, with an optional leading + */
  phone: string;
  lineId: string;
  /** Address in Bandung */
  address: string;
  /** One line */
  motivation: string;
}

export interface RecDocument {
  kind: DocKind;
  size: number;
  uploadedAt: string;
  note: string | null;
}

/* ------------------------------------------------------------- the viewer */

/** Who is asking, as far as calendar visibility and the banner care. */
export type ViewerKind = "visitor" | "praktikan" | "candidate" | "asisten" | "panitia";

export interface Viewer {
  kind: ViewerKind;
  /** Events the viewer is plotted into or was offered (audience own and offered). */
  ownEventIds?: readonly number[];
  /** hakPenuh holders see every event. */
  full?: boolean;
}

/* ------------------------------------------------------------------ rights */

/** What a person may do in recruitment (PRD 4). rights.ts computes it. */
export interface RecRights {
  /** Edit the calendar */
  calendar: boolean;
  /** Seat the Panitia (everyone but the Ketua) */
  board: boolean;
  /** Seat or unseat the Ketua */
  seatKetua: boolean;
  /** See the candidate list: names, stage, status */
  candidates: boolean;
  /** Read Berkas and biodata contact details */
  documents: boolean;
  /** Approve an application or bounce it back */
  approve: boolean;
  /** Question bank and raw answers */
  bank: boolean;
  /** Plot rooms and slots */
  plotting: boolean;
  /** Plot pengawas for each test evening */
  plotPengawas: boolean;
  /** Propose Lolos or Gagal */
  cuttingPropose: boolean;
  /** Lock a stage's Cutting */
  cuttingLock: boolean;
  /** Attendance QR and manual override */
  attendance: boolean;
  /** Lend and take back the ESP32 kits */
  kitLoans: boolean;
  /** Jadikan Asisten */
  accept: boolean;
}

export const RIGHTS_KEYS: readonly (keyof RecRights)[] = [
  "calendar",
  "board",
  "seatKetua",
  "candidates",
  "documents",
  "approve",
  "bank",
  "plotting",
  "plotPengawas",
  "cuttingPropose",
  "cuttingLock",
  "attendance",
  "kitLoans",
  "accept",
];

/* ============================================================== API shapes */

/** Every failure answers { ok: false, kode } with a status; these are the kode values. */
export type RecError =
  | "belum_masuk"
  | "peran_salah"
  | "tanpa_hak"
  | "aksi_tidak_dikenal"
  | "tidak_ada_edisi"
  | "tidak_ditemukan"
  | "data_salah"
  | "jendela_tutup"
  | "sudah_daftar"
  | "bukan_praktikan"
  | "berkas_kurang"
  | "format_salah"
  | "terlalu_besar"
  | "bukan_pdf"
  | "tiket_salah"
  | "penyimpanan_mati"
  | "perlu_konfirmasi"
  | "ketua_sudah_ada"
  | "bukan_asisten"
  | "status_salah"
  | "sesi_berganti";

export interface RecFail {
  ok: false;
  kode: RecError;
  /** Extra fields some failures carry (e.g. perlu_konfirmasi names what changes). */
  [extra: string]: unknown;
}

export interface EditionInfo {
  id: number;
  year: number;
  title: string;
  status: EditionStatus;
}

/** GET edition */
export interface EditionResponse {
  ok: true;
  edition: EditionInfo | null;
  viewer: ViewerKind;
  /** null unless the viewer sits on the committee or holds hakPenuh */
  rights: RecRights | null;
  /** The viewer's seat, when they have one */
  seat: { division: CommitteeDivision; isKoor: boolean; title: string | null } | null;
}

/** GET calendar */
export interface CalendarResponse {
  ok: true;
  edition: EditionInfo;
  /** Already filtered by visibleEvents for this viewer */
  events: RecEvent[];
  /** Server clock, ISO, so pages can offset their countdowns */
  now: string;
}

export interface CandidateSelf {
  id: number;
  status: CandidateStatus;
  stage: StageKey;
  appliedAt: string;
  biodata: Biodata;
  /** The note Admin left when asking for a revision */
  reviewNote: string | null;
}

/** An envelope in the inbox; empty until S2. */
export interface EnvelopeSelf {
  stage: StageKey;
  /** True once the Ketua locked and the reveal time passed */
  ready: boolean;
  opened: boolean;
  /** Only set after the reveal time */
  result: Proposal | null;
}

/** GET me (Praktikan only) */
export interface MeResponse {
  ok: true;
  edition: EditionInfo | null;
  candidate: CandidateSelf | null;
  documents: RecDocument[];
  envelopes: EnvelopeSelf[];
  /** Whether Daftar is open right now (the server's own gate check) */
  daftarOpen: boolean;
}

export interface EventLite {
  id: number;
  kind: EventKind;
  title: string;
  startsOn: string;
  endsOn: string;
  dayStart: string | null;
  dayEnd: string | null;
  place: string | null;
}

/** GET banner: the Home banner, one shape per viewer. */
export type BannerResponse =
  | { ok: true; kind: "none"; segera: boolean }
  | {
      ok: true;
      kind: "visitor";
      title: string;
      /** The registration window: first start to last end */
      opens: string | null;
      closes: string | null;
      daftarOpen: boolean;
    }
  | {
      ok: true;
      kind: "praktikan";
      title: string;
      daftarOpen: boolean;
      /** Instant Daftar closes, ISO (end of the last registration day, WIB) */
      closesAt: string | null;
    }
  | {
      ok: true;
      kind: "candidate";
      title: string;
      status: CandidateStatus;
      stage: StageKey;
      phase: Phase;
      next: EventLite | null;
      /** A reveal is waiting to be opened (S2) */
      envelope: boolean;
    }
  | { ok: true; kind: "cut"; title: string; stage: StageKey }
  | { ok: true; kind: "panitia"; title: string; today: EventLite[]; seat: string | null }
  | { ok: true; kind: "asisten"; title: string; today: EventLite[] };

export interface CandidateRow {
  id: number;
  nim: string;
  nama: string;
  kelas: string | null;
  angkatan: number | null;
  status: CandidateStatus;
  stage: StageKey;
  appliedAt: string;
  /** How many of the required documents are uploaded */
  docs: number;
}

/** GET candidates (Panitia). Query: stage, status, q. */
export interface CandidatesResponse {
  ok: true;
  candidates: CandidateRow[];
}

/** GET candidate?id= (Panitia). biodata and documents are null without the documents right. */
export interface CandidateDetailResponse {
  ok: true;
  candidate: CandidateRow & {
    reviewNote: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  };
  biodata: Biodata | null;
  documents: (RecDocument & { id: number })[] | null;
}

export interface SeatRow {
  nim: string;
  nama: string;
  kode: string;
  division: CommitteeDivision;
  isKoor: boolean;
  title: string | null;
}

/** GET committee (Panitia, or anyone with hakPenuh) */
export interface CommitteeResponse {
  ok: true;
  seats: SeatRow[];
}

/** POST apply */
export interface ApplyRequest {
  biodata: Biodata;
  /** Confirmation tokens from `ticket`, one per required document */
  docs: { kind: DocKind; tiket: string }[];
  /** Must be true: the data use and the 6 month retention (a Checkbox) */
  consent: true;
}
export interface ApplyResponse {
  ok: true;
  candidate: CandidateSelf;
}

/** POST ticket: where to PUT one PDF */
export interface TicketRequest {
  kind: DocKind;
  ukuran: number;
  /** SHA-256 of the file, hex */
  sha256: string;
  /** Page count; the relay stores it as metadata */
  halaman?: number;
}
export type TicketResponse =
  { ok: true; sama: true } | { ok: true; sama: false; url: string; tiket: string };

/** POST document: confirm an upload after the PUT */
export interface DocumentRequest {
  kind: DocKind;
  tiket: string;
}
export interface DocumentResponse {
  ok: true;
  document: RecDocument;
  /** applied again after a revision upload */
  status: CandidateStatus;
}

/** POST withdraw */
export interface WithdrawResponse {
  ok: true;
  status: "withdrawn";
}

/** POST review */
export interface ReviewRequest {
  id: number;
  decision: "approve" | "revision";
  /** Required with a revision */
  note?: string;
}
export interface ReviewResponse {
  ok: true;
  status: "approved" | "revision";
}

/** POST event-save: create (no id) or edit */
export interface EventSaveRequest {
  id?: number;
  kind: EventKind;
  title: string;
  startsOn: string;
  endsOn: string;
  dayStart?: string | null;
  dayEnd?: string | null;
  place?: string | null;
  internal?: boolean;
  audience?: Audience;
  gates?: GateKey[];
  stage?: StageKey | null;
  color?: string | null;
  /** Send true to confirm editing an event whose stage already started */
  confirm?: boolean;
}
export interface EventMoveRequest {
  id: number;
  startsOn: string;
  endsOn: string;
  confirm?: boolean;
}
export interface EventDeleteRequest {
  id: number;
  confirm?: boolean;
}
export interface EventResponse {
  ok: true;
  event: RecEvent | null;
  /** True when the change was written to the audit log */
  logged: boolean;
}

/** POST seat */
export interface SeatRequest {
  nim: string;
  division: CommitteeDivision;
  isKoor?: boolean;
  title?: string | null;
}
export interface UnseatRequest {
  nim: string;
}
export interface SeatResponse {
  ok: true;
  seats: SeatRow[];
}

/** GET berkas?id=[&unduh=1]: answers 302 to a 10 minute link, or { ok:false, kode }. */
