/**
 * Live Upload, the two things that talk to a board over Web Serial (2026-11-13):
 *
 *   flashEsp32   a merged image (bootloader, partitions, app: address 0) onto an
 *                ESP32 with esptool-js, trying a faster link first and the plain
 *                ROM loader last, because these CH340 boards sometimes will not
 *                start the stub flasher (the same thing the Linux esptool shows).
 *                It returns which attempt worked, for the upload report.
 *   writeMain    a MicroPython file as main.py on a Pico W through the raw REPL.
 *
 * Both take a SerialPort that is closed and return with it closed, so the
 * caller opens it again for Hubungkan. Failures are UploadError: `kode` is one
 * of upload-flow's codes and `log` the device's own words, shown under the
 * message so a failure on a real board says what the board said.
 * The Pico side is tested against a simulated Pico (upload-serial.test.ts);
 * flashing an ESP32 needs a board.
 */
import SparkMD5 from "spark-md5";

/** What these functions use of a Web Serial port (the DOM lib has no Web Serial types here) */
export interface PortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

/** A failure with one of our codes, and what the device said */
export class UploadError extends Error {
  constructor(
    public kode: string,
    public log?: string,
  ) {
    super(kode);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- ESP32 ----------

/** Fast and clever first, plain and slow last: each attempt starts from a fresh reset */
export const ESP32_ATTEMPTS = [
  { baud: 460800, stub: true },
  { baud: 115200, stub: true },
  { baud: 115200, stub: false },
] as const;

/** Opens and closes the port once: a port something else holds fails here, with its own code,
 *  instead of looking like a board that will not enter its bootloader. */
async function probe(port: PortLike): Promise<void> {
  try {
    await port.open({ baudRate: 115200 });
  } catch {
    throw new UploadError("port_sibuk");
  }
  try {
    await port.close();
  } catch {
    /* an unplugged port throws */
  }
  await sleep(150);
}

export async function flashEsp32(
  port: PortLike,
  image: Uint8Array,
  onPercent: (n: number) => void,
  onPhase: (p: "erase" | "write") => void = () => undefined,
): Promise<string> {
  await probe(port);
  const { ESPLoader, Transport } = await import("esptool-js");
  const said: string[] = [];
  const terminal = {
    clean: () => undefined,
    writeLine: (s: string) => void said.push(s),
    write: (s: string) => void said.push(s),
  };
  let last = "gagal_masuk_bootloader";
  for (const a of ESP32_ATTEMPTS) {
    said.push(`-- attempt: ${a.baud} baud, ${a.stub ? "stub" : "ROM loader"}`);
    const transport = new Transport(port as never, false);
    const loader = new ESPLoader({ transport, baudrate: a.baud, romBaudrate: 115200, terminal });
    const release = async () => {
      try {
        await transport.disconnect();
      } catch {
        /* already gone */
      }
      // A port left open would make the next attempt fail as "already open"
      if (port.readable || port.writable) {
        try {
          await port.close();
        } catch {
          /* locked or unplugged */
        }
      }
      await sleep(400);
    };
    try {
      if (a.stub) await loader.main("default_reset");
      else await loader.detectChip("default_reset");
    } catch (err) {
      said.push(`-- ${err instanceof Error ? err.message : String(err)}`);
      last = "gagal_masuk_bootloader";
      await release();
      continue;
    }
    try {
      // A fresh install: the whole chip is erased first, so nothing of what was on the board stays
      // (an old firmware, Wi-Fi settings and pairings kept in NVS, files in the flash). The libraries
      // are part of the image written next, so they come back with it. Only the stub can erase the
      // whole chip; the plain ROM loader attempt writes the image from address 0 instead, which
      // still overwrites the bootloader, the partition table, NVS and the boot data (the image is
      // padded with 0xFF through all of them).
      if (a.stub) {
        onPhase("erase");
        said.push("-- erasing the whole flash");
        await loader.eraseFlash();
      }
      onPhase("write");
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
      // Which attempt got the board in, for the upload report (a laptop that needs the slow ROM loader shows here)
      return `reset-${a.baud}-${a.stub ? "stub" : "rom"}`;
    } catch (err) {
      said.push(`-- ${err instanceof Error ? err.message : String(err)}`);
      last = "gagal_flash";
      await release();
    }
  }
  throw new UploadError(last, said.slice(-30).join("\n"));
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

/** A fresh install of the Pico's files: everything in the root goes (an old main.py, boot.py, test
 *  files, saved settings, folders) except /lib, where the libraries live. Each item that cannot be
 *  removed is skipped; the script prints what is left. */
export const PICO_WIPE = `import os
def rm(p):
    try:
        if os.stat(p)[0] & 0x4000:
            for f in os.listdir(p):
                rm(p + '/' + f)
            os.rmdir(p)
        else:
            os.remove(p)
    except OSError:
        pass
for f in os.listdir('/'):
    if f != 'lib':
        rm('/' + f)
print(sorted(os.listdir('/')))
`;
/** What the raw REPL says when it is ready for code */
export const RAW_BANNER = "raw REPL; CTRL-B to exit\r\n>";
/** Tries at stopping a running program and getting into the raw REPL, about 1.2 s each */
export const ENTER_TRIES = 12;

export async function writeMain(
  port: PortLike,
  text: string,
  onPercent: (n: number) => void,
  tries: number = ENTER_TRIES,
): Promise<void> {
  try {
    await port.open({ baudRate: 115200 });
  } catch {
    throw new UploadError("port_sibuk");
  }
  const writer = port.writable!.getWriter();
  const reader = port.readable!.getReader();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let seen = "";

  /** Small pieces with a pause between, so the board's USB buffer never overflows */
  const send = async (s: string) => {
    for (let i = 0; i < s.length; i += 64) {
      await writer.write(enc.encode(s.slice(i, i + 64)));
      if (s.length > 64) await sleep(4);
    }
  };
  /** Reads until `end` shows in what arrived (kept in `seen`); false on a timeout */
  const until = async (end: string, ms: number): Promise<string | null> => {
    const stop = Date.now() + ms;
    for (;;) {
      const at = seen.indexOf(end);
      if (at >= 0) {
        const got = seen.slice(0, at + end.length);
        seen = seen.slice(at + end.length);
        return got;
      }
      const left = stop - Date.now();
      if (left <= 0) return null;
      const r = await Promise.race([
        reader.read(),
        sleep(left).then(() => ({ done: true as const, value: undefined })),
      ]);
      if (r.done) return null;
      seen += dec.decode(r.value, { stream: true });
    }
  };
  const tail = () => seen.slice(-400);

  /** Runs statements in the raw REPL: what they printed and what they failed with */
  const run = async (code: string): Promise<{ out: string; err: string }> => {
    await send(code);
    await send("\x04");
    if ((await until("OK", 3000)) === null) throw new UploadError("pico_tak_menjawab", tail());
    const out = await until("\x04", 6000);
    const err = out === null ? null : await until("\x04", 6000);
    if (out === null || err === null || (await until(">", 3000)) === null)
      throw new UploadError("pico_tak_menjawab", tail());
    return { out: out.slice(0, -1), err: err.slice(0, -1) };
  };

  try {
    // A running main.py may be busy in the middle of a socket call, or still tidying up after the
    // first Ctrl C (its finally block closes the broker connection): one Ctrl C is not enough,
    // and two sent at the same instant count as one. So, like Thonny: stop, wait, stop again,
    // ask for the raw REPL, and if it does not come, start over.
    let entered = false;
    for (let i = 0; i < tries && !entered; i++) {
      await send("\x03");
      await sleep(120);
      await send("\x03");
      await sleep(250);
      await send("\x01");
      entered = (await until(RAW_BANNER, 800)) !== null;
    }
    if (!entered) throw new UploadError("pico_tak_menjawab", tail());
    await sleep(80);
    seen = "";

    const bytes = enc.encode(text);
    onPercent(0);
    const wiped = await run(PICO_WIPE);
    if (wiped.err.trim()) throw new UploadError("pico_galat", wiped.err.trim());
    for (let i = 0; i < bytes.length; i += PICO_CHUNK) {
      const { err } = await run(writeStatements(bytes.slice(i, i + PICO_CHUNK), i === 0));
      if (err.trim()) throw new UploadError("pico_galat", err.trim());
      onPercent(Math.min(99, Math.round(((i + PICO_CHUNK) / bytes.length) * 100)));
    }
    // The whole file is on the Pico, byte for byte
    const check = await run("import os\nprint(os.stat('main.py')[6])\n");
    const size = parseInt(check.out.trim(), 10);
    if (check.err.trim()) throw new UploadError("pico_galat", check.err.trim());
    if (size !== bytes.length)
      throw new UploadError(
        "pico_tidak_utuh",
        `sent ${bytes.length} bytes, the Pico holds ${size}`,
      );
    onPercent(100);

    // Out of the raw REPL, then a soft reset runs the new main.py
    await send("\x02");
    await sleep(100);
    await send("\x04");
    await sleep(100);
  } catch (err) {
    throw err instanceof UploadError ? err : new UploadError("gagal_tulis", String(err));
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
