import { describe, expect, it } from "vitest";
import { bahasaKonten, isLang, langOfPath, langTag, pathForLang } from "../kelas";
import { dict, href, localeOf } from "../app";

describe("Mandarin as the third interface language", () => {
  it("accepts zh as a language and nothing else new", () => {
    expect(isLang("zh")).toBe(true);
    expect(isLang("zh-Hans")).toBe(false);
    expect(isLang("cn")).toBe(false);
  });

  it("maps a path between all three languages, keeping query and hash", () => {
    expect(pathForLang("/modules/2/live?x=1#a", "zh")).toBe("/zh/modules/2/live?x=1#a");
    expect(pathForLang("/en/modules/2/live?x=1#a", "zh")).toBe("/zh/modules/2/live?x=1#a");
    expect(pathForLang("/zh/modules/2/live", "en")).toBe("/en/modules/2/live");
    expect(pathForLang("/zh/modules/2/live", "id")).toBe("/modules/2/live");
    expect(pathForLang("/zh", "id")).toBe("/");
    expect(pathForLang("/zh/", "en")).toBe("/en/");
    expect(pathForLang("/", "zh")).toBe("/zh/");
  });

  it("does not mistake a path that only starts with the letters for a prefix", () => {
    expect(pathForLang("/zhang", "en")).toBe("/en/zhang");
    expect(langOfPath("/zhang")).toBe("id");
    expect(langOfPath("/english")).toBe("id");
  });

  it("reads the language from a path", () => {
    expect(langOfPath("/zh/servers")).toBe("zh");
    expect(langOfPath("/zh")).toBe("zh");
    expect(langOfPath("/en/")).toBe("en");
    expect(langOfPath("/servers")).toBe("id");
  });

  it("prefixes links for the page language", () => {
    expect(href("zh", "/servers")).toBe("/zh/servers");
    expect(href("zh", "/")).toBe("/zh/");
    expect(href("id", "/servers")).toBe("/servers");
  });

  it("serves the English handbook and journals to Mandarin readers", () => {
    expect(bahasaKonten("zh")).toBe("en");
    expect(bahasaKonten("en")).toBe("en");
    expect(bahasaKonten("id")).toBe("id");
  });

  it("tags the page and formats dates for Mandarin", () => {
    expect(langTag("zh")).toBe("zh-Hans");
    expect(localeOf("zh")).toBe("zh-CN");
    expect(localeOf("en")).toBe("en-GB");
    expect(localeOf("id")).toBe("id-ID");
  });

  it("falls back to English until a table has its Mandarin half", () => {
    const T = dict({ id: { a: "Simpan" }, en: { a: "Save" } });
    expect(T.zh.a).toBe("Save");
    const U = dict({ id: { a: "Simpan" }, en: { a: "Save" }, zh: { a: "保存" } });
    expect(U.zh.a).toBe("保存");
  });
});
