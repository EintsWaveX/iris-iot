/**
 * Phase 18 teaching attendance, server side: an Asisten's own check-in
 * (Masuk), the PJ's status changes and clock shifts, and the Ambil Alih
 * answers. The rule itself (clock, statuses, cuts) is in
 * src/lib/hadir-mengajar.ts; this file keeps the rows.
 *
 * A slot is named by its `kunci`: "j:<jadwalId>:<tanggal>" for a scheduled
 * slot, "s:<sesiId>" for a Susulan, so attendance can exist before the
 * session does (the automatic start of Task 4 fills the rows early).
 *
 * GET  /api/session/hadirku   Asisten: { slot, nilai }, today's slot of the
 *        signed-in Asisten and how they stand in it.
 * POST /api/session/hadirku { aksi: "masuk" | "batal", kunci? }
 * POST /api/session/hadir { aksi: "status" | "geser" | "aa", ... } (PJ only,
 *        routed from sesi-hadir.ts; "asisten" there is Tandai Hadir)
 */
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { ALASAN_MIN, catatKejadian } from "./berjalan.js";
import { muatOrang, type OrangHak } from "./hak.js";
import { muatLupaSaya, muatNilaiTerbuka } from "./lupa-nilai.js";
import { bayarUlangSlot, muatMinggu, muatPengaturanJendela } from "./penugasan-api.js";
import { konteksModul } from "./pasangan-modul.js";
import { getDb } from "../../src/lib/db.js";
import {
  asisten,
  audit,
  hadirJam,
  hadirMengajar,
  izin,
  jadwal,
  pengaturan,
  sesi,
  sesiAsisten,
  sesiKejadian,
} from "../../src/lib/schema.js";
import { writeAudit } from "../../src/lib/auth.js";
import {
  batasNilai,
  pengingatNilai,
  type LupaSaya,
  type NilaiSaya,
  type TahapNilai,
} from "../../src/lib/lupa-nilai.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { hakPenuh, bolehPenuh } from "../../src/lib/hak.js";
import { slotToMulai } from "../../src/lib/jadwal.js";
import { hariDariTanggal, semesterDariTanggal } from "../../src/lib/jadwal-parser.js";
import { statusSlotTanggal } from "../../src/lib/penugasan-minggu.js";
import { orangTanggal } from "../../src/lib/penugasan-minggu.js";
import { modulTanggal } from "../../src/lib/penugasan-modul.js";
import {
  jamDariMenit,
  jendelaSlot,
  menitDariJam,
  menitSekarangWib,
} from "../../src/lib/sesi-mulai.js";
import {
  TELAT_MAKS,
  akhirSesiMaks,
  baseSlot,
  baseSusulan,
  dinilai,
  potonganPada,
  hitungHadir,
  instanWib,
  potonganHadir,
  type StatusHadir,
  type StatusLive,
} from "../../src/lib/hadir-mengajar.js";

type Db = ReturnType<typeof getDb>;

/** A check-in may be taken back within this many seconds of the press. */
export const BATAL_DETIK = 15;

export interface SlotSaya {
  kunci: string;
  tanggal: string;
  jadwalId: number | null;
  sesiId: number | null;
  slot: number | null;
  /** The clock the check-in is measured from (a PJ's shift included). */
  base: Date;
  diharapkan: boolean;
  izin: boolean;
  pj: string | null;
  sesi: { id: number; status: string } | null;
}

export interface BarisHadir {
  nim: string;
  kode: string;
  nama: string;
  diharapkan: boolean;
  izin: boolean;
  hadirPada: string | null;
  status: StatusLive;
  menit: number | null;
  potong: number;
  nolkanUnit: boolean;
  hitungMangkir: boolean;
  ubah: {
    status: StatusHadir;
    menit: number | null;
    alasan: string | null;
    oleh: string | null;
  } | null;
}

export interface AmbilAlih {
  nim: string;
  kelompok: number | null;
  oleh: string;
  pada: string;
}

/* ------------------------------------------------------------- the key */

export const kunciSlot = (jadwalId: number, tanggal: string) => `j:${jadwalId}:${tanggal}`;
export const kunciSusulan = (sesiId: number) => `s:${sesiId}`;

type KunciUrai = { jenis: "j"; jadwalId: number; tanggal: string } | { jenis: "s"; sesiId: number };

/** Reads a key back; null when it is neither shape. */
export function uraiKunci(kunci: unknown): KunciUrai | null {
  if (typeof kunci !== "string") return null;
  const j = /^j:(\d+):(\d{4}-\d{2}-\d{2})$/.exec(kunci);
  if (j) return { jenis: "j", jadwalId: Number(j[1]), tanggal: j[2] };
  const s = /^s:(\d+)$/.exec(kunci);
  if (s) return { jenis: "s", sesiId: Number(s[1]) };
  return null;
}

/** WIB date of an instant, "YYYY-MM-DD". */
export const tanggalWib = (now: Date) =>
  new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

/**
 * Who may act as the slot's PJ: the full right, the slot's PJ code, or the
 * Asisten who made a Susulan.
 */
