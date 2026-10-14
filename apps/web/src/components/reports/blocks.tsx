/**
 * The written report's blocks (Phase 9 Stage 6b, mockup r-builder): text
 * blocks edit in place; data blocks show the snapshot taken when they were
 * inserted (src/lib/laporan.ts), so a report reads the same later.
 */
import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import {
  ArrowRightIcon,
  ArrowsLeftRightIcon,
  CheckIcon,
  FileTextIcon,
  InfoIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { localeOf, namaKelompok, tanggalPanjang, titikDua } from "../../lib/app";
import { rupiah } from "../../lib/bayar";
import { hariLabel, kelasLabel, kelompokLabel, modulLabel, slotLabel } from "../../lib/labels";
import type { Blok } from "../../lib/laporan";
import type { Kelas, Lang } from "../../lib/kelas";
import type { Direktori } from "../../lib/people";
import { NILAI_KOMPONEN, type NilaiKomponen } from "../../lib/nilai-komponen";
import Pill from "../ui/Pill";
import { jamSlot, jamWib, tanggalWib } from "./data";
import type { Tx } from "./strings";
import Nil from "../ui/Nil";

/* ------------------------------------------------------- snapshot shapes */

export interface VSesi {
  id: number;
  tanggal: string;
  slot: number | null;
  mulai: string;
  modul: number;
  kelas: Kelas;
  status: string;
  asisten: string[];
  hadir: [number, number];
  dinilai: [number, number];
}
export interface VKelompok {
  sesi: string;
  nomor: number;
  nama: string | null;
  pemegang: string | null;
  anggota: string[];
  blank: [number, number];
}
export interface VPraktikan {
  sesi: string;
  nama: string;
  nim: string;
  nomor: number;
  skor: Partial<Record<NilaiKomponen, number>>;
}
export interface VNilai {
  sesi: string;
  nomor: number;
  baris: { nama: string; nim: string; skor: Partial<Record<NilaiKomponen, number>> }[];
  pada: string;
}
export interface VChart {
  server: string;
  ukuran: "cpu" | "suhu" | "mem";
  rentang: string;
  pts: [number, number][];
  pada: string;
}
export interface VKejadian {
  sesi: string;
  jam: string;
  tag: string;
  teks: string;
}
export interface VFoto {
  url: string;
  nama: string;
  tipe: string;
  ukuran: number;
  cap?: string;
}
export interface VSerial {
  sesi: string;
  nomor: number;
  baris: {
    seq: number;
    tx: string | null;
    rx: string | null;
    delayMs: number | null;
    pada: string;
  }[];
}
export interface VSlot {
  hari: number;
  slot: number;
  kelas: Kelas;
  dari: string;
  ke: string;
}
export interface VBayar {
  jenis: "unit" | "kotor" | "balik";
  teks: string;
  jumlah: number;
  lunas: boolean;
}

/** Text areas that grow with their content (where `field-sizing` isn't
 *  supported). */
function useTumbuh(v: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || CSS.supports?.("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [v]);
  return ref;
}

function Teks({
  v,
  ro,
  cls,
  ph,
  upd,
  onSlash,
  label,
}: {
  v: string;
  ro: boolean;
  cls: string;
  ph?: string;
  upd?: (v: string) => void;
  onSlash?: () => void;
  label: string;
}) {
  const ref = useTumbuh(v);
  return (
    <textarea
      ref={ref}
      className={cls}
      rows={1}
      readOnly={ro}
      value={v}
      aria-label={label}
      placeholder={ro ? undefined : ph}
      onChange={(e) => upd?.(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "/" && !v && onSlash) {
          e.preventDefault();
          onSlash();
        }
      }}
    />
  );
}

function Checklist({
  v,
  ro,
  upd,
  t,
}: {
  v: [boolean, string][];
  ro: boolean;
  upd?: (v: [boolean, string][]) => void;
  t: Tx;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const fokus = (i: number) =>
    requestAnimationFrame(() => wrap.current?.querySelectorAll("input")[i]?.focus());
  const onKey = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (!upd) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...v];
      next.splice(i + 1, 0, [false, ""]);
      upd(next);
      fokus(i + 1);
    } else if (e.key === "Backspace" && !v[i][1] && v.length > 1) {
      e.preventDefault();
      upd(v.filter((_, j) => j !== i));
      fokus(Math.max(0, i - 1));
    }
  };
  return (
    <div ref={wrap}>
      {v.map(([on, teks], i) => (
        <div key={i} className="rp-check" data-done={on ? "yes" : undefined}>
          <button
            type="button"
            role="checkbox"
            className="rp-check__box"
            aria-checked={on}
            aria-label={teks || t.checkPh}
            disabled={!upd}
            onClick={() => upd?.(v.map((x, j) => (j === i ? [!x[0], x[1]] : x)))}
          >
            <CheckIcon size={14} weight="bold" aria-hidden="true" />
          </button>
          {ro ? (
            <span>{teks}</span>
          ) : (
            <input
              value={teks}
              placeholder={t.checkPh}
              aria-label={t.checkPh}
              onChange={(e) => upd?.(v.map((x, j) => (j === i ? [x[0], e.target.value] : x)))}
              onKeyDown={(e) => onKey(e, i)}
            />
          )}
        </div>
      ))}
      {!ro && upd && (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            upd([...v, [false, ""]]);
            fokus(v.length);
          }}
        >
          <PlusIcon size={16} weight="bold" aria-hidden="true" />
          {t.addCheck}
        </button>
      )}
    </div>
  );
}

