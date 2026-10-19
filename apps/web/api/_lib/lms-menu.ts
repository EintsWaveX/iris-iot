/**
 * Phase 15: the LMS menu (Beta). The LMS calls behind its tabs, through
 * the app token (lms.ts panggil) or the Teacher web session (lms-web.ts),
 * and the records IRIS keeps of what it did there (pengaturan, one key per
 * kind, each scoped to its semester so a new semester starts empty).
 *
 * Every change still happens in the real LMS and is read back; these
 * records only remember which LMS ids are IRIS's (an announcement's
 * discussion, a calendar event, a URL module) so IRIS can find, match or
 * take them down later.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { pengaturan } from "../../src/lib/schema.js";
import { poinNomor } from "../../src/lib/tp.js";
import { LmsGalat, panggil, teksLms } from "./lms.js";
import { tulisSet } from "./tp.js";

type Db = ReturnType<typeof getDb>;

/* ============================================================== records */

export const KUNCI_LMS = {
  otomatis: "lms_otomatis",
  umum: "lms_umum",
  kalender: "lms_kalender",
  materi: "lms_materi",
  nilai: "lms_nilai",
  perpanjang: "lms_perpanjang",
  info: "lms_kelas_info",
} as const;

/** What IRIS does in the LMS by itself; each can be turned off. Off until
 *  someone turns it on (outward actions on real classes). */
export const OTOMATIS = ["tugas", "tanggal", "pdf", "nilai", "umum", "kalender"] as const;
export type Otomatis = (typeof OTOMATIS)[number];
export interface OtomatisSet {
  nyala: Partial<Record<Otomatis, boolean>>;
  ubah: Partial<Record<Otomatis, { oleh: string; pada: string }>>;
}

/** One announcement IRIS posted, and where. */
export interface UmumIris {
  id: string;
  judul: string;
  /** The International class's title (English). */
  judulEn: string;
  isi: { id: string; en: string };
  oleh: string;
  pada: string;
  /** Set for a scheduled one: when it goes out (ISO). */
  jadwal: string | null;
  /** Per class course: the discussion and its first post, once posted. */
  kursus: Record<string, { diskusi: number; post: number | null; pada: string } | null>;
  /** The class courses it is for. */
  tujuan: number[];
  ditarik?: { oleh: string; pada: string };
}

/** A calendar event IRIS put in a class course. */
export interface AcaraIris {
  kunci: string;
  id: number;
  mulai: string;
  selesai: string;
  nama: string;
}

/** A module's section and links IRIS set in a class course. */
export interface MateriIris {
  bagian: number | null;
  nama: string | null;
  url: Record<string, number>;
  /** the handbook chapter's File and the stamp it was uploaded at */
  berkas?: { cmid: number; cap: string; ukuran: number };
  pada: string;
}

/** A TP score as it went to the LMS gradebook. */
export interface NilaiTerkirim {
  skor: number;
  pada: string;
  oleh: string;
}

/** A per-Praktikan deadline set from IRIS, with its reason. */
export interface Perpanjang {
  tugas: number;
  nama: string;
  kursus: number;
  nim: string;
  userid: number;
  sampai: string;
  alasan: string;
  oleh: string;
  pada: string;
}

interface Bertanda<T> {
  semester: string;
  isi: T;
}

/** A per-semester record: another semester's copy reads as empty. */
export async function bacaCatatan<T>(
  db: Db,
  kunci: string,
  semester: string,
  kosong: T,
): Promise<T> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, kunci))
    .limit(1);
  const v = r?.nilai as Bertanda<T> | undefined;
  return v && v.semester === semester ? v.isi : kosong;
}

export async function tulisCatatan<T>(
  db: Db,
  kunci: string,
  semester: string,
  isi: T,
  oleh: string | null,
): Promise<void> {
  await tulisSet(db, kunci, { semester, isi } satisfies Bertanda<T>, oleh);
}

/** Marks the Kelas tab's group and content counts as old, so its next read
 *  asks the LMS again (Sinkron Sekarang, 2026-10-16). The old counts stay
 *  on show if that read fails. */
