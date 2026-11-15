export function persentil(nilai: number[], p: number): number;
export function topikUnik(): string;
export function minta(
  emit: { mode: "hmac" | "bearer" | "metrik"; url: string; rahasia: string },
  topik: string,
): { badan: string; header: Record<string, string> };
export interface OpsiFanout {
  url: string;
  soket: number;
  putaran: number;
  jeda: number;
  tahan?: number;
  rampa?: number;
  /** ms to wait after each announcement before counting missing deliveries (default 1500). */
  tungguAkhir?: number;
  emit?: { mode: "hmac" | "bearer" | "metrik"; url: string; rahasia: string };
  origin?: string;
}
export interface HasilFanout {
  url: string;
  soketDiminta: number;
  soketTersambung: number;
  gagalSambung: number;
  terputusSelama: number;
  hidupDiAkhir: number;
  putaran: number;
  emitGagal: number;
  diharap: number;
  diterima: number;
  hilang: number;
  latensiMs: { p50: number; p95: number; p99: number; maks: number };
  sambungMs: { p50: number; p95: number; maks: number };
  rttEmitMs: { p50: number; maks: number };
  totalDetik: number;
}
export function jalankanFanout(o: OpsiFanout): Promise<HasilFanout>;
