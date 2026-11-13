/**
 * Live Upload for one board row (2026-11-13): the click, the port, and
 * lib/upload-flow.ts's steps with the real network and the real USB behind
 * them. The row's own useSerialBoard supplies the port: it is chosen in the
 * click (a browser opens its chooser only from one), closed just before the
 * flash, and opened again as Hubungkan afterwards.
 */
import { useCallback, useRef, useState } from "react";
import { validateUploadValues, type UploadValues } from "../../lib/live-build";
import { runUpload, type UploadApi, type UploadProgress } from "../../lib/upload-flow";
import { flashEsp32, writeMain, type PortLike } from "../../lib/upload-serial";
import type { BoardStatus, SerialPortLike } from "./useSerialBoard";

/** What an upload needs of the row's serial hook */
export interface BoardHandle {
  status: BoardStatus;
  pickPort(): Promise<SerialPortLike | null>;
  /** Has whichever other row holds `p` let go of it */
  claim(p: SerialPortLike): Promise<void>;
  release(): Promise<SerialPortLike | null>;
  reopen(p: SerialPortLike): Promise<void>;
}

async function jsonOf<T>(r: Response): Promise<T> {
  return (await r.json()) as T;
}

const api: UploadApi = {
  start: async (body) =>
    jsonOf(
      await fetch("/api/session/bangun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  status: async (id) =>
    jsonOf(await fetch(`/api/session/bangun-status?id=${encodeURIComponent(id)}`)),
  image: async (id) => {
    const r = await fetch(`/api/session/bangun-berkas?id=${encodeURIComponent(id)}`);
    if (!r.ok || (r.headers.get("content-type") ?? "").includes("json")) return null;
    return new Uint8Array(await r.arrayBuffer());
  },
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Ports being written right now, page wide: two rows must not write to one board at once */
const writing = new Set<SerialPortLike>();
const IDLE: UploadProgress = { stage: "idle" };

export function useUploadBoard(
  modul: number,
  role: string,
  lang: "id" | "en" | "zh",
  board: BoardHandle,
  values: UploadValues,
) {
  const [state, setState] = useState<UploadProgress>(IDLE);
  const control = useRef<AbortController | null>(null);
  const busy =
    state.stage === "building" || state.stage === "downloading" || state.stage === "flashing";

  const start = useCallback(async () => {
    if (busy) return;
    const check = validateUploadValues(modul, role, values);
    if (!check.ok) {
      setState({ stage: "error", kode: check.kode });
      return;
    }
    const wasOpen = board.status === "open";
    // Inside the click: the chooser opens only now.
    const port = await board.pickPort();
    if (!port) return;
    if (writing.has(port)) {
      setState({ stage: "error", kode: "port_baris_lain" });
      return;
    }
    writing.add(port);
    const ac = new AbortController();
    control.current = ac;
    let released = false;
    // Only now, with an image or a file in hand, does the board leave whichever row holds it: a
    // build that fails first leaves every connection as it was.
    const free = async () => {
      released = true;
      await board.claim(port);
      await board.release();
    };
    try {
      const result = await runUpload<SerialPortLike>(
        {
          api,
          flashEsp32: async (p, image, pct) => {
            await free();
            await flashEsp32(p as PortLike, image, pct);
          },
          writeMain: async (p, text, pct) => {
            await free();
            await writeMain(p as PortLike, text, pct);
          },
          sleep,
        },
        { modul, role, bahasa: lang === "id" ? "id" : "en", values, port },
        setState,
        ac.signal,
      );
      // The board is on the cable again: connect to it, as Hubungkan would. A failed upload
      // gives back the connection the board had before.
      if (released && (result.ok || wasOpen)) void board.reopen(port);
    } finally {
      writing.delete(port);
    }
  }, [busy, modul, role, lang, board, values]);

  const cancel = useCallback(() => control.current?.abort(), []);
  const clear = useCallback(() => setState(IDLE), []);
  return { state, busy, start, cancel, clear };
}