export function bolehPj(
  orang: {
    tier: string;
    badges: readonly string[];
    kode?: string;
    nim?: string;
    hakOverride?: Readonly<Partial<Record<string, boolean>>>;
  },
  ctx: { pj: string | null; pembuat?: string | null; susulan?: boolean },
): boolean {
  if (hakPenuh(orang as Parameters<typeof hakPenuh>[0])) return true;
  // A Susulan has no PJ code: the creator, or anyone with the full Pair right.
  if (
    ctx.susulan &&
    bolehPenuh({ hakOverride: {}, ...orang } as Parameters<typeof bolehPenuh>[0], "pair")
  )
    return true;
  if (ctx.pj && orang.kode && orang.kode.toUpperCase() === ctx.pj.toUpperCase()) return true;
  return !!ctx.pembuat && !!orang.nim && orang.nim === ctx.pembuat;
}

/** The `bolehPj` context of a loaded slot. */
export const pjCtx = (c: {
  pj: string | null;
  pembuat: string | null;
  jadwalId: number | null;
}) => ({
  pj: c.pj,
  pembuat: c.pembuat,
  susulan: c.jadwalId === null,
});

/* ------------------------------------------------------------- context */

interface Konteks {
  kunci: string;
  tanggal: string;
  jadwalId: number | null;
  sesiId: number | null;
  slot: number | null;
  sesi: { id: number; status: string; modul: number; mulai: string } | null;
  jadwalRow: typeof jadwal.$inferSelect | null;
  /** The slot is a normal teaching day (not a holiday or No Practicum). */
  aktif: boolean;
  /** Base minute without a shift, and the one in force. */
  normal: number;
  baseMenit: number;
  geser: { dariMenit: number; alasan: string; oleh: string; pada: Date } | null;
  pj: string | null;
  pembuat: string | null;
  /** NIMs expected to teach (seated, helping, or holding a Susulan's group). */
  diharapkan: Set<string>;
  /** NIMs excused for this slot. */
  izin: Set<string>;
  orang: Map<string, { nim: string; kode: string; nama: string }>;
}

/**
 * Loads everything the rule needs about one slot; null when the key names
 * nothing. `pemegangSekarang`: a Susulan's expected people from who holds a
 * group now even once it runs (only its start, which writes them down).
 */
export async function muatKonteks(
  db: Db,
  kunci: string,
  opsi: { pemegangSekarang?: boolean } = {},
): Promise<Konteks | null> {
  const u = uraiKunci(kunci);
  if (!u) return null;
  const semua = await db
    .select({ nim: asisten.nim, kode: asisten.kode, nama: asisten.nama })
    .from(asisten);
  const orang = new Map(semua.map((o) => [o.nim, o]));
  const nimDariKode = new Map(semua.map((o) => [o.kode.toUpperCase(), o.nim]));

  const [geser] = await db.select().from(hadirJam).where(eq(hadirJam.kunci, kunci)).limit(1);
  const geserOut = geser
    ? { dariMenit: geser.dariMenit, alasan: geser.alasan, oleh: geser.oleh, pada: geser.pada }
    : null;

  if (u.jenis === "j") {
    const [row] = await db.select().from(jadwal).where(eq(jadwal.id, u.jadwalId)).limit(1);
    if (!row) return null;
    const [s] = await db
      .select({ id: sesi.id, status: sesi.status, modul: sesi.modul, mulai: sesi.mulai })
      .from(sesi)
      .where(
        and(
          eq(sesi.tanggal, u.tanggal),
          eq(sesi.slot, row.slot),
          sql`${sesi.status} <> 'batal'`,
          sql`${sesi.jenis} <> 'tot'`,
        ),
      )
      .orderBy(desc(sesi.id))
      .limit(1);
    const minggu = (await muatMinggu(db, [row], u.tanggal)).get(row.id);
    const diharapkan = new Set<string>();
    const kodes = minggu
      ? orangTanggal(minggu.kursi, minggu.tugas)
      : new Set(row.asisten.map((k) => k.toUpperCase()));
    for (const k of kodes) {
      const nim = nimDariKode.get(k.toUpperCase());
      if (nim) diharapkan.add(nim);
    }
    const iz = new Set<string>();
    for (const x of minggu?.izin ?? []) {
      if (x.status === "dibatalkan") continue;
      iz.add(x.nim);
      diharapkan.add(x.nim);
    }
    const normal = baseSlot(u.tanggal, row.slot);
    return {
      kunci,
      tanggal: u.tanggal,
      jadwalId: row.id,
      sesiId: s?.id ?? null,
      slot: row.slot,
      sesi: s ?? null,
      jadwalRow: row,
      aktif: statusSlotTanggal(row, u.tanggal) === "aktif",
      normal,
      baseMenit: geserOut ? geser.baseMenit : normal,
      geser: geserOut,
      pj: row.pj ?? null,
      pembuat: null,
      diharapkan,
      izin: iz,
      orang,
    };
  }

  const [s] = await db
    .select({
      id: sesi.id,
      status: sesi.status,
      modul: sesi.modul,
      mulai: sesi.mulai,
      tanggal: sesi.tanggal,
    })
    .from(sesi)
    .where(eq(sesi.id, u.sesiId))
    .limit(1);
  if (!s) return null;
  // A Susulan has no creator column; its draft's audit row names who made it.
  const [dibuat] = await db
    .select({ nim: audit.aktorNim })
    .from(audit)
    .where(
      and(
        eq(audit.aksi, "susulan_draf"),
        sql`(${audit.detail}::jsonb ->> 'sesiId')::int = ${s.id}`,
      ),
    )
    .orderBy(asc(audit.id))
    .limit(1);
  // Without a draft row (a Susulan opened straight away), whoever started it made it.
  const [pembuka] = dibuat
    ? []
    : await db
        .select({ nim: sesiKejadian.aktorNim })
        .from(sesiKejadian)
        .where(and(eq(sesiKejadian.sesiId, s.id), eq(sesiKejadian.jenis, "mulai")))
        .limit(1);
  const pembuat = dibuat?.nim ?? pembuka?.nim ?? null;
  // Until it starts, whoever holds a group now and its creator. From the
  // start on, the people its start wrote down (pastikanBaris): a cover who
  // takes over later, or a group moved after the end, is never judged.
  let diharapkan: Set<string>;
  if (s.status === "terjadwal" || opsi.pemegangSekarang) {
    const pegang = await db
      .select({ nim: sesiAsisten.asistenNim })
      .from(sesiAsisten)
      .where(eq(sesiAsisten.sesiId, s.id));
    diharapkan = new Set(pegang.map((p) => p.nim));
    if (pembuat) diharapkan.add(pembuat);
  } else {
    const tercatat = await db
      .select({ nim: hadirMengajar.nim, diharapkan: hadirMengajar.diharapkan })
      .from(hadirMengajar)
      .where(and(eq(hadirMengajar.kunci, kunci), eq(hadirMengajar.diharapkan, true)));
    diharapkan = new Set(tercatat.filter((r) => r.diharapkan).map((r) => r.nim));
  }
  const normal = baseSusulan(s.mulai);
  return {
    kunci,
    tanggal: s.tanggal,
    jadwalId: null,
    sesiId: s.id,
    slot: null,
    sesi: { id: s.id, status: s.status, modul: s.modul, mulai: s.mulai },
    jadwalRow: null,
    aktif: s.status !== "batal",
    normal,
    baseMenit: geserOut ? geser.baseMenit : normal,
    geser: geserOut,
    pj: null,
    pembuat,
    diharapkan,
    izin: new Set(),
    orang,
  };
}