export async function basikanInfoKelas(db: Db, semester: string): Promise<void> {
  const info = await bacaCatatan<{ pada: string } | null>(db, KUNCI_LMS.info, semester, null);
  if (info) await tulisCatatan(db, KUNCI_LMS.info, semester, { ...info, basi: true }, null);
}

export async function bacaOtomatis(db: Db): Promise<OtomatisSet> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_LMS.otomatis))
    .limit(1);
  const v = r?.nilai as Partial<OtomatisSet> | undefined;
  return { nyala: v?.nyala ?? {}, ubah: v?.ubah ?? {} };
}

export async function otomatisNyala(db: Db, k: Otomatis): Promise<boolean> {
  return (await bacaOtomatis(db)).nyala[k] === true;
}

/** The keys the semester's data deletion clears (they hold NIMs). */
export const KUNCI_LMS_PRIBADI = [KUNCI_LMS.nilai, KUNCI_LMS.perpanjang] as const;

export async function kunciLmsAda(db: Db): Promise<string[]> {
  const rows = await db
    .select({ kunci: pengaturan.kunci })
    .from(pengaturan)
    .where(inArray(pengaturan.kunci, Object.values(KUNCI_LMS)));
  return rows.map((r) => r.kunci);
}

/* ======================================================= the app token */

/** A few at a time: the relay's one Durable Object takes them in turn. */
export async function sebagian<A, B>(xs: A[], n: number, f: (x: A) => Promise<B>): Promise<B[]> {
  const out: B[] = new Array(xs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length) {
        const k = i++;
        out[k] = await f(xs[k]);
      }
    }),
  );
  return out;
}

export interface GrupLms {
  id: number;
  name: string;
}

export async function grupKursus(token: string, kursus: number): Promise<GrupLms[]> {
  const d = await panggil<GrupLms[]>(token, "core_group_get_course_groups", { courseid: kursus });
  return (d ?? []).map((g) => ({ id: g.id, name: teksLms(g.name) }));
}

export interface ModulLms {
  id: number;
  name: string;
  modname: string;
  visible: number;
  instance?: number;
  url?: string;
}

export interface BagianLms {
  id: number;
  section: number;
  name: string;
  visible?: number;
  modules: ModulLms[];
}

export async function isiKursus(token: string, kursus: number): Promise<BagianLms[]> {
  const d = await panggil<BagianLms[]>(token, "core_course_get_contents", {
    courseid: kursus,
    options: [{ name: "excludecontents", value: 1 }],
  });
  return (d ?? []).map((b) => ({
    id: b.id,
    section: b.section,
    name: teksLms(b.name ?? ""),
    visible: b.visible,
    modules: (b.modules ?? []).map((m) => ({
      id: m.id,
      name: teksLms(m.name),
      modname: m.modname,
      visible: m.visible,
      instance: m.instance,
      url: m.url,
    })),
  }));
}

/** Each URL activity's address in these courses, by cmid: the course read
 *  gives only the activity's own page (mod/url/view.php). */
export async function alamatTautan(token: string, kursus: number[]): Promise<Map<number, string>> {
  const d = await panggil<{ urls?: { coursemodule: number; externalurl: string }[] }>(
    token,
    "mod_url_get_urls_by_courses",
    { courseids: kursus },
  );
  return new Map((d?.urls ?? []).map((u) => [u.coursemodule, u.externalurl]));
}

export interface OrangLms {
  id: number;
  fullname: string;
  idnumber?: string;
  username?: string;
  email?: string;
  roles?: { shortname: string }[];
  groups?: { id: number; name: string }[];
  lastcourseaccess?: number;
}

export function orangKursus(token: string, kursus: number) {
  return panggil<OrangLms[]>(token, "core_enrol_get_enrolled_users", {
    courseid: kursus,
    options: [
      { name: "onlyactive", value: 1 },
      {
        name: "userfields",
        value: "id,fullname,idnumber,username,email,roles,groups,lastcourseaccess",
      },
    ],
  });
}

