/**
 * Flashing an ESP32 as a fresh install, against a stand-in for esptool-js: the whole chip is erased
 * before the image is written (so nothing of the old firmware, Wi-Fi settings or files stays), the
 * image goes to address 0, the fast link is tried first and the plain ROM loader last (which cannot
 * erase the chip but still overwrites everything up to the end of the image), a port that will not
 * open is its own failure, and whatever happens the port ends closed and the failure says what
 * esptool said. The board itself is the one thing this cannot stand in for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as string[],
  writes: [] as { address: number; length: number; eraseAll: boolean; compress: boolean }[],
  /** per attempt (0 stub 460800, 1 stub 115200, 2 ROM): what fails */
  plan: [] as { main?: boolean; erase?: boolean; write?: boolean }[],
  attempt: -1,
  leaveOpen: false,
  bauds: [] as number[],
}));

vi.mock("esptool-js", () => ({
  Transport: class {
    constructor(public port: { close(): Promise<void>; readable: unknown }) {}
    async disconnect() {
      h.calls.push("disconnect");
      // A transport that fails to close its port: the caller must not leave it open
      if (!h.leaveOpen) await this.port.close();
    }
  },
  ESPLoader: class {
    constructor(o: { baudrate: number; terminal: { writeLine(s: string): void } }) {
      h.attempt++;
      h.bauds.push(o.baudrate);
      this.say = (s) => o.terminal.writeLine(s);
    }
    say: (s: string) => void;
    private step() {
      return h.plan[h.attempt] ?? {};
    }
    async main() {
      h.calls.push("main");
      if (this.step().main) throw new Error("Failed to connect to ESP32: No serial data received.");
      this.say("Chip is ESP32-D0WD");
    }
    async detectChip() {
      h.calls.push("detectChip");
      if (this.step().main) throw new Error("Failed to connect to ESP32: Wrong boot mode");
    }
    async eraseFlash() {
      h.calls.push("eraseFlash");
      if (this.step().erase) throw new Error("erase timed out");
    }
    async writeFlash(o: {
      fileArray: { data: Uint8Array; address: number }[];
      eraseAll: boolean;
      compress: boolean;
      reportProgress?: (i: number, w: number, t: number) => void;
    }) {
      h.calls.push("writeFlash");
      h.writes.push({
        address: o.fileArray[0].address,
        length: o.fileArray[0].data.length,
        eraseAll: o.eraseAll,
        compress: o.compress,
      });
      o.reportProgress?.(0, 50, 100);
      if (this.step().write)
        throw new Error("Failed to write compressed data to flash after seq 12");
      o.reportProgress?.(0, 100, 100);
    }
    async after(mode: string) {
      h.calls.push(`after:${mode}`);
    }
  },
}));

import { ESP32_ATTEMPTS, UploadError, flashEsp32, type PortLike } from "../upload-serial";

function port(failOpen = false): PortLike & { isOpen: boolean } {
  const p = {
    isOpen: false,
    get readable() {
      return p.isOpen ? ({} as ReadableStream<Uint8Array>) : null;
    },
    get writable() {
      return p.isOpen ? ({} as WritableStream<Uint8Array>) : null;
    },
    async open() {
      if (failOpen) throw new DOMException("in use", "NetworkError");
      p.isOpen = true;
      h.calls.push("open");
    },
    async close() {
      p.isOpen = false;
      h.calls.push("close");
    },
  };
  return p as unknown as PortLike & { isOpen: boolean };
}

const image = new Uint8Array(1_100_000).fill(0xe9);

beforeEach(() => {
  h.calls.length = 0;
  h.writes.length = 0;
  h.plan = [];
  h.attempt = -1;
  h.leaveOpen = false;
  h.bauds.length = 0;
});

