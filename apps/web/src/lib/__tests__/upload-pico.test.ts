/**
 * Writing main.py to a Pico W through the raw REPL, against a simulated Pico: one that stops at
 * the first Ctrl C, one that ignores the first few (the second of two sent at the same instant
 * counts as one), one that is slow to get back to the prompt (its finally block closes the broker
 * connection), one that never stops, one that fails a write, one that loses bytes, and one whose
 * port will not open. Whatever happens the port ends closed and the failure carries a code.
 */
import { describe, expect, it } from "vitest";
import { RAW_BANNER, UploadError, writeMain, type PortLike } from "../upload-serial";

class FakePico {
  state: "running" | "repl" | "raw" = "running";
  ctrlC = 0;
  code = "";
  file: number[] | null = null;
  pending: number[] = [];
  reboots = 0;
  stopping = false;
  writes = 0;
  opened = false;
  private ctl: ReadableStreamDefaultController<Uint8Array> | null = null;
  private enc = new TextEncoder();
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;

  constructor(
    private o: {
      /** Ctrl C the running program ignores */
      ignore?: number;
      /** ms between the Ctrl C that works and the prompt */
      slowStop?: number;
      /** the nth write statement fails with this message */
      failWrite?: { n: number; msg: string };
      /** bytes the second write loses */
      dropBytes?: number;
      failOpen?: boolean;
    } = {},
  ) {}

  port: PortLike = {
    open: async () => {
      if (this.o.failOpen || this.opened) throw new DOMException("in use", "InvalidStateError");
      this.opened = true;
      this.readable = new ReadableStream<Uint8Array>({ start: (c) => void (this.ctl = c) });
      this.writable = new WritableStream<Uint8Array>({
        write: (chunk) => {
          for (const b of chunk) this.byte(b);
        },
      });
    },
    close: async () => {
      // A real SerialPort refuses to close while a stream is still locked
      if (this.readable?.locked || this.writable?.locked) throw new TypeError("locked");
      this.opened = false;
      this.readable = null;
      this.writable = null;
    },
    get readable() {
      return that.readable;
    },
    get writable() {
      return that.writable;
    },
  } as PortLike;

  private say(s: string) {
    this.ctl?.enqueue(this.enc.encode(s));
  }

  private byte(b: number) {
    if (this.state === "running") {
      if (b !== 3) return void this.pending.push(b);
      this.ctrlC++;
      if (this.ctrlC > (this.o.ignore ?? 0) && !this.stopping) {
        this.stopping = true;
        const stop = () => {
          this.stopping = false;
          this.state = "repl";
          this.say("\r\nKeyboardInterrupt:\r\n>>> ");
          const p = this.pending;
          this.pending = [];
          for (const x of p) this.byte(x);
        };
        if (this.o.slowStop) setTimeout(stop, this.o.slowStop);
        else stop();
      }
    } else if (this.state === "repl") {
      if (b === 1) {
        this.state = "raw";
        this.say(RAW_BANNER);
      } else if (b === 4) {
        this.reboots++;
        this.state = "running";
        this.ctrlC = 0;
        this.say("MPY: soft reboot\r\n");
      }
    } else {
      if (b === 3) this.code = "";
      else if (b === 2) {
        this.state = "repl";
        this.say("\r\n>>> ");
      } else if (b === 1) this.say(RAW_BANNER);
      else if (b === 4) this.exec();
      else this.code += String.fromCharCode(b);
    }
  }

