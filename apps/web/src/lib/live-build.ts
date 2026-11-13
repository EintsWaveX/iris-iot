/**
 * Live Upload, the parts the browser and the API share (2026-11-13): which file
 * each board slot of a module runs, which values it takes, and the one place
 * those values are checked.
 *
 * A Praktikan types a Wi-Fi name, password and group (Module 4 also the group's
 * board key); the API fills them into the module's complete sketch and has the
 * PC build it. Values only ever reach a sketch through `literalC()` below,
 * which writes every character as an octal escape, so nothing a person types
 * can change the code around it (a quote, a backslash, `#include`, a trigraph),
 * and the build's source checks never see a word of it.
 */

/** The board slots of the four modules (the same names serial-lines.ts uses) */
export type UploadRole =
  "central" | "peripheral" | "esp32" | "publisher" | "subscriber" | "hunter" | "beacon";

export type UploadKind = "esp32" | "pico";

export interface UploadFile {
  modul: number;
  role: UploadRole;
  /** The module's file, as the Code step names it */
  path: string;
  /** The file's name without its extension (what the code API calls a slug) */
  slug: string;
  kind: UploadKind;
  /** The file has a Wi-Fi name and password to set */
  wifi: boolean;
  /** The file carries the group's board key (Module 4) */
  key: boolean;
}

const FILES: UploadFile[] = [
  {
    modul: 1,
    role: "central",
    path: "modul1_ble_central.ino",
    slug: "modul1_ble_central",
    kind: "esp32",
    wifi: false,
    key: false,
  },
  {
    modul: 1,
    role: "peripheral",
    path: "modul1_ble_peripheral.ino",
    slug: "modul1_ble_peripheral",
    kind: "esp32",
    wifi: false,
    key: false,
  },
  {
    modul: 2,
    role: "esp32",
    path: "modul2_websocket_esp32.ino",
    slug: "modul2_websocket_esp32",
    kind: "esp32",
    wifi: true,
    key: false,
  },
  {
    modul: 3,
    role: "publisher",
    path: "modul3_mqtt_publish.py",
    slug: "modul3_mqtt_publish",
    kind: "pico",
    wifi: true,
    key: false,
  },
  {
    modul: 3,
    role: "subscriber",
    path: "modul3_mqtt_subscribe.py",
    slug: "modul3_mqtt_subscribe",
    kind: "pico",
    wifi: true,
    key: false,
  },
  {
    modul: 4,
    role: "hunter",
    path: "modul4_hunter.ino",
    slug: "modul4_hunter",
    kind: "esp32",
    wifi: true,
    key: true,
  },
  {
    modul: 4,
    role: "beacon",
    path: "modul4_beacon.ino",
    slug: "modul4_beacon",
    kind: "esp32",
    wifi: true,
    key: true,
  },
];

/** The file a module's board slot runs, or null for a role the module has not got */
export function uploadFile(modul: number, role: string): UploadFile | null {
  return FILES.find((f) => f.modul === modul && f.role === role) ?? null;
}

/** What the browser sends and the API checks */
export interface UploadValues {
  ssid: string;
  password: string;
  group: number;
  /** Module 4's board key; empty keeps the sketch's own placeholder */
  key?: string;
}

export const SSID_MAX = 32;
export const SANDI_MIN = 8;
export const SANDI_MAX = 63;
export const GRUP_MAKS = 10;
export const KUNCI_RE = /^[A-Z0-9]{8}$/;

export type UploadField = "ssid" | "password" | "group" | "key" | "role";
export type UploadKode =
  | "ssid_kosong"
  | "ssid_panjang"
  | "ssid_karakter"
  | "sandi_pendek"
  | "sandi_panjang"
  | "sandi_karakter"
  | "grup_salah"
  | "kunci_salah"
  | "peran_salah";

export type UploadCheck =
  | { ok: true; file: UploadFile; v: Required<UploadValues> }
  | { ok: false; field: UploadField; kode: UploadKode };

/** Printable ASCII only: a Wi-Fi name or password outside it is not something these boards take */
const PRINTABLE = /^[\x20-\x7e]*$/;

export function validateUploadValues(modul: number, role: string, v: UploadValues): UploadCheck {
  const file = uploadFile(modul, role);
  if (!file) return { ok: false, field: "role", kode: "peran_salah" };
  const group = Number(v.group);
  if (!Number.isInteger(group) || group < 1 || group > GRUP_MAKS)
    return { ok: false, field: "group", kode: "grup_salah" };

  let ssid = "";
  let password = "";
  if (file.wifi) {
    ssid = typeof v.ssid === "string" ? v.ssid : "";
    password = typeof v.password === "string" ? v.password : "";
    if (!ssid.length) return { ok: false, field: "ssid", kode: "ssid_kosong" };
    if (ssid.length > SSID_MAX) return { ok: false, field: "ssid", kode: "ssid_panjang" };
    if (!PRINTABLE.test(ssid)) return { ok: false, field: "ssid", kode: "ssid_karakter" };
    // An open network has no password; anything typed must be a real WPA one.
    if (password.length && password.length < SANDI_MIN)
      return { ok: false, field: "password", kode: "sandi_pendek" };
    if (password.length > SANDI_MAX) return { ok: false, field: "password", kode: "sandi_panjang" };
    if (!PRINTABLE.test(password)) return { ok: false, field: "password", kode: "sandi_karakter" };
  }

  let key = "";
  if (file.key) {
    key = typeof v.key === "string" ? v.key.trim().toUpperCase() : "";
    if (key.length && !KUNCI_RE.test(key)) return { ok: false, field: "key", kode: "kunci_salah" };
  }
  return { ok: true, file, v: { ssid, password, group, key } };
}

/** A string literal for a C (or MicroPython) source file in which every character is an octal escape */
export function literalC(s: string): string {
  let out = '"';
  for (const ch of s) out += "\\" + ch.charCodeAt(0).toString(8).padStart(3, "0");
  return out + '"';
}
