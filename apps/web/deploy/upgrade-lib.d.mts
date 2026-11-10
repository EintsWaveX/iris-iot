export const UPGRADE_DIR: string;
export const MARKER: string;
export const ACTIONS: readonly ["check", "deploy", "rollback"];
export const SHA_RE: RegExp;
export const ROLLBACK_MAX: number;
export const HISTORY_MAX: number;
export const LOG_LINES: number;

export type UpgradeAction = "check" | "deploy" | "rollback";

export interface UpgradeRequest {
  id: string;
  action: UpgradeAction;
  /** The commit to roll back to (rollback only) */
  ref?: string;
  /** NIM of the Asisten who pressed the button */
  by: string;
  at: number;
}

export interface Release {
  sha: string;
  at: number;
  by: string;
  action: "seed" | "deploy" | "rollback";
}

export interface UpgradeStatus {
  id: string;
  action: UpgradeAction;
  state: "running" | "ok" | "failed";
  /** What the job is doing now, in words the page can show */
  step: string;
  /** The commit being deployed or rolled back to */
  target?: string;
  /** The commit that was running when the job began */
  from?: string;
  startedAt: number;
  finishedAt?: number;
  message?: string;
}

export interface UpgradeLatest {
  fetchedAt: number;
  /** origin/main */
  head: string;
  /** What runs now */
  current: string | null;
  /** Commits on origin/main that the running build lacks, newest first */
  ahead: { sha: string; subject: string; at: number }[];
}

export function cekPermintaan(v: unknown): UpgradeRequest | null;
export function samaSha(a: string | null | undefined, b: string | null | undefined): boolean;
export function bacaRilis(v: unknown): Release[];
export function tambahRilis(rilis: Release[], baru: Release): Release[];
export function pilihRollback(rilis: Release[], sekarang: string | null): Release[];
export function bolehRollback(
  rilis: Release[],
  sekarang: string | null,
  target: string,
  punyaMarker: boolean,
): boolean;
export function ekor(teks: string | null | undefined, n?: number): string[];
export function bacaBuildSha(teks: string | null | undefined): string | null;