function Grafik({ v, t, lang }: { v: VChart; t: Tx; lang: Lang }) {
  const W = 640;
  const H = 180;
  if (v.pts.length < 2) return <p className="hint">{t.noChart}</p>;
  const xs = v.pts.map((p) => p[0]);
  const ys = v.pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(0, ...ys);
  const y1 = Math.max(1, ...ys) * 1.1;
  const px = (x: number) => ((x - x0) / Math.max(1, x1 - x0)) * (W - 50) + 44;
  const py = (y: number) => H - 22 - ((y - y0) / (y1 - y0)) * (H - 34);
  const d = v.pts
    .map((p, i) => `${i ? "L" : "M"}${px(p[0]).toFixed(1)} ${py(p[1]).toFixed(1)}`)
    .join(" ");
  const unit = v.ukuran === "suhu" ? "°C" : "%";
  const jam = (ms: number) =>
    titikDua(
      new Date(ms).toLocaleString(localeOf(lang), {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "long",
        timeZone: "Asia/Jakarta",
      }),
    );
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${v.server} · ${t.metric[v.ukuran]}`}
      style={{ width: "100%", height: "auto" }}
    >
      {[0, 0.5, 1].map((f) => {
        const y = y0 + (y1 - y0) * f;
        return (
          <g key={f}>
            <line x1={44} x2={W - 6} y1={py(y)} y2={py(y)} stroke="var(--hairline)" />
            <text x={40} y={py(y) + 4} textAnchor="end" fontSize="11" fill="var(--text-faint)">
              {Math.round(y)}
              {unit}
            </text>
          </g>
        );
      })}
      <path d={d} fill="none" stroke="var(--chart-1, var(--accent))" strokeWidth={2} />
      <text x={44} y={H - 4} fontSize="11" fill="var(--text-faint)">
        {jam(x0)}
      </text>
      <text x={W - 6} y={H - 4} fontSize="11" fill="var(--text-faint)" textAnchor="end">
        {jam(x1)}
      </text>
    </svg>
  );
}

const jamFrozen = (iso: string, lang: Lang) =>
  `${tanggalPanjang(tanggalWib(iso), lang)} ${jamWib(iso)}`;

export function BlokIsi({
  b,
  ro,
  upd,
  onSlash,
  t,
  lang,
  dir,
}: {
  b: Blok;
  ro: boolean;
  upd?: (v: unknown) => void;
  onSlash?: () => void;
  t: Tx;
  lang: Lang;
  dir: Direktori;
}) {
  const kode = (nim: string) => dir.byNim.get(nim)?.kode ?? "?";
  switch (b.k) {
    case "p":
      return (
        <Teks
          v={String(b.v ?? "")}
          ro={ro}
          cls="rp-doc__p"
          ph={t.pPh}
          upd={upd}
          onSlash={onSlash}
          label={t.blk.p[0]}
        />
      );
    case "h":
      return ro ? (
        <h2 className="rp-doc__h" style={{ margin: 0 }}>
          {String(b.v ?? "")}
        </h2>
      ) : (
        <input
          className="rp-doc__h"
          value={String(b.v ?? "")}
          placeholder={t.hPh}
          aria-label={t.blk.h[0]}
          onChange={(e) => upd?.(e.target.value)}
        />
      );
    case "list": {
      const items = Array.isArray(b.v) ? (b.v as string[]) : [];
      return ro ? (
        <ul className="rp-doc__ul">
          {items.filter(Boolean).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <Teks
          v={items.join("\n")}
          ro={false}
          cls="rp-doc__li"
          ph={t.listPh}
          upd={(s) => upd?.(s.split("\n"))}
          label={t.blk.list[0]}
        />
      );
    }
    case "check":
      return (
        <Checklist
          v={Array.isArray(b.v) ? (b.v as [boolean, string][]) : [[false, ""]]}
          ro={ro}
          upd={upd as ((v: [boolean, string][]) => void) | undefined}
          t={t}
        />
      );
    case "callout":
      return (
        <div className="rp-doc__callout">
          <InfoIcon size={20} aria-hidden="true" />
          <Teks
            v={String(b.v ?? "")}
            ro={ro}
            cls="rp-doc__p"
            ph={t.calloutPh}
            upd={upd}
            label={t.blk.callout[0]}
          />
        </div>
      );
    case "div":
      return <hr className="rp-doc__div" />;
    case "sesi": {
      const v = b.v as VSesi;
      return (
        <div className="rp-dblock">
          <div className="row">
            <Pill modul={v.modul}>{modulLabel(v.modul, lang)}</Pill>
            <b>
              {tanggalPanjang(v.tanggal, lang)} · {v.slot ? `${slotLabel(v.slot, lang)} · ` : ""}
              {jamSlot(v.slot, v.mulai)}
            </b>
            <Pill tone={v.status === "berjalan" ? "ok" : undefined}>
              {v.status === "berjalan" ? t.st.jalan : kelasLabel(v.kelas, lang)}
            </Pill>
          </div>
          <div className="row hint">
            {t.col.asisten}:
            {v.asisten.map((n) => (
              <span key={n} className="acode">
                {kode(n)}
              </span>
            ))}
            · {v.hadir[0]}/{v.hadir[1]} {t.stHadir} · {v.dinilai[0]}/{v.dinilai[1]} {t.stNilai}
          </div>
        </div>
      );
    }
    case "kelompok": {
      const v = b.v as VKelompok;
      return (
        <div
          className="rp-dblock rp-dblock--g"
          style={{ "--g": `var(--group-${v.nomor})` } as CSSProperties}
        >
          <div className="row">
            <Pill group={v.nomor}>{namaKelompok(v.nomor, v.nama)}</Pill>
            <span className="hint">{v.sesi}</span>
          </div>
          <span className="hint">
            {v.anggota.join(", ")}
            {v.pemegang ? ` · ${dir.nama(v.pemegang)}` : ""}
          </span>
          <span className="row row--nowrap">
            <span
              className="meter grow"
              aria-hidden="true"
              style={
                {
                  "--meter": v.blank[1] ? (v.blank[0] / v.blank[1]) * 100 : 0,
                  "--meter-hue": `var(--group-${v.nomor})`,
                } as CSSProperties
              }
            />
            <span className="hint num">
              {t.progress} {v.blank[0]}/{v.blank[1]}
            </span>
          </span>
        </div>
      );
    }
    case "praktikan": {
      const v = b.v as VPraktikan;
      const isi = NILAI_KOMPONEN.filter((k) => v.skor[k] != null);
      const rata = isi.length
        ? Math.round(isi.reduce((a, k) => a + (v.skor[k] ?? 0), 0) / isi.length)
        : null;
      return (
        <div className="rp-dblock">
          <b>{v.nama}</b>
          <span className="hint mono">
            {v.nim} · {kelompokLabel(v.nomor, lang)} · {v.sesi}
          </span>
          <span className="hint">
            {isi.map((k) => `${k} ${v.skor[k]}`).join(" · ")}
            {rata != null ? ` · ${t.average} ${rata}` : ""}
          </span>
        </div>
      );
    }
    case "nilai": {
      const v = b.v as VNilai;
      return (
        <div className="rp-dblock">
          <div className="row">
            <Pill group={v.nomor}>{kelompokLabel(v.nomor, lang)}</Pill>
            <span className="hint">{v.sesi}</span>
          </div>
          <div className="rp-scrollx">
            <table className="rp-table rp-table--tight">
              <thead>
                <tr>
                  <th>{t.nama}</th>
                  {NILAI_KOMPONEN.map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {v.baris.map((r) => (
                  <tr key={r.nim}>
                    <td>{r.nama}</td>
                    {NILAI_KOMPONEN.map((k) => (
                      <td key={k} className="num">
                        {r.skor[k] ?? <Nil dot />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="hint">{t.frozenAt(jamFrozen(v.pada, lang))}</span>
        </div>
      );
    }
    case "chart": {
      const v = b.v as VChart;
      return (
        <div className="rp-dblock">
          <b>
            {t.metric[v.ukuran]} · {v.server} · {v.rentang}
          </b>
          <Grafik v={v} t={t} lang={lang} />
          <span className="hint">{t.frozenAt(jamFrozen(v.pada, lang))}</span>
        </div>
      );
    }
    case "kejadian": {
      const v = b.v as VKejadian;
      return (
        <div className="rp-dblock">
          <div className="row row--nowrap" style={{ alignItems: "start" }}>
            <span className="mono hint">{v.jam}</span>
            <Pill>{v.tag}</Pill>
            <span>{v.teks}</span>
          </div>
          <span className="hint">{v.sesi}</span>
        </div>
      );
    }
    case "foto": {
      const v = b.v as VFoto;
      const gambar = v.tipe.startsWith("image/");
      return (
        <div className="rp-dblock">
          {gambar ? (
            <img className="rp-photo" src={v.url} alt={v.cap || v.nama} loading="lazy" />
          ) : (
            <a className="rp-file" href={v.url} target="_blank" rel="noreferrer">
              <FileTextIcon size={28} aria-hidden="true" />
              <span>
                <b>{v.nama}</b>
                <span className="hint" style={{ display: "block" }}>
                  {(v.ukuran / 1024 / 1024).toLocaleString(localeOf(lang), {
                    maximumFractionDigits: 1,
                  })}{" "}
                  MB · {t.openFile}
                </span>
              </span>
            </a>
          )}
          {ro ? (
            v.cap && <span className="hint">{v.cap}</span>
          ) : (
            <input
              className="rp-doc__cap"
              value={v.cap ?? ""}
              placeholder={t.captionPh}
              aria-label={t.caption}
              onChange={(e) => upd?.({ ...v, cap: e.target.value })}
            />
          )}
        </div>
      );
    }
    case "serial": {
      const v = b.v as VSerial;
      return (
        <div className="rp-dblock">
          <div className="row">
            <Pill group={v.nomor}>{kelompokLabel(v.nomor, lang)}</Pill>
            <span className="hint">{v.sesi}</span>
          </div>
          <pre className="rp-log">
            {v.baris
              .map(
                (r) =>
                  `[${new Date(r.pada).toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta" })}] #${r.seq}` +
                  `${r.tx ? ` TX ${r.tx}` : ""}${r.rx ? ` RX ${r.rx}` : ""}${r.delayMs != null ? ` · ${r.delayMs} ms` : ""}`,
              )
              .join("\n")}
          </pre>
        </div>
      );
    }
    case "slot": {
      const v = b.v as VSlot;
      return (
        <div className="rp-dblock">
          <div className="row">
            <Pill tone={v.kelas === "internasional" ? "violet" : undefined}>
              {hariLabel(v.hari, lang)} · {slotLabel(v.slot, lang)} · {jamSlot(v.slot)}
            </Pill>
            <ArrowsLeftRightIcon size={18} aria-hidden="true" />
            <span>{dir.nama(v.dari)}</span>
            <ArrowRightIcon size={14} aria-hidden="true" />
            <span>{dir.nama(v.ke)}</span>
          </div>
        </div>
      );
    }
    case "bayar": {
      const v = b.v as VBayar;
      return (
        <div className="rp-dblock">
          <div className="row">
            <Pill tone={v.lunas ? "ok" : "warn"}>
              {v.lunas ? t.stat.selesai : t.seelabsSt.siap}
            </Pill>
            <span className="grow">{v.teks}</span>
            <b className="num">{rupiah(v.jumlah)}</b>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
