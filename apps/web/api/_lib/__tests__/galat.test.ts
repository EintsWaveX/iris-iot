import { describe, expect, it, vi } from "vitest";

const tersimpan: Array<{ aksi: string; detail: string }> = [];
vi.mock("../../../src/lib/db.js", () => ({
  getDb: () => ({
    insert: () => ({
      values: async (v: { aksi: string; detail: string }) => {
        tersimpan.push(v);
      },
    }),
  }),
}));

import { bukanGalat, denganGalat } from "../galat";

describe("bukanGalat", () => {
  it("skips Node's own process warnings", () => {
    expect(
      bukanGalat(
        "(node:4) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized",
      ),
    ).toBe(true);
    expect(bukanGalat("(node:4) ExperimentalWarning: vm.USE_MAIN_CONTEXT_DEFAULT_LOADER")).toBe(
      true,
    );
  });

  it("keeps the site's own errors", () => {
    expect(bukanGalat("[api/session] unexpected error: Error: boom")).toBe(false);
    expect(bukanGalat("[api/agent] uncaught error: TypeError: x is undefined")).toBe(false);
  });
});

describe("the route named in a report belongs to its own request", () => {
  it("does not mix up two requests that overlap", async () => {
    const jeda = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const a = denganGalat("api/aaa", async () => {
      await jeda(30);
      console.error("[a] salah-satu");
    });
    const b = denganGalat("api/bbb", async () => {
      await jeda(5);
      console.error("[b] salah-dua");
    });
    const req = (m: string) => ({ method: m, query: {} }) as never;
    const res = { headersSent: false, status: () => ({ json: () => {} }) } as never;
    await Promise.all([a(req("GET"), res), b(req("POST"), res)]);
    const rute = (kata: string) =>
      JSON.parse(tersimpan.find((r) => r.detail.includes(kata))!.detail).rute;
    expect(rute("salah-satu")).toBe("GET api/aaa");
    expect(rute("salah-dua")).toBe("POST api/bbb");
  });
});
