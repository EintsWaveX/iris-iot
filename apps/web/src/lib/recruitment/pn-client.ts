/** The browser side of Penerimaan (api/_lib/recruitment-s5.ts). */
import { usePoll } from "../hooks";
import { isFail, recGet } from "./client";

export interface PnRow {
  id: number;
  nim: string;
  nama: string;
  kelas: string | null;
  scores: {
    berkas: number | null;
    tes: number | null;
    wawancara: number | null;
    wawancaraVerdict: "lolos" | "ragu" | "cut" | null;
    mengajar: number | null;
    mengajarVerdict: "lolos" | "ragu" | "cut" | null;
  };
  code: string | null;
  proposedCode: string | null;
  saved: boolean;
  decision: "terima" | "tolak";
  promotedNim: string | null;
}

export interface PnClose {
  closed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  closeAt: string | null;
  keepUntil: string | null;
  closeDays: number;
  retentionMonths: number;
}

export interface PnListResponse {
  ok: true;
  rows: PnRow[];
  taken: string[];
  quota: number;
  canConfirm: boolean;
  done: boolean;
  locked: boolean;
  revealAt: string | null;
  revealed: boolean;
  close: PnClose;
}

export interface PnConfirmResponse {
  ok: true;
  created: { nim: string; nama: string; kode: string }[];
  already: { nim: string; kode: string }[];
  rejected: number;
  again: boolean;
  revealAt: string;
}

export function useRecPn(enabled = true) {
  return usePoll(
    async () => {
      const r = await recGet<PnListResponse>("pn-list");
      if (!isFail(r)) return r;
      if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
      return null;
    },
    300_000,
    enabled,
    ["recpn", "reccutting", "reccandidates", "recedition"],
    1_000,
  );
}

/** Only whether the edition is closed, for the read-only banner on every tab. */
export function useRecPnState(enabled = true) {
  return usePoll(
    async () => {
      const r = await recGet<{ ok: true; canConfirm: boolean; close: PnClose }>("pn-state");
      if (!isFail(r)) return r;
      if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
      return null;
    },
    300_000,
    enabled,
    ["recpn", "recedition"],
    1_000,
  );
}
