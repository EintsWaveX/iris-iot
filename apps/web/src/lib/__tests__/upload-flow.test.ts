import { describe, expect, it } from "vitest";
import {
  runUpload,
  type StartReply,
  type StatusReply,
  type UploadApi,
  type UploadDeps,
  type UploadProgress,
} from "../upload-flow";

type Port = { name: string };
const PORT: Port = { name: "COM9" };
const VALUES = { ssid: "Lab", password: "secret123", group: 2, key: "ABCD2345" };

function make(
  over: Partial<{
    start: StartReply;
    statuses: StatusReply[];
    image: Uint8Array | null;
    flash: () => Promise<void>;
    write: () => Promise<void>;
    /** what flashEsp32 returns: which way in worked */
    via: string;
  }> = {},
) {
  const calls: string[] = [];
  const statuses = [...(over.statuses ?? [{ ok: true, state: "done", pos: 0 } as StatusReply])];
  const api: UploadApi = {
    start: async () => {
      calls.push("start");
      return over.start ?? { ok: true, kind: "esp32", id: "a".repeat(16), state: "queued", pos: 2 };
    },
    status: async () => {
      calls.push("status");
      return statuses.length > 1 ? (statuses.shift() as StatusReply) : statuses[0];
    },
    image: async () => {
      calls.push("image");
      return over.image === undefined ? new Uint8Array(2048) : over.image;
    },
  };
  const deps: UploadDeps<Port> = {
    api,
    flashEsp32: async (_p, _i, pct) => {
      calls.push("flash");
      pct(50);
      await (over.flash ?? (async () => undefined))();
      return over.via;
    },
    writeMain: async (_p, _t, pct) => {
      calls.push("write");
      pct(100);
      await (over.write ?? (async () => undefined))();
    },
    sleep: async () => undefined,
  };
  const seen: UploadProgress[] = [];
  const run = (signal = new AbortController().signal) =>
    runUpload(
      deps,
      { modul: 4, role: "hunter", bahasa: "en", values: VALUES, port: PORT },
      (p) => seen.push(p),
      signal,
    );
  return { calls, seen, run };
}

describe("runUpload", () => {
  it("passes on which way into the bootloader worked, for the upload report", async () => {
    const t = make({ via: "reset-115200-rom" });
    expect(await t.run()).toEqual({ ok: true, via: "reset-115200-rom" });
  });

  it("builds, waits its turn, downloads, flashes and says done, in that order", async () => {
    const t = make({
      statuses: [
        { ok: true, state: "queued", pos: 1 },
        { ok: true, state: "running", pos: 0 },
        { ok: true, state: "done", pos: 0 },
      ],
    });
    expect(await t.run()).toEqual({ ok: true, via: "esp32" });
    expect(t.calls).toEqual(["start", "status", "status", "status", "image", "flash"]);
    const stages = t.seen.map((p) => p.stage);
    expect(stages[0]).toBe("building");
    expect(stages).toContain("downloading");
    expect(stages.at(-1)).toBe("done");
    expect(t.seen.find((p) => p.stage === "building" && p.pos === 2)).toBeTruthy(); // the queue place is shown
    expect(t.seen.find((p) => p.stage === "flashing" && p.percent === 50)).toBeTruthy();
  });

  it("a MicroPython file is written without any build", async () => {
    const t = make({
      start: { ok: true, kind: "pico", path: "modul3_mqtt_publish.py", teks: "print(1)" },
    });
    expect(await t.run()).toEqual({ ok: true, via: "raw-repl" });
    expect(t.calls).toEqual(["start", "write"]);
  });

  it("passes the site's refusal through with its code", async () => {
    const t = make({ start: { ok: false, kode: "terlalu_sering" } });
    expect(await t.run()).toEqual({ ok: false, kode: "terlalu_sering" });
    expect(t.seen.at(-1)).toMatchObject({ stage: "error", kode: "terlalu_sering" });
    expect(t.calls).toEqual(["start"]);
  });

  it("a failed build ends with the compiler's log and never touches the port", async () => {
    const t = make({
      statuses: [{ ok: true, state: "failed", kode: "galat_kompilasi", log: "s.ino:3: error" }],
    });
    expect(await t.run()).toEqual({ ok: false, kode: "galat_kompilasi", log: "s.ino:3: error" });
    expect(t.calls).not.toContain("flash");
  });

  it("a build the service has forgotten ends as tak_ada", async () => {
    const t = make({ statuses: [{ ok: false }] });
    expect(await t.run()).toMatchObject({ ok: false, kode: "tak_ada" });
  });

  it("an image that did not arrive, or arrived empty, is not flashed", async () => {
    for (const image of [null, new Uint8Array(10)]) {
      const t = make({ image });
      expect(await t.run()).toEqual({ ok: false, kode: "unduh_gagal" });
      expect(t.calls).not.toContain("flash");
    }
  });

  it("a flash that throws one of our codes keeps it, any other error becomes gagal_flash", async () => {
    const coded = make({
      flash: async () => {
        throw new Error("gagal_masuk_bootloader");
      },
    });
    expect(await coded.run()).toEqual({ ok: false, kode: "gagal_masuk_bootloader" });
    const odd = make({
      flash: async () => {
        throw new Error("NetworkError: The device has been lost.");
      },
    });
    expect(await odd.run()).toEqual({ ok: false, kode: "gagal_flash" });
  });

  it("a Pico write that throws is gagal_tulis", async () => {
    const t = make({
      start: { ok: true, kind: "pico", path: "p.py", teks: "x" },
      write: async () => {
        throw new Error("Boom: the port went away");
      },
    });
    expect(await t.run()).toEqual({ ok: false, kode: "gagal_tulis" });
  });

  it("a cancel while waiting stops before anything is downloaded or flashed", async () => {
    const ctl = new AbortController();
    const t = make({ statuses: [{ ok: true, state: "running", pos: 0 }] });
    ctl.abort();
    expect(await t.run(ctl.signal)).toEqual({ ok: false, kode: "dibatalkan" });
    expect(t.calls).not.toContain("flash");
    expect(t.calls).not.toContain("image");
  });

  it("a status call that fails once is simply asked again", async () => {
    let n = 0;
    const t = make({ statuses: [{ ok: true, state: "done", pos: 0 }] });
    const api = t as unknown as { calls: string[] };
    void api;
    const deps: UploadDeps<Port> = {
      api: {
        start: async () => ({
          ok: true,
          kind: "esp32",
          id: "b".repeat(16),
          state: "running",
          pos: 0,
        }),
        status: async () => {
          if (n++ === 0) throw new Error("net");
          return { ok: true, state: "done", pos: 0 };
        },
        image: async () => new Uint8Array(4096),
      },
      flashEsp32: async () => undefined,
      writeMain: async () => undefined,
      sleep: async () => undefined,
    };
    const r = await runUpload(
      deps,
      { modul: 4, role: "hunter", bahasa: "id", values: VALUES, port: PORT },
      () => undefined,
      new AbortController().signal,
    );
    expect(r).toEqual({ ok: true, via: "esp32" });
    expect(n).toBe(2);
  });
});