/** One LMS message to one person; refused when their LMS blocks it. */
export async function kirimPesan(token: string, userid: number, teks: string): Promise<void> {
  const d = await panggil<{ msgid: number; errormessage?: string }[]>(
    token,
    "core_message_send_instant_messages",
    {
      messages: [
        { touserid: userid, text: teks, textformat: 2, clientmsgid: `iris-${Date.now()}` },
      ],
    },
  );
  if (!d?.[0] || d[0].msgid < 0)
    throw new LmsGalat("lms_pesan_ditolak", d?.[0]?.errormessage ?? "message refused");
}

export interface BenderaLms {
  userid: number;
  locked: number;
  extensionduedate: number;
}

export async function benderaTugas(
  token: string,
  tugas: number[],
): Promise<Map<number, BenderaLms[]>> {
  if (!tugas.length) return new Map();
  const d = await panggil<{ assignments?: { assignmentid: number; userflags?: BenderaLms[] }[] }>(
    token,
    "mod_assign_get_user_flags",
    { assignmentids: tugas },
  );
  return new Map((d.assignments ?? []).map((a) => [a.assignmentid, a.userflags ?? []]));
}

/** A deadline for these people only (0 takes it back). */
export function simpanPerpanjang(token: string, tugas: number, userid: number, sampai: number) {
  return panggil<unknown>(token, "mod_assign_save_user_extensions", {
    assignmentid: tugas,
    userids: [userid],
    dates: [sampai],
  });
}

export function kunciKiriman(token: string, tugas: number, userids: number[], kunci: boolean) {
  return panggil<unknown>(
    token,
    kunci ? "mod_assign_lock_submissions" : "mod_assign_unlock_submissions",
    { assignmentid: tugas, userids },
  );
}

export function kembalikanDraf(token: string, tugas: number, userid: number) {
  return panggil<unknown>(token, "mod_assign_revert_submissions_to_draft", {
    assignmentid: tugas,
    userids: [userid],
  });
}

export async function nilaiLms(
  token: string,
  tugas: number[],
): Promise<Map<number, Map<number, number>>> {
  if (!tugas.length) return new Map();
  const d = await panggil<{
    assignments?: { assignmentid: number; grades?: { userid: number; grade: string }[] }[];
  }>(token, "mod_assign_get_grades", { assignmentids: tugas });
  return new Map(
    (d.assignments ?? []).map((a) => [
      a.assignmentid,
      new Map(
        (a.grades ?? [])
          .map((g) => [g.userid, Number(g.grade)] as const)
          .filter(([, v]) => Number.isFinite(v) && v >= 0),
      ),
    ]),
  );
}

/** Scores with their feedback into one assignment's gradebook. */
export function simpanNilaiLms(
  token: string,
  tugas: number,
  baris: { userid: number; skor: number; umpan: string }[],
) {
  return panggil<unknown>(token, "mod_assign_save_grades", {
    assignmentid: tugas,
    applytoall: 0,
    grades: baris.map((b) => ({
      userid: b.userid,
      grade: b.skor,
      attemptnumber: -1,
      addattempt: 0,
      workflowstate: "",
      plugindata: { assignfeedbackcomments_editor: { text: b.umpan, format: 2 } },
    })),
  });
}

/** Each class course's Announcements forum. */
export async function forumUmum(token: string, kursus: number[]): Promise<Map<number, number>> {
  if (!kursus.length) return new Map();
  const d = await panggil<{ id: number; course: number; type: string }[]>(
    token,
    "mod_forum_get_forums_by_courses",
    { courseids: kursus },
  );
  const out = new Map<number, number>();
  for (const f of d ?? []) if (f.type === "news" && !out.has(f.course)) out.set(f.course, f.id);
  return out;
}

export async function tulisUmum(
  token: string,
  forum: number,
  judul: string,
  html: string,
): Promise<{ diskusi: number; post: number | null }> {
  const d = await panggil<{ discussionid: number }>(token, "mod_forum_add_discussion", {
    forumid: forum,
    subject: judul,
    message: html,
    options: [{ name: "discussionsubscribe", value: 1 }],
  });
  if (!d?.discussionid) throw new LmsGalat("lms_umum_gagal", "no discussion id");
  let post: number | null = null;
  try {
    const p = await panggil<{ posts?: { id: number; parentid?: number | null }[] }>(
      token,
      "mod_forum_get_discussion_posts",
      { discussionid: d.discussionid },
    );
    const ps = p.posts ?? [];
    post = (ps.find((x) => !x.parentid) ?? ps.sort((a, b) => a.id - b.id)[0])?.id ?? null;
  } catch {
    // The post id only serves a later take-down; it is asked again then.
  }
  return { diskusi: d.discussionid, post };
}

