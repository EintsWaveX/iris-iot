import { describe, expect, it } from "vitest";
import {
  durasiLabel,
  kelasLabel,
  kelompokLabel,
  laluLabel,
  menitLabel,
  modulLabel,
} from "../labels";
import { namaAsisten } from "../people";

describe("labels", () => {
  it("writes modules, groups and classes out in each language", () => {
    expect(modulLabel(2, "id")).toBe("Modul 2");
    expect(modulLabel(2, "en")).toBe("Module 2");
    expect(modulLabel(2, "zh")).toBe("模块 2");
    expect(kelompokLabel(3, "id")).toBe("Kelompok 3");
    expect(kelompokLabel(3, "en")).toBe("Group 3");
    expect(kelompokLabel(3, "zh")).toBe("第 3 组");
    expect(kelasLabel("internasional", "id")).toBe("Internasional");
    expect(kelasLabel("reguler", "en")).toBe("Regular");
    expect(kelasLabel("internasional", "zh")).toBe("国际班");
  });

  it("writes minutes and durations in full", () => {
    expect(menitLabel(1, "en")).toBe("1 minute");
    expect(menitLabel(150, "id")).toBe("150 menit");
    expect(durasiLabel(125, "id")).toBe("2 jam 5 menit");
    expect(durasiLabel(120, "en")).toBe("2 hours");
    expect(durasiLabel(61, "en")).toBe("1 hour 1 minute");
    expect(durasiLabel(1440 + 180, "id")).toBe("1 hari 3 jam");
    expect(durasiLabel(45, "zh")).toBe("45 分钟");
  });

  it("says how long ago in words", () => {
    expect(laluLabel(12, "id")).toBe("12 detik lalu");
    expect(laluLabel(1, "en")).toBe("1 second ago");
    expect(laluLabel(180, "en")).toBe("3 minutes ago");
    expect(laluLabel(7200, "zh")).toBe("2 小时前");
  });
});

describe("namaAsisten", () => {
  it("writes Full Name (CODE)", () => {
    expect(namaAsisten({ nama: "Desta Saputra", kode: "des" })).toBe("Desta Saputra (DES)");
  });

  it("falls back to the name, then to the given fallback", () => {
    expect(namaAsisten({ nama: "Desta Saputra", kode: null })).toBe("Desta Saputra");
    expect(namaAsisten(undefined, "1101200002")).toBe("1101200002");
    expect(namaAsisten(null)).toBe("?");
  });
});
