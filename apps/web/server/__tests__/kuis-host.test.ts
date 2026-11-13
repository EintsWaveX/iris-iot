import { afterEach, describe, expect, it } from "vitest";
import { alamatKuis, aturKuis, hostKuis } from "../kuis-host.js";

afterEach(() => {
  delete process.env.IRIS_HOST_KUIS;
});

describe("the games host", () => {
  it("knows its own names, with or without a port", () => {
    expect(hostKuis("games.irisiotlab.com")).toBe(true);
    expect(hostKuis("GAMES.irisiotlab.com")).toBe(true);
    expect(hostKuis("games.localhost:8787")).toBe(true);
    expect(hostKuis("irisiotlab.com")).toBe(false);
    expect(hostKuis("hunt.irisiotlab.com")).toBe(false);
    expect(hostKuis(undefined)).toBe(false);
    process.env.IRIS_HOST_KUIS = "kuis.contoh.test";
    expect(hostKuis("kuis.contoh.test")).toBe(true);
  });

  it("serves the game page at /", () => {
    expect(aturKuis("games.irisiotlab.com", "/")).toEqual({ jenis: "tulis", path: "/kuis" });
    expect(aturKuis("games.irisiotlab.com", "/kuis")).toEqual({ jenis: "tulis", path: "/kuis" });
  });

  it("lets the API, the assets and the socket through", () => {
    for (const p of [
      "/api/auth/me",
      "/_astro/a.js",
      "/f/1/a.pdf",
      "/kuis/ws",
      "/favicon.svg",
      "/theme-init.js",
      "/login",
      "/en/login",
      "/privacy",
    ]) {
      expect(aturKuis("games.irisiotlab.com", p)).toBeNull();
    }
  });

  it("sends every other page back to /", () => {
    expect(aturKuis("games.irisiotlab.com", "/dashboard")).toEqual({ jenis: "alih", lokasi: "/" });
    expect(aturKuis("games.irisiotlab.com", "/en/modules/4", "?a=1")).toEqual({
      jenis: "alih",
      lokasi: "/?a=1",
    });
  });

  it("forwards /kuis on the main site to the games host", () => {
    expect(aturKuis("irisiotlab.com", "/kuis")).toEqual({
      jenis: "alih",
      lokasi: "https://games.irisiotlab.com/",
    });
    expect(aturKuis("localhost:8787", "/kuis/")).toEqual({
      jenis: "alih",
      lokasi: "http://games.localhost:8787/",
    });
    expect(aturKuis("irisiotlab.com", "/modules/4")).toBeNull();
  });

  it("names the games address for a host", () => {
    expect(alamatKuis("irisiotlab.com")).toBe("https://games.irisiotlab.com/");
    expect(alamatKuis("127.0.0.1:9000")).toBe("http://games.localhost:9000/");
  });
});