/** The key of the session the room is running (null for a TOT session or one without a slot). */
export async function kunciDariSesi(
  db: Db,
  s: { id: number; tanggal: string; slot: number | null; jenis?: string | null },
): Promise<string | null> {
  if (s.jenis === "tot") return null;
  if (s.jenis === "susulan") return kunciSusulan(s.id);
  if (s.slot === null) return null;
  const [row] = await db
    .select({ id: jadwal.id })
    .from(jadwal)
    .where(
      and(
        eq(jadwal.semester, semesterDariTanggal(s.tanggal)),
        eq(jadwal.hari, hariDariTanggal(s.tanggal)),
        eq(jadwal.slot, s.slot),
      ),
    )
    .limit(1);
  return row ? kunciSlot(row.id, s.tanggal) : null;
}

/* ----------------------------------------------------------- the slots */

/** Today's slots (and Susulan) this person is seated in, holds a group in, or is PJ of. */
export async function slotHariIni(db: Db, nim: string, now: Date): Promise<SlotSaya[]> {
  const hariIni = tanggalWib(now);
  if (!dinilai(hariIni)) return [];
  const [saya] = await db
    .select({ kode: asisten.kode })
    .from(asisten)
    .where(eq(asisten.nim, nim))
    .limit(1);
  const kode = saya?.kode.toUpperCase() ?? "";
  const baris = await db
    .select({ id: jadwal.id })
    .from(jadwal)
    .where(
      and(
        eq(jadwal.semester, semesterDariTanggal(hariIni)),
        eq(jadwal.hari, hariDariTanggal(hariIni)),
      ),
    );
  const susulan = await db
    .select({ id: sesi.id })
    .from(sesi)
    .where(
      and(eq(sesi.tanggal, hariIni), eq(sesi.jenis, "susulan"), sql`${sesi.status} <> 'batal'`),
    );
  const kunci = [
    ...baris.map((b) => kunciSlot(b.id, hariIni)),
    ...susulan.map((s) => kunciSusulan(s.id)),
  ];
  const out: SlotSaya[] = [];
  for (const k of kunci) {
    const c = await muatKonteks(db, k);
    if (!c || !c.aktif) continue;
    const diharapkan = c.diharapkan.has(nim);
    const izinKu = c.izin.has(nim);
    const jadiPj = (!!c.pj && c.pj.toUpperCase() === kode) || c.pembuat === nim;
    let pegang = false;
    if (!diharapkan && !jadiPj && c.sesiId !== null) {
      const [p] = await db
        .select({ id: sesiAsisten.id })
        .from(sesiAsisten)
        .where(and(eq(sesiAsisten.sesiId, c.sesiId), eq(sesiAsisten.asistenNim, nim)))
        .limit(1);
      pegang = !!p;
    }
    if (!diharapkan && !izinKu && !jadiPj && !pegang) continue;
    out.push({
      kunci: k,
      tanggal: c.tanggal,
      jadwalId: c.jadwalId,
      sesiId: c.sesiId,
      slot: c.slot,
      base: instanWib(c.tanggal, c.baseMenit),
      diharapkan,
      izin: izinKu,
      pj: c.pj,
      sesi: c.sesi ? { id: c.sesi.id, status: c.sesi.status } : null,
    });
  }
  return out.sort((a, b) => a.base.getTime() - b.base.getTime());
}

/* -------------------------------------------------------------- the rows */

/**
 * Makes sure each expected person has a row for the slot and that the rows
 * know their session once it exists. Never touches a check-in.
 */
