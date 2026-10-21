/**
 * Phase 13 pieces the TP views share: the status pill, the window's track
 * and countdown, the question list and its keys (light markup with code,
 * tables and diagrams), the data hooks and the date words.
 */
import { Fragment, type CSSProperties, type ReactNode } from "react";
import {
  CalendarPlusIcon,
  CheckIcon,
  ClockIcon,
  CloudCheckIcon,
  HourglassIcon,
  XIcon,
} from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import type { KabarTampil } from "../../lib/tp-kabar";
import { getJson, localeOf, useDetik, useTick } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import {
  TP_NOMOR,
  poinNomor,
  blokTeks,
  isiSoal,
  sasaranNomor,
  soalAkhir,
  tampilSoal,
  type BahasaTp,
  type JendelaTp,
  type KeadaanJendela,
  type KelasTp,
  type SoalTampil,
  type StatusTp,
  type VarianTp,
} from "../../lib/tp";
import { TPS } from "./tpStrings";
import "./tp.css";

/* ------------------------------------------------------------ the data */

export interface JendelaInfo extends JendelaTp {
  sumber: "iris" | "lms";
}

export interface TpSayaModul {
  modul: number;
  jendela: JendelaInfo | null;
  keadaan: KeadaanJendela | null;
  status: StatusTp;
  berkas: { i: number; nama: string; ukuran: number; mime: string }[];
  kirimanId: number | null;
  dikirimPada: string | null;
  diambilPada: string | null;
  telatMenit: number | null;
  /** Their own extension's end, when they have one (2026-10-17). */
  perpanjangan: string | null;
  terkirim: boolean;
  skor: Record<string, { skor: number; catatan: string | null }> | null;
  total: number | null;
  dinilaiOleh: string | null;
  /** The receipt of the current file (2026-10-21): its code (SHA-256,
   *  first 8) and pages. */
  tandaTerima: { kode: string; halaman: number | null } | null;
  bolehUnggah: boolean;
}

export interface TpSaya {
  ok: boolean;
  semester: string;
  kelas: KelasTp;
  nomor: number[];
  /** One module, once its window opened: the final set in my class's
   *  language and in Mandarin (Beta), and the PDF's instructions. */
  soal?: SoalTampil[];
  soalZh?: SoalTampil[];
  petunjuk?: Partial<Record<BahasaTp, string>>;
  modul: TpSayaModul[];
  /** The TP notices they see now (2026-10-21). */
  kabar?: KabarTampil[];
  /** One module: their own submission history, newest first. */
  riwayat?: { id: number; jenis: string; berkas: string[]; pada: string }[];
}

/** A module's question bank as an Asisten loads it (GET /api/tp/paket). */
export interface PaketData {
  ok: boolean;
  paket: {
    modul: number;
    varian: VarianTp[];
    pilih: number[];
    petunjuk: Record<BahasaTp, string>;
    versi: number;
    bawaan: boolean;
    diubahOleh: { kode: string; nama: string } | null;
    diubahPada: string | null;
  };
  beda: number[];
  jendela: JendelaInfo | null;
  keadaan: KeadaanJendela | null;
  semester: string;
  bolehUbah: boolean;
}

export function usePaket(modul: number, enabled = true) {
  return usePoll(
    () => getJson<PaketData>(`/api/tp/paket?modul=${modul}`).then((d) => (d.ok ? d : null)),
    300_000,
    enabled,
    ["tp"],
    0,
    modul,
  );
}

/** One question's key and the diagrams it places. */
export interface KunciTp {
  teks: string;
  gambar?: string[];
}

/** The final set's questions and keys in one language. */
export function soalDari(p: PaketData["paket"], b: BahasaTp): SoalTampil[] {
  return soalAkhir(p.varian, p.pilih).map((s) => tampilSoal(s, b));
}

export function kunciDari(p: PaketData["paket"], b: BahasaTp): KunciTp[] {
  return soalAkhir(p.varian, p.pilih).map((s) => ({ teks: isiSoal(s, b).kunci, gambar: s.gambar }));
}

/** A Praktikan's TP, one module or all four. */
export function useTpSaya(enabled: boolean, modul?: number) {
  return usePoll(
    () =>
      getJson<TpSaya>(`/api/tp/saya${modul ? `?modul=${modul}` : ""}`).then((d) =>
        d.ok ? d : null,
      ),
    120_000,
    enabled,
    ["tp", "nilai"],
    0,
    modul ?? 0,
  );
}

