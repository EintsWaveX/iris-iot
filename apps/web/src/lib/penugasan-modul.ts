/**
 * Who holds which group in each module, when a semester runs its pairing
 * per module (Jadwal › Per Modul). Browser-safe: the Schedule, Tim, the
 * Console home and session start share it.
 *
 * A slot keeps its default pairing in `jadwal.asisten`. With the semester's
 * switch on, `jadwal.asisten_modul` may hold a list per module, one code per
 * group in group order ("" for an open seat); a module without one uses the
 * default. Only the slot's own default Asisten are ever seated there, so
 * who belongs to a slot doesn't change; covers, volunteers and excuses stay
 * per date (penugasan_slot, izin).
 */
import { bagiKelompok } from "./penugasan.js";
import { hariKe, mingguPraktikum, tambahHari, type JendelaTp } from "./tp.js";

/** How many modules a semester pairs by default, and the most it may set
 *  (Per Modul's Jumlah Modul; the handbook and journals stay at 4). */
export const MODUL_BAWAAN = 4;
export const MODUL_MAKS = 8;

/** Modules 1 to `n`, `n` held between 1 and MODUL_MAKS. */
export function daftarModul(n: number = MODUL_BAWAAN): number[] {
  const k = Number.isInteger(n) ? Math.min(MODUL_MAKS, Math.max(1, n)) : MODUL_BAWAAN;
  return Array.from({ length: k }, (_, i) => i + 1);
}

/** One list per module, keyed "1" to the semester's module count. */
export type AsistenModul = Partial<Record<string, string[]>>;

/* ============================================================ the lists */

/** The list a date's seats are built from: the module's own while the
 *  switch is on and it has one, else the slot's default. */
export function asistenModul(
  j: { asisten: readonly string[]; asistenModul?: AsistenModul | null },
  modul: number | null,
  aktif: boolean,
): readonly string[] {
  if (!aktif || modul == null) return j.asisten;
  return j.asistenModul?.[String(modul)] ?? j.asisten;
}

/** The slot's people a module may seat: its default codes, once each. */
export function kolam(asisten: readonly string[]): string[] {
  const out: string[] = [];
  for (const k of asisten.map((x) => x.trim().toUpperCase()))
    if (k && !out.includes(k)) out.push(k);
  return out;
}

/** Whether `list` is a valid module list for a slot of `n` groups. */
export function listSah(list: unknown, n: number, pool: readonly string[]): list is string[] {
  return (
    Array.isArray(list) &&
    list.length === n &&
    list.every((k) => typeof k === "string" && (k === "" || pool.includes(k.toUpperCase())))
  );
}

/**
 * Keeps only the module lists that still fit a slot: the same group count
 * and every code still among its default Asisten. The rest drop (that
 * module goes back to the default).
 */
export function saringModul(
  am: AsistenModul | null | undefined,
  n: number,
  asisten: readonly string[],
): { tetap: AsistenModul; dibuang: number } {
  const pool = kolam(asisten);
  const tetap: AsistenModul = {};
  let dibuang = 0;
  for (const [m, list] of Object.entries(am ?? {})) {
    if (listSah(list, n, pool)) tetap[m] = list.map((k) => k.toUpperCase());
    else dibuang++;
  }
  return { tetap, dibuang };
}

/** For each module, which groups hold an Asisten they had in an earlier
 *  one. With `pool`, only where it could be helped: someone in the pool
 *  the group hasn't met yet. */
export function ulang(
  lists: Record<number, readonly string[]>,
  pool?: readonly string[],
): Record<number, boolean[]> {
  const out: Record<number, boolean[]> = {};
  const lalu = new Map<number, Set<string>>();
  for (const m of Object.keys(lists)
    .map(Number)
    .sort((a, b) => a - b)) {
    const list = lists[m];
    if (!list) continue;
    out[m] = list.map((k, g) => {
      const met = lalu.get(g);
      if (!k || !met?.has(k)) return false;
      return !pool || pool.some((x) => !met.has(x));
    });
    list.forEach((k, g) => {
      if (!k) return;
      if (!lalu.has(g)) lalu.set(g, new Set());
      lalu.get(g)!.add(k);
    });
  }
  return out;
}

/* ===================================================== a date's module */

export type SumberModul = "sesi" | "tp" | "terbuka";

/** The Monday of a date's Monday to Sunday week. */
export const seninDari = (tanggal: string) => tambahHari(tanggal, 1 - hariKe(tanggal));

/**
 * Each module's practicum week (the Monday to Saturday after its TP window
 * closes) with the postponed weeks (`tunda`, Mondays; user, 2026-10-21: a
 * midterm week has no practicum) taken out: a module never shares a week
 * with an earlier one, and one falling on a postponed week moves to the
 * next week that isn't.
 */
export function mingguModulSemua(
  jendela: Partial<Record<number, JendelaTp | null>>,
  tunda: readonly string[] = [],
): Record<number, { senin: string; sabtu: string } | null> {
  const libur = new Set(tunda);
  const out: Record<number, { senin: string; sabtu: string } | null> = {};
  let lalu: string | null = null;
  for (const m of Object.keys(jendela)
    .map(Number)
    .sort((a, b) => a - b)) {
    const j = jendela[m];
    if (!j) {
      out[m] = null;
      continue;
    }
    let senin = mingguPraktikum(j).senin;
    if (lalu && senin <= lalu) senin = tambahHari(lalu, 7);
    while (libur.has(senin)) senin = tambahHari(senin, 7);
    out[m] = { senin, sabtu: tambahHari(senin, 5) };
    lalu = senin;
  }
  return out;
}

