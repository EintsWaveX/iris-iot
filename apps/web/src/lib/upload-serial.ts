/**
 * Live Upload, the two things that talk to a board over Web Serial (2026-11-13):
 *
 *   flashEsp32   a merged image (bootloader, partitions, app: address 0) onto an
 *                ESP32 with esptool-js, trying a faster link first and the plain
 *                ROM loader last, because these CH340 boards sometimes will not
 *                start the stub flasher (the same thing the Linux esptool shows).
 *   writeMain    a MicroPython file as main.py on a Pico W through the raw REPL.
 *
 * Both take a SerialPort that is closed and return with it closed, so the
 * caller opens it again for Hubungkan. Errors are Errors whose message is one
 * of upload-flow's codes (gagal_masuk_bootloader, gagal_flash, gagal_tulis ...).
 * Nothing here can be unit tested without a board; the pure helpers are.
 */
import SparkMD5 from "spark-md5";

/** What these functions use of a Web Serial port (the DOM lib has no Web Serial types here) */
export interface PortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- ESP32 ----------

/** Fast and clever first, plain and slow last: each attempt starts from a fresh reset */
export const ESP32_ATTEMPTS = [
  { baud: 460800, stub: true },
  { baud: 115200, stub: true },
  { baud: 115200, stub: false },
] as const;

const SILENT = { clean: () => undefined, writeLine: () => undefined, write: () => undefined };

export async function flashEsp32(
  port: PortLike,
  image: Uint8Array,
  onPercent: (n: number) => void,
): Promise<void> {
  const { ESPLoader, Transport } = await import("esptool-js");
  let last = "gagal_masuk_bootloader";
  for (const a of ESP32_ATTEMPTS) {
    const transport = new Transport(port as never, false);
    const loader = new ESPLoader({
      transport,
      baudrate: a.baud,
      romBaudrate: 115200,
      terminal: SILENT,
    });
    const release = async () => {
      try {
        await transport.disconnect();
      } catch {
        /* already gone */
      }
    };
    try {
      if (a.stub) await loader.main("default_reset");
      else await loader.detectChip("default_reset");
    } catch {
      last = "gagal_masuk_bootloader";
      await release();
      await sleep(400);
      continue;
    }
    try {
      onPercent(0);
      await loader.writeFlash({
        fileArray: [{ data: image, address: 0 }],
        flashMode: "keep",
        flashFreq: "keep",
        flashSize: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (_i, written, total) => onPercent(Math.round((written / total) * 100)),
        calculateMD5Hash: (d) =>
          SparkMD5.ArrayBuffer.hash(
            d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer,
          ),
      });
      await loader.after("hard_reset");
      await release();
      return;
    } catch {
      last = "gagal_flash";
      await release();
      await sleep(400);
    }
  }
  throw new Error(last);
}

// ---------- Pico W ----------

/** A MicroPython bytes literal: printable ASCII as is, everything else (and ' and \) as \xNN */
export function pyBytes(chunk: Uint8Array): string {
  let s = "b'";
  for (const b of chunk) {
    if (b >= 0x20 && b < 0x7f && b !== 0x27 && b !== 0x5c) s += String.fromCharCode(b);
    else s += "\\x" + b.toString(16).padStart(2, "0");
  }
  return s + "'";
}

/** The statements that write one piece of the file (the first truncates, the rest append) */
export function writeStatements(chunk: Uint8Array, first: boolean): string {
  return `f=open('main.py','${first ? "wb" : "ab"}')\nf.write(${pyBytes(chunk)})\nf.close()\n`;
}

export const PICO_CHUNK = 200;

export async function writeMain(
  port: PortLike,
  text: string,
  onPercent: (n: number) => void,
): Promise<void> {
  try {
    await port.open({ baudRate: 115200 });
  } catch {
    throw new Error("port_sibuk");
  }
  const writer = port.writable!.getWriter();
  const reader = port.readable!.getReader();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let seen = "";

  const send = (s: string) => writer.write(enc.encode(s));
  /** Reads until `end` shows in what arrived (kept in `seen`), or throws on a timeout */
  const until = async (end: string, ms: number): Promise<string> => {
    const stop = Date.now() + ms;
    for (;;) {
      const at = seen.indexOf(end);
      if (at >= 0) {
        const got = seen.slice(0, at + end.length);
        seen = seen.slice(at + end.length);
        return got;
      }
      const left = stop - Date.now();
      if (left <= 0) throw new Error("gagal_tulis");
      const r = await Promise.race([
        reader.read(),
        sleep(left).then(() => ({ done: true as const, value: undefined })),
      ]);
      if (r.done) throw new Error("gagal_tulis");
      seen += dec.decode(r.value, { stream: true });
    }
  };

  try {
    // Stop whatever main.py is doing (twice, as Thonny does), then the raw REPL
    await send("\x03\x03");
    await sleep(200);
    seen = "";
    await send("\x01");
    await until("raw REPL; CTRL-B to exit\r\n>", 3000);

    const bytes = enc.encode(text);
    for (let i = 0; i < bytes.length; i += PICO_CHUNK) {
      await send(writeStatements(bytes.slice(i, i + PICO_CHUNK), i === 0));
      await send("\x04");
      await until("OK", 3000);
      // What the statements printed, then what they failed with, each ended by \x04
      const out = await until("\x04", 5000);
      const err = await until("\x04", 5000);
      await until(">", 3000);
      if (out.length > 1 || err.length > 1) throw new Error("gagal_tulis");
      onPercent(Math.min(100, Math.round(((i + PICO_CHUNK) / bytes.length) * 100)));
    }
    // Out of the raw REPL, then a soft reset runs the new main.py
    await send("\x02");
    await sleep(100);
    await send("\x04");
    await sleep(100);
  } catch (err) {
    throw err instanceof Error && err.message === "gagal_tulis" ? err : new Error("gagal_tulis");
  } finally {
    try {
      // A cancel ends a read that is still waiting, so the lock can go and the port can close
      await reader.cancel();
      reader.releaseLock();
    } catch {
      /* a read is still waiting */
    }
    try {
      writer.releaseLock();
    } catch {
      /* ditto */
    }
    try {
      await port.close();
    } catch {
      /* an unplugged port throws */
    }
  }
}
