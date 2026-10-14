import { describe, expect, it } from "vitest";
import {
  divisiLabel,
  durasiLabel,
  kelasLabel,
  kelompokLabel,
  klpLabel,
  nomorKlp,
  laluLabel,
  menitLabel,
  detikLabel,
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
    expect(detikLabel(1, "en")).toBe("1 second");
    expect(detikLabel(58, "en")).toBe("58 seconds");
    expect(detikLabel(58, "id")).toBe("58 detik");
    expect(detikLabel(58, "zh")).toBe("58 秒");
    expect(durasiLabel(125, "id")).toBe("2 jam 5 menit");
    expect(durasiLabel(120, "en")).toBe("2 hours");
    expect(durasiLabel(61, "en")).toBe("1 hour 1 minute");
    expect(durasiLabel(1440 + 180, "id")).toBe("1 hari 3 jam");
    expect(durasiLabel(45, "zh")).toBe("45 分钟");
  });

  it("says how long ago as days (HH:MM:SS), past 30 days in words", () => {
    expect(laluLabel(12, "id")).toBe("00:00:12 lalu");
    expect(laluLabel(1, "en")).toBe("00:00:01 ago");
    expect(laluLabel(180, "en")).toBe("00:03:00 ago");
    expect(laluLabel(7200, "zh")).toBe("02:00:00 前");
    expect(laluLabel(2 * 86400 + 3 * 3600 + 14 * 60 + 7, "id")).toBe("2 hari (03:14:07) lalu");
    expect(laluLabel(86400 + 59.9, "en")).toBe("1 day (00:00:59) ago");
    expect(laluLabel(5 * 86400 + 1, "zh")).toBe("5 天（00:00:01）前");
    expect(laluLabel(30 * 86400, "en")).toBe("30 days (00:00:00) ago");
    expect(laluLabel(30 * 86400 + 1, "id")).toBe("lebih dari 30 hari lalu");
    expect(laluLabel(90 * 86400, "en")).toBe("more than 30 days ago");
    expect(laluLabel(40 * 86400, "zh")).toBe("超过 30 天前");
    expect(laluLabel(-5, "id")).toBe("00:00:00 lalu");
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

describe("divisiLabel", () => {
  const anggota = { id: "Anggota Divisi ASO", en: "Member of ASO Division" };
  it("keeps the stored Indonesian and English names", () => {
    expect(divisiLabel(anggota, "id")).toBe("Anggota Divisi ASO");
    expect(divisiLabel(anggota, "en")).toBe("Member of ASO Division");
  });
  it("builds the Mandarin name from the English one", () => {
    expect(divisiLabel(anggota, "zh")).toBe("ASO 部成员");
    expect(divisiLabel({ id: "Kepala Divisi ARM", en: "Chief of ARM Division" }, "zh")).toBe(
      "ARM 部部长",
    );
    expect(divisiLabel({ id: "Bendahara", en: "Treasurer" }, "zh")).toBe("财务");
  });
  it("falls back to English for a name it does not know", () => {
    expect(divisiLabel({ id: "Lainnya", en: "Something Else" }, "zh")).toBe("Something Else");
  });
});

describe("klpLabel and nomorKlp", () => {
  it("names a group's SeeLabs KLP", () => {
    expect(klpLabel("6")).toBe("KLP 6");
    expect(klpLabel("KLP-07")).toBe("KLP 07");
    expect(klpLabel(" klp 12 ")).toBe("KLP 12");
    expect(klpLabel(null)).toBeNull();
    expect(klpLabel("")).toBeNull();
  });
  it("adds it to a group number when known", () => {
    expect(nomorKlp(1, "6")).toBe("1 (KLP 6)");
    expect(nomorKlp(2, null)).toBe("2");
  });
});
