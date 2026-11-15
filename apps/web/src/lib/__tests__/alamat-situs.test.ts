import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SITE_URL } from "../lab";
import { alamatRelay, alamatSiaran } from "../siaran";

type Header = { key: string; value: string };
type Vercel = {
  redirects: {
    source: string;
    has?: { type: string; value: string }[];
    destination: string;
    permanent: boolean;
  }[];
  headers: { source: string; headers: Header[] }[];
};

const vercel: Vercel = JSON.parse(
  readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"),
);
const csp = () =>
  vercel.headers
    .flatMap((h) => h.headers)
    .find((x) => x.key === "Content-Security-Policy" && x.value.includes("connect-src"))!.value;

describe("irisiotlab.com (2026-10-17)", () => {
  it("the site lives on irisiotlab.com", () => {
    expect(SITE_URL).toBe("https://irisiotlab.com");
  });

  it("old host pages go to the same path on the new host, never /api", () => {
    const r = vercel.redirects.find((x) => x.has?.some((h) => h.type === "host"));
    expect(r).toEqual({
      source: "/((?!api/).*)",
      has: [{ type: "host", value: "iris-praktikum-jurnal.vercel.app" }],
      destination: "https://irisiotlab.com/$1",
      permanent: true,
    });
    expect(vercel.redirects[0]).toBe(r);
  });

  it("the CSP allows the new relay and still the old one", () => {
    expect(csp()).toContain("wss://konsol.irisiotlab.com");
    expect(csp()).toContain("wss://iris-konsol.iris-iot-relay.workers.dev");
  });

  it("live updates use the relay on the domain, the rig its local one", () => {
    expect(alamatRelay("irisiotlab.com")).toBe("wss://konsol.irisiotlab.com/siaran");
    expect(alamatRelay("localhost")).toBe("ws://127.0.0.1:8788/siaran");
  });

  it("a page on the domain listens to the hub in the server itself, the rig to its local relay", () => {
    const hub = (h: string, pw = false, n: number | null = null, e: string | null = null) =>
      alamatSiaran(h, "https:", h, pw, n, e);
    expect(hub("irisiotlab.com")).toBe("wss://irisiotlab.com/siaran");
    expect(hub("pc.irisiotlab.com")).toBe("wss://pc.irisiotlab.com/siaran");
    expect(alamatSiaran("localhost", "http:", "localhost:4321", false, null, null)).toBe(
      "ws://127.0.0.1:8788/siaran",
    );
  });

  it("falls back to the Worker relay after the hub failed, and resumes where it left off", () => {
    expect(alamatSiaran("irisiotlab.com", "https:", "irisiotlab.com", true, 5, "ab")).toBe(
      "wss://konsol.irisiotlab.com/siaran",
    );
    expect(alamatSiaran("irisiotlab.com", "https:", "irisiotlab.com", false, 41, "ab12")).toBe(
      "wss://irisiotlab.com/siaran?sejak=41&e=ab12",
    );
  });

  it("the CSP lets a page open the hub's socket", () => {
    expect(csp()).toContain("wss://irisiotlab.com");
  });
});
