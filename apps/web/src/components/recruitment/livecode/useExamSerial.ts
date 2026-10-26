/**
 * One board's serial monitor in the Live Coding editor (prompt 12, EXAM-ENGINE
 * 9.5 step 4): Web Serial at 115200, the board's own lines with the time they
 * arrived. After a flash the port comes back from esptool-js released, so
 * `attach` opens it again and the output starts at the reboot. Unlike Module
 * 1's Live view this reads any text; it parses nothing. One instance per board.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { pickPort, type SerialPortLike } from "./flash";

export type ExamSerialStatus = "idle" | "open" | "lost" | "busy";
export interface SerialLine {
  id: number;
  t: number;
  text: string;
}

const KEEP = 300;
const BAUD = 115200;

export function useExamSerial() {
  const [status, setStatus] = useState<ExamSerialStatus>("idle");
  const [lines, setLines] = useState<SerialLine[]>([]);
  const port = useRef<SerialPortLike | null>(null);
  const reader = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const piped = useRef<Promise<void> | null>(null);
  const seq = useRef(0);

  const close = useCallback(async (next: ExamSerialStatus = "idle") => {
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

  /** Opens a port the page already holds (after a flash) */
  const attach = useCallback(
    async (p: SerialPortLike) => {
      await close();
      try {
        await p.open({ baudRate: BAUD });
      } catch {
        setStatus("busy"); // most often the Arduino Serial Monitor holding it
        return;
      }
      port.current = p;
      setStatus("open");
      setLines([]);
      const decoder = new TextDecoderStream();
      piped.current = p.readable!.pipeTo(decoder.writable as WritableStream<Uint8Array>);
      const r = decoder.readable.getReader();
      reader.current = r;
      let rest = "";
      try {
        for (;;) {
          const { value, done } = await r.read();
          if (done) break;
          rest += value;
          const parts = rest.split("\n");
          rest = parts.pop() ?? "";
          const now = Date.now();
          const fresh = parts
            .map((x) => x.replace(/\r$/, ""))
            .filter((x) => x.trim())
            .map((text) => ({ id: ++seq.current, t: now, text }));
          if (fresh.length) setLines((l) => [...l, ...fresh].slice(-KEEP));
        }
      } catch {
        // Unplugged mid-read
      }
      if (port.current === p) await close("lost");
    },
    [close],
  );

  /** The picker, then the monitor; must come from a click */
  const connect = useCallback(async () => {
    const p = await pickPort();
    if (p) await attach(p);
  }, [attach]);

  useEffect(
    () => () => {
      void close();
    },
    [close],
  );

  return { status, lines, attach, connect, close, clear: () => setLines([]) };
}