export async function pastikanBaris(
  db: Db,
  kunci: string,
  ctx: { tanggal: string; jadwalId?: number | null; sesiId?: number | null },
  diharapkan: string[],
): Promise<void> {
  if (diharapkan.length > 0) {
    await db
      .insert(hadirMengajar)
      .values(
        diharapkan.map((nim) => ({
          kunci,
          tanggal: ctx.tanggal,
          jadwalId: ctx.jadwalId ?? null,
          sesiId: ctx.sesiId ?? null,
          nim,
          diharapkan: true,
        })),
      )
      .onConflictDoUpdate({
        target: [hadirMengajar.kunci, hadirMengajar.nim],
        set: { diharapkan: true },
      });
  }
  if (ctx.sesiId) {
    await db
      .update(hadirMengajar)
      .set({ sesiId: ctx.sesiId })
      .where(eq(hadirMengajar.kunci, kunci));
  }
}

/** One person's check-in: the first press stands; a second keeps it and answers `sudah`. */
export async function masuk(
  db: Db,
  nim: string,
  kunci: string,
  now: Date = new Date(),
): Promise<
  | { ok: true; hadirPada: string }
  | { ok: false; kode: "tidak_dijadwalkan" | "sudah" | "belum_buka" | "sudah_selesai" }
> {
  // An Asisten on Izin may still check in; the status stays Izin, never cut.
  const slot = (await slotHariIni(db, nim, now)).find((s) => s.kunci === kunci);
  if (!slot) return { ok: false, kode: "tidak_dijadwalkan" };
  const c = await muatKonteks(db, kunci);
  if (!c) return { ok: false, kode: "tidak_dijadwalkan" };
  if (sudahSelesai(c, now)) return { ok: false, kode: "sudah_selesai" };
  // Not before the start window opens (a Susulan: its own start).
  const mulai = c.slot !== null ? slotToMulai(c.slot) : (c.sesi?.mulai ?? null);
  if (mulai) {
    const jendela = c.jadwalRow?.jendelaMulaiMenit ?? (await muatPengaturanJendela(db)).default;
    if (jendelaSlot(mulai, jendela, menitSekarangWib(now)).posisi === "belum")
      return { ok: false, kode: "belum_buka" };
  }
  await db
    .insert(hadirMengajar)
    .values({
      kunci,
      tanggal: slot.tanggal,
      jadwalId: slot.jadwalId,
      sesiId: slot.sesiId,
      nim,
      diharapkan: slot.diharapkan,
    })
    .onConflictDoNothing();
  const [r] = await db
    .update(hadirMengajar)
    .set({
      hadirPada: now,
      diubahOleh: nim,
      diubahPada: now,
      ...(slot.sesiId ? { sesiId: slot.sesiId } : {}),
    })
    .where(
      and(
        eq(hadirMengajar.kunci, kunci),
        eq(hadirMengajar.nim, nim),
        isNull(hadirMengajar.hadirPada),
      ),
    )
    .returning({ hadirPada: hadirMengajar.hadirPada });
  if (!r) return { ok: false, kode: "sudah" };
  return { ok: true, hadirPada: (r.hadirPada ?? now).toISOString() };
}

/** Takes a check-in back, only the person's own and only just after pressing. */
export async function batalMasuk(
  db: Db,
  nim: string,
  kunci: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; kode: "tidak_ada" | "terlalu_lama" }> {
  const [r] = await db
    .select({
      hadirPada: hadirMengajar.hadirPada,
      oleh: hadirMengajar.diubahOleh,
      ubah: hadirMengajar.ubahStatus,
    })
    .from(hadirMengajar)
    .where(and(eq(hadirMengajar.kunci, kunci), eq(hadirMengajar.nim, nim)))
    .limit(1);
  if (!r?.hadirPada || r.oleh !== nim || r.ubah) return { ok: false, kode: "tidak_ada" };
  if (now.getTime() - r.hadirPada.getTime() > BATAL_DETIK * 1000)
    return { ok: false, kode: "terlalu_lama" };
  await db
    .update(hadirMengajar)
    .set({ hadirPada: null, diubahPada: now })
    .where(and(eq(hadirMengajar.kunci, kunci), eq(hadirMengajar.nim, nim)));
  return { ok: true };
}

/** Whether the slot's session is over for the rule: ended, or past its longest run. */
function sudahSelesai(c: Konteks, now: Date): boolean {
  if (c.sesi?.status === "selesai") return true;
  const akhir = akhirSesiMaks(c.tanggal, c.slot, instanWib(c.tanggal, c.baseMenit));
  return now.getTime() >= instanWib(c.tanggal, c.baseMenit).getTime() + akhir * 60000;
}

/** A date's module when no session names it: its TP week's module, else the
 *  highest open one (read even while the semester doesn't pair per module). */
export async function modulHari(db: Db, tanggal: string): Promise<number | null> {
  const k = await konteksModul(db, semesterDariTanggal(tanggal), true);
  return modulTanggal({ tanggal, hariIni: tanggal, jendela: k.jendela, terbuka: k.terbuka }).modul;
}