export async function postPertama(token: string, diskusi: number): Promise<number | null> {
  const p = await panggil<{ posts?: { id: number; parentid?: number | null }[] }>(
    token,
    "mod_forum_get_discussion_posts",
    { discussionid: diskusi },
  );
  const ps = p.posts ?? [];
  return (ps.find((x) => !x.parentid) ?? ps.sort((a, b) => a.id - b.id)[0])?.id ?? null;
}

export function hapusPost(token: string, post: number) {
  return panggil<unknown>(token, "mod_forum_delete_post", { postid: post });
}

export interface AcaraLms {
  id: number;
  name: string;
  courseid: number;
  timestart: number;
  timeduration: number;
  eventtype: string;
}

export async function acaraKursus(
  token: string,
  kursus: number[],
  dari: number,
  sampai: number,
): Promise<AcaraLms[]> {
  if (!kursus.length) return [];
  const d = await panggil<{ events?: AcaraLms[] }>(token, "core_calendar_get_calendar_events", {
    events: { courseids: kursus },
    options: { userevents: 0, siteevents: 0, timestart: dari, timeend: sampai },
  });
  return (d.events ?? []).filter((e) => e.eventtype === "course");
}

export async function buatAcara(
  token: string,
  kursus: number,
  a: { nama: string; teks: string; mulai: number; selesai: number },
): Promise<number> {
  const d = await panggil<{ events?: { id: number }[] }>(
    token,
    "core_calendar_create_calendar_events",
    {
      events: [
        {
          name: a.nama,
          description: a.teks,
          format: 2,
          courseid: kursus,
          groupid: 0,
          repeats: 0,
          eventtype: "course",
          timestart: a.mulai,
          timeduration: Math.max(0, a.selesai - a.mulai),
          visible: 1,
          sequence: 1,
        },
      ],
    },
  );
  const id = d.events?.[0]?.id;
  if (!id) throw new LmsGalat("lms_kalender_gagal", "no event id");
  return id;
}

export function hapusAcara(token: string, ids: number[]) {
  return panggil<unknown>(token, "core_calendar_delete_calendar_events", {
    events: ids.map((eventid) => ({ eventid, repeat: 0 })),
  });
}

/** Shows or hides one activity (the LMS's eye). */
export function tampilModul(token: string, cmid: number, tampil: boolean) {
  return panggil<unknown>(token, "core_course_edit_module", {
    action: tampil ? "show" : "hide",
    id: cmid,
  });
}

/** The functions this token may call (the menu hides what it can't do). */
export async function fungsiToken(token: string): Promise<Set<string>> {
  const d = await panggil<{ functions?: { name: string }[] }>(
    token,
    "core_webservice_get_site_info",
  );
  return new Set((d.functions ?? []).map((f) => f.name));
}

/* =============================================================== words */

/** Server copies of the module names (src/lib/app.ts is browser code). */
export const NAMA_MODUL: Record<number, string> = {
  1: "Bluetooth Low Energy",
  2: "WebSocket",
  3: "MQTT",
  4: "LoRa",
};

/** Plain text to the LMS's HTML: a paragraph per blank-line block. */
export function htmlTeks(teks: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return teks
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** The per-question breakdown a Praktikan reads as feedback in the LMS. */
export function umpanBalik(
  per: Partial<Record<number, number>>,
  nomor: readonly number[],
  oleh: string | null,
  b: "id" | "en",
): string {
  const baris = nomor.map((n) => `${n}. ${per[n] ?? 0}/${poinNomor(n)}`);
  const akhir = oleh
    ? b === "id"
      ? `Dinilai ${oleh} lewat IRIS.`
      : `Graded by ${oleh} through IRIS.`
    : b === "id"
      ? "Dinilai lewat IRIS."
      : "Graded through IRIS.";
  return `<p>${baris.join("<br>")}</p><p>${akhir}</p>`;
}
