/** SeeLabs data for the console (Phase 9 Stage 3g): one session's groups as
 *  /api/session/seelabs reports them, and the action that picks a borrowed
 *  account. The scores themselves go through the robot. */
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
  /** Group number to the Asisten its holder covers, offered first (when they can lend). */
  saran?: Record<number, string>;
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

export type AksiSeelabs = {
  aksi: "akun";
  sesiId: number;
  kelompok: number;
  akun: string | null;
};

export function kirimSeelabs(body: AksiSeelabs) {
  return postJson<{ ok: boolean; kode?: string }>("/api/session/seelabs", body);
}

/** Writes to the clipboard; false when the browser refuses (also used by the hunt's QR link). */
export async function salinTeks(teks: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(teks);
    return true;
  } catch {
    return false;
  }
}
