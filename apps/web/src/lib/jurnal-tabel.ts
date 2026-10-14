/**
 * Phase 9 Stage 7f: the paper journal's tables, for "Tangkap 5 Data
 * Terakhir". Headers are copied from the worksheets in IRIS ASO\jurnal\
 * ("ID_Modul N - Lembar Kerja.typ", "EN_Module N - Worksheet.typ"): same
 * words, same order, same units. The journals stay in Indonesian and
 * English; a Mandarin page shows the same columns with Mandarin headers.
 */
import type { Lang } from "./kelas";
import type { LiveRecord } from "./live-records";

export type JLang = Lang;
export const jLang = (l: Lang): JLang => l;

export type JKey =
  | "trial"
  | "led"
  | "temp"
  | "hum"
  | "seq"
  | "pos"
  | "rssi"
  | "snr"
  | "tx"
  | "rx"
  | "oneway"
  | "rtt";

interface JDef {
  keys: JKey[];
  id: { cols: [string, string][]; foot: string; span: number };
  en: { cols: [string, string][]; foot: string; span: number };
  zh: { cols: [string, string][]; foot: string; span: number };
}

const TRIAL_ID: [string, string] = ["Percobaan ke-...", ""];
const TRIAL_EN: [string, string] = ["Trial no. ...", ""];
const TRIAL_ZH: [string, string] = ["第 ... 次试验", ""];
const HMS = "[HH:MM:SS:MS]";

export const JURNAL: Record<number, JDef> = {
  1: {
    keys: ["trial", "led", "tx", "rx", "oneway", "rtt"],
    id: {
      cols: [
        TRIAL_ID,
        ["Status LED", "[0/1]"],
        ["Waktu kirim", `(Central) ${HMS}`],
        ["Waktu terima", `(Peripheral) ${HMS}`],
        ["Delay satu arah", "[ms]"],
        ["Delay round-trip", "[ms]"],
      ],
      foot: "Rata-rata delay (ms)",
      span: 4,
    },
    en: {
      cols: [
        TRIAL_EN,
        ["LED state", "[0/1]"],
        ["Send time", `(Central) ${HMS}`],
        ["Receive time", `(Peripheral) ${HMS}`],
        ["One-way delay", "[ms]"],
        ["Round-trip delay", "[ms]"],
      ],
      foot: "Average delay (ms)",
      span: 4,
    },
    zh: {
      cols: [
        TRIAL_ZH,
        ["LED 状态", "[0/1]"],
        ["发送时间", `(Central) ${HMS}`],
        ["接收时间", `(Peripheral) ${HMS}`],
        ["单程延迟", "[ms]"],
        ["往返延迟", "[ms]"],
      ],
      foot: "平均延迟 (ms)",
      span: 4,
    },
  },
  2: {
    keys: ["trial", "temp", "hum", "tx", "rx", "oneway", "rtt"],
    id: {
      cols: [
        TRIAL_ID,
        ["Suhu", "[°C]"],
        ["Kelembapan", "[%]"],
        ["Waktu kirim", `(ESP32) ${HMS}`],
        ["Waktu terima", `(PC Server) ${HMS}`],
        ["Delay satu arah", "[ms]"],
        ["Delay round-trip", "[ms]"],
      ],
      foot: "Rata-rata delay (ms)",
      span: 5,
    },
    en: {
      cols: [
        TRIAL_EN,
        ["Temp.", "[°C]"],
        ["Humidity", "[%]"],
        ["Send time", `(ESP32) ${HMS}`],
        ["Receive time", `(PC Server) ${HMS}`],
        ["One-way delay", "[ms]"],
        ["Round-trip delay", "[ms]"],
      ],
      foot: "Average delay (ms)",
      span: 5,
    },
    zh: {
      cols: [
        TRIAL_ZH,
        ["温度", "[°C]"],
        ["湿度", "[%]"],
        ["发送时间", `(ESP32) ${HMS}`],
        ["接收时间", `(PC 服务器) ${HMS}`],
        ["单程延迟", "[ms]"],
        ["往返延迟", "[ms]"],
      ],
      foot: "平均延迟 (ms)",
      span: 5,
    },
  },
  3: {
    keys: ["trial", "seq", "pos", "tx", "rx", "oneway"],
    id: {
      cols: [
        TRIAL_ID,
        ["No. sampel", ""],
        ["Posisi", "[%]"],
        ["Waktu publish", `(Publisher) ${HMS}`],
        ["Waktu terima", `(Subscriber) ${HMS}`],
        ["Delay satu arah", "[ms]"],
      ],
      foot: "Rata-rata delay satu arah (ms)",
      span: 5,
    },
    en: {
      cols: [
        TRIAL_EN,
        ["Sample no.", ""],
        ["Position", "[%]"],
        ["Publish time", `(Publisher) ${HMS}`],
        ["Receive time", `(Subscriber) ${HMS}`],
        ["One-way delay", "[ms]"],
      ],
      foot: "Average one-way delay (ms)",
      span: 5,
    },
    zh: {
      cols: [
        TRIAL_ZH,
        ["样本编号", ""],
        ["位置", "[%]"],
        ["发布时间", `(Publisher) ${HMS}`],
        ["接收时间", `(Subscriber) ${HMS}`],
        ["单程延迟", "[ms]"],
      ],
      foot: "平均单程延迟 (ms)",
      span: 5,
    },
  },
  4: {
    keys: ["trial", "seq", "rssi", "snr", "tx", "rx", "oneway"],
    id: {
      cols: [
        TRIAL_ID,
        ["No. paket", ""],
        ["RSSI", "[dBm]"],
        ["SNR", "[dB]"],
        ["Waktu kirim", `(Beacon) ${HMS}`],
        ["Waktu terima", `(Hunter) ${HMS}`],
        ["Delay satu arah", "[ms]"],
      ],
      foot: "Rata-rata delay satu arah (ms)",
      span: 6,
    },
    en: {
      cols: [
        TRIAL_EN,
        ["Packet no.", ""],
        ["RSSI", "[dBm]"],
        ["SNR", "[dB]"],
        ["Send time", `(Beacon) ${HMS}`],
        ["Receive time", `(Hunter) ${HMS}`],
        ["One-way delay", "[ms]"],
      ],
      foot: "Average one-way delay (ms)",
      span: 6,
    },
    zh: {
      cols: [
        TRIAL_ZH,
        ["数据包编号", ""],
        ["RSSI", "[dBm]"],
        ["SNR", "[dB]"],
        ["发送时间", `(Beacon) ${HMS}`],
        ["接收时间", `(Hunter) ${HMS}`],
        ["单程延迟", "[ms]"],
      ],
      foot: "平均单程延迟 (ms)",
      span: 6,
    },
  },
};