describe("flashEsp32 as a fresh install", () => {
  it("erases the whole chip, then writes the image at address 0, then restarts the board", async () => {
    const p = port();
    const phases: string[] = [];
    const pct: number[] = [];
    await flashEsp32(
      p,
      image,
      (n) => pct.push(n),
      (x) => phases.push(x),
    );
    const flow = h.calls.filter((c) => !["open", "close", "disconnect"].includes(c));
    expect(flow).toEqual(["main", "eraseFlash", "writeFlash", "after:hard_reset"]);
    expect(h.writes).toEqual([
      { address: 0, length: image.length, eraseAll: false, compress: true },
    ]);
    expect(phases).toEqual(["erase", "write"]);
    expect(pct.at(-1)).toBe(100);
    expect(p.isOpen).toBe(false);
  });

  it("says which attempt worked, so a laptop that needs the slow ROM loader shows in the reports", async () => {
    h.plan = [{ main: true }, { main: true }, {}];
    expect(await flashEsp32(port(), image, () => undefined)).toBe("reset-115200-rom");
    h.attempt = -1;
    h.calls = [];
    h.writes = [];
    h.bauds = [];
    h.plan = [];
    expect(await flashEsp32(port(), image, () => undefined)).toBe("reset-460800-stub");
  });

  it("starts with the fast link and ends on the plain ROM loader", () => {
    expect(ESP32_ATTEMPTS[0]).toEqual({ baud: 460800, stub: true });
    expect(ESP32_ATTEMPTS.at(-1)).toEqual({ baud: 115200, stub: false });
  });

  it("when the stub will not start twice, the ROM loader still rewrites everything from address 0", async () => {
    h.plan = [{ main: true }, { main: true }, {}];
    const p = port();
    const phases: string[] = [];
    await flashEsp32(
      p,
      image,
      () => undefined,
      (x) => phases.push(x),
    );
    expect(h.bauds).toEqual([460800, 115200, 115200]);
    expect(h.calls).toContain("detectChip");
    // The ROM loader cannot erase the chip: no erase step, but the image still goes to address 0
    expect(h.calls.filter((c) => c === "eraseFlash")).toHaveLength(0);
    expect(phases).toEqual(["write"]);
    expect(h.writes).toEqual([
      { address: 0, length: image.length, eraseAll: false, compress: true },
    ]);
    expect(p.isOpen).toBe(false);
  });

  it("a write that fails halfway is tried again from the erase, on a slower link", async () => {
    h.plan = [{ write: true }];
    const p = port();
    await flashEsp32(p, image, () => undefined);
    expect(h.bauds).toEqual([460800, 115200]);
    expect(h.calls.filter((c) => c === "eraseFlash")).toHaveLength(2);
    expect(h.calls.filter((c) => c === "writeFlash")).toHaveLength(2);
    expect(h.calls.at(-1) === "close" || h.calls.at(-2) === "after:hard_reset").toBe(true);
    expect(p.isOpen).toBe(false);
  });

  it("when every attempt fails it says gagal_flash with what esptool said, port closed", async () => {
    h.plan = [{ write: true }, { write: true }, { write: true }];
    const p = port();
    const err = await flashEsp32(p, image, () => undefined).catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect(err.kode).toBe("gagal_flash");
    expect(err.log).toContain("Failed to write compressed data");
    expect(err.log).toContain("attempt: 460800 baud, stub");
    expect(err.log).toContain("attempt: 115200 baud, ROM loader");
    expect(p.isOpen).toBe(false);
  });

  it("a board that never answers is gagal_masuk_bootloader", async () => {
    h.plan = [{ main: true }, { main: true }, { main: true }];
    const err = await flashEsp32(port(), image, () => undefined).catch((e) => e);
    expect(err.kode).toBe("gagal_masuk_bootloader");
    expect(err.log).toContain("No serial data received");
    expect(h.calls).not.toContain("writeFlash");
  });

  it("a port that will not open is port_sibuk and esptool is never started", async () => {
    const err = await flashEsp32(port(true), image, () => undefined).catch((e) => e);
    expect(err.kode).toBe("port_sibuk");
    expect(h.bauds).toEqual([]);
  });

  it("a transport that fails to close its port does not leave it open for the next attempt", async () => {
    h.leaveOpen = true;
    h.plan = [{ write: true }];
    const p = port();
    // Each attempt opens the port through the transport in real life; here the probe opened it
    // once and the transport never closes, so the cleanup has to
    await flashEsp32(p, image, () => undefined).catch(() => undefined);
    expect(p.isOpen).toBe(false);
  });
});
