import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  isiKunciPapan,
  isiKunciPapanSegments,
  personalize,
  personalizeJaringan,
  personalizeJaringanSegments,
  needsPersonalization,
} from "../group-identity";
import identitas from "../../content/sketches/identitas.json";

// Stage 16: exists because src/content/sketches/'s Module 4 files were once
// allowed to silently drift from the real practicum source -- they still
// carried the shared pre-Stage-14 sync word and no GROUP_ID in the beacon
// at all. These tests fail loudly if a group-identity line personalize()
// expects ever disappears or starts matching more than once.

const SKETCHES_DIR = fileURLToPath(new URL("../../content/sketches/", import.meta.url));
// zh: the Mandarin twin of en, comments only (scripts/sketch_zh.py, 2026-10-09).
const LANGUAGES = ["id", "en", "zh"] as const;
const GROUPS = Array.from({ length: 5 }, (_, i) => i + 1);

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
      const marker =
        bahasa === "id"
          ? "Kelompok 1 memancar"
          : bahasa === "zh"
            ? "第 1 组在每个周期开头发射"
            : "Group 1 transmits";
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
  it("are unique across all five groups (five groups a session)", () => {
    const table = (identitas as Record<string, Record<string, { syncWord?: string }>>)["4"];
    const words = Object.values(table).map((entry) => entry.syncWord);
    expect(new Set(words).size).toBe(words.length);
    expect(words.length).toBe(5);
  });
});

describe("isiKunciPapan() fills HUNT_KEY with the group's board key", () => {
  const BERKAS = ["modul4_hunter", "modul4_beacon"];

  it("puts the key into the one HUNT_KEY line, in every language and both boards", () => {
    for (const bahasa of LANGUAGES) {
      for (const berkas of BERKAS) {
        const source = readSketch(bahasa, berkas);
        const out = isiKunciPapan(berkas, personalize(berkas, source, 3), "K7M2QX9A");
        expect(out).toMatch(/const char\* HUNT_KEY\s*= "K7M2QX9A";/);
        // nothing else changed
        expect(out.split("\n").length).toBe(source.split("\n").length);
      }
    }
  });

  it("leaves the placeholder alone while the hunt has no key yet", () => {
    for (const berkas of BERKAS) {
      const source = readSketch("en", berkas);
      expect(isiKunciPapan(berkas, source, null)).toBe(source);
    }
  });

  it("refuses a key that is not plain letters and digits", () => {
    const source = readSketch("en", "modul4_hunter");
    for (const bad of ['AB"; evil("', "AB CD", "ab", "$&$&$&$&"]) {
      expect(isiKunciPapan("modul4_hunter", source, bad)).toBe(source);
    }
  });

  it("never touches another module's file", () => {
    const source = readSketch("en", "modul1_ble_central");
    expect(isiKunciPapan("modul1_ble_central", source, "K7M2QX9A")).toBe(source);
  });

  it("works over the editor's segments too", () => {
    const segs = [
      { kind: "text" as const, text: 'const char* HUNT_KEY       = "SITE-KEY";\n' },
      { kind: "text" as const, text: "int x;" },
    ];
    const out = isiKunciPapanSegments("modul4_beacon", segs, "ABCD1234");
    expect(out[0]).toMatchObject({ text: 'const char* HUNT_KEY       = "ABCD1234";\n' });
    expect(out[1]).toBe(segs[1]);
  });
});

describe("personalizeJaringan() points the Module 4 sketch at the chosen network", () => {
  const BERKAS = ["modul4_hunter", "modul4_beacon"];

  it("leaves the internet template exactly as it is", () => {
    for (const bahasa of LANGUAGES) {
      for (const berkas of BERKAS) {
        const source = personalize(berkas, readSketch(bahasa, berkas), 3);
        expect(personalizeJaringan(berkas, source, "internet")).toBe(source);
      }
    }
  });

  it("rewrites the five network lines for IRIS_IOT, same line count, every group", () => {
    for (const bahasa of LANGUAGES) {
      for (const berkas of BERKAS) {
        for (const n of GROUPS) {
          const base = personalize(berkas, readSketch(bahasa, berkas), n);
          const out = personalizeJaringan(berkas, base, "iris_iot");
          expect(out).toMatch(/const char\* WIFI_SSID\s+= "IRIS_IOT";/);
          expect(out).toMatch(/const char\* SERVER_HOST\s+= "192\.168\.4\.1";/);
          expect(out).toMatch(/const uint16_t SERVER_PORT = 8080;/);
          expect(out).toMatch(/const char\* NTP_SERVER\s+= "192\.168\.4\.1";/);
          expect(out).toContain("webSocket.begin(");
          expect(out).not.toContain("beginSSL");
          expect(out).not.toContain("hunt.irisiotlab.com");
          expect(out).not.toContain("time.cloudflare.com");
          expect(out).not.toMatch(/IRIS-G\d/);
          expect(out.split("\n").length).toBe(base.split("\n").length);
        }
      }
    }
  });

  it("keeps the group's own identity and the board key when both are applied", () => {
    for (const berkas of BERKAS) {
      const base = personalize(berkas, readSketch("en", berkas), 4);
      const out = isiKunciPapan(berkas, personalizeJaringan(berkas, base, "iris_iot"), "K7M2QX9A");
      expect(out).toContain("#define GROUP_ID 4");
      expect(out).toMatch(/const char\* HUNT_KEY\s*= "K7M2QX9A";/);
    }
  });

  it("works over the editor's segments the same way", () => {
    for (const berkas of BERKAS) {
      const text = personalize(berkas, readSketch("id", berkas), 2);
      const segs = [{ kind: "text" as const, text }];
      const out = personalizeJaringanSegments(berkas, segs, "iris_iot");
      expect(out[0]).toMatchObject({ text: personalizeJaringan(berkas, text, "iris_iot") });
      expect(personalizeJaringanSegments(berkas, segs, "internet")).toBe(segs);
    }
  });

  it("says Wi-Fi, not phone hotspot, in the comments and serial text", () => {
    for (const [bahasa, berkas, nenek] of [
      ["en", "modul4_hunter", "Connecting to the IRIS_IOT Wi-Fi"],
      ["id", "modul4_beacon", "Menyambung ke Wi-Fi IRIS_IOT"],
    ] as const) {
      const out = personalizeJaringan(
        berkas,
        personalize(berkas, readSketch(bahasa, berkas), 1),
        "iris_iot",
      );
      expect(out).toContain(nenek);
    }
  });

  it("throws if a line it must change is missing, instead of shipping the wrong network", () => {
    const rusak = readSketch("en", "modul4_hunter").replace(
      /webSocket\.beginSSL\(/g,
      "ws.beginSSL(",
    );
    expect(() => personalizeJaringan("modul4_hunter", rusak, "iris_iot")).toThrow(
      /expected exactly 1/,
    );
  });

  it("does nothing to another module's file", () => {
    const source = readSketch("en", "modul1_ble_central");
    expect(personalizeJaringan("modul1_ble_central", source, "iris_iot")).toBe(source);
  });
});

describe("src/content/sketches directory has no extra languages", () => {
  it("only id/, en/ and zh/ exist", () => {
    const dirs = readdirSync(SKETCHES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(dirs).toEqual([...LANGUAGES].sort());
  });
});
