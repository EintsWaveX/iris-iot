import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSerialLine } from "../../../src/lib/serial-lines";
import { blokBeaconBersama, pasangBeaconBersama, type TambahanBeacon } from "../beacon-bersama";

const BAHASA = ["id", "en", "zh"] as const;
const sketsa = (b: string) =>
  readFileSync(
    new URL(`../../../src/content/sketches/${b}/modul4_beacon.ino`, import.meta.url),
    "utf8",
  );

const T: TambahanBeacon[] = [
  { grup: 1, sync: "0xF1", kunci: "AAAAAAAA" },
  { grup: 5, sync: "0xF5", kunci: "BBBBBBBB" },
];

describe("pasangBeaconBersama", () => {
  it.each(BAHASA)("returns the %s sketch unchanged for no extra groups", (b) => {
    expect(pasangBeaconBersama(sketsa(b), [])).toBe(sketsa(b));
  });

  it.each(BAHASA)(
    "changes only the hook line of the %s sketch and keeps its line count before the block",
    (b) => {
      const asli = sketsa(b);
      const baru = pasangBeaconBersama(asli, T);
      const blok = blokBeaconBersama(T);
      expect(baru.endsWith(blok)).toBe(true);
      const depan = baru.slice(0, baru.length - blok.length);
      const a = asli.split("\n");
      const d = depan.split("\n");
      expect(d.length).toBe(a.length);
      const beda = a.map((x, i) => (x === d[i] ? -1 : i)).filter((i) => i >= 0);
      expect(beda.length).toBe(1);
      expect(d[beda[0]]).toContain("webSocket.loop(); void irisSharedLoop(); irisSharedLoop();");
    },
  );

  it("throws when the hook line is missing or appears twice", () => {
    expect(() => pasangBeaconBersama("void loop() {}\n", T)).toThrow(/matched 0 times/);
    expect(() =>
      pasangBeaconBersama("void loop() {\n  webSocket.loop();\n  webSocket.loop();\n}\n", T),
    ).toThrow(/matched 2 times/);
  });
});

describe("blokBeaconBersama", () => {
  const blok = blokBeaconBersama(T);

  it("lists the groups, sync words and keys in order", () => {
    expect(blok).toContain("const int irisSharedN = 2;");
    expect(blok).toContain("irisSharedGroup[] = {1, 5};");
    expect(blok).toContain("irisSharedSync[] = {0xF1, 0xF5};");
    expect(blok).toContain('irisSharedKey[] = {"AAAAAAAA", "BBBBBBBB"};');
  });

  it("restores the primary sync word after each extra packet and keeps one counter per group", () => {
    expect(blok.indexOf("LoRa.setSyncWord(irisSharedSync[i])")).toBeLessThan(
      blok.indexOf("LoRa.endPacket()"),
    );
    expect(blok.indexOf("LoRa.endPacket()")).toBeLessThan(
      blok.indexOf("LoRa.setSyncWord(LORA_SYNC_WORD)"),
    );
    expect(blok).toContain("irisSharedSeq[irisSharedN]");
  });

  it("uses none of the names the rewrites of the sketch look for", () => {
    for (const w of [
      "#define",
      "HUNT_KEY",
      "WIFI_SSID",
      "WIFI_PASSWORD",
      "webSocket.begin",
      "GROUP_ID",
    ]) {
      expect(blok).not.toContain(w);
    }
  });

  it("prints a line the Live room's parser takes for nothing, while the primary's line still parses", () => {
    expect(parseSerialLine(4, "[12:00:00:000] Shared beacon: group 5 packet #3")).toBeNull();
    expect(parseSerialLine(4, "[12:00:00:000] Memancar paket #3 (kelompok 1)")?.k).toBe("send");
  });

  it("every name it adds starts with irisShared", () => {
    const defs = [
      ...blok.matchAll(
        /^(?:static\s+)?(?:const\s+)?(?:void|int|int64_t|uint32_t|bool|uint8_t|char\*?)\s+(?:const\s+)?(\w+)/gm,
      ),
    ].map((x) => x[1]);
    expect(defs.length).toBeGreaterThan(5);
    for (const d of defs) expect(d).toMatch(/^irisShared/);
  });

  it("refuses a bad group, sync word, key or a repeated group", () => {
    const ok = T[0];
    expect(() => blokBeaconBersama([{ ...ok, grup: 0 }])).toThrow();
    expect(() => blokBeaconBersama([{ ...ok, sync: "F1" }])).toThrow();
    expect(() => blokBeaconBersama([{ ...ok, kunci: "short" }])).toThrow();
    expect(() => blokBeaconBersama([ok, ok])).toThrow(/twice/);
  });
});
