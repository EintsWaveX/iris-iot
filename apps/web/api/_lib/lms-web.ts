/**
 * IRIS's own LMS web session (2026-10-13), for making, changing and
 * deleting the "TP Modul N" assignments in every class course.
 *
 * The app token reads only; Moodle has no web service that adds an
 * activity. So IRIS signs in to the LMS website the way the CeLOE app does
 * when it opens a page: the token's private key buys a one-minute autologin
 * key (tool_mobile_get_autologin_key, once per six minutes), and
 * admin/tool/mobile/autologin.php turns it into a session cookie. That
 * session then fills course/modedit.php like a Teacher: the form is read
 * whole, only IRIS's own fields change, and it is sent back with every
 * other value as the LMS gave it. A delete goes through course/mod.php's
 * own confirmation form.
 *
 * The cookie is kept encrypted (pengaturan lms_web), so the six-minute
 * limit is rarely met; a page that sends IRIS to the sign in starts a new
 * session once.
 */
import { keHalaman, LmsGalat, LMS_URL, panggil, type JawabHalaman } from "./lms.js";

/* ============================================================== the form */

export interface Isian {
  nama: string;
  nilai: string;
  /** input type, "select" or "textarea" */
  jenis: string;
  centang: boolean;
  mati: boolean;
  /** a select's selected values (several for a multiple select) */
  pilih?: string[];
  ganda?: boolean;
}

const ENTITAS: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function teksHtml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#")
      return String.fromCodePoint(
        e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
      );
    return ENTITAS[e.toLowerCase()] ?? m;
  });
}

function atribut(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1].toLowerCase()] = teksHtml(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

/**
 * The fields of the page's first form whose action matches `aksi`, in
 * document order, as a browser would see them before any script runs.
 */
export function bacaForm(html: string, aksi: RegExp): Isian[] | null {
  const bersih = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let isi: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bersih))) {
    if (aksi.test(atribut(m[1]).action ?? "")) {
      isi = m[2];
      break;
    }
  }
  if (isi === null) return null;
  const out: Isian[] = [];
  const el = /<(input|select|textarea)\b([^>]*)>/gi;
  while ((m = el.exec(isi))) {
    const tag = m[1].toLowerCase();
    const a = atribut(m[2]);
    if (!a.name) continue;
    const mati = "disabled" in a;
    if (tag === "input") {
      const jenis = (a.type || "text").toLowerCase();
      out.push({
        nama: a.name,
        nilai: a.value ?? (jenis === "checkbox" || jenis === "radio" ? "on" : ""),
        jenis,
        centang: "checked" in a,
        mati,
      });
    } else if (tag === "textarea") {
      const tutup = isi.toLowerCase().indexOf("</textarea>", el.lastIndex);
      const dalam = isi.slice(el.lastIndex, tutup < 0 ? undefined : tutup).replace(/^\r?\n/, "");
      out.push({ nama: a.name, nilai: teksHtml(dalam), jenis: "textarea", centang: false, mati });
      if (tutup >= 0) el.lastIndex = tutup;
    } else {
      const tutup = isi.toLowerCase().indexOf("</select>", el.lastIndex);
      const dalam = isi.slice(el.lastIndex, tutup < 0 ? undefined : tutup);
      const opsi = [
        ...dalam.matchAll(/<option\b([^>]*)>([\s\S]*?)(?=<option\b|<\/optgroup|$)/gi),
      ].map((o) => {
        const oa = atribut(o[1]);
        return {
          nilai: oa.value ?? teksHtml(o[2].replace(/<[^>]*>/g, "")).trim(),
          pilih: "selected" in oa,
        };
      });
      const ganda = "multiple" in a;
      let pilih = opsi.filter((o) => o.pilih).map((o) => o.nilai);
      if (!ganda && !pilih.length && opsi.length) pilih = [opsi[0].nilai];
      if (!ganda) pilih = pilih.slice(-1);
      out.push({
        nama: a.name,
        nilai: pilih[0] ?? "",
        jenis: "select",
        centang: false,
        mati,
        pilih,
        ganda,
      });
      if (tutup >= 0) el.lastIndex = tutup;
    }
  }
  return out;
}

/**
 * Changes some fields: a string sets a text, hidden or select value; a
 * boolean ticks or clears a checkbox (its hidden twin, Moodle's "0", stays).
 * A field the form doesn't have is added at the end.
 */
