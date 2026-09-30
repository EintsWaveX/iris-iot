/**
 * One ESP32 on this PC's USB, over Web Serial (Chrome/Edge on a desktop).
 * Opens the port at the sketches' 115200 baud, resets the board so its
 * 10-second "waiting for PC time" prompt comes up while we listen, answers
 * that prompt with pcTimeString(), and hands every line to `onLine`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LineBuffer, parseModul1Line, pcTimeString } from "../../lib/serial-modul1";

// The DOM lib here has no Web Serial types yet; only what this file uses.
interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals(s: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
interface SerialLike extends EventTarget {
  requestPort(): Promise<SerialPortLike>;
}

export function serialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export type BoardStatus = "idle" | "open" | "lost" | "busy" | "error";
export interface LogLine {
  id: number;
  text: string;
}

const LOG_MAX = 200;
const BAUD = 115200;

export function useSerialBoard(onLine: (line: string) => void) {
  const [status, setStatus] = useState<BoardStatus>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const [role, setRole] = useState<"central" | "peripheral" | null>(null);
  const [synced, setSynced] = useState(false);
  const port = useRef<SerialPortLike | null>(null);
  const reader = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const piped = useRef<Promise<void> | null>(null);
  const lineId = useRef(0);
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;

  const write = useCallback(async (text: string) => {
    const w = port.current?.writable?.getWriter();
    if (!w) return;
    try {
      await w.write(new TextEncoder().encode(text + "\n"));
    } finally {
      w.releaseLock();
    }
  }, []);

  const sendTime = useCallback(() => write(pcTimeString()), [write]);

  const handle = useCallback(
    (text: string) => {
      const clean = text.replace(/\r$/, "");
      if (!clean) return;
      lineId.current += 1;
      const id = lineId.current;
      setLog((l) => [...l, { id, text: clean }].slice(-LOG_MAX));
      const p = parseModul1Line(clean);
      if (p?.kind === "prompt" || p?.kind === "retry") void sendTime();
      if (p?.kind === "synced") setSynced(true);
      if (p?.kind === "send" || p?.kind === "echo") setRole("central");
      if (p?.kind === "peripheral") setRole("peripheral");
      onLineRef.current(clean);
    },
    [sendTime],
  );

  /** EN low for a moment with IO0 left high: a normal reboot, the same
   *  pulse esptool and the Arduino IDE use on these dev boards. */
  const reset = useCallback(async () => {
    const p = port.current;
    if (!p) return;
    setSynced(false);
    try {
      await p.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 120));
      await p.setSignals({ dataTerminalReady: false, requestToSend: false });
    } catch {
      // Boards without the auto-reset circuit: the EN button does the same.
    }
  }, []);

  const close = useCallback(async (next: BoardStatus = "idle") => {
    const p = port.current;
    port.current = null;
    try {
      await reader.current?.cancel();
    } catch {
      /* already gone */
    }
    reader.current = null;
    try {
      await piped.current;
    } catch {
      /* the pipe rejects when the reader is cancelled */
    }
    piped.current = null;
    try {
      await p?.close();
    } catch {
      /* unplugged ports throw on close */
    }
    setStatus(next);
  }, []);

  const connect = useCallback(async () => {
    const serial = (navigator as unknown as { serial?: SerialLike }).serial;
    if (!serial) return;
    let p: SerialPortLike;
    try {
      p = await serial.requestPort();
    } catch {
      return; // the chooser was dismissed
    }
    try {
      await p.open({ baudRate: BAUD });
    } catch {
      setStatus("busy"); // most often Arduino's Serial Monitor holding it
      return;
    }
    port.current = p;
    setStatus("open");
    setRole(null);
    setSynced(false);
    setLog([]);

    const decoder = new TextDecoderStream();
    piped.current = p.readable!.pipeTo(decoder.writable as WritableStream<Uint8Array>);
    const r = decoder.readable.getReader();
    reader.current = r;
    void reset();

    const lines = new LineBuffer();
    try {
      for (;;) {
        const { value, done } = await r.read();
        if (done) break;
        for (const line of lines.push(value)) handle(line);
      }
    } catch {
      // Unplugged mid-read.
      if (port.current === p) await close("lost");
      return;
    }
    if (port.current === p) await close("lost");
  }, [close, handle, reset]);

  useEffect(
    () => () => {
      void close();
    },
    [close],
  );

  return { status, log, role, synced, connect, close, reset, sendTime };
}
