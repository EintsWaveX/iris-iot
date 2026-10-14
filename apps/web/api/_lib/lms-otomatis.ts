/**
 * Phase 15: what IRIS does in the LMS by itself, on the Orange Pi's beat
 * (api/agent, after the beat is answered), at most every five minutes and
 * within a time budget; what's left goes on at the next beat.
 *
 * - Scheduled announcements go out at their time (someone asked for them).
 * - The rest only when switched on in LMS › Ringkasan (all off by default):
 *   make TP Modul N in every class once its window is set, match the
 *   assignment dates when the window moves, send ready TP scores to the
 *   gradebook, announce when TP opens and 3 hours before it closes, and
 *   keep the class calendars matching the schedule.
 *   (The PDF is built in the browser: Soal TP attaches it on save.)
 *
 * Every change is audited as "otomatis" and read back like the page's.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import { writeAudit } from "../../src/lib/auth.js";
import { pengaturan } from "../../src/lib/schema.js";
import {
  htmlTugasLms,
  keadaanJendela,
  modulTugas,
  namaTugasLms,
  tanggalSama,
  teksTugasLms,
} from "../../src/lib/tp.js";
import { LmsGalat, tugasKursus } from "./lms.js";
import { buatTugas, tanggalTugas } from "./lms-web.js";
import {
  KUNCI_TP,
  bacaSet,
  jendelaUntuk,
  tulisSet,
  webLms,
  type SetTp,
  type TugasTp,
} from "./tp.js";
import {
  KUNCI_LMS,
  bacaCatatan,
  bacaOtomatis,
  tulisCatatan,
  type AcaraIris,
  type NilaiTerkirim,
  type UmumIris,
} from "./lms-menu.js";
import {
  acaraIngin,
  kirimNilaiKursus,
  nilaiSiap,
  samakanKalender,
  templatUmum,
  tokenDari,
  umumkanKursus,
} from "./lms-kerja.js";

type Db = ReturnType<typeof getDb>;

const KUNCI_JALAN = "lms_otomatis_jalan";
const JEDA_MS = 5 * 60_000;
const ANGGARAN_MS = 25_000;
const JAM3 = 3 * 3_600_000;
const OLEH = "otomatis";

interface Jalan {
  pada: string;
  /** Automatic announcements already made: "buka1|<window open>" etc. */
  umum: string[];
}

async function bacaJalan(db: Db): Promise<Jalan> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_JALAN))
    .limit(1);
  const v = r?.nilai as Partial<Jalan> | undefined;
  return { pada: v?.pada ?? "1970-01-01T00:00:00Z", umum: v?.umum ?? [] };
}

/** One step: logged, and a failure doesn't stop the others. */
async function langkah(
  aksi: string,
  detail: Record<string, unknown>,
  f: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await f();
    await writeAudit(OLEH, aksi, detail);
    return true;
  } catch (e) {
    await writeAudit(OLEH, aksi, {
      ...detail,
      gagal: e instanceof LmsGalat ? e.kode : "lms_tak_terjangkau",
    });
    if (!(e instanceof LmsGalat)) console.error(`[lms-otomatis] ${aksi}:`, e);
    return false;
  }
}

export async function otomatisLmsBilaPerlu(db: Db): Promise<void> {
  try {
    const set = await bacaSet(db);
    if (!set.token) return;
    const jalan = await bacaJalan(db);
    const now = Date.now();
    if (now - Date.parse(jalan.pada) < JEDA_MS) return;
    jalan.pada = new Date(now).toISOString();
    await tulisSet(db, KUNCI_JALAN, jalan, null);
    const batas = now + ANGGARAN_MS;
    const sisa = () => Date.now() < batas;
    const nyala = (await bacaOtomatis(db)).nyala;

    await umumTerjadwal(db, set, sisa);
    if (nyala.umum && sisa()) await umumOtomatis(db, set, jalan, sisa);
    if ((nyala.tugas || nyala.tanggal) && set.token.privat && sisa())
      await tugasOtomatis(db, set, !!nyala.tugas, !!nyala.tanggal, sisa);
    if (nyala.nilai && sisa()) await nilaiOtomatis(db, set, sisa);
    if (nyala.kalender && sisa()) await kalenderOtomatis(db, set, sisa);
    await tulisSet(db, KUNCI_JALAN, jalan, null);
  } catch (e) {
    console.error("[lms-otomatis] failed:", e);
  }
}

/** Announcements someone scheduled, once their time comes. */
async function umumTerjadwal(db: Db, set: SetTp, sisa: () => boolean) {
  const daftar = await bacaCatatan<UmumIris[]>(db, KUNCI_LMS.umum, set.semester, []);
  for (const u of daftar) {
    if (u.ditarik || !u.jadwal || Date.parse(u.jadwal) > Date.now()) continue;
    for (const k of u.tujuan) {
      if (!sisa()) return;
      if (u.kursus[String(k)]) continue;
      const label = set.kelas?.kursus.find((x) => x.id === k)?.label ?? String(k);
      await langkah("lms_umum", { langkah: "kirim", kursus: label, id: u.id }, () =>
        umumkanKursus(db, set, u.id, k, u.oleh),
      );
    }
  }
}