/** The lab clock's refusal for a slot that never started (api/_lib/jam-lab.ts), if any. */
async function tolakOtomatis(
  db: Db,
  kunci: string,
  tanggal: string,
): Promise<{ kode: string; pada: string } | null> {
  const [r] = await db
    .select({ detail: audit.detail, pada: audit.pada })
    .from(audit)
    .where(
      and(
        eq(audit.aksi, "sesi_otomatis_tolak"),
        gte(audit.pada, instanWib(tanggal, 0)),
        sql`${audit.detail}::jsonb ->> 'kunci' = ${kunci}`,
      ),
    )
    .orderBy(desc(audit.id))
    .limit(1);
  if (!r?.detail) return null;
  const kode = (JSON.parse(r.detail) as { kode?: unknown }).kode;
  return typeof kode === "string" ? { kode, pada: r.pada.toISOString() } : null;
}

/** The cut setting (pengaturan `potongan_telat`), each field falling back by itself. */
export async function muatPotongan(db: Db, tanggal?: string) {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, "potongan_telat"))
    .limit(1);
  return potonganPada(r?.nilai, tanggal);
}

/** Everyone's standing in one slot, by the clock and the PJ's overrides. */
export async function statusOrang(
  db: Db,
  kunci: string,
  now: Date,
  ctxAda?: Konteks | null,
): Promise<BarisHadir[]> {
  const c = ctxAda ?? (await muatKonteks(db, kunci));
  // Before HADIR_SEJAK nobody is judged: no Mangkir, no cut, no zeroed unit.
  if (!c || !dinilai(c.tanggal)) return [];
  const rows = await db.select().from(hadirMengajar).where(eq(hadirMengajar.kunci, kunci));
  const potongan = await muatPotongan(db, c.tanggal);
  const selesai = sudahSelesai(c, now);
  const base = instanWib(c.tanggal, c.baseMenit);
  const rowOf = new Map(rows.map((r) => [r.nim, r]));
  const semuaNim = new Set([...c.diharapkan, ...c.izin, ...rows.map((r) => r.nim)]);
  const out: BarisHadir[] = [];
  for (const nim of semuaNim) {
    const o = c.orang.get(nim);
    if (!o) continue;
    const r = rowOf.get(nim);
    const diharapkan = c.diharapkan.has(nim) || !!r?.diharapkan;
    // A PJ's own status wins over an izin written earlier by someone else.
    const ubah = r?.ubahStatus ? { status: r.ubahStatus, menit: r.ubahMenit } : null;
    const izinKu = c.izin.has(nim) && !ubah;
    const hitung = hitungHadir({
      hadir: r?.hadirPada ?? null,
      base,
      izin: izinKu,
      diharapkan,
      selesai,
      now,
      ubah,
    });
    const hitungMangkir = r?.hitungMangkir ?? true;
    const { potong, nolkanUnit } = potonganHadir(hitung, hitungMangkir, potongan);
    out.push({
      nim,
      kode: o.kode.toUpperCase(),
      nama: o.nama,
      diharapkan,
      izin: hitung.status === "izin",
      hadirPada: r?.hadirPada ? r.hadirPada.toISOString() : null,
      status: hitung.status,
      menit: hitung.menit,
      potong,
      nolkanUnit,
      hitungMangkir,
      ubah: r?.ubahStatus
        ? {
            status: r.ubahStatus,
            menit: r.ubahMenit ?? null,
            alasan: r.alasan ?? null,
            oleh: r.diubahOleh ?? null,
          }
        : null,
    });
  }
  return out.sort((a, b) => a.kode.localeCompare(b.kode));
}

/**
 * The Ambil Alih prompts: a group paired away (`pasangan` event) from someone
 * expected who has not checked in, is not on izin, and was not yet asked.
 */
export async function ambilAlihTertunda(
  db: Db,
  c: Konteks,
  baris: BarisHadir[],
): Promise<AmbilAlih[]> {
  if (!c.sesiId) return [];
  const rows = await db
    .select({ detail: sesiKejadian.detail, aktor: sesiKejadian.aktorNim, pada: sesiKejadian.pada })
    .from(sesiKejadian)
    .where(and(eq(sesiKejadian.sesiId, c.sesiId), eq(sesiKejadian.jenis, "pasangan")))
    .orderBy(asc(sesiKejadian.id));
  const dijawab = await db
    .select({ nim: hadirMengajar.nim, ya: hadirMengajar.ambilAlihDijawab })
    .from(hadirMengajar)
    .where(eq(hadirMengajar.kunci, c.kunci));
  const sudah = new Set(dijawab.filter((d) => d.ya).map((d) => d.nim));
  const layak = new Map(
    baris
      .filter((b) => b.diharapkan && !b.hadirPada && !b.izin && b.status !== "izin")
      .map((b) => [b.nim, b]),
  );
  const out = new Map<string, AmbilAlih>();
  for (const r of rows) {
    const d = r.detail as { dari?: string | null; nomor?: number | null };
    if (!d.dari || !layak.has(d.dari) || sudah.has(d.dari)) continue;
    out.set(`${d.dari}:${d.nomor ?? ""}`, {
      nim: d.dari,
      kelompok: d.nomor ?? null,
      oleh: r.aktor,
      pada: r.pada.toISOString(),
    });
  }
  return [...out.values()];
}

