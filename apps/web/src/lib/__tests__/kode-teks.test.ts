import { describe, it, expect } from "vitest";
import { pecahKode } from "../kode-teks";

const kode = (s: string) =>
  pecahKode(s)
    .filter((p) => p.kode)
    .map((p) => p.teks);

describe("code inside a sentence", () => {
  it("finds the calls and constants in a hint, not the words around them", () => {
    expect(
      kode(
        "getService() mencari layanan lewat UUID-nya. Cari konstanta UUID layanan yang disusun dari GROUP_ID di bagian atas berkas.",
      ),
    ).toEqual(["getService()", "GROUP_ID"]);
  });

  it("keeps the text whole when put back together", () => {
    const s = "Lihat dua #include di atasnya: BLE lalu nama kelasnya, diakhiri .h. Pakai `INPUT`.";
    expect(
      pecahKode(s)
        .map((p) => p.teks)
        .join(""),
    ).toBe(s.replace(/`/g, ""));
  });

  it("reads each kind of code", () => {
    expect(kode("Baris di atasnya memakai dht.readHumidity() lalu LoRa.beginPacket().")).toEqual([
      "dht.readHumidity()",
      "LoRa.beginPacket()",
    ]);
    expect(kode("Buka modul2_websocket_esp32.ino dan cari WS_PORT.")).toEqual([
      "modul2_websocket_esp32.ino",
      "WS_PORT",
    ]);
    expect(kode("Fungsi bawaan, pasangan digitalWrite untuk membaca.")).toEqual(["digitalWrite"]);
    expect(kode("Kelas BLEScan dan MQTTClient, nilainya 0xF3, tanpa _PULLUP, pin HIGH.")).toEqual([
      "BLEScan",
      "MQTTClient",
      "0xF3",
      "_PULLUP",
      "HIGH",
    ]);
    expect(kode("Diimpor dari umqtt.simple. Tulis `state` saja.")).toEqual([
      "umqtt.simple",
      "state",
    ]);
  });

  it("leaves words, names, units and numbers alone", () => {
    expect(
      kode(
        "Header pustaka LoRa dari WiFi BLE ESP32 UUID, 10 dBm, versi 3.3, e.g. LoRaWAN, dan ________.",
      ),
    ).toEqual([]);
    expect(kode("上面两行 #include：BLE 加类名，以 .h 结尾。")).toEqual(["#include", ".h"]);
  });
});
