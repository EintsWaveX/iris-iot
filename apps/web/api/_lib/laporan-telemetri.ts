/**
 * The telemetry summary of a session's report, worked out inside Postgres. The console asks for this report
 * every few seconds, and it used to read every `telemetri_log` row of the session into the server and sum them
 * up in JavaScript: a long Module 4 session has tens of thousands of rows, so each poll moved all of them. Now
 * one query returns one row per group.
 *
 * The rules are the ones the JavaScript had (src/lib/telemetri-ringkas.ts), kept exactly:
 *  - a message's delay is the PC's own `delay_ms` when it has one, else the board's receive stamp minus its
 *    send stamp ("HH:MM:SS:mmm", a day wrap allowed), and only a result from 0 up to 60 s counts;
 *  - count, min, median (the middle two averaged), max and mean of those delays, rounded to whole ms;
 *  - the share of messages missing from the sequence range that arrived.
 */
import { sql } from "drizzle-orm";
import type { Db } from "../../src/lib/db.js";

export interface RingkasTelemetri {
  count: number;
  delayMinMs: number | null;
  delayMedianMs: number | null;
  delayMaxMs: number | null;
  delayRataMs: number | null;
  hilangPct: number | null;
}

/** One row per group, as Postgres returns it. */
export interface BarisAgregat {
  nomor: number;
  n: number;
  unik: number;
  lo: number;
  hi: number;
  nd: number;
  dmin: number | null;
  dmax: number | null;
  drata: number | null;
  dmed: number | null;
}

/**
 * Share of messages missing from the seq range that arrived, in percent (the same rule as hilangPersen in
 * src/lib/telemetri-ringkas.ts, from the aggregates): needs two messages, a range of at most a million.
 */
export function hilangDariAgregat(n: number, unik: number, lo: number, hi: number): number | null {
  if (n < 2) return null;
  const harap = hi - lo + 1;
  if (harap <= 0 || harap > 1_000_000) return null;
  return Math.round(((harap - unik) / harap) * 1000) / 10;
}

export function dariBaris(b: BarisAgregat): RingkasTelemetri {
  const ada = b.nd > 0;
  return {
    count: b.n,
    delayMinMs: ada ? b.dmin : null,
    delayMedianMs: ada ? b.dmed : null,
    delayMaxMs: ada ? b.dmax : null,
    delayRataMs: ada ? b.drata : null,
    hilangPct: hilangDariAgregat(b.n, b.unik, b.lo, b.hi),
  };
}

/** What a group with no telemetry shows. */
export const TELEMETRI_KOSONG: RingkasTelemetri = {
  count: 0,
  delayMinMs: null,
  delayMedianMs: null,
  delayMaxMs: null,
  delayRataMs: null,
  hilangPct: null,
};

const POLA_JAM = "^[0-9]{2}:[0-9]{2}:[0-9]{2}:[0-9]{3}$";

/** The agregat query text pieces, exported so a test against a real database can run exactly what the server runs. */
export function kueriRingkas(sesiId: number) {
  const jamMs = (k: string) =>
    sql.raw(
      `(((split_part(${k}, ':', 1)::int * 60 + split_part(${k}, ':', 2)::int) * 60 + split_part(${k}, ':', 3)::int) * 1000 + split_part(${k}, ':', 4)::int)`,
    );
  return sql`
    select z.kelompok_nomor as nomor,
           count(*)::int as n,
           count(distinct z.seq)::int as unik,
           min(z.seq)::int as lo,
           max(z.seq)::int as hi,
           count(z.d)::int as nd,
           min(z.d)::int as dmin,
           max(z.d)::int as dmax,
           round(avg(z.d))::int as drata,
           round((percentile_cont(0.5) within group (order by z.d))::numeric)::int as dmed
    from (
      select y.kelompok_nomor, y.seq,
             coalesce(y.delay_ms, case when y.o >= 0 and y.o < 60000 then y.o end) as d
      from (
        select x.kelompok_nomor, x.seq, x.delay_ms,
               case when x.tx ~ ${POLA_JAM} and x.rx ~ ${POLA_JAM} then
                 case when (${jamMs("x.rx")} - ${jamMs("x.tx")}) < -43200000
                      then (${jamMs("x.rx")} - ${jamMs("x.tx")}) + 86400000
                      else (${jamMs("x.rx")} - ${jamMs("x.tx")}) end
               end as o
        from telemetri_log x
        where x.sesi_id = ${sesiId}
      ) y
    ) z
    group by z.kelompok_nomor`;
}

/** The summary of every group that has telemetry in this session, by group number. */
export async function ringkasTelemetriSesi(
  db: Db,
  sesiId: number,
): Promise<Map<number, RingkasTelemetri>> {
  const hasil = await db.execute(kueriRingkas(sesiId));
  const peta = new Map<number, RingkasTelemetri>();
  for (const b of hasil.rows as unknown as BarisAgregat[]) peta.set(b.nomor, dariBaris(b));
  return peta;
}
