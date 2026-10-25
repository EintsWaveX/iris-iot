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
  // Pilih Jadwal: the window in which candidates pick their own slot (S2).
  "pick",
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
  "pick",
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

/**
 * Every PDF kind a candidate may have. The keys never change once stored;
 * `letter` and `other` are from the first plan and no longer asked for.
 */
export const DOC_KINDS = [
  "cv",
  "letter",
  "vision",
  "biodata",
  "other",
  "ktm",
  "khs",
  "ksm",
  "portofolio",
] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/**
 * The PDFs an application needs, the team's list on the Google Form (user,
 * 2026-10-25): Biodata, CV ATS, Visi Misi (with Motivasi and Ide Inovasi),
 * KHS, KSM and KTM.
 */
export const DOC_REQUIRED: readonly DocKind[] = ["biodata", "cv", "vision", "khs", "ksm", "ktm"];
/** Asked for, never needed: shown when there is one. */
export const DOC_OPTIONAL: readonly DocKind[] = ["portofolio"];

/** The three study programmes oprec 2026 is open to: S1 Teknik Elektro, Telekomunikasi, Biomedis. */
export const PRODI = ["te", "tt", "tb"] as const;
export type Prodi = (typeof PRODI)[number];

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

/** Admin's check of one uploaded file. */
export const DOC_VERDICTS = ["ok", "fix"] as const;
export type DocVerdict = (typeof DOC_VERDICTS)[number];

/** Who put a candidate in a slot: themself, Auto Isi, or Panitia. */
export const SLOT_VIA = ["self", "auto", "panitia"] as const;
export type SlotVia = (typeof SLOT_VIA)[number];

export const SLOT_CHANGE_STATUS = ["open", "approved", "declined", "withdrawn"] as const;
export type SlotChangeStatus = (typeof SLOT_CHANGE_STATUS)[number];

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
  /** e.g. TT-49-03 */
  kelas: string;
  /** Digits, with an optional leading + */
  phone: string;
  lineId: string;
  /** Address in Bandung. Only the in-IRIS form asked for it. */
  address?: string;
  /** One line. Only the in-IRIS form asked for it. */
  motivation?: string;
  /** The Google Form's answers (2026-10-25), on candidates the Panitia added by hand */
  prodi?: Prodi;
  /** Takes the IoT course */
  mkIot?: boolean;
  /** Takes the IoT practicum; asked of Teknik Elektro only, null for the others */
  praktikumIot?: boolean | null;
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
  | "sesi_berganti"
  // S2: Cutting
  | "terkunci"
  | "belum_lengkap"
  | "belum_dikunci"
  | "lewat_waktu"
  | "tanpa_pengumuman"
  | "bukan_peserta"
  // S2: QR attendance
  | "qr_berganti"
  | "bukan_tahapmu"
  | "bukan_jadwalmu"
  | "tidak_bisa_batal"
  // S2: Pilih Jadwal
  | "sudah_pilih"
  | "penuh"
  | "slot_salah"
  | "belum_memilih"
  | "lewat_batas"
  | "sudah_ada_permintaan"
  | "slot_sama"
  | "slot_terisi"
  // Oprec accounts (2026-10-24)
  | "belum_masuk_oprec"
  | "salah"
  | "terlalu_sering"
  | "akun_ada"
  | "nim_asisten"
  | "perlu_klaim"
  | "klaim_salah"
  // The Google Form is the way in (2026-10-25)
  | "daftar_lewat_formulir";

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
  /** Asisten only: Sembunyikan Oprec is on (nobody else sees recruitment) */
  hidden?: boolean;
  /** Asisten only: may flip it (the Ketua and hakPenuh) */
  canHide?: boolean;
  /** Asisten only: may add a candidate by hand from the Google Form (hakPenuh) */
  canAdd?: boolean;
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

/** GET me (Praktikan only) */
/** An oprec account (2026-10-24), apart from the practicum sign-in */
export interface OprecAccount {
  nim: string;
  nama: string;
}
/** GET account; POST account-signup and account-signin answer the same shape */
export interface AccountResponse {
  ok: true;
  account: OprecAccount | null;
}
/** POST account-reset: the one-time claim code, shown once to the Admin */
export interface AccountResetResponse {
  ok: true;
  klaim: string;
}