  private exec() {
    this.say("OK");
    let out = "";
    let err = "";
    const w = /^f=open\('main\.py','(wb|ab)'\)\nf\.write\(b'(.*)'\)\nf\.close\(\)\n$/s.exec(
      this.code,
    );
    if (w) {
      this.writes++;
      let bytes = [...w[2].matchAll(/\\x([0-9a-f]{2})|(.)/gs)].map((m) =>
        m[1] ? parseInt(m[1], 16) : m[2].charCodeAt(0),
      );
      if (this.o.failWrite?.n === this.writes) err = this.o.failWrite.msg;
      else {
        if (this.writes === 2 && this.o.dropBytes) bytes = bytes.slice(this.o.dropBytes);
        this.file = w[1] === "wb" ? bytes : [...(this.file ?? []), ...bytes];
      }
    } else if (this.code === "import os\nprint(os.stat('main.py')[6])\n") {
      out = `${this.file?.length ?? 0}\r\n`;
    } else err = "SyntaxError: invalid syntax";
    this.code = "";
    this.say(`${out}\x04${err}\x04>`);
  }
}
// `that` lets the port's getters reach the device they belong to
let that: FakePico;
const make = (o?: ConstructorParameters<typeof FakePico>[0]) => {
  that = new FakePico(o);
  return that;
};

const sample = (n: number) => {
  // Printable text with every character the escaping has to handle: quotes, a backslash, a tab, accents
  const unit = "wifi_ssid = \"x\"  # it's a 'test'\\path\tcaf\u00e9\nprint('ok')\n";
  return unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
};
const bytesOf = (s: string) => Array.from(new TextEncoder().encode(s));

describe("writeMain against a simulated Pico", () => {
  it("writes the file byte for byte, restarts the Pico, and leaves the port closed", async () => {
    const pico = make();
    const text = sample(900);
    const seen: number[] = [];
    await writeMain(pico.port, text, (n) => seen.push(n));
    expect(pico.file).toEqual(bytesOf(text));
    expect(pico.reboots).toBe(1);
    expect(pico.opened).toBe(false);
    expect(seen.at(-1)).toBe(100);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  }, 20000);

  it("a whole module file (8 KB with every awkward character) arrives intact", async () => {
    const pico = make();
    const text = sample(8200);
    await writeMain(pico.port, text, () => undefined);
    expect(pico.file).toEqual(bytesOf(text));
    expect(pico.writes).toBe(Math.ceil(bytesOf(text).length / 200));
  }, 30000);

  it("a program that ignores the first Ctrl C (two sent at once count as one) is stopped by the next try", async () => {
    const pico = make({ ignore: 3 });
    await writeMain(pico.port, sample(300), () => undefined);
    expect(pico.file).toEqual(bytesOf(sample(300)));
    expect(pico.opened).toBe(false);
  }, 20000);

  it("a program that takes a second and a half to reach the prompt after it is stopped", async () => {
    const pico = make({ slowStop: 1500 });
    await writeMain(pico.port, sample(300), () => undefined);
    expect(pico.file).toEqual(bytesOf(sample(300)));
  }, 20000);

  it("a program that never stops ends as pico_tak_menjawab, port closed", async () => {
    const pico = make({ ignore: Infinity });
    const err = await writeMain(pico.port, sample(100), () => undefined, 2).catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect(err.kode).toBe("pico_tak_menjawab");
    expect(pico.opened).toBe(false);
  }, 20000);

  it("a write the Pico refuses ends as pico_galat with the Pico's own message", async () => {
    const pico = make({ failWrite: { n: 2, msg: "OSError: [Errno 28] ENOSPC" } });
    const err = await writeMain(pico.port, sample(900), () => undefined).catch((e) => e);
    expect(err.kode).toBe("pico_galat");
    expect(err.log).toContain("ENOSPC");
    expect(pico.opened).toBe(false);
  }, 20000);

  it("bytes lost on the way are caught by the size check, not left as a broken main.py", async () => {
    const pico = make({ dropBytes: 7 });
    const err = await writeMain(pico.port, sample(900), () => undefined).catch((e) => e);
    expect(err.kode).toBe("pico_tidak_utuh");
    expect(err.log).toMatch(/sent \d+ bytes, the Pico holds \d+/);
  }, 20000);

  it("a port that will not open is port_sibuk", async () => {
    const pico = make({ failOpen: true });
    const err = await writeMain(pico.port, "x", () => undefined).catch((e) => e);
    expect(err.kode).toBe("port_sibuk");
  });
});
