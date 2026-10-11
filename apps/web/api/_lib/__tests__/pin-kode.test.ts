import { describe, it, expect } from "vitest";
import { kodeV1, PIN_BAWAAN } from "../kode-aktif";
import { buatTemplat, periksaBerkas, type KodeBerkas } from "../../../src/lib/kode-jurnal";
import {
  angkaPin,
  cekBarisPin,
  gabungPin,
  PIN_KODE,
  terapkanPin,
  type BarisPin,
} from "../../../src/lib/pin-kode";

/** The bundled table with one cell changed */
function dengan(modul: number, r: number, k: number, v: string): BarisPin {
  return PIN_BAWAAN[modul].map((row, i) => row.map((c, j) => (i === r && j === k ? v : c)));
}

/** Every blank's range still holds exactly its answer */
function celahUtuh(b: KodeBerkas) {
  for (const c of b.celah)
    for (const bahasa of ["id", "en"] as const) {
      const p = c.posisi[bahasa];
      if (p) expect(b.sumber[bahasa].slice(p.awal, p.akhir)).toBe(c.jawaban);
    }
}

describe("pin tables and the code", () => {
  it("reads GPIO numbers from pin labels", () => {
    expect(angkaPin("GPIO16")).toBe(16);
    expect(angkaPin("GP26 (ADC0)")).toBe(26);
    expect(angkaPin("3V3")).toBeNull();
    expect(angkaPin("GND")).toBeNull();
  });

  it("every link points at a pin cell the bundled table has", () => {
    for (const [m, links] of Object.entries(PIN_KODE))
      for (const t of links)
        expect(angkaPin(PIN_BAWAAN[Number(m)][t.baris][t.kolom])).not.toBeNull();
  });

  it("the bundled tables pass their own check", () => {
    for (const m of [1, 2, 3, 4]) expect(cekBarisPin(m, PIN_BAWAAN[m], PIN_BAWAAN[m])).toEqual([]);
  });

  it("refuses a linked pin that isn't a GPIO, and a changed shape", () => {
    expect(cekBarisPin(2, PIN_BAWAAN[2], dengan(2, 1, 1, "GND"))).toEqual(["1:1"]);
    expect(cekBarisPin(2, PIN_BAWAAN[2], PIN_BAWAAN[2].slice(1))).toEqual(["bentuk"]);
  });

  it("keeps the bundled names over saved ones", () => {
    const saved = dengan(2, 1, 0, "Something else");
    expect(gabungPin(PIN_BAWAAN[2], saved)[1][0]).toBe(PIN_BAWAAN[2][1][0]);
  });

  it("an unchanged table leaves the code as it is", () => {
    for (const m of [1, 2, 3, 4])
      for (const b of kodeV1(m)) expect(terapkanPin(m, b, PIN_BAWAAN[m], PIN_BAWAAN[m])).toEqual(b);
  });

  it("Modul 2: DHT DATA to GPIO4 rewrites DHT_PIN and its comment, blanks intact", () => {
    const b = kodeV1(2).find((x) => x.slug === "modul2_websocket_esp32")!;
    const out = terapkanPin(2, b, PIN_BAWAAN[2], dengan(2, 1, 1, "GPIO4"));
    for (const bahasa of ["id", "en"] as const) {
      expect(out.sumber[bahasa]).toContain("const int DHT_PIN = 4;");
      expect(out.sumber[bahasa]).not.toContain("DHT_PIN = 16");
      expect(out.sumber[bahasa]).toContain("GPIO4");
      expect(out.sumber[bahasa]).not.toMatch(/\bGPIO16\b/);
    }
    celahUtuh(out);
    expect(periksaBerkas(out).filter((m) => m.berat)).toEqual([]);
    expect(buatTemplat(out, "id").split("________").length).toBe(
      buatTemplat(b, "id").split("________").length,
    );
    // The original is untouched
    expect(b.sumber.id).toContain("DHT_PIN = 16");
  });

  it("Modul 1: both boards follow their own cell", () => {
    const pins = dengan(1, 1, 1, "GPIO21");
    pins[0][3] = "GPIO2";
    const [central, peripheral] = ["modul1_ble_central", "modul1_ble_peripheral"].map((s) =>
      kodeV1(1).find((x) => x.slug === s)!,
    );
    const c = terapkanPin(1, central, PIN_BAWAAN[1], pins);
    const p = terapkanPin(1, peripheral, PIN_BAWAAN[1], pins);
    expect(c.sumber.id).toContain("const int PB_PIN = 21;");
    expect(p.sumber.id).toContain("const int LED_PIN = 2;");
    celahUtuh(c);
    celahUtuh(p);
  });

  it("Modul 3: the ADC pin and its ADC channel in the comment", () => {
    const b = kodeV1(3).find((x) => x.slug === "modul3_mqtt_publish")!;
    const out = terapkanPin(3, b, PIN_BAWAAN[3], dengan(3, 1, 1, "GP27 (ADC1)"));
    expect(out.sumber.id).toContain("pot = ADC(27)");
    expect(out.sumber.id).toContain("GP27 (ADC1)");
    celahUtuh(out);
  });

  it("Modul 4: a radio pin changes in both sketches, swaps don't chain", () => {
    const pins = dengan(4, 0, 1, "GPIO27"); // NSS 15 -> 27
    pins[1][1] = "GPIO15"; // DIO0 27 -> 15
    for (const b of kodeV1(4)) {
      const out = terapkanPin(4, b, PIN_BAWAAN[4], pins);
      expect(out.sumber.id).toMatch(/#define LORA_NSS\s+27\b/);
      expect(out.sumber.id).toMatch(/#define LORA_DIO0\s+15\b/);
      celahUtuh(out);
    }
  });
});