/* ------------------------------------------------------------ the words */

const WIB = "Asia/Jakarta";

/** "Rabu, 14 Oktober 2026 · 18:00" */
export function waktuPanjang(iso: string, lang: Lang): string {
  return `${tanggalPanjang(iso, lang)} · ${jam(iso)}`;
}

/** "Kamis, 15 Oktober 2026" in WIB, for a date set over its time */
export function tanggalPanjang(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(localeOf(lang), {
    timeZone: WIB,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "18:00" in WIB */
export function jam(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: WIB,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** "Sabtu pukul 18:00" (the weekday alone when within the week ahead) */
export function hariJam(iso: string, lang: Lang): string {
  const t = TPS[lang];
  const ms = Date.parse(iso) - Date.now();
  if (Math.abs(ms) > 6 * 86_400_000) return waktuPanjang(iso, lang);
  const hari = new Date(iso).toLocaleDateString(localeOf(lang), { timeZone: WIB, weekday: "long" });
  return t.pukul(hari, jam(iso));
}

/** "Sab 18:07" */
export function hariJamPendek(iso: string, lang: Lang): string {
  const hari = new Date(iso).toLocaleDateString(localeOf(lang), {
    timeZone: WIB,
    weekday: "short",
  });
  return `${hari} ${jam(iso)}`;
}

export function ukuran(b: number, lang: Lang): string {
  const fmt = (n: number) => n.toLocaleString(localeOf(lang), { maximumFractionDigits: 1 });
  return b >= 1_048_576 ? `${fmt(b / 1_048_576)} MB` : `${fmt(Math.max(1, b / 1024))} KB`;
}

/* ------------------------------------------------------------ the pills */

const STATUS_ICON: Record<StatusTp, ReactNode> = {
  belum: <HourglassIcon size={14} aria-hidden="true" />,
  masuk: <CloudCheckIcon size={14} aria-hidden="true" />,
  panjang: <CalendarPlusIcon size={14} aria-hidden="true" />,
  telat: <ClockIcon size={14} aria-hidden="true" />,
  nilai: <CheckIcon size={14} aria-hidden="true" />,
  kosong: <XIcon size={14} aria-hidden="true" />,
};
const STATUS_TONE: Record<StatusTp, "ok" | "warn" | "danger" | "accent" | undefined> = {
  belum: undefined,
  masuk: "accent",
  panjang: "accent",
  telat: "warn",
  nilai: "ok",
  kosong: "danger",
};

export function StatusPill({ s, lang, extra }: { s: StatusTp; lang: Lang; extra?: string }) {
  return (
    <Pill tone={STATUS_TONE[s]}>
      {STATUS_ICON[s]}
      {TPS[lang].status[s]}
      {extra ? ` · ${extra}` : ""}
    </Pill>
  );
}

export function KeadaanPill({ k, lang }: { k: KeadaanJendela | null; lang: Lang }) {
  const t = TPS[lang];
  if (!k) return <Pill>{t.tanpaJendela}</Pill>;
  return (
    <Pill tone={k === "buka" ? "ok" : k === "belum" ? "accent" : undefined}>
      {k === "buka" && <span className="dot dot--ok dot--pulse" aria-hidden="true" />}
      {t.keadaan[k]}
    </Pill>
  );
}

/* ----------------------------------------------- the window and its time */

export function durasi(sec: number, lang: Lang): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return TPS[lang].dur(d, h, m);
}

const dua = (n: number) => String(n).padStart(2, "0");

/** A countdown to an instant as digit tiles, each digit in its own cell:
 *  the days while a day or more is left, then HH:MM:SS. `pelangi` puts the
 *  digits in the kit's moving rainbow (back from the LMS Ringkasan,
 *  2026-10-21); counting to a close, they turn warning under three hours. */
export function Countdown({
  to,
  lang,
  pelangi = false,
  keTutup = false,
}: {
  to: string;
  lang: Lang;
  pelangi?: boolean;
  keTutup?: boolean;
}) {
  // The page's shared second, so it turns on the clock's own second and
  // together with the sync timer beside it.
  const now = useDetik();
  const t = TPS[lang];
  const s = Math.max(0, Math.ceil((Date.parse(to) - now) / 1000));
  const d = Math.floor(s / 86400);
  const jms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
  const mepet = pelangi && keTutup && s < 3 * 3600;
  // Each group a step further along the rainbow.
  const kelompok = (v: string, l: string, i: number, cls = "") => (
    <span className={`cdown__g${cls}`} style={{ "--i": i } as CSSProperties}>
      <span className="cdown__d">
        {[...v].map((c, i) => (
          <b key={i}>{c}</b>
        ))}
      </span>
      <small>{l}</small>
    </span>
  );
  return (
    <span
      className={`cdown${pelangi ? " cdown--pelangi" : ""}`}
      data-mepet={mepet ? "yes" : undefined}
      role="timer"
      aria-label={durasi(s, lang)}
    >
      <span className="cdown__in" aria-hidden="true">
        {d > 0 && kelompok(String(d), t.satuan[0], 0, " cdown__g--hari")}
        {jms.map((n, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="cdown__sep">:</span>}
            {kelompok(dua(n), t.satuan[i + 1], i + 1)}
          </Fragment>
        ))}
      </span>
    </span>
  );
}

/** The window as a track from opening to closing, with now on it and the
 *  days in between. */
export function WinTrack({ j, lang, compact }: { j: JendelaTp; lang: Lang; compact?: boolean }) {
  const t = TPS[lang];
  useTick(60_000);
  const a = Date.parse(j.buka);
  const b = Date.parse(j.tutup);
  const now = Date.now();
  const ws = now < a ? "belum" : now < b ? "buka" : "tutup";
  const p = Math.max(0, Math.min(100, ((now - a) / (b - a)) * 100));
  // The days between, each named in the middle of its own span.
  const tanda: { p: number; l: string; ujung?: "a" | "b" }[] = [
    { p: 0, l: hariJamPendek(j.buka, lang), ujung: "a" },
  ];
  const hari = new Date(a + 7 * 3_600_000);
  hari.setUTCHours(0, 0, 0, 0);
  for (
    let d = hari.getTime() - 7 * 3_600_000 + 86_400_000;
    d < b - 6 * 3_600_000;
    d += 86_400_000
  ) {
    const mid = Math.min(b, d + 43_200_000);
    // the closing day is already named by the end label
    if (mid - a < 6 * 3_600_000 || d + 86_400_000 > b) continue;
    tanda.push({
      p: ((mid - a) / (b - a)) * 100,
      l: new Date(d).toLocaleDateString(localeOf(lang), { timeZone: WIB, weekday: "short" }),
    });
  }
  tanda.push({ p: 100, l: hariJamPendek(j.tutup, lang), ujung: "b" });
  // Midnight ticks, so the uneven first and last days read as such.
  const garis: number[] = [];
  for (let d = hari.getTime() - 7 * 3_600_000 + 86_400_000; d < b; d += 86_400_000)
    garis.push(((d - a) / (b - a)) * 100);
  return (
    <div
      className={`wtrack${compact ? " wtrack--sm" : ""}`}
      data-ws={ws}
      role="img"
      aria-label={t.jendela}
    >
      <div className="wtrack__bar">
        <i style={{ width: `${ws === "belum" ? 0 : p}%` }} />
        {!compact && garis.map((x) => <u key={x} style={{ left: `${x}%` }} aria-hidden="true" />)}
        {ws === "buka" && (
          <b
            className="wtrack__now"
            style={{ left: `${p}%` }}
            data-end={p < 12 ? "a" : p > 88 ? "b" : undefined}
          >
            <span>{t.sekarang}</span>
          </b>
        )}
      </div>
      {!compact && (
        <div className="wtrack__marks">
          {tanda.map((x) => (
            <span key={`${x.p}-${x.l}`} style={{ left: `${x.p}%` }} data-end={x.ujung}>
              {x.l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Kumpulkan sebelum Sabtu pukul 18:00" and the rest of the hero's head. */
export function judulJendela(k: KeadaanJendela | null, j: JendelaTp | null, lang: Lang): string {
  const t = TPS[lang];
  if (!k || !j) return t.heroNone;
  if (k === "buka") return t.heroBuka(hariJam(j.tutup, lang));
  if (k === "belum") return t.heroBelum(hariJam(j.buka, lang));
  return t.heroTutup;
}

/* ---------------------------------------------------------- questions */

export function SasaranPill({ no, lang }: { no: number; lang: Lang }) {
  const s = sasaranNomor(no);
  return <Pill tone={s === "semua" ? "accent" : undefined}>{TPS[lang].sasaran[s]}</Pill>;
}

/** The numbered question list. `mine` dims the others; `kunci` shows the
 *  key under each one; `extra` renders under a question (an answer box). */
export function SoalList({
  soal,
  lang,
  mine,
  tampil,
  kunci,
  poin,
  extra,
}: {
  soal: SoalTampil[];
  lang: Lang;
  mine?: number[];
  tampil?: number[];
  kunci?: (KunciTp | null)[] | null;
  poin?: boolean;
  extra?: (no: number) => ReactNode;
}) {
  const t = TPS[lang];
  const nomor = tampil ?? soal.map((_, i) => i + 1).slice(0, TP_NOMOR);
  return (
    <ol className="tpsoal">
      {nomor.map((no) => {
        const q = soal[no - 1];
        if (!q) return null;
        const milik = !mine || mine.includes(no);
        return (
          <li key={no} className="tpsoal__i" data-mine={milik ? "yes" : "no"}>
            <span className="tpsoal__no">{no}</span>
            <div className="stack stack--sm">
              <div className="row tpsoal__tags">
                <SasaranPill no={no} lang={lang} />
                {!milik && <span className="hint">{t.bukanUntukmu}</span>}
                {poin && (
                  <span className="hint">
                    {poinNomor(no)} {t.poin}
                  </span>
                )}
              </div>
              <p className="tpsoal__t">{q.teks}</p>
              {q.bagian && (
                <ol className="tpsoal__parts" type="a">
                  {q.bagian.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
              )}
              {kunci !== undefined && <KunciBox k={kunci?.[no - 1] ?? null} lang={lang} />}
              {extra?.(no)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function KunciBox({ k, lang }: { k: KunciTp | null; lang: Lang }) {
  const t = TPS[lang];
  return (
    <div className="tpkey">
      <span className="label-caps">{t.kunci}</span>
      {k?.teks.trim() ? (
        <TeksTp md={k.teks} gambar={k.gambar} lang={lang} />
      ) : (
        <p className="hint">{t.kunciKosong}</p>
      )}
    </div>
  );
}

/** A key's light markup (blokTeks) as the page shows it. */
export function TeksTp({ md, gambar, lang }: { md: string; gambar?: string[]; lang: Lang }) {
  const t = TPS[lang];
  return (
    <div className="tpteks">
      {blokTeks(md).map((b, i) => {
        if (b.k === "kode")
          return (
            <pre key={i} className="tpteks__kode">
              <code>{b.teks}</code>
            </pre>
          );
        if (b.k === "butir")
          return (
            <ul key={i}>
              {b.teks.map((x, j) => (
                <li key={j}>{x}</li>
              ))}
            </ul>
          );
        if (b.k === "bagian")
          return (
            <p key={i} className="tpteks__bag">
              <b>{b.huruf}.</b> {b.teks}
            </p>
          );
        if (b.k === "tabel")
          return (
            <div key={i} className="tpteks__tabel">
              <table>
                <thead>
                  <tr>
                    {b.baris[0]?.map((c, j) => (
                      <th key={j}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.baris.slice(1).map((r, j) => (
                    <tr key={j}>
                      {r.map((c, x) => (
                        <td key={x}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        if (b.k === "gambar")
          return gambar?.[b.i] ? (
            <img key={i} className="tpteks__img" src={gambar[b.i]} alt={t.gambarNo(b.i + 1)} />
          ) : (
            <p key={i} className="hint">
              {t.gambarHilang(b.i + 1)}
            </p>
          );
        return <p key={i}>{b.teks}</p>;
      })}
    </div>
  );
}

export const modulStyle = (m: number) => ({ "--m": `var(--mod-${m})` }) as CSSProperties;
export const grupStyle = (g: number) =>
  ({ "--g": `var(--group-${((g - 1) % 10) + 1})` }) as CSSProperties;

export function inisial(nama: string): string {
  return nama
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
