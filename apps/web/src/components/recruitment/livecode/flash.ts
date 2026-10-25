/**
 * Flashing from the browser (prompt 12, EXAM-ENGINE 9.5): Web Serial and
 * esptool-js 0.7.0, loaded on demand. The compiled image is the merged image
 * with its trailing 0xFF trimmed, so it goes to address 0x0 on both chips.
 * Speed goes 921600 first, then 460800, then 115200; the chip esptool finds
 * must be the one the board's tab compiled for, else nothing is written and
 * the page offers to switch (`chip_beda`).
 */
import { chipOf, FLASH_BAUDS, USB_FILTERS } from "../../../lib/recruitment/lc-ui";
import type { Chip } from "../../../lib/recruitment/lc-types";
import { holdPicker, releasePicker } from "../exam/lockdown/useLockdown";

export type FlashKode =
  "tanpa_dukungan" | "dibatalkan" | "chip_beda" | "tidak_menjawab" | "gagal_tulis" | "port_dipakai";

export type FlashStep =
  | { k: "connect"; baud: number }
  | { k: "found"; chip: string }
  | { k: "write"; baud: number }
  | { k: "retry"; baud: number; boot: boolean };

export interface FlashDone {
  ok: boolean;
  kode?: FlashKode;
  /** What esptool called the chip, when it got that far */
  found?: string;
  ms: number;
  /** The port, released and ready for the serial monitor */
  port?: SerialPortLike;
}

// The DOM lib has no Web Serial types here; only what this file uses.
export interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
}
interface SerialLike {
  requestPort(o?: { filters?: { usbVendorId: number }[] }): Promise<SerialPortLike>;
}

/**
 * A dry-run seam for the rig (no ESP32 plugged in): a test sets `window.__irisFlashStub` before the
 * page loads and the port picker, the image and the flash itself answer from it. Nothing sets it on
 * the real site.
 */
interface FlashStub {
  pick?: () => Promise<SerialPortLike | null>;
  image?: (job: number) => Promise<Uint8Array | null>;
  flash?: (o: {
    target: Chip;
    onStep: (s: FlashStep) => void;
    onProgress: (fraction: number) => void;
  }) => Promise<FlashDone>;
}
const stub = (): FlashStub | undefined =>
  (globalThis as unknown as { __irisFlashStub?: FlashStub }).__irisFlashStub;

export const serialOk = (): boolean =>
  !!stub() || (typeof navigator !== "undefined" && "serial" in navigator);

/** The port picker; must be called from the click itself. Null when the picker is dismissed. */
export async function pickPort(): Promise<SerialPortLike | null> {
  if (stub()?.pick) return stub()!.pick!();
  const serial = (navigator as unknown as { serial?: SerialLike }).serial;
  if (!serial) return null;
  holdPicker();
  try {
    return await serial.requestPort({ filters: USB_FILTERS });
  } catch {
    return null;
  } finally {
    releasePicker();
  }
}

/** The image from `lc-bin?job=` (a 302 to a ten minute link). */
export async function fetchImage(job: number): Promise<Uint8Array | null> {
  if (stub()?.image) return stub()!.image!(job);
  try {
    const r = await fetch(`/api/recruitment/lc-bin?job=${job}`, { cache: "no-store" });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function flashImage(o: {
  port: SerialPortLike;
  image: Uint8Array;
  target: Chip;
  onStep: (s: FlashStep) => void;
  onProgress: (fraction: number) => void;
}): Promise<FlashDone> {
  if (stub()?.flash) {
    const r = await stub()!.flash!({
      target: o.target,
      onStep: o.onStep,
      onProgress: o.onProgress,
    });
    return { ...r, port: r.port ?? o.port };
  }
  const t0 = Date.now();
  const { ESPLoader, Transport } = await import("esptool-js");
  let found: string | undefined;
  let last: FlashKode = "tidak_menjawab";
  for (let i = 0; i < FLASH_BAUDS.length; i++) {
    const baud = FLASH_BAUDS[i];
    o.onStep({ k: "connect", baud });
    const transport = new Transport(
      o.port as unknown as ConstructorParameters<typeof Transport>[0],
      false,
    );
    try {
      const loader = new ESPLoader({ transport, baudrate: baud, romBaudrate: 115200 });
      found = await loader.main();
      o.onStep({ k: "found", chip: found });
      if (chipOf(found) !== o.target) {
        await transport.disconnect().catch(() => undefined);
        return { ok: false, kode: "chip_beda", found, ms: Date.now() - t0 };
      }
      o.onStep({ k: "write", baud });
      await loader.writeFlash({
        fileArray: [{ data: o.image, address: 0x0 }],
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (_i, written, total) => o.onProgress(total ? written / total : 0),
      });
      await loader.after("hard_reset");
      await transport.disconnect().catch(() => undefined);
      return { ok: true, found, ms: Date.now() - t0, port: o.port };
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      last = /failed to open|already open|in use|busy/i.test(msg)
        ? "port_dipakai"
        : found
          ? "gagal_tulis"
          : "tidak_menjawab";
      await transport.disconnect().catch(() => undefined);
      if (last === "port_dipakai") break;
      if (i + 1 < FLASH_BAUDS.length) {
        o.onStep({ k: "retry", baud: FLASH_BAUDS[i + 1], boot: !found });
        o.onProgress(0);
        await pause(600);
      }
    }
  }
  return { ok: false, kode: last, found, ms: Date.now() - t0 };
}
