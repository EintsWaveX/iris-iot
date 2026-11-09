/**
 * The Servers page's history (GET /api/server/:id?aksi=riwayat), worked out inside Postgres.
 *
 * It used to pull every heartbeat of the range into Node (about 30,000 rows for 7 days) and loop over them
 * three ways. On Vercel each request had a machine to itself; on the PC one process serves the whole site, and
 * three such requests (the page asks for 1 h, 24 h and 7 d together) held it for seconds, so other requests
 * waited and database connections timed out. Now Postgres does the scanning and only what the page draws
 * comes back: at most 300 chart points, and the few gap, reboot and service-change rows.
 *
 * Same answers as before, by construction: the chart picks the same rows (index floor(i * n / max), see
 * `jarakPilih`), a gap is any two neighbouring heartbeats further apart than the lowest threshold and is then
 * judged by the same `gapAntara` (which knows the quiet hours), and the service timeline is rebuilt by the same
 * `bangunTimelineLayanan` from the rows where a service's status changed.
 * api/_lib/__tests__/server-riwayat.test.ts holds the pure parts; scripts/riwayat-banding.ts compares the whole
 * thing with the old row-by-row code on a real Postgres.
 */
import { sql } from "drizzle-orm";
import type { Db } from "../../src/lib/db.js";
import {
  GAP_AMBANG_DETIK,
  RIWAYAT_MAX_POINTS,
  bangunTimelineLayanan,
  gapAntara,
  ketersediaanDari,
  type GapEvent,
  type LayananTimelineEntry,
} from "../../src/lib/server-lib.js";

export interface TitikRiwayat {
  pada: string;
  cpu: number | null;
  memori: number | null;
  disk: number | null;
  suhu: number | null;
  jaringan: number | null;
  uptimeSec: number | null;
  layanan: Record<string, string> | null;
}

export interface RingkasanRiwayat {
  seri: TitikRiwayat[];
  reboot: { pada: string }[];
  gap: GapEvent[];
  ketersediaan: number;
  timelineLayanan: LayananTimelineEntry[];
}

/** The 0-based positions the chart keeps out of `n` heartbeats: floor(i * n / maks) for i = 0 .. maks - 1, or all
 *  of them when there are no more than `maks`. (Kept here as the specification the SQL below is tested against.) */
export function jarakPilih(n: number, maks: number): number[] {
  if (n <= maks || maks <= 0) return Array.from({ length: n }, (_, k) => k);
  const step = n / maks;
  return Array.from({ length: maks }, (_, i) => Math.floor(i * step));
}

/** Time as the ISO text `Date.toISOString()` gives, made by Postgres so Node never parses 30,000 dates. */
const ISO = (kolom: string) => sql.raw(`to_char(${kolom} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

type Hasil<T> = { rows: T[] };

export async function ringkasRiwayat(
  db: Db,
  serverId: number,
  mulai: Date,
  akhir: Date,
  maks: number = RIWAYAT_MAX_POINTS,
): Promise<RingkasanRiwayat> {
  const lingkup = sql`d.server_id = ${serverId} and d.pada >= ${mulai}`;
  const urut = sql.raw("d.pada, d.id");
  // A gap of this many seconds or fewer is never one, whatever the hour; the exact test (quiet hours) is
  // gapAntara's. One second of margin so rounding in the two places can never drop a real gap.
  const ambangLonggar = GAP_AMBANG_DETIK - 1;

  const [meta, deret, celah, reboot, perubahan] = (await Promise.all([
    db.execute(sql`
      select count(*)::int as n, ${ISO("min(d.pada)")} as pertama, ${ISO("max(d.pada)")} as terakhir
      from denyut d where ${lingkup}`),
    // Number each heartbeat, then keep position k when some i in 0..maks-1 has floor(i * n / maks) = k, i.e.
    // for i = ceil(maks * k / n): i * n < maks * (k + 1). All integer arithmetic, so it matches the JS exactly.
    db.execute(sql`
      select ${ISO("t.pada")} as pada, t.cpu, t.memori, t.disk, t.suhu, t.jaringan,
             t.uptime_sec as "uptimeSec", t.layanan
      from (
        select d.*, row_number() over (order by ${urut}) - 1 as k, count(*) over () as n
        from denyut d where ${lingkup}
      ) t
      where t.n <= ${maks}::bigint
         or (((t.k * ${maks}::bigint + t.n - 1) / t.n) * t.n < ${maks}::bigint * (t.k + 1))
      order by t.pada, t.id`),
    db.execute(sql`
      select ${ISO("t.prev")} as dari, ${ISO("t.pada")} as sampai
      from (select d.pada, lag(d.pada) over (order by ${urut}) as prev from denyut d where ${lingkup}) t
      where t.prev is not null and extract(epoch from (t.pada - t.prev)) > ${ambangLonggar}::float8
      order by t.pada`),
    db.execute(sql`
      select ${ISO("t.pada")} as pada
      from (
        select d.pada, d.uptime_sec, lag(d.uptime_sec) over (order by ${urut}) as prev
        from denyut d where ${lingkup}
      ) t
      where t.uptime_sec is not null and t.prev is not null and t.uptime_sec < t.prev
      order by t.pada`),
    // Only the rows where a service first appears or changes status; the timeline is rebuilt from them.
    db.execute(sql`
      select t.nama, t.status, ${ISO("t.pada")} as pada
      from (
        select e.key as nama, e.value as status, d.pada, d.id, e.ord,
               row_number() over w as rn, lag(e.value) over w as prev
        from denyut d
        cross join lateral jsonb_each_text(
          case when jsonb_typeof(d.layanan) = 'object' then d.layanan else '{}'::jsonb end
        ) with ordinality as e(key, value, ord)
        where ${lingkup}
        window w as (partition by e.key order by ${urut})
      ) t
      where t.rn = 1 or t.prev is distinct from t.status
      order by t.pada, t.id, t.ord`),
  ])) as unknown as [
    Hasil<{ n: number; pertama: string | null; terakhir: string | null }>,
    Hasil<TitikRiwayat>,
    Hasil<{ dari: string; sampai: string }>,
    Hasil<{ pada: string }>,
    Hasil<{ nama: string; status: string; pada: string }>,
  ];

  const { n, pertama, terakhir } = meta.rows[0] ?? { n: 0, pertama: null, terakhir: null };
  const gap = celah.rows.flatMap((c) => {
    const g = gapAntara(c.dari, c.sampai);
    return g ? [g] : [];
  });
  const timelineLayanan = bangunTimelineLayanan([
    ...perubahan.rows.map((p) => ({ pada: p.pada, layanan: { [p.nama]: p.status } })),
    ...(n > 0 && terakhir ? [{ pada: terakhir, layanan: null }] : []),
  ]);

  return {
    seri: deret.rows,
    reboot: reboot.rows.map((r) => ({ pada: r.pada })),
    gap,
    ketersediaan: ketersediaanDari(gap, pertama, terakhir, mulai, akhir),
    timelineLayanan,
  };
}
