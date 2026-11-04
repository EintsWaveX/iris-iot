/**
 * The attendance QR from outside (user, 2026-11-03): an event can show its own
 * IRIS QR (rotating, signed, counted in IRIS) or a QR made from a link the
 * Panitia paste, a Google Form for example. For that second kind the page makes
 * the QR from the link, and, when a responses spreadsheet is given too, reads
 * its last rows to show who scanned most recently (4 at most, like the TP
 * submission history).
 *
 * Pure, so the API and the page share the checks. The server only ever fetches
 * docs.google.com from an id it parsed itself (never the pasted text).
 */

export type QrMode = "iris" | "luar";

export interface QrSetting {
  mode: QrMode;
  /** The link the QR is made from (mode "luar") */
  link: string;
  /** The responses spreadsheet to read the latest scans from; empty for none */
  sheet: string;
  /** Panitia opened the attendance early (a gathering takes it in its last 30 minutes otherwise) */
  buka?: boolean;
}

/** Per event id (as text). An event with no entry shows the IRIS QR. */
export type QrMap = Record<string, QrSetting>;

export const QR_DEFAULT: QrMap = {};
export const QR_RECENT_MAX = 4;
export const QR_LINK_MAX = 500;

/** A web link a phone can open: http or https, no spaces. */
export function cekLinkQr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0 || t.length > QR_LINK_MAX || /\s/.test(t)) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The spreadsheet's id and tab from a Google Sheets link, or null for anything else. */
export function bacaSheet(v: unknown): { id: string; gid: string | null } | null {
  if (typeof v !== "string") return null;
  const m =
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})(?:[/?#]|$)/.exec(
      v.trim(),
    );
  if (!m) return null;
  const g = /[#?&]gid=(\d{1,12})/.exec(v);
  return { id: m[1], gid: g ? g[1] : null };
}

/** The address the CSV of that sheet is read from. */
export function sheetCsvUrl(s: { id: string; gid: string | null }): string {
  return `https://docs.google.com/spreadsheets/d/${s.id}/gviz/tq?tqx=out:csv${s.gid ? `&gid=${s.gid}` : ""}`;
}

/** One QR setting, cleaned, or null. An empty sheet link means "do not read one". */
export function cekQrSetting(v: unknown): QrSetting | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.mode !== "iris" && o.mode !== "luar") return null;
  const link = o.link === "" || o.link === undefined ? "" : cekLinkQr(o.link);
  if (link === null) return null;
  const sheetRaw = typeof o.sheet === "string" ? o.sheet.trim() : "";
  if (sheetRaw !== "" && !bacaSheet(sheetRaw)) return null;
  if (o.mode === "luar" && link === "") return null;
  return { mode: o.mode, link, sheet: sheetRaw, ...(o.buka === true ? { buka: true } : {}) };
}

export function cekQrMap(v: unknown): QrMap | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const out: QrMap = {};
  for (const [k, s] of Object.entries(v)) {
    if (!/^\d{1,9}$/.test(k)) return null;
    const c = cekQrSetting(s);
    if (!c) return null;
    out[k] = c;
  }
  return out;
}

/** What an event shows: its own entry, or the IRIS QR. */
export const qrUntuk = (map: QrMap | undefined, eventId: number): QrSetting =>
  map?.[String(eventId)] ?? { mode: "iris", link: "", sheet: "" };

/* ------------------------------------------------------------------ CSV */

/** RFC 4180 enough for a Google CSV: quotes, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

export interface ScanBaru {
  nama: string;
  /** HH:MM taken from the timestamp text, empty when it has none */
  jam: string;
}

/**
 * The newest rows of a responses sheet. A form appends, so the order of the rows
 * is the order of the scans (the timestamp text depends on the sheet's locale and
 * is not parsed). The name is the column headed Nama or Name, else the second
 * column, else the first.
 */
export function scanTerbaru(rows: string[][], max = QR_RECENT_MAX): ScanBaru[] {
  if (rows.length < 2) return [];
  const [head, ...data] = rows;
  const iNama = head.findIndex((h) => /^\s*(nama|name)\b/i.test(h));
  const iTs = head.findIndex((h) => /timestamp|waktu|cap waktu|stempel/i.test(h));
  const kolom = iNama >= 0 ? iNama : head.length > 1 ? 1 : 0;
  const tsKolom = iTs >= 0 ? iTs : 0;
  return data
    .slice(-max)
    .reverse()
    .map((r) => {
      const m = /(\d{1,2})[.:](\d{2})/.exec(r[tsKolom] ?? "");
      return {
        nama: (r[kolom] ?? "").trim().slice(0, 60),
        jam: m ? `${m[1].padStart(2, "0")}:${m[2]}` : "",
      };
    })
    .filter((s) => s.nama !== "");
}