/** When TP opens, and 3 hours before it closes, from the templates. */
async function umumOtomatis(db: Db, set: SetTp, jalan: Jalan, sisa: () => boolean) {
  const t = templatUmum(set);
  const m = t.modul;
  const j = jendelaUntuk(set, m);
  if (!j) return;
  const now = Date.now();
  const jenis =
    keadaanJendela(j) !== "buka"
      ? null
      : now >= Date.parse(j.tutup) - JAM3
        ? "tutup"
        : now - Date.parse(j.buka) < JAM3
          ? "buka"
          : null;
  if (!jenis) return;
  const kunci = `${jenis}${m}|${jenis === "buka" ? j.buka : j.tutup}`;
  if (jalan.umum.includes(kunci)) return;
  const tpl = t[jenis];
  const kursus = (set.kelas?.kursus ?? []).map((k) => k.id);
  const id = `${Date.now().toString(16).slice(-6)}${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
  const daftar = await bacaCatatan<UmumIris[]>(db, KUNCI_LMS.umum, set.semester, []);
  daftar.push({
    id,
    judul: tpl.judul.id,
    judulEn: tpl.judul.en,
    isi: tpl.isi,
    oleh: OLEH,
    pada: new Date().toISOString(),
    // Due now: the scheduled sender finishes it at the next beats if needed.
    jadwal: new Date().toISOString(),
    kursus: Object.fromEntries(kursus.map((k) => [String(k), null])),
    tujuan: kursus,
  });
  await tulisCatatan(db, KUNCI_LMS.umum, set.semester, daftar.slice(-200), OLEH);
  jalan.umum = [...jalan.umum.slice(-40), kunci];
  await writeAudit(OLEH, "lms_umum", { langkah: "tulis", judul: tpl.judul.id });
  await umumTerjadwal(db, set, sisa);
}

/** TP Modul N made where it's missing, and its dates kept on the window. */
async function tugasOtomatis(
  db: Db,
  set: SetTp,
  buat: boolean,
  tanggal: boolean,
  sisa: () => boolean,
) {
  const token = tokenDari(set);
  const web = webLms(db, set);
  for (const m of [1, 2, 3, 4]) {
    const j = jendelaUntuk(set, m);
    // Only IRIS's own windows, not yet closed.
    if (!j || j.sumber !== "iris" || keadaanJendela(j) === "tutup") continue;
    for (const k of set.kelas?.kursus ?? []) {
      if (!sisa()) return;
      const ada = k.tugas[String(m)];
      if (!ada && buat) {
        const ok = await langkah(
          "tp_lms_tugas",
          { modul: m, kursus: k.label, langkah: "buat" },
          () =>
            buatTugas(web, k.id, {
              nama: namaTugasLms(m),
              buka: j.buka,
              tutup: j.tutup,
              deskripsi: htmlTugasLms(teksTugasLms(m, j.tutup, k.kelas === "inter" ? "en" : "id")),
              tampil: true,
            }),
        );
        if (ok) await catatTugas(db, token, k.id, m);
      } else if (ada && tanggal && !tanggalSama(ada, j)) {
        const ok = await langkah(
          "tp_lms_tugas",
          { modul: m, kursus: k.label, langkah: "ubah" },
          () => tanggalTugas(web, ada.cmid, j.buka, j.tutup),
        );
        if (ok) await catatTugas(db, token, k.id, m);
      }
    }
  }
}

/** The copy IRIS reads windows and banners from, after a change. */
async function catatTugas(db: Db, token: string, kursus: number, m: number) {
  const a = (await tugasKursus(token, [kursus])).find((t) => modulTugas(t.name) === m);
  const iso = (d: number) => (d > 0 ? new Date(d * 1000).toISOString() : null);
  const segar = await bacaSet(db);
  const kk = segar.kelas?.kursus.find((x) => x.id === kursus);
  if (!segar.kelas || !kk) return;
  kk.tugas[String(m)] = a
    ? ({
        id: a.id,
        cmid: a.cmid,
        nama: a.name,
        buka: iso(a.allowsubmissionsfromdate),
        tutup: iso(a.duedate),
      } satisfies TugasTp)
    : null;
  await tulisSet(db, KUNCI_TP.kelas, segar.kelas, null);
}

/** Ready TP scores that the gradebook doesn't have yet (by IRIS's record). */
async function nilaiOtomatis(db: Db, set: SetTp, sisa: () => boolean) {
  const catatan = await bacaCatatan<Record<string, Record<string, NilaiTerkirim>>>(
    db,
    KUNCI_LMS.nilai,
    set.semester,
    {},
  );
  for (const m of [1, 2, 3, 4]) {
    const siap = await nilaiSiap(db, set, m);
    if (!siap.size) continue;
    const per = catatan[String(m)] ?? {};
    const perlu = [...siap.values()].filter((s) => per[s.nim]?.skor !== s.total).map((s) => s.nim);
    if (!perlu.length) continue;
    for (const k of set.kelas?.kursus ?? []) {
      if (!sisa()) return;
      if (!k.tugas[String(m)] || !(k.nim ?? []).some((n) => perlu.includes(n))) continue;
      await langkah("lms_nilai", { langkah: "kirim", modul: m, kursus: k.label }, () =>
        kirimNilaiKursus(db, set, m, k.id, OLEH),
      );
    }
  }
}

/** Calendars whose IRIS events don't match the schedule any more. */
async function kalenderOtomatis(db: Db, set: SetTp, sisa: () => boolean) {
  const catatan = await bacaCatatan<Record<string, AcaraIris[]>>(
    db,
    KUNCI_LMS.kalender,
    set.semester,
    {},
  );
  const ingin = acaraIngin(set);
  for (const k of set.kelas?.kursus ?? []) {
    if (!sisa()) return;
    const punya = catatan[String(k.id)] ?? [];
    const sama =
      punya.length === ingin.length &&
      ingin.every((a) =>
        punya.some((p) => p.kunci === a.kunci && p.mulai === a.mulai && p.selesai === a.selesai),
      );
    if (sama) continue;
    await langkah("lms_kalender", { langkah: "samakan", kursus: k.label }, () =>
      samakanKalender(db, set, k.id, OLEH),
    );
  }
}
