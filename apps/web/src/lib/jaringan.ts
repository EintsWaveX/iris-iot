/**
 * The network Module 4's hunt runs on (2026-11-11). The lab picks one on the
 * Server page; the choice rides to the pages (Hunt step, Code step, sketch
 * download) and to the PC (heartbeat reply -> /var/lib/iris-agent/bagi/
 * jaringan-hunt.env -> modul4.service).
 *
 *   iris_iot : the PC makes the Wi-Fi IRIS_IOT; Beacon, Hunter and phones join
 *              it; the scoreboard is http://192.168.4.1:8080; the PC is the
 *              time server; no internet is needed (the default).
 *   internet : each group's phone makes the hotspot IRIS-G<n>; the boards use
 *              the scoreboard at hunt.irisiotlab.com through the Cloudflare
 *              Tunnel and time.cloudflare.com; phones keep their mobile data.
 *
 * Pure (no database), so the browser can import it too; the stored value is
 * read and written in jaringan-hunt.ts.
 */

export const JARINGAN = ["internet", "iris_iot"] as const;
export type Jaringan = (typeof JARINGAN)[number];

/** What a fresh install does until the lab picks. */
export const JARINGAN_BAWAAN: Jaringan = "iris_iot";

export function jaringanValid(value: unknown): value is Jaringan {
  return typeof value === "string" && (JARINGAN as readonly string[]).includes(value);
}

/** The stored `pengaturan` value ({ jaringan }), or the default for anything
 *  else (no row yet, an older shape). */
export function bacaJaringan(raw: unknown): Jaringan {
  const v =
    typeof raw === "object" && raw !== null ? (raw as { jaringan?: unknown }).jaringan : raw;
  return jaringanValid(v) ? v : JARINGAN_BAWAAN;
}

/** The IRIS_IOT network: the PC's own address on its hotspot, the scoreboard
 *  port, and the Wi-Fi name. The password is the practicum's shared one,
 *  printed in the sketches (hotspotKelompok in perburuan.ts holds the same). */
export const ALAMAT_IRIS_IOT = "192.168.4.1";
export const PORT_IRIS_IOT = 8080;
export const SSID_IRIS_IOT = "IRIS_IOT";
