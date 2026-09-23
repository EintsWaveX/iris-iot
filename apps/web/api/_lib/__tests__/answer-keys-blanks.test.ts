import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseBlanks, soalKode } from "../../../src/lib/blanks";
import { ANSWER_KEYS } from "../answer-keys";

// Stage 16: no existing test ever cross-checked that every blank a real
// sketch carries has a matching ANSWER_KEYS entry (or the reverse) --
// Stage 14's Module 4 rework changed the underlying sketches without any
// automated check that answer-keys.ts still lined up with what they
// actually parse to. This one does, for all four modules and both
// languages.

const SKETCHES_DIR = fileURLToPath(new URL("../../../src/content/sketches/", import.meta.url));
const LANGUAGES = ["id", "en"] as const;

const BERKAS_BY_MODUL: Record<number, string[]> = {
  1: ["modul1_ble_central", "modul1_ble_peripheral"],
  2: ["modul2_websocket_server", "modul2_websocket_esp32"],
  3: ["modul3_mqtt_publish", "modul3_mqtt_subscribe"],
  4: ["modul4_hunter", "modul4_beacon"],
};

function readSketch(bahasa: string, berkas: string): string {
  const ext =
    berkas.startsWith("modul2_websocket_server") || berkas.startsWith("modul3") ? ".py" : ".ino";
  return readFileSync(path.join(SKETCHES_DIR, bahasa, `${berkas}${ext}`), "utf-8");
}

describe("every parsed blank has an answer-key entry, and vice versa", () => {
  for (const [modulStr, berkasList] of Object.entries(BERKAS_BY_MODUL)) {
    const modul = Number(modulStr);
    for (const berkas of berkasList) {
      for (const bahasa of LANGUAGES) {
        it(`m${modul}.${berkas} (${bahasa}): every blank resolves`, () => {
          const source = readSketch(bahasa, berkas);
          const segments = parseBlanks(source);
          const blankNomors = segments
            .filter((s): s is Extract<typeof s, { kind: "blank" }> => s.kind === "blank")
            .map((s) => s.nomor);

          expect(blankNomors.length).toBeGreaterThan(0);
          for (const nomor of blankNomors) {
            const kode = soalKode(modul, berkas, nomor);
            expect(ANSWER_KEYS, `missing ANSWER_KEYS entry for ${kode}`).toHaveProperty(kode);
          }
        });
      }
    }
  }

  it("every ANSWER_KEYS entry matches a real blank in at least one language", () => {
    const foundByKode = new Set<string>();
    for (const [modulStr, berkasList] of Object.entries(BERKAS_BY_MODUL)) {
      const modul = Number(modulStr);
      for (const berkas of berkasList) {
        for (const bahasa of LANGUAGES) {
          const segments = parseBlanks(readSketch(bahasa, berkas));
          for (const seg of segments) {
            if (seg.kind === "blank") foundByKode.add(soalKode(modul, berkas, seg.nomor));
          }
        }
      }
    }
    for (const kode of Object.keys(ANSWER_KEYS)) {
      expect(foundByKode, `ANSWER_KEYS has "${kode}" but no sketch has that blank`).toContain(kode);
    }
  });
});