/**
 * Which module a slot's date teaches: the session already started there,
 * else the module whose practicum week (mingguModulSemua) holds the date,
 * else the highest open module. A date past every known window and past
 * this week, or in a postponed week, has none.
 */
export function modulTanggal(f: {
  tanggal: string;
  hariIni: string;
  sesiModul?: number | null;
  jendela: Partial<Record<number, JendelaTp | null>>;
  terbuka: readonly number[];
  tunda?: readonly string[];
}): { modul: number | null; sumber: SumberModul | null } {
  if (f.sesiModul) return { modul: f.sesiModul, sumber: "sesi" };
  if (f.tunda?.includes(seninDari(f.tanggal))) return { modul: null, sumber: null };
  // This week's Saturday; on a Sunday the slots ahead are next week's.
  const h = hariKe(f.hariIni);
  let akhir = tambahHari(f.hariIni, h === 7 ? 6 : 6 - h);
  const minggu = mingguModulSemua(f.jendela, f.tunda);
  for (const m of Object.keys(minggu)
    .map(Number)
    .sort((a, b) => a - b)) {
    const w = minggu[m];
    if (!w) continue;
    if (f.tanggal >= w.senin && f.tanggal <= w.sabtu) return { modul: m, sumber: "tp" };
    if (w.sabtu > akhir) akhir = w.sabtu;
  }
  if (f.tanggal <= akhir && f.terbuka.length)
    return { modul: Math.max(...f.terbuka), sumber: "terbuka" };
  return { modul: null, sumber: null };
}

/* ======================================================= rotate, draw */

/** The groups each seat block covers: one group each while there are
 *  enough Asisten, else contiguous blocks as bagiKelompok hands them out. */
export function blok(k: number, n: number): number[][] {
  if (k <= 0 || n <= 0) return [];
  if (k >= n) return Array.from({ length: n }, (_, g) => [g]);
  const peta = bagiKelompok(
    Array.from({ length: k }, (_, i) => i),
    Array.from({ length: n }, (_, g) => g),
  );
  const out: number[][] = Array.from({ length: k }, () => []);
  for (const [g, b] of peta) out[b].push(g);
  return out;
}

function isiBlok(b: number[][], kode: readonly string[], n: number): string[] {
  const out = Array<string>(n).fill("");
  b.forEach((gs, bi) => gs.forEach((g) => (out[g] = kode[bi])));
  return out;
}

/** Rotate: each module moves everyone one block on, so Module 1 is the
 *  slot's people in order and a group meets someone new each module for
 *  as long as there are people to meet. */
export function putar(
  asisten: readonly string[],
  n: number,
  modul: readonly number[] = daftarModul(),
): Record<number, string[]> {
  const pool = kolam(asisten);
  const b = blok(pool.length, n);
  const out: Record<number, string[]> = {};
  for (const m of modul)
    out[m] = isiBlok(
      b,
      b.map((_, bi) => pool[(bi + m - 1) % pool.length]),
      n,
    );
  return out;
}

/**
 * Minimum-cost assignment of rows to columns (rows <= columns): the column
 * each row gets. The Hungarian method, O(rows² · columns).
 */
export function tugaskan(biaya: readonly (readonly number[])[]): number[] {
  const n = biaya.length;
  if (!n) return [];
  const m = biaya[0].length;
  const u = Array<number>(n + 1).fill(0);
  const v = Array<number>(m + 1).fill(0);
  const p = Array<number>(m + 1).fill(0);
  const way = Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = Array<number>(m + 1).fill(Infinity);
    const used = Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = biaya[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const out = Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) out[p[j] - 1] = j - 1;
  return out;
}

/** A repeat for a group weighs more than any spread of the load. */
const BOBOT_ULANG = 1000;
const BOBOT_BEBAN = 10;

/**
 * Randomize: a fresh draw for each module, Module 1 included. A group
 * meets an Asisten it had in an earlier module only when there is no way
 * around it, and with more people than groups the ones left out come in
 * next. Modules in `tetap` (already taught) stay as they are and count as
 * history.
 */
export function acakModul(
  asisten: readonly string[],
  n: number,
  acak: () => number = Math.random,
  tetap: Record<number, readonly string[]> = {},
  modul: readonly number[] = daftarModul(),
): Record<number, string[]> {
  const pool = kolam(asisten);
  const b = blok(pool.length, n);
  const out: Record<number, string[]> = {};
  if (!b.length) {
    for (const m of modul) out[m] = tetap[m] ? [...tetap[m]] : Array(n).fill("");
    return out;
  }
  const pernah = Array.from({ length: n }, () => new Map<string, number>());
  const duduk = new Map<string, number>();
  const catat = (list: readonly string[]) => {
    const di = new Set<string>();
    list.forEach((k, g) => {
      if (!k || g >= n) return;
      pernah[g].set(k, (pernah[g].get(k) ?? 0) + 1);
      di.add(k);
    });
    for (const k of di) duduk.set(k, (duduk.get(k) ?? 0) + 1);
  };
  for (const m of modul) if (tetap[m]) catat(tetap[m]);
  for (const m of modul) {
    if (tetap[m]) {
      out[m] = [...tetap[m]];
      continue;
    }
    const biaya = b.map((gs) =>
      pool.map((k) => {
        const ulangi = gs.reduce((s, g) => s + (pernah[g].get(k) ?? 0), 0);
        return ulangi * BOBOT_ULANG + (duduk.get(k) ?? 0) * BOBOT_BEBAN + acak();
      }),
    );
    const pilih = tugaskan(biaya);
    out[m] = isiBlok(
      b,
      pilih.map((a) => pool[a]),
      n,
    );
    catat(out[m]);
  }
  return out;
}

/** A seeded generator for repeatable draws (tests, the rig). */
export function benih(s: number): () => number {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
