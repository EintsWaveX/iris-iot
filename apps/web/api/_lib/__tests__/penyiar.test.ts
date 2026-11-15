import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { kirimRelay } from "../aliran.js";
import { pasangPenyiar, siarkanLokal } from "../penyiar.js";

const ENV_ASLI = { ...process.env };

beforeEach(() => {
  process.env.KONSOL_RELAY_SECRET = "s".repeat(40);
  process.env.KONSOL_RELAY_URL = "wss://relay.example";
});
afterEach(() => {
  pasangPenyiar(null);
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

  it("with IRIS_RELAY_LAMA=0 the topics stay on the hub and only room messages go to the Worker", async () => {
    process.env.IRIS_RELAY_LAMA = "0";
    const hub = vi.fn(() => 3);
    pasangPenyiar(hub);
    const fetchPalsu = vi.fn(async (_u: string, _i: RequestInit) => jawab());
    vi.stubGlobal("fetch", fetchPalsu);
    await kirimRelay(["sesi"]);
    expect(hub).toHaveBeenCalledWith(["sesi"]);
    expect(fetchPalsu).not.toHaveBeenCalled();
    await kirimRelay(["sesi"], { "sesi-1": [{ j: "denyut" } as never] });
    const badan = JSON.parse(String(fetchPalsu.mock.calls[0]![1].body));
    expect(badan).not.toHaveProperty("t");
    expect(badan.r).toHaveProperty("sesi-1");
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
