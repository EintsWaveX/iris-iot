/**
 * The seat's Live Coding state and the calls that change it (prompt 12,
 * EXAM-ENGINE 10.3): `GET lc` is the truth; the relay only says it changed
 * (a compile finished, the Master re-rolled or moved a board), so nothing
 * here runs on a timer. Every write goes through `act`, which asks `lc` again
 * when the server's answer changed more than the caller already knows.
 */
import { useCallback, useEffect, useRef } from "react";
import { usePoll } from "../../../lib/hooks";
import { isFail, recGet, recPost } from "../../../lib/recruitment/client";
import type { CompileReply, LiveCodeSelf, SpinReply } from "../../../lib/recruitment/lc-api";
import type { Chip } from "../../../lib/recruitment/lc-types";

type Fetched = { lc: LiveCodeSelf } | { err: string };

async function fetchLc(): Promise<Fetched> {
  const r = await recGet<LiveCodeSelf & { ok: true }>("lc");
  if (!isFail(r)) return { lc: r };
  if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
  return { err: r.kode };
}

export type Fail = { ok: false; kode: string; rev?: number; field?: string };
export type Done<T> = ({ ok: true } & T) | Fail;

const fail = (r: { kode: string; [k: string]: unknown }): Fail => ({
  ok: false,
  kode: r.kode,
  rev: typeof r.rev === "number" ? r.rev : undefined,
  field: typeof r.field === "string" ? r.field : undefined,
});

export function useLc(enabled: boolean, signal: number) {
  const poll = usePoll<Fetched>(fetchLc, 300_000, enabled, ["recroom"], 300);
  const refresh = poll.refresh;
  const first = useRef(signal);
  useEffect(() => {
    if (signal !== first.current) refresh();
  }, [signal, refresh]);

  const data = poll.data;
  const lc = data && "lc" in data ? data.lc : null;
  const err = data && "err" in data ? data.err : null;

  const post = useCallback(
    async <T>(aksi: string, body: unknown, reload = true): Promise<Done<T>> => {
      const r = await recPost<{ ok: true } & T>(aksi, body);
      if (reload) refresh();
      return isFail(r) ? fail(r) : r;
    },
    [refresh],
  );

  return {
    lc,
    err,
    loading: !data,
    errors: poll.errors,
    refresh,
    spin: (what: "topic" | "protocol") => post<SpinReply>("lc-spin", { what }),
    saveCode: (board: number, code: string, rev: number) =>
      post<{ rev: number }>("lc-code", { board, code, rev }, false),
    compile: (board: number, code: string, rev: number) =>
      post<CompileReply>("lc-compile", { board, code, rev }),
    addBoard: () => post<{ boards: unknown[] }>("lc-board", { add: true }),
    removeBoard: () => post<{ boards: unknown[] }>("lc-board", { remove: 2 }),
    setChip: (board: number, chip: Chip) =>
      post<{ boards: unknown[] }>("lc-board", { board, chip }),
    setVariant: (variant: "http" | "ws", replace = false) =>
      post<{ variant: string }>("lc-variant", { variant, replace }),
    flashed: (b: { job: number; ok: boolean; ms: number; chip?: string; kode?: string }) =>
      post<object>("lc-flash", b, true),
  };
}

export type LcApi = ReturnType<typeof useLc>;