export interface MeResponse {
  ok: true;
  edition: EditionInfo | null;
  candidate: CandidateSelf | null;
  /** Their own, with the id berkas needs to open one */
  documents: (RecDocument & { id: number })[];
  /** Revealed envelopes only; a sealed one carries no result (see EnvelopeView) */
  envelopes: EnvelopeView[];
  /** Locked but not yet revealed: stage and time only */
  pending: { stage: CutStage; revealAt: string }[];
  /** Whether Daftar is open right now (the server's own gate check) */
  daftarOpen: boolean;
  /** Server clock, ISO: the envelope timer counts from it, never from the device clock */
  now: string;
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
      /** The next locked reveal that has not come yet, ISO; the banner refetches then */
      nextReveal?: string | null;
      /** Server clock, ISO */
      now?: string;
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
    /** The practicum roster's name for this NIM, null when it is not on the roster */
    namaRoster: string | null;
    reviewNote: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    /** Nilai Berkas, only with the documents right */
    berkasScore: number | null;
  };
  biodata: Biodata | null;
  documents: BerkasFile[] | null;
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
  /** The Asisten who may be seated; only for the board or seatKetua right */
  pool?: { nim: string; nama: string; kode: string }[];
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

/** POST candidate-add (hakPenuh): a candidate from the Google Form, account included */
export interface CandidateAddRequest {
  nim: string;
  nama: string;
  /** Required for a new candidate; on `ubah`, a new password or nothing */
  sandi?: string;
  biodata: Biodata;
  /** Correct a candidate already added instead of adding one */
  ubah?: boolean;
}
export interface CandidateAddResponse {
  ok: true;
  candidate: { id: number; nim: string; nama: string };
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

/** GET berkas?id=[&unduh=1][&v=1]: answers 302 to a 10 minute link (v=1 is the file a re-upload replaced), or { ok:false, kode }. */

/* ===================================================================== S2 */

/** The stages that end in a Cutting and an envelope. */
export const CUT_STAGES = ["berkas", "tes_tulis", "wawancara", "tubes", "mengajar"] as const;
export type CutStage = (typeof CUT_STAGES)[number];

/** One file as Admin sees it while checking Berkas. */
export interface BerkasFile {
  id: number;
  kind: DocKind;
  size: number;
  uploadedAt: string;
  note: string | null;
  verdict: DocVerdict | null;
  /** A re-upload replaced an earlier file (V1); V2 is this one */
  hasPrev: boolean;
  prevUploadedAt: string | null;
}

/** POST review, S2 additions: a score and a verdict per file. */
export interface ReviewRequestS2 extends ReviewRequest {
  /** 0 to 100, or null to clear; ignored by Cutting */
  score?: number | null;
  files?: Partial<Record<DocKind, DocVerdict | null>>;
}

/** A row of the Cutting board. */
export interface CutRowView {
  id: number;
  nim: string;
  nama: string;
  kelas: string | null;
  /** First Meet and Tes Tulis attendance */
  fm: boolean;
  tt: boolean;
  /** Logika, FITB, Kodingan, Mikro (S3 fills them) */
  parts: (number | null)[];
  total: number | null;
  /** Berkas only: the status and the optional score */
  berkas: { status: CandidateStatus; score: number | null; docs: number } | null;
  proposal: Proposal | null;
  /** The proposer's 3-letter code */
  proposedBy: string | null;
  note: string | null;
  /** The candidate opened their envelope (after the reveal) */
  opened: boolean | null;
}

export interface CutLock {
  locked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  /** When the envelopes open, once locked */
  revealAt: string | null;
  /** What locking would use now: the stage's Pengumuman start */
  defaultRevealAt: string | null;
  /** Past revealAt: unlocking is over */
  revealed: boolean;
  opened: number;
}

/** GET results?stage= (cuttingPropose) */
export interface CutBoardResponse {
  ok: true;
  stage: CutStage;
  rows: CutRowView[];
  tally: { lolos: number; gagal: number; belum: number; total: number };
  lock: CutLock;
  /** What the deck aims for, from PRD 3 targets, for the threshold card */
  target: { min: number; max: number } | null;
  now: string;
}

/** POST propose */
export interface ProposeRequest {
  stage: CutStage;
  items: { id: number; proposal: Proposal | null; note?: string | null }[];
}
export interface ProposeResponse {
  ok: true;
  changed: number;
  /** Proposals by someone else that this call replaced */
  overwrote: { id: number; by: string }[];
}

/** POST lock and unlock */
export interface LockRequest {
  stage: CutStage;
  /** Only the Ketua, to bring the reveal forward or back (a rehearsal); default is the Pengumuman's start */
  revealAt?: string;
}
export interface LockResponse {
  ok: true;
  locked: boolean;
  revealAt: string | null;
}

/** An envelope as the candidate's inbox sees it. */
export interface EnvelopeView {
  stage: CutStage;
  opened: boolean;
  /** Null until it is opened: a sealed envelope carries nothing about the result */
  result: Proposal | null;
  /** When the envelope became available */
  revealAt: string;
  /** What they got through (stages passed), for the Gagal copy; no scores */
  through: StageKey[];
}

/** GET envelopes (the candidate) */
export interface EnvelopesResponse {
  ok: true;
  envelopes: EnvelopeView[];
  /** Locked but not yet revealed: only the stage and the time, never the result */
  pending: { stage: CutStage; revealAt: string }[];
  now: string;
}

/** POST envelope-open */
export interface EnvelopeOpenResponse {
  ok: true;
  stage: CutStage;
  result: Proposal;
  openedAt: string;
  /** The next event after a Lolos */
  next: EventLite | null;
}

/** GET qr-events (attendance): the events a QR can be shown for right now. */
export interface QrEventsResponse {
  ok: true;
  events: (EventLite & { here: number; expected: number })[];
  now: string;
}

/** GET qr-token?event= (attendance) */
export interface QrTokenResponse {
  ok: true;
  token: string;
  /** 6 characters for a phone that cannot scan */
  code: string;
  period: number;
  /** ISO instant this token stops being the wall's */
  until: string;
  event: EventLite;
  here: number;
  expected: number;
}

/** POST attend: a token from the QR, or the typed code. */
export interface AttendRequest {
  token?: string;
  code?: string;
}
export interface AttendResponse {
  ok: true;
  /** Already marked present before this scan */
  sudah: boolean;
  event: EventLite;
}

/** GET attendance?event= (attendance): the Kehadiran drawer. */
export interface AttendanceRow {
  id: number;
  nim: string;
  nama: string;
  present: boolean;
  via: "qr" | "manual" | null;
  reason: string | null;
  by: string | null;
  at: string | null;
}
export interface AttendanceResponse {
  ok: true;
  event: EventLite;
  rows: AttendanceRow[];
  live: boolean;
}

/** POST attend-manual */
export interface AttendManualRequest {
  id: number;
  event: number;
  reason?: string;
  /** Take a manual mark back (QR marks cannot be taken back) */
  undo?: boolean;
}

/** A seat count in a slot, with no names. */
export interface SlotSeat {
  id: number;
  stage: StageKey;
  eventId: number | null;
  room: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  taken: number;
}

export interface PickWindowInfo {
  stage: StageKey;
  eventId: number;
  opensAt: string;
  closesAt: string;
  open: boolean;
}

export interface MySlotChange {
  id: number;
  toSlot: number | null;
  reason: string;
  status: SlotChangeStatus;
  /** What Panitia wrote when declining */
  note: string | null;
  decidedAt: string | null;
}

/** What one stage's Pilih Jadwal looks like to the candidate who is in it. */
export interface CandidateSlotsStage {
  window: PickWindowInfo;
  slots: SlotSeat[];
  mine: { slotId: number; via: SlotVia; at: string } | null;
  /** Changes stop at H-1 23.59 of mine; an ISO instant */
  changeUntil: string | null;
  canChange: boolean;
  /** Their latest request, open or decided */
  change: MySlotChange | null;
}

/** GET slots (a candidate): stages they may pick in; no other candidate's name or number ever. */
export interface CandidateSlotsResponse {
  ok: true;
  stages: CandidateSlotsStage[];
  now: string;
}

/** The Panitia board. */
export interface BoardSeat {
  candidateId: number;
  nim: string;
  nama: string;
  via: SlotVia;
}
export interface BoardRequest {
  id: number;
  candidateId: number;
  nim: string;
  nama: string;
  fromSlot: number | null;
  toSlot: number | null;
  reason: string;
  status: SlotChangeStatus;
  note: string | null;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}
export interface PlotBoardResponse {
  ok: true;
  stage: StageKey;
  window: PickWindowInfo | null;
  slots: (SlotSeat & { seats: BoardSeat[] })[];
  /** In the stage with no seat yet */
  unplaced: { candidateId: number; nim: string; nama: string }[];
  requests: BoardRequest[];
  now: string;
}

/** POST slot-pick / slot-change / slot-decide / slot-set / slot-autofill */
export interface SlotPickRequest {
  slotId: number;
}
export interface SlotChangeRequest {
  toSlot?: number;
  reason?: string;
  withdraw?: boolean;
}
export interface SlotDecideRequest {
  id: number;
  approve: boolean;
  /** Approve although the target is full (Setujui Melebihi Kapasitas) */
  over?: boolean;
  note?: string;
}
export type SlotSetRequest =
  | {
      op: "create";
      stage: StageKey;
      room: string;
      startsAt: string;
      endsAt: string;
      capacity: number;
      eventId?: number | null;
    }
  | { op: "edit"; id: number; room?: string; startsAt?: string; endsAt?: string; capacity?: number }
  | { op: "delete"; id: number }
  | { op: "move"; candidateId: number; stage: StageKey; toSlot: number | null; over?: boolean }
  | { op: "window"; stage: StageKey; mode: "extend" | "close" };
export interface SlotAutofillRequest {
  stage: StageKey;
  /** The `at` of an earlier run: take that run back */
  undo?: string;
}
export interface SlotAutofillResponse {
  ok: true;
  placed: number;
  left: number;
  /** ISO instant that names this run, for one Urungkan */
  at: string | null;
}
