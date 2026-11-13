/**
 * One board on this laptop's USB, over Web Serial (Chrome or Edge on a
 * desktop), for any module (Phase 9 Stage 7e; Module 1 only before).
 * Opens the port at the sketches' 115200 baud and hands every line, with
 * its parsed event (serial-lines.ts), to `onLine`.
 *
 * - ESP32 boards (Modules 1, 2 and 4): connecting pulses EN so the board
 *   reboots while we listen; Module 1's "waiting for PC time" prompt is
 *   answered with pcTimeString().
 * - Pico W (Module 3): MicroPython holds no reset line; Restart sends
 *   Ctrl C then Ctrl D, a soft reset that runs main.py again.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LineBuffer, pcTimeString } from "../../lib/serial-modul1";
import { parseSerialLine, type BoardRole, type SerialEvent } from "../../lib/serial-lines";
import { jamMs } from "../../lib/live-records";

// The DOM lib here has no Web Serial types yet; only what this file uses.
export interface SerialPortLike {
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
  /** Milliseconds since midnight: the line's own [HH:MM:SS:MS] stamp, or
   *  when it arrived. Used to merge sources in time order. */
  t: number;
}

const LOG_MAX = 300;
const BAUD = 115200;

function nowMs() {
  const d = new Date();
  return ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
}

export function useSerialBoard(modul: number, onLine?: (line: LogLine, ev: SerialEvent) => void) {
  const [status, setStatus] = useState<BoardStatus>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const [role, setRole] = useState<BoardRole | null>(null);
  const [synced, setSynced] = useState(false);
  const port = useRef<SerialPortLike | null>(null);
  /** The port last chosen or opened, kept after it closes so an upload can use it again */
  const lastPort = useRef<SerialPortLike | null>(null);
  const reader = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const piped = useRef<Promise<void> | null>(null);
  const lineId = useRef(0);
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;

  const writeRaw = useCallback(async (text: string) => {
    const w = port.current?.writable?.getWriter();
    if (!w) return;
    try {
      await w.write(new TextEncoder().encode(text));
    } finally {
      w.releaseLock();
    }
  }, []);

  const sendTime = useCallback(() => writeRaw(pcTimeString() + "\n"), [writeRaw]);

  const handle = useCallback(
    (text: string) => {
      const clean = text.replace(/\r$/, "");
      if (!clean.trim()) return;
      lineId.current += 1;
      const stamp = /^\[(\d{2}:\d{2}:\d{2}:\d{3})\]/.exec(clean)?.[1] ?? null;
      const line: LogLine = { id: lineId.current, text: clean, t: jamMs(stamp) ?? nowMs() };
      setLog((l) => [...l, line].slice(-LOG_MAX));
      const ev = parseSerialLine(modul, clean);
      if (ev?.k === "prompt" || ev?.k === "retry") void sendTime();
      if (ev?.k === "synced") setSynced(true);
      if (ev && "role" in ev) setRole(ev.role);
      onLineRef.current?.(line, ev);
    },
    [modul, sendTime],
  );

  /** ESP32: EN low for a moment with IO0 left high, the same pulse esptool
   *  and the Arduino IDE use. Pico W: Ctrl C stops the program, Ctrl D
   *  soft-resets, and main.py runs again. */
  const reset = useCallback(async () => {
    const p = port.current;
    if (!p) return;
    setSynced(false);
    if (modul === 3) {
      // Two Ctrl C, as Thonny sends them: the first can land inside the
      // sketch's own try block and only break out of one call.
      await writeRaw("\x03\x03");
      await new Promise((r) => setTimeout(r, 150));
      await writeRaw("\x04");
      return;
    }
    try {
      await p.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 120));
      await p.setSignals({ dataTerminalReady: false, requestToSend: false });
    } catch {
      // Boards without the auto-reset circuit: the EN button does the same.
    }
  }, [modul, writeRaw]);

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

  /** Opens a port the user has already chosen and reads it until it closes. `restart`: pulse EN
   *  first (Hubungkan does; right after an upload the board has just restarted by itself). */
  const openPort = useCallback(
    async (p: SerialPortLike, restart: boolean) => {
      try {
        await p.open({ baudRate: BAUD });
      } catch {
        setStatus("busy"); // most often the Arduino Serial Monitor or Thonny holding it
        return;
      }
      port.current = p;
      lastPort.current = p;
      setStatus("open");
      setRole(null);
      setSynced(false);
      setLog([]);

      const decoder = new TextDecoderStream();
      piped.current = p.readable!.pipeTo(decoder.writable as WritableStream<Uint8Array>);
      const r = decoder.readable.getReader();
      reader.current = r;
      if (modul !== 3 && restart) void reset();

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
    },
    [close, handle, reset, modul],
  );

  const requestPort = useCallback(async (): Promise<SerialPortLike | null> => {
    const serial = (navigator as unknown as { serial?: SerialLike }).serial;
    if (!serial) return null;
    try {
      return await serial.requestPort();
    } catch {
      return null; // the chooser was dismissed
    }
  }, []);

  const connect = useCallback(async () => {
    const p = await requestPort();
    if (p) await openPort(p, true);
  }, [requestPort, openPort]);

  /** Live Upload: the port this board is on, or a chosen one. Call it from the click that starts
   *  the upload: a browser opens its port chooser only from a click, and a build can take a minute. */
  const pickPort = useCallback(async (): Promise<SerialPortLike | null> => {
    if (port.current) return port.current;
    if (lastPort.current) return lastPort.current;
    const p = await requestPort();
    if (p) lastPort.current = p;
    return p;
  }, [requestPort]);

  /** Closes the port for an upload (esptool needs it closed) and says which one it was */
  const release = useCallback(async (): Promise<SerialPortLike | null> => {
    const p = port.current ?? lastPort.current;
    await close("idle");
    return p;
  }, [close]);

  /** Opens `p` again as Hubungkan does, without a restart (the board has just restarted itself) */
  const reopen = useCallback((p: SerialPortLike) => openPort(p, false), [openPort]);

  useEffect(
    () => () => {
      void close();
    },
    [close],
  );

  return { status, log, role, synced, connect, close, reset, sendTime, pickPort, release, reopen };
}
