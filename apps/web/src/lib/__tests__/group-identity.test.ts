import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { personalize, needsPersonalization } from "../group-identity";
import identitas from "../../content/sketches/identitas.json";

// Stage 16: exists because src/content/sketches/'s Module 4 files were once
// allowed to silently drift from the real practicum source -- they still
// carried the shared pre-Stage-14 sync word and no GROUP_ID in the beacon
// at all. These tests fail loudly if a group-identity line personalize()
// expects ever disappears or starts matching more than once.

const SKETCHES_DIR = fileURLToPath(new URL("../../content/sketches/", import.meta.url));
const LANGUAGES = ["id", "en"] as const;
const GROUPS = [1, 2, 3, 4, 5];

function readSketch(bahasa: string, berkas: string): string {
  const ext =
    berkas.startsWith("modul2_websocket_server") || berkas.startsWith("modul3") ? ".py" : ".ino";
  return readFileSync(path.join(SKETCHES_DIR, bahasa, `${berkas}${ext}`), "utf-8");
}

describe("personalize()", () => {
  it("Module 1 rewrites GROUP_ID for every group, both languages, both files", () => {
    for (const bahasa of LANGUAGES) {
      for (const berkas of ["modul1_ble_central", "modul1_ble_peripheral"]) {
        const source = readSketch(bahasa, berkas);
        for (const n of GROUPS) {
          const out = personalize(berkas, source, n);
          expect(out).toContain(`const int GROUP_ID = ${n};`);
        }
      }
    }
  });

  it("Module 3 rewrites group_id for every group, both languages, both files", () => {
    for (const bahasa of LANGUAGES) {
      for (const berkas of ["modul3_mqtt_publish", "modul3_mqtt_subscribe"]) {
        const source = readSketch(bahasa, berkas);
        for (const n of GROUPS) {
          const out = personalize(berkas, source, n);
          expect(out).toContain(`group_id = ${n}`);
        }
      }
    }
  });

  it("Module 4 rewrites GROUP_ID and LORA_SYNC_WORD for every group, both languages, both files", () => {
    const syncWords = (identitas as Record<string, Record<string, { syncWord?: string }>>)["4"];
    for (const bahasa of LANGUAGES) {
      for (const berkas of ["modul4_hunter", "modul4_beacon"]) {
        const source = readSketch(bahasa, berkas);
        for (const n of GROUPS) {
          const out = personalize(berkas, source, n);
          expect(out).toContain(`#define GROUP_ID ${n}`);
          expect(out).toContain(syncWords[String(n)].syncWord);
        }
      }
    }
  });

  it("also rewrites the header docblock's own group label, not just the #define lines", () => {
    // A real, independent bug: personalize() once rewrote GROUP_ID and
    // LORA_SYNC_WORD correctly but left "Peran: HUNTER (Kelompok 1)" /
    // "Role: HUNTER (Group 1)" untouched in the header comment -- found by
    // staging an actual reconstructed download and reading it, not by
    // trusting the #define assertions above alone.
    for (const n of GROUPS) {
      const hunterId = personalize("modul4_hunter", readSketch("id", "modul4_hunter"), n);
      expect(hunterId).toContain(`Peran: HUNTER (Kelompok ${n})`);
      const hunterEn = personalize("modul4_hunter", readSketch("en", "modul4_hunter"), n);
      expect(hunterEn).toContain(`Role: HUNTER (Group ${n})`);

      const beaconId = personalize("modul4_beacon", readSketch("id", "modul4_beacon"), n);
      expect(beaconId).toContain(`Peran: BEACON (Kelompok ${n},`);
      const beaconEn = personalize("modul4_beacon", readSketch("en", "modul4_beacon"), n);
      expect(beaconEn).toContain(`Role: BEACON (Group ${n},`);
    }
  });

  it("never touches the TDMA explanation's own illustrative 'group 1, group 2' text", () => {
    // beacon.ino explains the TDMA slot scheme using "Kelompok 1 memancar...
    // kelompok 2..." / "Group 1 transmits... group 2..." as a generic
    // example -- this stays identical in every group's own file on purpose,
    // and must not be mistaken for that group's own identity.
    for (const bahasa of LANGUAGES) {
      const source = readSketch(bahasa, "modul4_beacon");
      const marker = bahasa === "id" ? "Kelompok 1 memancar" : "Group 1 transmits";
      for (const n of GROUPS) {
        const out = personalize("modul4_beacon", source, n);
        expect(out).toContain(marker);
      }
    }
  });

  it("Module 2 needs no personalization (its per-group value is a graded blank)", () => {
    expect(needsPersonalization("modul2_websocket_server")).toBe(false);
    expect(needsPersonalization("modul2_websocket_esp32")).toBe(false);
  });

  it("throws rather than silently doing nothing on an unexpected source", () => {
    expect(() => personalize("modul1_ble_central", "no identity line here", 3)).toThrow();
  });
});

describe("Module 4 sync words", () => {
  it("are unique across all five groups", () => {
    const table = (identitas as Record<string, Record<string, { syncWord?: string }>>)["4"];
    const words = Object.values(table).map((entry) => entry.syncWord);
    expect(new Set(words).size).toBe(words.length);
    expect(words.length).toBe(5);
  });
});

describe("src/content/sketches directory has no extra languages", () => {
  it("only id/ and en/ exist", () => {
    const dirs = readdirSync(SKETCHES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(dirs).toEqual([...LANGUAGES].sort());
  });
});
