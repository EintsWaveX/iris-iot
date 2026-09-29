import { describe, expect, it } from "vitest";
import { navUtama } from "../nav-links";

describe("navUtama", () => {
  it("keeps the same hrefs and role scoping in both languages", () => {
    const strip = (l: ReturnType<typeof navUtama>) => l.map(({ href, peran }) => ({ href, peran }));
    const id = strip(navUtama("id"));
    const en = strip(navUtama("en"));
    // Only the modules link differs, because it points at the /en/ mirror.
    expect(en.filter((l) => l.href !== "/en/modules")).toEqual(
      id.filter((l) => l.href !== "/modules"),
    );
    expect(en.some((l) => l.href === "/en/modules")).toBe(true);
  });

  it("translates every label on English routes", () => {
    expect(navUtama("en").map((l) => l.label)).toEqual([
      "Home",
      "Dashboard",
      "Session",
      "Modules",
      "Server",
      "Reports",
    ]);
  });

  it("defaults to Indonesian", () => {
    expect(navUtama().map((l) => l.label)).toEqual([
      "Beranda",
      "Dasbor",
      "Sesi",
      "Modul",
      "Server",
      "Laporan",
    ]);
  });
});
