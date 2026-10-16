/** SeeLabs data for the console (Phase 9 Stage 3g): one session's groups as
 *  /api/session/seelabs reports them, and the actions that log a copy, mark a
 *  group saved, or pick a borrowed account. */
import { useEffect } from "react";
import { getJson, postJson } from "../../../lib/app";
import { usePoll } from "../../../lib/hooks";
import type { KelompokSeelabs, PemberiTolak, SesiSeelabs } from "../../../lib/seelabs";

export type { KelompokSeelabs };

export type SesiSeelabsInfo = SesiSeelabs["sesi"];

export interface SeelabsData extends SesiSeelabs {
  /** Asisten free to lend their account (no group in this session). */
  pemberi: string[];
  /** Asisten who can't lend, with why (shown dimmed in the picker). */
  pemberiTolak: PemberiTolak[];
}

export interface Titipan extends SesiSeelabsInfo {
  kelompok: KelompokSeelabs;
}

type JawabSeelabs = ({ ok: true } & SeelabsData) | { ok: false; kode?: string };

export function useSeelabs(sesiId: number | null) {
  const poll = usePoll(
    () =>
      // The console's refresh-everything also calls this with no session:
      // asking then was a 400 for `sesiId=null` on every page load.
      sesiId === null
        ? Promise.resolve(null)
        : getJson<JawabSeelabs>(`/api/session/seelabs?sesiId=${sesiId}`),
    60_000,
    sesiId !== null,
    ["sesi", "bayar", "nilai"],
  );
  const { refresh } = poll;
  useEffect(() => {
    if (sesiId !== null) refresh();
    // Re-run only when the session changes (refresh is stable).
  }, [sesiId]);
  const d = poll.data;
  return {
    ...poll,
    data: d && d.ok ? d : null,
    // Why there is nothing to send: "sesi_tot" (TOT sessions never go to
    // SeeLabs) or another refusal. Without it the view waited forever.
    kode: d && !d.ok ? (d.kode ?? "galat") : null,
  };
}

/** Groups whose scores go through MY account and aren't saved yet. */
export function useTitipan(enabled = true) {
  return usePoll(
    () =>
      getJson<{ ok: boolean; titipan: Titipan[]; namaAkun: Record<string, string | null> }>(
        "/api/session/seelabs?titipan=1",
      ).then((d) => (d.ok ? d : null)),
    60_000,
    enabled,
    ["sesi", "bayar"],
  );
}

export type AksiSeelabs =
  | { aksi: "salin" | "simpan" | "belum"; sesiId: number; kelompok: number }
  | { aksi: "akun"; sesiId: number; kelompok: number; akun: string | null };

export function kirimSeelabs(body: AksiSeelabs) {
  return postJson<{ ok: boolean; kode?: string }>("/api/session/seelabs", body);
}

/** Writes to the clipboard; false when the browser refuses. */
export async function salinTeks(teks: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(teks);
    return true;
  } catch {
    return false;
  }
}
