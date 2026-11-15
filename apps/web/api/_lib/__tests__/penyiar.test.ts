import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { kirimRelay } from "../aliran.js";
import {
  alamatRuang,
  kirimRuangLokal,
  pasangPenyiar,
  pasangPenyiarRuang,
  ruangDiServer,
  siarkanLokal,
  tutupRuangLokal,
} from "../penyiar.js";

const ENV_ASLI = { ...process.env };

beforeEach(() => {
  process.env.KONSOL_RELAY_SECRET = "s".repeat(40);
  process.env.KONSOL_RELAY_URL = "wss://relay.example";
});
afterEach(() => {
  pasangPenyiar(null);
  pasangPenyiarRuang(null);
  vi.unstubAllGlobals();
  process.env = { ...ENV_ASLI };
});

describe("siarkanLokal", () => {
  it("reaches nobody until the server hands over its hub", () => {
    expect(siarkanLokal(["sesi"])).toBe(0);
  });

  it("calls the hub with the topics and returns how many it reached", () => {
    const hub = vi.fn(() => 7);
    pasangPenyiar(hub);
    expect(siarkanLokal(["sesi", "nilai"])).toBe(7);
    expect(hub).toHaveBeenCalledWith(["sesi", "nilai"]);
  });

  it("never throws, and ignores an empty list", () => {
    pasangPenyiar(() => {
      throw new Error("hub broke");
    });
    expect(siarkanLokal(["sesi"])).toBe(0);
    const hub = vi.fn(() => 1);
    pasangPenyiar(hub);
    expect(siarkanLokal([])).toBe(0);
    expect(hub).not.toHaveBeenCalled();
  });
});

describe("kirimRelay announces to the local hub first, and to the Worker unless told not to", () => {
  const jawab = () => ({ ok: true, json: async () => ({}) }) as Response;

  it("sends the topics to the hub and to the Worker by default (pages on an older build still listen there)", async () => {
    const hub = vi.fn(() => 3);
    pasangPenyiar(hub);
    const fetchPalsu = vi.fn(async (_u: string, _i: RequestInit) => jawab());
    vi.stubGlobal("fetch", fetchPalsu);
    await kirimRelay(["sesi"]);
    expect(hub).toHaveBeenCalledWith(["sesi"]);
    expect(JSON.parse(String(fetchPalsu.mock.calls[0]![1].body))).toEqual({ t: ["sesi"] });
  });

  it("with IRIS_RELAY_LAMA=0 nothing goes to the Worker any more, topics or rooms", async () => {
    process.env.IRIS_RELAY_LAMA = "0";
    const hub = vi.fn(() => 3);
    const ruang = vi.fn(() => 2);
    pasangPenyiar(hub);
    pasangPenyiarRuang({ kirim: ruang, tutup: () => 0 });
    const fetchPalsu = vi.fn(async (_u: string, _i: RequestInit) => jawab());
    vi.stubGlobal("fetch", fetchPalsu);
    const pesan = [{ j: "denyut", g: null, d: 1 }] as never[];
    await kirimRelay(["sesi"], { "sesi-1": pesan });
    expect(hub).toHaveBeenCalledWith(["sesi"]);
    expect(ruang).toHaveBeenCalledWith("sesi-1", pesan);
    expect(fetchPalsu).not.toHaveBeenCalled();
  });

  it("room messages reach the rooms held by this server, and still go to the Worker by default", async () => {
    const ruang = vi.fn(() => 2);
    pasangPenyiarRuang({ kirim: ruang, tutup: () => 0 });
    const fetchPalsu = vi.fn(async (_u: string, _i: RequestInit) => jawab());
    vi.stubGlobal("fetch", fetchPalsu);
    const pesan = [{ j: "tel", g: 2, d: [] }] as never[];
    await kirimRelay([], { "sesi-1": pesan });
    expect(ruang).toHaveBeenCalledWith("sesi-1", pesan);
    expect(JSON.parse(String(fetchPalsu.mock.calls[0]![1].body)).r).toHaveProperty("sesi-1");
  });

  it("still reaches the hub when no relay is configured", async () => {
    delete process.env.KONSOL_RELAY_SECRET;
    const hub = vi.fn(() => 1);
    pasangPenyiar(hub);
    const fetchPalsu = vi.fn();
    vi.stubGlobal("fetch", fetchPalsu);
    await kirimRelay(["sesi"]);
    expect(hub).toHaveBeenCalledWith(["sesi"]);
    expect(fetchPalsu).not.toHaveBeenCalled();
  });
});

describe("rooms held by this server", () => {
  it("reach nobody until the server hands them over, and never throw", () => {
    expect(ruangDiServer()).toBe(false);
    expect(kirimRuangLokal("sesi-1", [{}])).toBe(0);
    expect(tutupRuangLokal("rec-1")).toBe(0);
    pasangPenyiarRuang({
      kirim: () => {
        throw new Error("x");
      },
      tutup: () => {
        throw new Error("y");
      },
    });
    expect(ruangDiServer()).toBe(true);
    expect(kirimRuangLokal("sesi-1", [{}])).toBe(0);
    expect(tutupRuangLokal("rec-1")).toBe(0);
  });
});

describe("alamatRuang", () => {
  const req = (h: Record<string, string>) => ({ headers: h });
  const relay = "wss://relay.example";

  it("points at the relay until this server holds the rooms", () => {
    expect(alamatRuang(req({ host: "irisiotlab.com" }), "aliran", "pc", relay, false)).toBe(
      "wss://relay.example/aliran/pc",
    );
    expect(alamatRuang(req({ host: "irisiotlab.com" }), "aliran", "pc", null, false)).toBeNull();
  });

  it("points at this server once it holds them, over wss on the public host", () => {
    pasangPenyiarRuang({ kirim: () => 0, tutup: () => 0 });
    expect(alamatRuang(req({ host: "irisiotlab.com" }), "ujian", "rec-7", relay, false)).toBe(
      "wss://irisiotlab.com/ujian/rec-7",
    );
    expect(
      alamatRuang(
        req({
          host: "127.0.0.1:8787",
          "x-forwarded-host": "pc.irisiotlab.com",
          "x-forwarded-proto": "https",
        }),
        "ujian",
        "rec-7",
        relay,
        false,
      ),
    ).toBe("wss://pc.irisiotlab.com/ujian/rec-7");
    expect(alamatRuang(req({ host: "localhost:8787" }), "aliran", "sesi-2", null, false)).toBe(
      "ws://localhost:8787/aliran/sesi-2",
    );
  });

  it("falls back to the relay when the page asks for it (lama) or IRIS_RUANG_HUB=0", () => {
    pasangPenyiarRuang({ kirim: () => 0, tutup: () => 0 });
    expect(alamatRuang(req({ host: "irisiotlab.com" }), "aliran", "pc", relay, true)).toBe(
      "wss://relay.example/aliran/pc",
    );
    // With no relay to fall back to, the page keeps using this server.
    expect(alamatRuang(req({ host: "irisiotlab.com" }), "aliran", "pc", null, true)).toBe(
      "wss://irisiotlab.com/aliran/pc",
    );
    process.env.IRIS_RUANG_HUB = "0";
    expect(alamatRuang(req({ host: "irisiotlab.com" }), "aliran", "pc", relay, false)).toBe(
      "wss://relay.example/aliran/pc",
    );
  });
});
