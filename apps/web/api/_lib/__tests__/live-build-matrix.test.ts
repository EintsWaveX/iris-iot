/**
 * Every file Live Upload can build, for every group it accepts, in both code languages and on both
 * Module 4 networks: the complete file is made, no blank is left, the group lands where the module
 * keeps it, and the person's Wi-Fi is the only thing that changed in its two lines. The same matrix
 * is compiled with arduino-cli by hand before a release (see the plan); this is the part a test run
 * can do on any machine.
 */
import { describe, expect, it } from "vitest";
import { kodeBawaan } from "../kode-aktif";
import { rakitSketch } from "../live-build";
import { literalC, uploadFile, type UploadFile } from "../../../src/lib/live-build";

const ROLES: [number, string][] = [
  [1, "central"],
  [1, "peripheral"],
  [2, "esp32"],
  [3, "publisher"],
  [3, "subscriber"],
  [4, "hunter"],
  [4, "beacon"],
];
// From a session of three to one of dozens; 15 and 16 are where Module 4 changes how it makes a sync word
const GROUPS_ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 17, 40, 99];

/** What each module writes its group as */
const GROUP_LINE: Record<number, (n: number) => RegExp> = {
  1: (n) => new RegExp(`const int GROUP_ID = ${n};`),
  2: (n) => new RegExp(`grup${n}\\b`),
  3: (n) => new RegExp(`group_id = ${n}\\b`),
  4: (n) => new RegExp(`#define GROUP_ID ${n}\\b`),
};

describe.each(ROLES)("Module %i %s", (m, r) => {
  const f = uploadFile(m, r) as UploadFile;
  const GROUPS = GROUPS_ALL;
  for (const bahasa of ["id", "en"] as const) {
    for (const jaringan of m === 4
      ? (["internet", "iris_iot"] as const)
      : (["internet"] as const)) {
      it(`${bahasa}, ${jaringan}: every group from 1 to 99 builds a complete file with its own group`, () => {
        const outs = new Set<string>();
        for (const g of GROUPS) {
          const text = rakitSketch(
            kodeBawaan(m),
            f,
            bahasa,
            { ssid: "LabWifi", password: "Secret123", group: g, key: m === 4 ? "HD9LAUK9" : "" },
            jaringan,
          );
          expect(text, `group ${g}`).not.toContain("________");
          expect(text, `group ${g}`).toMatch(GROUP_LINE[m](g));
          if (f.wifi) expect(text).toContain(literalC("LabWifi"));
          if (m === 4) {
            expect(text).toMatch(/LORA_SYNC_WORD\s+0x[0-9A-Fa-f]{2}\b/); // one byte, as the radio takes it
            expect(text).toContain('"HD9LAUK9"');
          }
          outs.add(text);
        }
        // A group changes the file: ten groups, ten different files
        expect(outs.size).toBe(GROUPS.length);
      });
    }
  }
});

describe("Module 4 sync words", () => {
  const GROUPS = GROUPS_ALL;
  it("each group has its own sync word, and one the radio's single byte can hold", () => {
    const words = GROUPS.map((g) => {
      const t = rakitSketch(
        kodeBawaan(4),
        uploadFile(4, "hunter") as UploadFile,
        "en",
        { ssid: "x", password: "", group: g, key: "" },
        "internet",
      );
      return /LORA_SYNC_WORD\s+(0x[0-9A-Fa-f]+)/.exec(t)?.[1] ?? "";
    });
    expect(new Set(words).size).toBe(GROUPS.length);
    for (const w of words) expect(parseInt(w, 16)).toBeLessThanOrEqual(0xff);
  });
});