/** What GET /api/session/hadir adds for a slot's key. */
export async function hadirUntukKunci(
  db: Db,
  kunci: string,
  orang: OrangHak | null,
  now: Date = new Date(),
) {
  const c = await muatKonteks(db, kunci);
  // A slot from before HADIR_SEJAK shows nothing judged, like a TOT session.
  if (!c || !dinilai(c.tanggal)) return null;
  const baris = await statusOrang(db, kunci, now, c);
  return {
    kunci,
    base: instanWib(c.tanggal, c.baseMenit).toISOString(),
    geser: c.geser ? { dari: jamDariMenit(c.geser.dariMenit), alasan: c.geser.alasan } : null,
    pj: c.pj,
    bolehPj: !!orang && bolehPj(orang, pjCtx(c)),
    baris,
    potongan: await muatPotongan(db),
    ambilAlih: await ambilAlihTertunda(db, c, baris),
  };
}

/* ---------------------------------------------------------------- izin */

/** A PJ's Izin for one person: the same row Penugasan writes, status "aktif". */
export async function catatIzinPj(
  db: Db,
  p: { nim: string; jadwalId: number; tanggal: string; alasan: string; oleh: string },
): Promise<void> {
  await db
    .insert(izin)
    .values({
      nim: p.nim,
      jadwalId: p.jadwalId,
      tanggal: p.tanggal,
      alasan: p.alasan,
      status: "aktif",
      dibuatOleh: p.oleh,
    })
    .onConflictDoUpdate({
      target: [izin.nim, izin.jadwalId, izin.tanggal],
      set: {
        status: sql`CASE WHEN ${izin.status} = 'dibatalkan' THEN 'aktif' ELSE ${izin.status} END`,
      },
    });
  // An Izin given after the session ended changes its Bayar.
  await bayarUlangSlot(db, p.jadwalId, p.tanggal);
}

/* ------------------------------------------------------------- handlers */

function tolak(res: ApiResponse, kode: string, status = 200) {
  res.status(status).json({ ok: false, kode });
}

const STATUS_PJ: readonly string[] = ["tepat", "telat", "mm", "mangkir", "izin", "ikut"];

/** The slot to show an Asisten now: the first one not over yet, else the last. */
export function pilihSlot(slots: SlotSaya[], now: Date): SlotSaya | null {
  if (slots.length === 0) return null;
  const belumLewat = slots.find((s) => {
    const akhir = akhirSesiMaks(s.tanggal, s.slot, s.base);
    return now.getTime() < s.base.getTime() + akhir * 60000;
  });
  return belumLewat ?? slots[slots.length - 1];
}

/** The score reminder for the banner and the home: what is still open. */
export interface NilaiBanner {
  tahap: TahapNilai;
  /** The deadline, 23:59:59 WIB on the practicum day. */
  batas: string;
  saya: NilaiSaya[];
  /** The session's other holders' open groups, for its PJ from 22:30. */
  pj: NilaiSaya[];
  lupa: LupaSaya[];
}

/**
 * Today's groups that are not done: mine, the other holders' of a session
 * I am PJ of, and my Lupa Input Nilai records not put in yet. Null when
 * there is nothing to remind.
 */
export async function muatNilaiBanner(
  db: Db,
  nim: string,
  now: Date,
  semuaPj = false,
): Promise<NilaiBanner | null> {
  const hariIni = tanggalWib(now);
  // No Lupa Input Nilai is recorded before HADIR_SEJAK, so nothing to remind.
  if (!dinilai(hariIni)) return null;
  const hariRows = await db
    .select({ id: sesi.id, tanggal: sesi.tanggal, slot: sesi.slot, jenis: sesi.jenis })
    .from(sesi)
    .where(and(eq(sesi.tanggal, hariIni), eq(sesi.status, "selesai")));
  const terbuka = await muatNilaiTerbuka(
    db,
    hariRows.map((x) => x.id),
  );
  const saya = terbuka.filter((g) => g.pemegang === nim);
  const tahap = pengingatNilai(hariIni, now);
  let pj: NilaiSaya[] = [];
  const lain = terbuka.filter((g) => g.pemegang !== nim);
  if (lain.length && (semuaPj || tahap === "terakhir" || tahap === "robot")) {
    const [akunku] = await db
      .select({ kode: asisten.kode })
      .from(asisten)
      .where(eq(asisten.nim, nim))
      .limit(1);
    const kode = akunku?.kode.toUpperCase() ?? "";
    for (const id of new Set(lain.map((g) => g.sesiId))) {
      const x = hariRows.find((r) => r.id === id);
      const kunci = x ? await kunciDariSesi(db, x) : null;
      const c = kunci ? await muatKonteks(db, kunci) : null;
      if (!c) continue;
      if ((c.pj && c.pj.toUpperCase() === kode) || c.pembuat === nim)
        pj = pj.concat(lain.filter((g) => g.sesiId === id));
    }
  }
  const lupa = await muatLupaSaya(db, nim, now);
  if (saya.length === 0 && pj.length === 0 && lupa.length === 0) return null;
  return {
    tahap: saya.length || pj.length ? tahap : "lewat",
    batas: batasNilai(hariIni).toISOString(),
    saya,
    pj,
    lupa,
  };
}

