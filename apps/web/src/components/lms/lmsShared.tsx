/**
 * The LMS menu's shared parts: a card header without an icon tile, label
 * and value pairs, the class picker every "in all classes" action uses,
 * and the batch dialog that runs one class at a time with a row each.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import Dialog from "../ui/Dialog";
import SegmentedControl from "../ui/SegmentedControl";
import { postJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { LS } from "./lmsStrings";

export interface KursusRingan {
  id: number;
  label: string;
  kelas: "reguler" | "inter";
}

/** A card's title, its line of detail and an aside (2026-10-14: no icon
 *  beside a label that already says it). */
export function Head({
  title,
  desc,
  aside,
  level = 2,
}: {
  title: ReactNode;
  desc?: ReactNode;
  aside?: ReactNode;
  level?: 2 | 3;
}) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className="lms-head">
      <div className="lms-head__t">
        <H className="panel__title">{title}</H>
        {desc && <span className="hint">{desc}</span>}
      </div>
      {aside && <div className="lms-head__aside">{aside}</div>}
    </div>
  );
}

export function Facts({
  items,
  cols = 4,
}: {
  items: [ReactNode, ReactNode, boolean?][];
  cols?: 2 | 4;
}) {
  return (
    <dl className="slr-facts" data-cols={cols}>
      {items.map(([k, v, mono], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd className={mono ? "mono" : undefined}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export type Sasaran = "semua" | "reguler" | "inter";

export function sasaranKursus<T extends KursusRingan>(kursus: T[], s: Sasaran): T[] {
  return s === "semua" ? kursus : kursus.filter((k) => k.kelas === s);
}

/** All, Reguler or International. */
export function ClassPick({
  lang,
  kursus,
  value,
  onChange,
}: {
  lang: Lang;
  kursus: KursusRingan[];
  value: Sasaran;
  onChange: (v: Sasaran) => void;
}) {
  const t = LS[lang];
  const reg = kursus.filter((k) => k.kelas === "reguler").length;
  const int = kursus.length - reg;
  return (
    <div className="field lms-kelaspick">
      <span className="field__label">{t.kelas}</span>
      <SegmentedControl
        aria-label={t.pilihKelas}
        fill
        value={value}
        onValueChange={(v) => onChange(v as Sasaran)}
        options={[
          { value: "semua", label: t.semuaKelas(kursus.length) },
          { value: "reguler", label: t.reguler(reg) },
          { value: "inter", label: t.inter(int) },
        ]}
      />
    </div>
  );
}

/** "baru saja", "4 menit lalu", "kemarin"-ish, from an ISO instant. */
export function lalu(iso: string | null, lang: Lang): string {
  const t = LS[lang];
  if (!iso) return t.belumPernah;
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return t.baruSaja;
  if (s < 3600) return t.menitLalu(Math.round(s / 60));
  if (s < 86400) return t.jamLalu(Math.round(s / 3600));
  return t.hariLalu(Math.round(s / 86400));
}

export function galatTeks(kode: string | undefined, lang: Lang): string {
  const t = LS[lang];
  return (kode && t.galat[kode]) || t.muatGagal(kode ?? "?");
}

export interface JawabLangkah {
  ok: boolean;
  cocok?: boolean;
  kode?: string;
  rinci?: string;
}

/** POST one step; a network failure reads as the LMS not answering. */
export function langkah(url: string, isi: unknown): Promise<JawabLangkah> {
  return postJson<JawabLangkah>(url, isi).catch((): JawabLangkah => ({
    ok: false,
    kode: "lms_tak_terjangkau",
  }));
}

type Keadaan = "tunggu" | "jalan" | "ok" | "beda" | "gagal";

/**
 * Runs `jalan` for each class in turn, a row per class showing where it
 * is, then reads "Selesai" when every class is done. It starts when it
 * opens; closing it while it runs is not possible (the footer waits).
 */
export function BatchDialog({
  open,
  onOpenChange,
  lang,
  title,
  kursus,
  jalan,
  selesai,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  title: string;
  kursus: { id: number; label: string }[];
  jalan: (id: number) => Promise<JawabLangkah>;
  selesai: string;
  onDone?: () => void;
}) {
  const t = LS[lang];
  const [st, setSt] = useState<Record<number, { k: Keadaan; pesan?: string }>>({});
  const [lari, setLari] = useState(false);
  const mulai = useRef(false);
  const jalanRef = useRef(jalan);
  jalanRef.current = jalan;
  useEffect(() => {
    if (!open) {
      mulai.current = false;
      return;
    }
    if (mulai.current) return;
    mulai.current = true;
    setSt(Object.fromEntries(kursus.map((k) => [k.id, { k: "tunggu" as Keadaan }])));
    setLari(true);
    void (async () => {
      for (const k of kursus) {
        setSt((s) => ({ ...s, [k.id]: { k: "jalan" } }));
        const r = await jalanRef.current(k.id);
        setSt((s) => ({
          ...s,
          [k.id]: r.ok
            ? { k: r.cocok === false ? "beda" : "ok" }
            : { k: "gagal", pesan: galatTeks(r.kode, lang) },
        }));
      }
      setLari(false);
      onDone?.();
    })();
  }, [open]);
  const habis = !lari && Object.values(st).length > 0;
  const ada = Object.values(st);
  const label: Record<Keadaan, string> = {
    tunggu: t.menunggu,
    jalan: t.berjalan,
    ok: t.selesaiBaca,
    beda: t.selesaiBeda,
    gagal: t.gagal,
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && lari) return;
        onOpenChange(v);
      }}
      title={title}
      lang={lang}
      blocking={lari}
      actions={
        <button
          type="button"
          className={habis ? "btn btn--primary" : "btn btn--ghost"}
          disabled={!habis}
          onClick={() => onOpenChange(false)}
        >
          {habis ? t.selesai : t.berjalan}
        </button>
      }
    >
      <ul className="lms-batch">
        {kursus.map((k) => {
          const s = st[k.id] ?? { k: "tunggu" as Keadaan };
          return (
            <li key={k.id} data-s={s.k}>
              <b className="mono">{k.label}</b>
              <span className="hint" title={s.pesan}>
                {s.k === "gagal" && s.pesan ? s.pesan : label[s.k]}
              </span>
            </li>
          );
        })}
      </ul>
      {habis && (
        <p className="hint">
          {ada.every((x) => x.k === "ok")
            ? selesai
            : `${ada.filter((x) => x.k === "ok").length}/${ada.length} · ${selesai}`}
        </p>
      )}
    </Dialog>
  );
}
