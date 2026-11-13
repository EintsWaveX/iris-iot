import { describe, expect, it } from "vitest";
import { BOARDS } from "../serial-lines";
import { literalC, uploadFile, validateUploadValues, type UploadValues } from "../live-build";

const ok: UploadValues = { ssid: "EintsWaveX", password: "Secret123", group: 4, key: "C39AVC44" };

describe("uploadFile", () => {
  it("names a file for every board slot of every module, and none for a role a module has not got", () => {
    for (const [modul, slots] of Object.entries(BOARDS))
      for (const s of slots) expect(uploadFile(Number(modul), s.role)).not.toBeNull();
    expect(uploadFile(1, "hunter")).toBeNull();
    expect(uploadFile(9, "central")).toBeNull();
  });

  it("knows which module's file takes Wi-Fi and which the board key", () => {
    expect(uploadFile(1, "central")).toMatchObject({ wifi: false, key: false, kind: "esp32" });
    expect(uploadFile(2, "esp32")).toMatchObject({ wifi: true, key: false, kind: "esp32" });
    expect(uploadFile(3, "publisher")).toMatchObject({
      wifi: true,
      kind: "pico",
      path: "modul3_mqtt_publish.py",
    });
    expect(uploadFile(4, "beacon")).toMatchObject({ wifi: true, key: true, slug: "modul4_beacon" });
  });
});

describe("validateUploadValues", () => {
  it("accepts good values and normalises the key to capitals", () => {
    const r = validateUploadValues(4, "hunter", { ...ok, key: " c39avc44 " });
    expect(r).toMatchObject({ ok: true, v: { ssid: "EintsWaveX", group: 4, key: "C39AVC44" } });
  });

  it.each([
    [{ ssid: "" }, "ssid", "ssid_kosong"],
    [{ ssid: "x".repeat(33) }, "ssid", "ssid_panjang"],
    [{ ssid: "café" }, "ssid", "ssid_karakter"],
    [{ ssid: "line\nbreak" }, "ssid", "ssid_karakter"],
    [{ password: "short" }, "password", "sandi_pendek"],
    [{ password: "p".repeat(64) }, "password", "sandi_panjang"],
    [{ password: "tab\there123" }, "password", "sandi_karakter"],
    [{ group: 0 }, "group", "grup_salah"],
    [{ group: 11 }, "group", "grup_salah"],
    [{ group: 1.5 }, "group", "grup_salah"],
    [{ key: "abc" }, "key", "kunci_salah"],
    [{ key: "ABCD123!" }, "key", "kunci_salah"],
  ] as [Partial<UploadValues>, string, string][])("refuses %j", (over, field, kode) => {
    expect(validateUploadValues(4, "hunter", { ...ok, ...over })).toEqual({
      ok: false,
      field,
      kode,
    });
  });

  it("allows an open network (no password) and a missing board key", () => {
    expect(validateUploadValues(4, "hunter", { ...ok, password: "", key: "" })).toMatchObject({
      ok: true,
    });
  });

  it("asks nothing of Wi-Fi from a module whose file has none, and nothing of the key outside Module 4", () => {
    expect(validateUploadValues(1, "central", { ssid: "", password: "", group: 2 })).toMatchObject({
      ok: true,
      v: { group: 2, ssid: "", key: "" },
    });
    expect(validateUploadValues(2, "esp32", { ...ok, key: "not checked here" })).toMatchObject({
      ok: true,
      v: { key: "" },
    });
  });

  it("refuses an unknown role", () => {
    expect(validateUploadValues(1, "hunter", ok)).toEqual({
      ok: false,
      field: "role",
      kode: "peran_salah",
    });
  });
});

describe("literalC", () => {
  it("writes every character as a three digit octal escape, so no value can change the code", () => {
    expect(literalC("A")).toBe('"\\101"');
    expect(literalC("")).toBe('""');
    const hostile = 'x"; system("x"); //\\ #include <a> ??/ %: asm incbin R"(';
    const lit = literalC(hostile);
    expect(lit).toMatch(/^"(\\[0-7]{3})+"$/);
    expect(lit).not.toMatch(/[#?%]|include|asm|incbin/);
    // Reading the escapes back gives the original text
    const back = lit
      .slice(1, -1)
      .split("\\")
      .slice(1)
      .map((o) => String.fromCharCode(parseInt(o, 8)))
      .join("");
    expect(back).toBe(hostile);
  });
});