export async function handleHadirkuGet(
  _req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const db = getDb();
  const now = new Date();
  const slots = await slotHariIni(db, session.nim, now);
  const s = pilihSlot(slots, now);
  const nilai = await muatNilaiBanner(db, session.nim, now);
  if (!s) return res.status(200).json({ ok: true, slot: null, nilai });
  const c = await muatKonteks(db, s.kunci);
  const baris = await statusOrang(db, s.kunci, now, c);
  const saya = baris.find((b) => b.nim === session.nim) ?? null;
  const orang = await muatOrang(session.nim);

  // May this person start the slot now? Seated that date, or the full pair
  // right; a Susulan only by the full right; scheduled slots only inside
  // their start window (api/session/index.ts).
  let bolehMulai = false;
  const belumJalan = !s.sesi || s.sesi.status === "terjadwal";
  if (orang && belumJalan && s.tanggal === tanggalWib(now)) {
    const penuh = bolehPenuh(orang, "pair");
    if (s.slot === null) bolehMulai = penuh;
    else {
      const mulai = slotToMulai(s.slot);
      const jendela = c?.jadwalRow?.jendelaMulaiMenit ?? (await muatPengaturanJendela(db)).default;
      const dalam = mulai
        ? jendelaSlot(mulai, jendela, menitSekarangWib(now)).posisi === "buka"
        : false;
      bolehMulai = dalam && (penuh || s.diharapkan);
    }
  }
  // Not started yet: the module the lab clock would start, and why it
  // could not when it tried (the banner's alert).
  const modul = c?.sesi?.modul ?? (await modulHari(db, s.tanggal));
  const otomatisTolak = belumJalan ? await tolakOtomatis(db, s.kunci, s.tanggal) : null;
  res.status(200).json({
    ok: true,
    slot: { ...s, saya, modul, bolehMulai, otomatisTolak, potongan: await muatPotongan(db) },
    nilai,
  });
}

export async function handleHadirkuPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const body = jsonBody(req);
  const aksi = typeof body.aksi === "string" ? body.aksi : "";
  if (aksi !== "masuk" && aksi !== "batal") return tolak(res, "format_salah");
  const db = getDb();
  const now = new Date();
  let kunci = typeof body.kunci === "string" ? body.kunci : "";
  if (!kunci) {
    const s = pilihSlot(await slotHariIni(db, session.nim, now), now);
    if (!s) return tolak(res, "tidak_dijadwalkan");
    kunci = s.kunci;
  }
  if (aksi === "masuk") {
    const r = await masuk(db, session.nim, kunci, now);
    if (r.ok) await writeAudit(session.nim, "hadir_masuk", { kunci, hadirPada: r.hadirPada });
    return res.status(200).json(r);
  }
  const r = await batalMasuk(db, session.nim, kunci, now);
  if (r.ok) await writeAudit(session.nim, "hadir_batal", { kunci });
  return res.status(200).json(r);
}