export function ubahForm(isian: Isian[], ubah: Record<string, string | boolean>): Isian[] {
  const out = isian.map((f) => ({ ...f }));
  // name and name[value] are one key to PHP: the later one wins and can
  // turn a text field into an array, so a field the form lacks is only
  // added when no field of the form shares its base name.
  const dasar = (n: string) => n.replace(/\[.*$/, "");
  const adaDasar = new Set(isian.map((f) => dasar(f.nama)));
  for (const [nama, v] of Object.entries(ubah)) {
    const kena = out.filter((f) => f.nama === nama && f.jenis !== "submit");
    if (!kena.length) {
      if (typeof v === "string" && !adaDasar.has(dasar(nama)))
        out.push({ nama, nilai: v, jenis: "hidden", centang: false, mati: false });
      continue;
    }
    for (const f of kena) {
      f.mati = false;
      if (f.jenis === "checkbox" || f.jenis === "radio") {
        f.centang = typeof v === "boolean" ? v && f.jenis === "checkbox" : f.nilai === v;
      } else if (f.jenis === "hidden" && typeof v === "boolean") {
        // the unticked twin of a checkbox keeps its "0"
      } else if (f.jenis === "select") {
        f.nilai = String(v);
        f.pilih = [String(v)];
      } else {
        f.nilai = String(v);
      }
    }
  }
  return out;
}

/** The form's body as the browser sends it, pressing `tombol`. */
export function bentukForm(isian: Isian[], tombol?: string): string {
  const b = new URLSearchParams();
  for (const f of isian) {
    if (f.mati) continue;
    if (["submit", "button", "image", "reset", "file"].includes(f.jenis)) {
      if (tombol && f.nama === tombol) b.append(f.nama, f.nilai);
      continue;
    }
    if ((f.jenis === "checkbox" || f.jenis === "radio") && !f.centang) continue;
    if (f.jenis === "select") {
      for (const v of f.pilih ?? []) b.append(f.nama, v);
      continue;
    }
    b.append(f.nama, f.nilai);
  }
  return b.toString();
}

/** The messages Moodle puts under fields it refused. */
export function galatForm(html: string): string[] {
  return [...html.matchAll(/<div[^>]*class="[^"]*invalid-feedback[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
    .map((m) =>
      teksHtml(m[1].replace(/<[^>]*>/g, ""))
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/** A page's sesskey (M.cfg), for a check that its session is real. */
export function kunciSesi(html: string): string | null {
  return html.match(/"sesskey":"([A-Za-z0-9]+)"/)?.[1] ?? null;
}

/** "2026-10-14T11:00:00Z" as Moodle's date selector in WIB (UTC+7). */
export function tanggalWib(
  iso: string,
): Record<"day" | "month" | "year" | "hour" | "minute", string> {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000);
  return {
    day: String(d.getUTCDate()),
    month: String(d.getUTCMonth() + 1),
    year: String(d.getUTCFullYear()),
    hour: String(d.getUTCHours()),
    minute: String(d.getUTCMinutes()),
  };
}

function tanggalForm(nama: string, iso: string | null): Record<string, string | boolean> {
  if (!iso) return { [`${nama}[enabled]`]: false };
  const t = tanggalWib(iso);
  return {
    [`${nama}[enabled]`]: true,
    [`${nama}[day]`]: t.day,
    [`${nama}[month]`]: t.month,
    [`${nama}[year]`]: t.year,
    [`${nama}[hour]`]: t.hour,
    [`${nama}[minute]`]: t.minute,
  };
}

/* =========================================================== the session */

/** Where the stored cookie is read and written (encrypted by the caller). */
export interface SimpanKue {
  baca(): Promise<string | null>;
  tulis(kue: string | null): Promise<void>;
}

function kueDari(s: string | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of (s ?? "").split(/;\s*/)) {
    const i = p.indexOf("=");
    if (i > 0) m.set(p.slice(0, i), p.slice(i + 1));
  }
  return m;
}

function terapkan(jar: Map<string, string>, setCookies: string[]) {
  for (const c of setCookies) {
    const [pasang, ...attr] = c.split(";");
    const i = pasang.indexOf("=");
    if (i <= 0) continue;
    const nama = pasang.slice(0, i).trim();
    const nilai = pasang.slice(i + 1).trim();
    const kedaluwarsa = attr.some((a) => {
      const [k, v] = a.split("=").map((x) => x.trim().toLowerCase());
      return (k === "max-age" && Number(v) <= 0) || (k === "expires" && Date.parse(v) < Date.now());
    });
    if (!nilai || nilai === "deleted" || kedaluwarsa) jar.delete(nama);
    else jar.set(nama, nilai);
  }
}

const header = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const keMasuk = (r: JawabHalaman) =>
  (r.status >= 300 && r.status < 400 && /\/login\/(index|logout)\.php/.test(r.lokasi ?? "")) ||
  (r.status === 200 && /<form[^>]+id="login"/.test(r.teks));

export class WebLms {
  private jar: Map<string, string> | null = null;
  private segar = false;

  constructor(
    private token: string,
    private privat: string,
    private userid: number,
    private simpan: SimpanKue,
  ) {}

  /** A new session through the app's autologin. */
  private async masuk(): Promise<void> {
    const k = await panggil<{ key: string; autologinurl: string }>(
      this.token,
      "tool_mobile_get_autologin_key",
      { privatetoken: this.privat },
    );
    const jalan =
      `${new URL(k.autologinurl).pathname}?userid=${this.userid}&key=${encodeURIComponent(k.key)}` +
      `&urltogo=${encodeURIComponent(`${LMS_URL}/my/`)}`;
    const jar = new Map<string, string>();
    const r = await keHalaman(jalan, { metode: "GET", kue: "" });
    terapkan(jar, r.kueBaru);
    const sesi = [...jar.keys()].some((n) => n.startsWith("MoodleSession"));
    if (!sesi || r.status < 300 || r.status >= 400 || /\/login\//.test(r.lokasi ?? ""))
      throw new LmsGalat("lms_masuk_gagal", `autologin: HTTP ${r.status} ${r.lokasi ?? ""}`.trim());
    this.jar = jar;
    this.segar = true;
    await this.simpan.tulis(header(jar));
  }

  /** One page in the session; a sign-in redirect starts a new one once. */
  async halaman(
    jalan: string,
    metode: "GET" | "POST" = "GET",
    isi?: string,
  ): Promise<JawabHalaman> {
    if (!this.jar) {
      const lama = await this.simpan.baca();
      if (lama) this.jar = kueDari(lama);
      else await this.masuk();
    }
    let r = await keHalaman(jalan, { metode, isi, kue: header(this.jar!) });
    terapkan(this.jar!, r.kueBaru);
    if (keMasuk(r)) {
      if (this.segar) throw new LmsGalat("lms_masuk_gagal", "the new session went to the sign in");
      await this.masuk();
      // A form posted with the old session's sesskey would be refused: the
      // caller reads its form again (see kirimForm).
      if (metode === "POST") throw new SesiBaru();
      r = await keHalaman(jalan, { metode, isi, kue: header(this.jar!) });
      terapkan(this.jar!, r.kueBaru);
      if (keMasuk(r)) throw new LmsGalat("lms_masuk_gagal", "the new session went to the sign in");
    } else if (r.kueBaru.length) {
      await this.simpan.tulis(header(this.jar!));
    }
    return r;
  }

  /** Reads the form at `jalan`, changes `ubah`, sends it pressing `tombol`. */
  async kirimForm(
    jalan: string,
    aksi: RegExp,
    kirimKe: string,
    ubah: Record<string, string | boolean>,
    tombol?: string,
  ): Promise<JawabHalaman> {
    for (let coba = 0; ; coba++) {
      const r = await this.halaman(jalan);
      if (r.status === 404) throw new LmsGalat("lms_tidak_ada", `HTTP 404 ${jalan}`);
      if (r.status !== 200)
        throw new LmsGalat("lms_halaman", `HTTP ${r.status} ${jalan} ${r.lokasi ?? ""}`.trim());
      const form = bacaForm(r.teks, aksi);
      if (!form) throw new LmsGalat("lms_bentuk_berubah", `no form on ${jalan.split("?")[0]}`);
      try {
        return await this.halaman(kirimKe, "POST", bentukForm(ubahForm(form, ubah), tombol));
      } catch (e) {
        if (e instanceof SesiBaru && coba === 0) continue;
        throw e;
      }
    }
  }
}

class SesiBaru extends Error {}

/* ========================================================= assignments */

export interface RencanaTugas {
  nama: string;
  buka: string;
  tutup: string;
  /** the description, HTML */
  deskripsi: string;
  tampil: boolean;
  /** A draft item id holding the TP's PDF (unggahDraf): it replaces the
   *  description's attachments. Left out, they stay as they are. */
  lampiran?: number;
  /** One file of these types and size per student (an assignment from the
   *  LMS menu's Buat Tugas); left out, the LMS's defaults stay. */
  berkas?: { jenis: string; maksByte: number };
}

function isianTugas(r: RencanaTugas): Record<string, string | boolean> {
  return {
    name: r.nama,
    "introeditor[text]": r.deskripsi,
    "introeditor[format]": "1",
    ...tanggalForm("allowsubmissionsfromdate", r.buka),
    ...tanggalForm("duedate", r.tutup),
    // Late files are IRIS's to judge (Terima Telat), so the LMS takes them.
    ...tanggalForm("cutoffdate", null),
    ...tanggalForm("gradingduedate", null),
    alwaysshowdescription: true,
    assignsubmission_file_enabled: true,
    assignsubmission_onlinetext_enabled: false,
    // A TP uploaded in IRIS goes in as a feedback file (2026-10-14).
    assignfeedback_file_enabled: true,
    visible: r.tampil ? "1" : "0",
    // No "content changed" mail to every student for IRIS's edits.
    coursecontentnotification: false,
    ...(r.lampiran ? { introattachments: String(r.lampiran) } : {}),
    ...(r.berkas
      ? {
          assignsubmission_file_maxfiles: "1",
          assignsubmission_file_maxsizebytes: String(r.berkas.maksByte),
          "assignsubmission_file_filetypes[filetypes]": r.berkas.jenis,
        }
      : {}),
  };
}

/** After a save: the redirect away from the form, else what Moodle said. */
function hasilSimpan(r: JawabHalaman): void {
  if (r.status >= 300 && r.status < 400 && r.lokasi && !/modedit\.php/.test(r.lokasi)) return;
  const galat = r.status === 200 ? galatForm(r.teks) : [];
  throw new LmsGalat(
    "lms_form_ditolak",
    galat.length ? galat.join("; ").slice(0, 300) : `HTTP ${r.status} ${r.lokasi ?? ""}`.trim(),
  );
}

/** A new assignment at the top of the course; its cmid. */
export async function buatTugas(
  web: WebLms,
  kursus: number,
  r: RencanaTugas,
): Promise<number | null> {
  const jawab = await web.kirimForm(
    `/course/modedit.php?add=assign&type=&course=${kursus}&section=0&return=0&sr=0`,
    /modedit\.php/,
    "/course/modedit.php",
    isianTugas(r),
    "submitbutton",
  );
  hasilSimpan(jawab);
  const id = jawab.lokasi?.match(/mod\/assign\/view\.php\?id=(\d+)/)?.[1];
  return id ? Number(id) : null;
}

export async function ubahTugas(web: WebLms, cmid: number, r: RencanaTugas): Promise<void> {
  const jawab = await web.kirimForm(
    `/course/modedit.php?update=${cmid}`,
    /modedit\.php/,
    "/course/modedit.php",
    isianTugas(r),
    "submitbutton2",
  );
  hasilSimpan(jawab);
}

/** Only the description's attachments: the draft area's files replace them. */
export async function lampirTugas(web: WebLms, cmid: number, lampiran: number): Promise<void> {
  const jawab = await web.kirimForm(
    `/course/modedit.php?update=${cmid}`,
    /modedit\.php/,
    "/course/modedit.php",
    { introattachments: String(lampiran), coursecontentnotification: false },
    "submitbutton2",
  );
  hasilSimpan(jawab);
}

/** Turns feedback files on, where IRIS puts a TP uploaded in IRIS. */
export async function nyalakanUmpanBerkas(web: WebLms, cmid: number): Promise<void> {
  const jawab = await web.kirimForm(
    `/course/modedit.php?update=${cmid}`,
    /modedit\.php/,
    "/course/modedit.php",
    { assignfeedback_file_enabled: true, coursecontentnotification: false },
    "submitbutton2",
  );
  hasilSimpan(jawab);
}

/** Through course/mod.php's own confirmation (Moodle may keep it in the recycle bin). */
export async function hapusTugas(web: WebLms, cmid: number): Promise<void> {
  const jawab = await web.kirimForm(
    `/course/mod.php?delete=${cmid}&sr=0`,
    /\/course\/mod\.php/,
    "/course/mod.php",
    {},
  );
  if (!(jawab.status >= 300 && jawab.status < 400) || /mod\.php\?delete/.test(jawab.lokasi ?? ""))
    throw new LmsGalat("lms_hapus_gagal", `HTTP ${jawab.status} ${jawab.lokasi ?? ""}`.trim());
}

/* ============================================== the LMS menu (Phase 15) */

/** After a course page form: back on the course, its section page (Moodle
 *  4.5 with sr) or the group list. */
function kembaliKeKursus(r: JawabHalaman, kode: string): void {
  if (
    r.status >= 300 &&
    r.status < 400 &&
    r.lokasi &&
    /course\/(view|section)\.php|group\/index\.php/.test(r.lokasi)
  )
    return;
  const galat = r.status === 200 ? galatForm(r.teks) : [];
  throw new LmsGalat(
    kode,
    galat.length ? galat.join("; ").slice(0, 300) : `HTTP ${r.status} ${r.lokasi ?? ""}`.trim(),
  );
}

/** A course section's own name (Modul 1 · Bluetooth Low Energy). Both the
 *  4.x field and the older name[customize]/name[value] pair are set; the
 *  form keeps the one it has. */
export async function namaiBagian(web: WebLms, bagian: number, nama: string): Promise<void> {
  const jawab = await web.kirimForm(
    `/course/editsection.php?id=${bagian}&sr=0`,
    /editsection\.php/,
    "/course/editsection.php",
    { name: nama, usedefaultname: false, "name[customize]": true, "name[value]": nama },
    "submitbutton",
  );
  kembaliKeKursus(jawab, "lms_bagian_ditolak");
}

/** A URL activity in a section (a link to an IRIS page). The caller reads
 *  the course again for its cmid. */
export async function buatTautan(
  web: WebLms,
  kursus: number,
  bagian: number,
  t: { nama: string; url: string; teks: string },
): Promise<void> {
  const jawab = await web.kirimForm(
    `/course/modedit.php?add=url&type=&course=${kursus}&section=${bagian}&return=0&sr=0`,
    /modedit\.php/,
    "/course/modedit.php",
    {
      name: t.nama,
      externalurl: t.url,
      "introeditor[text]": t.teks,
      "introeditor[format]": "1",
      visible: "1",
      coursecontentnotification: false,
    },
    "submitbutton2",
  );
  hasilSimpan(jawab);
}

/** A new group in a course (group/group.php). */
export async function buatGrup(web: WebLms, kursus: number, nama: string): Promise<void> {
  const jawab = await web.kirimForm(
    `/group/group.php?courseid=${kursus}`,
    /group\/group\.php/,
    "/group/group.php",
    { name: nama },
    "submitbutton",
  );
  kembaliKeKursus(jawab, "lms_grup_ditolak");
}

/** Adds people to a group through group/members.php's own form. */
export async function isiGrup(web: WebLms, grup: number, userids: number[]): Promise<void> {
  if (!userids.length) return;
  const jalan = `/group/members.php?group=${grup}`;
  for (let coba = 0; ; coba++) {
    const r = await web.halaman(jalan);
    if (r.status !== 200) throw new LmsGalat("lms_halaman", `HTTP ${r.status} ${jalan}`);
    const kunci = r.teks.match(/name="sesskey"\s+value="([A-Za-z0-9]+)"/)?.[1] ?? kunciSesi(r.teks);
    if (!kunci) throw new LmsGalat("lms_bentuk_berubah", "no sesskey on group/members.php");
    const b = new URLSearchParams();
    b.set("sesskey", kunci);
    for (const u of userids) b.append("addselect[]", String(u));
    b.set("add", "add");
    try {
      const j = await web.halaman(jalan, "POST", b.toString());
      if (j.status >= 400) throw new LmsGalat("lms_grup_ditolak", `HTTP ${j.status}`);
      return;
    } catch (e) {
      if (e instanceof SesiBaru && coba === 0) continue;
      throw e;
    }
  }
}

/** Only an assignment's dates (the description and files stay). */
export async function tanggalTugas(
  web: WebLms,
  cmid: number,
  buka: string,
  tutup: string,
): Promise<void> {
  const jawab = await web.kirimForm(
    `/course/modedit.php?update=${cmid}`,
    /modedit\.php/,
    "/course/modedit.php",
    {
      ...tanggalForm("allowsubmissionsfromdate", buka),
      ...tanggalForm("duedate", tutup),
      coursecontentnotification: false,
    },
    "submitbutton2",
  );
  hasilSimpan(jawab);
}
