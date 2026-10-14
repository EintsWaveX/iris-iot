/**
 * The LMS menu's history: the audit's LMS rows grouped, one batch over
 * the classes as one line ("Buat TP Modul 1 · 11 kelas").
 */

/* ================================================================ types */

export interface BarisLog {
  pada: string;
  oleh: string;
  aksi: string;
  langkah: string | null;
  modul: number | null;
  judul: string | null;
  /** the classes the line touched (its rows when they name no class) */
  kelas: number;
  /** the classes whose last try failed */
  gagal: number;
}

export interface BarisAudit {
  pada: Date;
  nim: string;
  aksi: string;
  detail: string | null;
}

/* ================================================================ merge */

/** Rows newest first. A line counts classes, not rows: three materials in
 *  each of 11 classes is 11 classes, not 33; and a class's first row is its
 *  last try, so it alone says whether that class failed. */
export function gabungLog(rows: BarisAudit[], kodeOf: Map<string, string>, n: number): BarisLog[] {
  const out: (BarisLog & {
    kunci: string;
    akhir: number;
    kursus: Set<string>;
    gagalDi: Set<string>;
  })[] = [];
  for (const r of rows) {
    let d: Record<string, unknown> = {};
    try {
      d = r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : {};
    } catch {
      d = {};
    }
    const langkah =
      typeof d.langkah === "string" ? d.langkah : typeof d.aksi === "string" ? d.aksi : null;
    const modul = typeof d.modul === "number" ? d.modul : null;
    const judul =
      typeof d.judul === "string" ? d.judul : typeof d.nama === "string" ? d.nama : null;
    const kursus = typeof d.kursus === "string" ? d.kursus : null;
    const kunci = `${r.nim}|${r.aksi}|${langkah}|${modul}|${judul}`;
    const t = r.pada.getTime();
    const prev = out[out.length - 1];
    if (prev && prev.kunci === kunci && prev.akhir - t < 15 * 60_000) {
      if (kursus && !prev.kursus.has(kursus)) {
        prev.kursus.add(kursus);
        if (d.gagal) prev.gagalDi.add(kursus);
      }
      if (!kursus) {
        prev.kelas += 1;
        if (d.gagal) prev.gagal += 1;
      }
      if (prev.kursus.size > 0) {
        prev.kelas = prev.kursus.size;
        prev.gagal = prev.gagalDi.size;
      }
      prev.akhir = t;
      continue;
    }
    if (out.length >= n) break;
    out.push({
      kunci,
      akhir: t,
      pada: r.pada.toISOString(),
      oleh: r.nim === "pi" || r.nim === "otomatis" ? r.nim : (kodeOf.get(r.nim) ?? r.nim),
      aksi: r.aksi,
      langkah,
      modul,
      judul,
      kelas: 1,
      gagal: d.gagal ? 1 : 0,
      kursus: new Set(kursus ? [kursus] : []),
      gagalDi: new Set(kursus && d.gagal ? [kursus] : []),
    });
  }
  return out.map(({ kunci: _k, akhir: _a, kursus: _c, gagalDi: _g, ...b }) => b);
}