/** The PJ's writes on /api/session/hadir: status, geser and aa. */
export async function handleHadirPj(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const aksi = typeof body.aksi === "string" ? body.aksi : "";
  const kunci = typeof body.kunci === "string" ? body.kunci : "";
  if (!uraiKunci(kunci)) return tolak(res, "format_salah");
  const alasan = typeof body.alasan === "string" ? body.alasan.trim().slice(0, 300) : "";
  const db = getDb();
  const now = new Date();
  const nim = typeof body.nim === "string" ? body.nim.trim().toUpperCase() : "";

  if (aksi === "status" || aksi === "geser") {
    if (alasan.length < ALASAN_MIN) return tolak(res, "alasan_kosong");
  }
  let status = "";
  let menit: number | null = null;
  if (aksi === "status") {
    status = typeof body.status === "string" ? body.status : "";
    if (!nim || !STATUS_PJ.includes(status)) return tolak(res, "format_salah");
    if (status === "telat") {
      menit = Number(body.menit);
      if (!Number.isInteger(menit) || menit < 1 || menit > TELAT_MAKS)
        return tolak(res, "format_salah");
    }
  } else if (aksi === "aa") {
    if (!nim || typeof body.izin !== "boolean") return tolak(res, "format_salah");
  } else if (aksi !== "geser") return tolak(res, "format_salah");

  let baseMenit: number | null = null;
  if (aksi === "geser") {
    if (body.jam !== null) {
      baseMenit = typeof body.jam === "string" ? menitDariJam(body.jam) : NaN;
      if (!Number.isFinite(baseMenit)) return tolak(res, "format_salah");
    }
  }

  const orang = await muatOrang(session.nim);
  const c = await muatKonteks(db, kunci);
  if (!orang || !c) return tolak(res, c ? "tanpa_hak" : "slot_tidak_ada", c ? 403 : 200);
  if (!bolehPj(orang, pjCtx(c))) return tolak(res, "tanpa_hak", 403);

  if (aksi === "geser") {
    if (baseMenit === null) {
      await db.delete(hadirJam).where(eq(hadirJam.kunci, kunci));
    } else {
      await db
        .insert(hadirJam)
        .values({ kunci, baseMenit, dariMenit: c.normal, alasan, oleh: session.nim, pada: now })
        .onConflictDoUpdate({
          target: hadirJam.kunci,
          set: { baseMenit, dariMenit: c.normal, alasan, oleh: session.nim, pada: now },
        });
    }
    const detail = {
      kunci,
      dari: jamDariMenit(c.baseMenit),
      ke: jamDariMenit(baseMenit ?? c.normal),
      alasan,
    };
    if (c.sesiId) await catatKejadian(c.sesiId, "jam_geser", detail, session.nim);
    await writeAudit(session.nim, "hadir_geser", detail);
    return res.status(200).json({ ok: true, base: jamDariMenit(baseMenit ?? c.normal) });
  }

  // Everything below changes one person's row.
  if (!c.orang.has(nim)) return tolak(res, "tidak_ada");
  if (nim === session.nim && !hakPenuh(orang)) return tolak(res, "tanpa_hak", 403);

  if (aksi === "aa") {
    await db
      .insert(hadirMengajar)
      .values({
        kunci,
        tanggal: c.tanggal,
        jadwalId: c.jadwalId,
        sesiId: c.sesiId,
        nim,
        diharapkan: c.diharapkan.has(nim),
        ambilAlihDijawab: true,
        diubahOleh: session.nim,
        diubahPada: now,
      })
      .onConflictDoUpdate({
        target: [hadirMengajar.kunci, hadirMengajar.nim],
        set: { ambilAlihDijawab: true, diubahOleh: session.nim, diubahPada: now },
      });
    if (body.izin === true && c.jadwalId !== null) {
      await catatIzinPj(db, {
        nim,
        jadwalId: c.jadwalId,
        tanggal: c.tanggal,
        alasan: "ambil_alih",
        oleh: session.nim,
      });
    }
    if (body.izin === true) {
      // A Susulan has no izin table row: the row itself carries the Izin.
      if (c.jadwalId === null)
        await db
          .update(hadirMengajar)
          .set({ ubahStatus: "izin", alasan: "ambil_alih" })
          .where(and(eq(hadirMengajar.kunci, kunci), eq(hadirMengajar.nim, nim)));
      const d = { kunci, nim, via: "ambil_alih" };
      await writeAudit(session.nim, "hadir_izin", d);
      if (c.sesiId) await catatKejadian(c.sesiId, "hadir_izin", d, session.nim);
    }
    return res.status(200).json({ ok: true });
  }

  // aksi "status"
  const [lama] = await db
    .select({ ubah: hadirMengajar.ubahStatus })
    .from(hadirMengajar)
    .where(and(eq(hadirMengajar.kunci, kunci), eq(hadirMengajar.nim, nim)))
    .limit(1);
  const ubahStatus = status === "ikut" ? null : (status as StatusHadir);
  const ubahMenit = status === "telat" ? menit : null;
  const hitungMangkir = typeof body.hitungMangkir === "boolean" ? body.hitungMangkir : undefined;
  await db
    .insert(hadirMengajar)
    .values({
      kunci,
      tanggal: c.tanggal,
      jadwalId: c.jadwalId,
      sesiId: c.sesiId,
      nim,
      diharapkan: c.diharapkan.has(nim),
      ubahStatus,
      ubahMenit,
      ...(hitungMangkir === undefined ? {} : { hitungMangkir }),
      alasan,
      diubahOleh: session.nim,
      diubahPada: now,
    })
    .onConflictDoUpdate({
      target: [hadirMengajar.kunci, hadirMengajar.nim],
      set: {
        ubahStatus,
        ubahMenit,
        ...(hitungMangkir === undefined ? {} : { hitungMangkir }),
        alasan,
        diubahOleh: session.nim,
        diubahPada: now,
      },
    });
  if (c.jadwalId !== null) {
    if (status === "izin") {
      await catatIzinPj(db, {
        nim,
        jadwalId: c.jadwalId,
        tanggal: c.tanggal,
        alasan,
        oleh: session.nim,
      });
      await writeAudit(session.nim, "hadir_izin", { kunci, nim, alasan });
    } else if (lama?.ubah === "izin") {
      // Undoing the PJ's own Izin frees the seat again.
      await db
        .update(izin)
        .set({ status: "dibatalkan" })
        .where(
          and(
            eq(izin.nim, nim),
            eq(izin.jadwalId, c.jadwalId),
            eq(izin.tanggal, c.tanggal),
            inArray(izin.status, ["aktif", "dicari"]),
          ),
        );
    }
  }
  const detailStatus = {
    kunci,
    nim,
    status,
    menit: ubahMenit,
    hitungMangkir: hitungMangkir ?? null,
    alasan,
  };
  await writeAudit(session.nim, "hadir_status", detailStatus);
  if (c.sesiId) await catatKejadian(c.sesiId, "hadir_status", detailStatus, session.nim);
  return res.status(200).json({ ok: true });
}

/** Tandai Hadir: the PJ stamps someone's arrival at now (kept if they already checked in). */
export async function tandaiHadir(
  db: Db,
  p: { kunci: string; nim: string; oleh: string; now?: Date },
): Promise<void> {
  const now = p.now ?? new Date();
  const c = await muatKonteks(db, p.kunci);
  if (!c) return;
  await db
    .insert(hadirMengajar)
    .values({
      kunci: p.kunci,
      tanggal: c.tanggal,
      jadwalId: c.jadwalId,
      sesiId: c.sesiId,
      nim: p.nim,
      diharapkan: c.diharapkan.has(p.nim),
      hadirPada: now,
      diubahOleh: p.oleh,
      diubahPada: now,
    })
    .onConflictDoNothing();
  await db
    .update(hadirMengajar)
    .set({ hadirPada: now, diubahOleh: p.oleh, diubahPada: now })
    .where(
      and(
        eq(hadirMengajar.kunci, p.kunci),
        eq(hadirMengajar.nim, p.nim),
        isNull(hadirMengajar.hadirPada),
      ),
    );
  await writeAudit(p.oleh, "hadir_tandai", { kunci: p.kunci, nim: p.nim });
  if (c.sesiId)
    await catatKejadian(c.sesiId, "hadir_tandai", { kunci: p.kunci, nim: p.nim }, p.oleh);
}