/** Module 4's second table: three positions, typed in plus the board. */
export const JARAK = {
  id: {
    cols: [
      ["Posisi", ""],
      ["Jarak sebenarnya", "(meteran) [m]"],
      ["RSSI halus", "[dBm]"],
      ["Perkiraan papan skor", "[m]"],
      ["Ada penghalang?", "(ya / tidak)"],
    ] as [string, string][],
    rows: ["Dekat", "Sedang", "Jauh"],
    yes: "ya",
    no: "tidak",
  },
  en: {
    cols: [
      ["Position", ""],
      ["Real distance", "(tape) [m]"],
      ["Smoothed RSSI", "[dBm]"],
      ["Scoreboard estimate", "[m]"],
      ["Obstacle?", "(yes / no)"],
    ] as [string, string][],
    rows: ["Near", "Middle", "Far"],
    yes: "yes",
    no: "no",
  },
  zh: {
    cols: [
      ["位置", ""],
      ["实际距离", "(卷尺) [m]"],
      ["平滑 RSSI", "[dBm]"],
      ["记分板估计", "[m]"],
      ["有遮挡吗？", "(是 / 否)"],
    ] as [string, string][],
    rows: ["近", "中", "远"],
    yes: "是",
    no: "否",
  },
};

export type JRow = Record<string, string | number | null>;

/** A record the journal can use: it arrived, with a receive time or an echo. */
export function lengkap(r: LiveRecord): boolean {
  return !r.lost && (r.rx !== null || r.rtt !== null);
}

/** The last five complete records as the module's table rows. */
export function barisJurnal(modul: number, records: LiveRecord[]): JRow[] {
  const keys = JURNAL[modul]?.keys ?? [];
  return records
    .filter(lengkap)
    .slice(-5)
    .map((r, i) => {
      const v: Record<JKey, string | number | null> = {
        trial: i + 1,
        led: r.nilai.led ?? r.nilai.tombol ?? null,
        temp: r.nilai.suhu ?? null,
        hum: r.nilai.lembap ?? null,
        seq: r.seq,
        pos: r.nilai.posisi ?? null,
        rssi: r.rssi,
        snr: r.snr,
        tx: r.tx,
        rx: r.rx,
        oneway: r.oneway,
        rtt: r.rtt,
      };
      return Object.fromEntries(keys.map((k) => [k, v[k]]));
    });
}

const rata = (xs: (string | number | null)[]) => {
  const n = xs.filter((x): x is number => typeof x === "number");
  return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : null;
};

/** The footer's averages: one-way, then round-trip where the table has it. */
export function rataJurnal(modul: number, rows: JRow[]): (number | null)[] {
  const keys = JURNAL[modul]?.keys ?? [];
  return (["oneway", "rtt"] as const)
    .filter((k) => keys.includes(k))
    .map((k) => rata(rows.map((r) => r[k])));
}

/** Tab-separated, so it pastes into a Word or Sheets table as cells. */
export function tsvJurnal(modul: number, lang: JLang, rows: JRow[]): string {
  const def = JURNAL[modul];
  if (!def) return "";
  const head = def[lang].cols.map(([h, u]) => (u ? `${h} ${u}` : h));
  const body = rows.map((r) =>
    def.keys.map((k) => (k === "trial" ? `${r[k]}.` : (r[k] ?? ""))).join("\t"),
  );
  const avg = rataJurnal(modul, rows);
  const foot = [def[lang].foot, ...Array(def[lang].span - 1).fill(""), ...avg.map((x) => x ?? "")];
  return [head.join("\t"), ...body, foot.join("\t")].join("\n");
}

export interface JarakBaris {
  real: string;
  halus: number | null;
  est: number | null;
  obs: boolean | null;
}

export function tsvJarak(lang: JLang, marks: JarakBaris[]): string {
  const j = JARAK[lang];
  const head = j.cols.map(([h, u]) => (u ? `${h} ${u}` : h));
  const body = j.rows.map((pos, i) => {
    const m = marks[i];
    return [
      pos,
      m?.real ?? "",
      m?.halus ?? "",
      m?.est ?? "",
      m?.obs == null ? "" : m.obs ? j.yes : j.no,
    ].join("\t");
  });
  return [head.join("\t"), ...body].join("\n");
}
