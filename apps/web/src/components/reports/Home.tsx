/**
 * Reports home (Phase 9 Stage 6b, mockup r-home): one filter bar above
 * every tab (date range first with presets, then module, slot, class,
 * assistant, status, saved views, export of exactly what is shown), then
 * Sessions, Overview, Assistant Workload, Incidents, Lab Feedback, Audit and
 * Payments.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowsDownUpIcon,
  CalendarDotsIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
  ColumnsIcon,
  ExportIcon,
  FileCsvIcon,
  FileTextIcon,
  FilePdfIcon,
  FileXlsIcon,
  NotePencilIcon,
  XIcon,
} from "@phosphor-icons/react";
import { getJson, localeOf, tanggalPanjang } from "../../lib/app";
import { jumlahkan, rupiah } from "../../lib/bayar";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { kelasLabel, modulLabel, slotLabel } from "../../lib/labels";
import {
  beban,
  cocok,
  ikhtisar,
  jumlahSaringan,
  rentangPreset,
  statusLaporan,
  urutkan,
  type KolomUrut,
  type Preset,
  type Saringan,
  type SesiLaporan,
} from "../../lib/laporan";
import type { Kelas, Lang } from "../../lib/kelas";
import type { Ringkasan } from "../../lib/umpan-balik";
import { LABEL_CHIP } from "../../lib/umpan-balik";
import type { Direktori } from "../../lib/people";
import { isJenisAudit, JENIS_AUDIT, type JenisAudit } from "../../lib/audit-jenis";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import { DateField, Switch } from "../ui/Controls";
import Popover from "../ui/Popover";
import IconButton from "../ui/IconButton";
import Pill from "../ui/Pill";
import Fade from "../ui/Fade";
import TabLine from "../ui/TabLine";
import Tooltip from "../ui/Tooltip";
import { EarningsCard } from "../bayar/Earnings";
import { useBayar } from "../bayar/data";
import { IncidentsTab } from "./Incidents";
import { bantuAudit, kalimatAudit, type AuditKonteks, type AuditRow } from "./audit";
import { type Format, ekspor, jamSlot, jamWib, tanggalWib } from "./data";
import type { Tx } from "./strings";

export const TAB_HOME = [
  "sesi",
  "ringkasan",
  "beban",
  "kejadian",
  "lab",
  "audit",
  "bayar",
] as const;
export type TabHome = (typeof TAB_HOME)[number];

export interface Filter extends Saringan {
  preset: Preset;
}

export function filterAwal(): Filter {
  const [dari, sampai] = rentangPreset("sem", hariIniWib());
  return {
    preset: "sem",
    dari,
    sampai,
    modul: "all",
    slot: "all",
    kelas: "all",
    asisten: "all",
    status: "all",
  };
}

interface Ctx {
  t: Tx;
  lang: Lang;
  dir: Direktori;
  me: string;
}

const fmt1 = (n: number, lang: Lang) =>
  n.toLocaleString(localeOf(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (n: number | null, lang: Lang) =>
  n == null ? "·" : `${Math.round(n * 100).toLocaleString(localeOf(lang))}%`;

/* ------------------------------------------------------------ date range */

function DateRange({ f, setF, c }: { f: Filter; setF: (f: Filter) => void; c: Ctx }) {
  const { t, lang } = c;
  const [open, setOpen] = useState(false);
  const hariIni = hariIniWib();
  const [dari, setDari] = useState(f.dari ?? hariIni);
  const [sampai, setSampai] = useState(f.sampai ?? hariIni);
  useEffect(() => {
    if (!open) return;
    setDari(f.dari ?? rentangPreset("sem", hariIni)[0]!);
    setSampai(f.sampai ?? hariIni);
  }, [open, f.dari, f.sampai, hariIni]);
  const label = f.preset === "custom" ? t.custom : t.presets[f.preset as Exclude<Preset, "custom">];
  const tip =
    f.preset === "custom" && f.dari && f.sampai
      ? t.rangeTip(tanggalPanjang(f.dari, lang), tanggalPanjang(f.sampai, lang))
      : undefined;
  const trigger = (
    <button
      type="button"
      className="rp-fchip"
      aria-expanded={open}
      aria-label={`${t.dateRange}: ${label}`}
    >
      <CalendarDotsIcon size={18} aria-hidden="true" />
      <span>{label}</span>
      <CaretDownIcon size={16} aria-hidden="true" />
    </button>
  );
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={tip ? <Tooltip label={tip}>{trigger}</Tooltip> : trigger}
    >
      <div className="rp-range">
        <div className="rp-range__presets" role="group" aria-label={t.dateRange}>
          {(["7", "30", "sem", "all"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className="rp-menu__i"
              aria-pressed={f.preset === p}
              onClick={() => {
                const [d, s] = rentangPreset(p, hariIni);
                setF({ ...f, preset: p, dari: d, sampai: s });
                setOpen(false);
              }}
            >
              {t.presets[p]}
              {f.preset === p && <CheckIcon size={18} aria-hidden="true" />}
            </button>
          ))}
        </div>
        <hr className="rp-sep" />
        <span className="label-caps">{t.customRange}</span>
        <DateField
          value={dari}
          max={hariIni}
          onChange={(v) => {
            setDari(v);
            if (v > sampai) setSampai(v);
          }}
          label={t.from}
          lang={lang}
        />
        <span className="hint">{t.sampai}</span>
        <DateField
          value={sampai}
          min={dari}
          max={hariIni}
          onChange={setSampai}
          label={t.to}
          lang={lang}
        />
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => {
            setF({ ...f, preset: "custom", dari, sampai });
            setOpen(false);
          }}
        >
          {t.useRange}
        </button>
      </div>
    </Popover>
  );
}

/* ------------------------------------------------------------ filter bar */

function FilterBar({
  f,
  setF,
  c,
  onExport,
}: {
  f: Filter;
  setF: (f: Filter) => void;
  c: Ctx;
  onExport: (fmt: Format) => void;
}) {
  const { t, lang, dir, me } = c;
  const [ex, setEx] = useState(false);
  const aktif = jumlahSaringan(f);
  const orang = [...dir.byNim.values()].sort((a, b) => a.nama.localeCompare(b.nama));
  return (
    <div className="rp-fbar">
      <DateRange f={f} setF={setF} c={c} />
      <Dropdown
        id="rp-modul"
        label={t.modul}
        hideLabel
        value={String(f.modul)}
        onChange={(v) => setF({ ...f, modul: v === "all" ? "all" : Number(v) })}
        options={[
          { value: "all", label: t.allModul },
          ...[1, 2, 3, 4].map((m) => ({ value: String(m), label: modulLabel(m, lang) })),
        ]}
      />
      <Dropdown
        id="rp-slot"
        label={t.slot}
        hideLabel
        value={String(f.slot)}
        onChange={(v) => setF({ ...f, slot: v === "all" ? "all" : Number(v) })}
        options={[
          { value: "all", label: t.allSlot },
          ...[1, 2, 3, 4].map((s) => ({ value: String(s), label: t.slotN(s, SLOT_MULAI[s]) })),
        ]}
      />
      <Dropdown
        id="rp-kelas"
        label={t.kelas}
        hideLabel
        value={f.kelas}
        onChange={(v) => setF({ ...f, kelas: v as Kelas | "all" })}
        options={[
          { value: "all", label: t.allKelas },
          { value: "reguler", label: kelasLabel("reguler", lang) },
          { value: "internasional", label: kelasLabel("internasional", lang) },
        ]}
      />
      <Dropdown
        id="rp-asisten"
        label={t.asisten}
        hideLabel
        value={f.asisten}
        onChange={(v) => setF({ ...f, asisten: v })}
        options={[
          { value: "all", label: t.allAsisten },
          ...orang.map((o) => ({ value: o.nim, label: dir.nama(o.nim) })),
        ]}
      />
      <Dropdown
        id="rp-status"
        label={t.status}
        hideLabel
        value={f.status}
        onChange={(v) => setF({ ...f, status: v as Filter["status"] })}
        options={[
          { value: "all", label: t.allStatus },
          { value: "kurang", label: t.st.kurang },
          { value: "lengkap", label: t.st.lengkap },
          { value: "jalan", label: t.st.jalan },
        ]}
      />
      <Dropdown
        id="rp-view"
        label={t.views}
        hideLabel
        value="none"
        onChange={(v) => {
          if (v === "kurang") setF({ ...f, status: "kurang" });
          else if (v === "intl") {
            const [d, s] = rentangPreset("sem", hariIniWib());
            setF({ ...f, preset: "sem", dari: d, sampai: s, kelas: "internasional" });
          } else if (v === "saya") setF({ ...f, asisten: me });
        }}
        options={[
          { value: "none", label: t.views },
          { value: "kurang", label: t.view.kurang },
          { value: "intl", label: t.view.intl },
          { value: "saya", label: t.view.saya },
        ]}
      />
      <Popover
        open={ex}
        onOpenChange={setEx}
        align="end"
        trigger={
          <button type="button" className="btn btn--inverse" aria-expanded={ex}>
            <ExportIcon size={18} aria-hidden="true" />
            {t.exportView}
          </button>
        }
      >
        <div className="rp-range__presets" role="group" aria-label={t.exportPick}>
          {(
            [
              ["xlsx", FileXlsIcon, "XLSX"],
              ["csv", FileCsvIcon, "CSV"],
              ["pdf", FilePdfIcon, "PDF"],
            ] as const
          ).map(([k, Ic, l]) => (
            <button
              key={k}
              type="button"
              className="rp-menu__i"
              onClick={() => {
                setEx(false);
                onExport(k);
              }}
            >
              <Ic size={20} aria-hidden="true" />
              {l}
            </button>
          ))}
        </div>
      </Popover>
      {aktif > 0 && (
        <span className="rp-fbar__clear">
          <IconButton
            icon={XIcon}
            kind="ghost"
            label={t.clear(aktif)}
            onClick={() =>
              setF({ ...f, modul: "all", slot: "all", kelas: "all", asisten: "all", status: "all" })
            }
          />
        </span>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- tabs */

type Kolom = "tanggal" | "modul" | "kelas" | "asisten" | "hadir" | "nilai" | "lab";
const KOLOM: Kolom[] = ["tanggal", "modul", "kelas", "asisten", "hadir", "nilai", "lab"];
const KOLOM_KEY = "iris-rep-kolom";

function bacaKolom(): Record<Kolom, boolean> {
  const semua = Object.fromEntries(KOLOM.map((k) => [k, true])) as Record<Kolom, boolean>;
  try {
    const raw = JSON.parse(localStorage.getItem(KOLOM_KEY) ?? "{}") as Partial<
      Record<Kolom, boolean>
    >;
    for (const k of KOLOM) if (typeof raw[k] === "boolean") semua[k] = raw[k]!;
  } catch {
    // storage may be blocked; every column shows
  }
  return semua;
}

function NilaiBadge({ s, t }: { s: SesiLaporan; t: Tx }) {
  const st = statusLaporan(s);
  if (st === "jalan") return <Pill tone="ok">{t.st.jalan}</Pill>;
  if (st === "kurang")
    return (
      <Pill tone="warn">
        {s.dinilai[0]}/{s.dinilai[1]}
      </Pill>
    );
  return <Pill tone="ok">{t.st.lengkap}</Pill>;
}

function SessionsTab({
  rows,
  c,
  onOpen,
}: {
  rows: SesiLaporan[];
  c: Ctx;
  onOpen: (id: number) => void;
}) {
  const { t, lang, dir, me } = c;
  const [urut, setUrut] = useState<{ k: KolomUrut; arah: 1 | -1 }>({ k: "tanggal", arah: -1 });
  const [show, setShow] = useState<Record<Kolom, boolean>>(bacaKolom);
  const [colOpen, setColOpen] = useState(false);
  const [grup, setGrup] = useState<"none" | "modul" | "kelas">("none");
  const cols = KOLOM.filter((k) => show[k]);
  const sorted = useMemo(() => urutkan(rows, urut.k, urut.arah), [rows, urut]);
  const groups: [string | null, SesiLaporan[]][] =
    grup === "none"
      ? [[null, sorted]]
      : [...new Set(sorted.map((r) => String(r[grup])))].map((g) => [
          g,
          sorted.filter((r) => String(r[grup]) === g),
        ]);
  const setKolom = (k: Kolom, v: boolean) => {
    const next = { ...show, [k]: v };
    if (!KOLOM.some((x) => next[x])) return;
    setShow(next);
    try {
      localStorage.setItem(KOLOM_KEY, JSON.stringify(next));
    } catch {
      // the choice lasts for this visit only
    }
  };
  const sortable: Partial<Record<Kolom, KolomUrut>> = {
    tanggal: "tanggal",
    modul: "modul",
    kelas: "kelas",
    hadir: "hadir",
    nilai: "nilai",
    lab: "lab",
  };
  const sel = (s: SesiLaporan, k: Kolom) => {
    switch (k) {
      case "tanggal":
        return (
          <span className="rp-date">
            <b>{tanggalPanjang(s.tanggal, lang)}</b>
            <span className="hint">
              {s.jenis === "susulan" ? t.susulan : s.slot ? slotLabel(s.slot, lang) : ""}
              {" · "}
              {jamSlot(s.slot, s.mulai)}
            </span>
          </span>
        );
      case "modul":
        return <Pill modul={s.modul}>{modulLabel(s.modul, lang)}</Pill>;
      case "kelas":
        return (
          <Pill tone={s.kelas === "internasional" ? "violet" : undefined}>
            {kelasLabel(s.kelas, lang)}
          </Pill>
        );
      case "asisten": {
        const kode = [...new Set(s.pasangan.map((p) => p.nim))];
        return kode.length ? (
          <span className="rp-codes">
            {kode.map((nim) => (
              <Tooltip key={nim} label={dir.nama(nim)}>
                <span className={`acode${nim === me ? " acode--me" : ""}`} tabIndex={0}>
                  {dir.byNim.get(nim)?.kode ?? "?"}
                </span>
              </Tooltip>
            ))}
          </span>
        ) : (
          <span className="hint">·</span>
        );
      }
      case "hadir":
        return (
          <span className="num">
            {s.hadir[0]}/{s.hadir[1]}
          </span>
        );
      case "nilai":
        return <NilaiBadge s={s} t={t} />;
      case "lab":
        return s.lab.n ? (
          <span className="num">{fmt1(s.lab.jumlah / s.lab.n, lang)}</span>
        ) : (
          <span className="hint">·</span>
        );
    }
  };
  return (
    <div className="stack">
      <div className="rp-toolbar">
        <span className="hint">{t.match(rows.length)}</span>
        <span className="rp-toolbar__end">
          <span className="rp-label">{t.groupBy}</span>
          <div className="seg" role="radiogroup" aria-label={t.groupBy}>
            {(["none", "modul", "kelas"] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={grup === g}
                onClick={() => setGrup(g)}
              >
                {t.gb[g]}
              </button>
            ))}
          </div>
          <Popover
            open={colOpen}
            onOpenChange={setColOpen}
            align="end"
            trigger={
              <button type="button" className="btn btn--sm" aria-pressed={colOpen}>
                <ColumnsIcon size={18} aria-hidden="true" />
                {t.columns}
              </button>
            }
          >
            <div className="rp-cols">
              <b>{t.columnsShown}</b>
              {KOLOM.map((k) => (
                <label key={k}>
                  <span>{t.col[k]}</span>
                  <Switch on={show[k]} onChange={(v) => setKolom(k, v)} label={t.col[k]} />
                </label>
              ))}
            </div>
          </Popover>
        </span>
      </div>
      <section className="rp-card rp-card--flush">
        <div className="rp-scrollx" tabIndex={0} aria-label={t.tabs.sesi}>
          <table className="rp-table">
            <thead>
              <tr>
                {cols.map((k) => {
                  const key = sortable[k];
                  if (!key) return <th key={k}>{t.col[k]}</th>;
                  const on = urut.k === key;
                  const Ic = on ? (urut.arah > 0 ? CaretUpIcon : CaretDownIcon) : ArrowsDownUpIcon;
                  return (
                    <th
                      key={k}
                      aria-sort={on ? (urut.arah > 0 ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        className="rp-thsort"
                        aria-sort={on ? (urut.arah > 0 ? "ascending" : "descending") : "none"}
                        aria-label={t.sortBy(t.col[k])}
                        onClick={() => setUrut({ k: key, arah: on ? (-urut.arah as 1 | -1) : -1 })}
                      >
                        {t.col[k]}
                        <Ic size={14} aria-hidden="true" />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map(([g, list]) => [
                g != null && (
                  <tr key={`g-${g}`} className="rp-tgroup">
                    <td colSpan={cols.length}>
                      <b>
                        {grup === "modul"
                          ? modulLabel(Number(g), lang)
                          : kelasLabel(g as Kelas, lang)}
                      </b>{" "}
                      <span className="hint">· {t.nSesi(list.length)}</span>
                    </td>
                  </tr>
                ),
                ...list.map((s) => (
                  <tr
                    key={s.id}
                    className="is-link"
                    tabIndex={0}
                    onClick={() => onOpen(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen(s.id);
                      }
                    }}
                  >
                    {cols.map((k) => (
                      <td key={k}>{sel(s, k)}</td>
                    ))}
                  </tr>
                )),
              ])}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length}>
                    <p className="rp-empty">{t.noSessions}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OverviewTab({ rows, c }: { rows: SesiLaporan[]; c: Ctx }) {
  const { t, lang } = c;
  const o = ikhtisar(rows);
  return (
    <div className="stack">
      <div className="rp-stats">
        <div className="rp-stat">
          <b>{pct(o.hadir, lang)}</b>
          <span>{t.ovHadir}</span>
        </div>
        <div className="rp-stat">
          <b>{o.skorRata == null ? "·" : fmt1(o.skorRata, lang)}</b>
          <span>{t.ovSkor}</span>
        </div>
        <div className="rp-stat">
          <b>{pct(o.blank, lang)}</b>
          <span>{t.ovBlank}</span>
        </div>
        <div className="rp-stat">
          <b>{o.labRata == null ? "·" : fmt1(o.labRata, lang)}</b>
          <span>{t.ovLab}</span>
        </div>
      </div>
      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">{t.byModul}</h2>
          <span className="hint">{t.byModulSub}</span>
        </div>
        <div>
          {o.perModul.map((m) => (
            <div key={m.modul} className="rp-cmprow">
              <Pill modul={m.modul}>{modulLabel(m.modul, lang)}</Pill>
              <div className="rp-cmprow__bars">
                {(["reguler", "internasional"] as const).map((k) => {
                  const v = m[k];
                  return (
                    <div key={k} className="rp-cmprow__bar">
                      <span className="hint">{kelasLabel(k, lang)}</span>
                      <span
                        className="meter"
                        role="img"
                        aria-label={`${kelasLabel(k, lang)}: ${v == null ? t.noData : fmt1(v, lang)}`}
                        style={
                          {
                            "--meter": v ?? 0,
                            "--meter-hue":
                              k === "internasional" ? "var(--violet)" : `var(--mod-${m.modul})`,
                          } as CSSProperties
                        }
                      />
                      <b className="num">{v == null ? "·" : Math.round(v)}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LoadTab({ rows, c }: { rows: SesiLaporan[]; c: Ctx }) {
  const { t, dir, me } = c;
  const list = beban(rows, hariIniWib());
  const maks = Math.max(1, ...list.map((b) => b.minggu));
  if (!list.length) return <p className="empty-note">{t.noWorkload}</p>;
  return (
    <section className="rp-card rp-card--flush">
      <div className="rp-scrollx" tabIndex={0} aria-label={t.tabs.beban}>
        <table className="rp-table">
          <thead>
            <tr>
              <th>{t.wl.asisten}</th>
              <th>{t.wl.minggu}</th>
              <th>{t.wl.sesi}</th>
              <th>{t.wl.kelompok}</th>
              <th>{t.wl.ganda}</th>
              <th>{t.wl.ganti}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => {
              const o = dir.byNim.get(b.nim);
              return (
                <tr key={b.nim}>
                  <td>
                    <span className="row row--nowrap">
                      <span className={`acode${b.nim === me ? " acode--me" : ""}`}>
                        {o?.kode ?? "?"}
                      </span>
                      <span>{o?.nama ?? b.nim}</span>
                    </span>
                  </td>
                  <td>
                    <span className="row row--nowrap">
                      <span
                        className="meter"
                        style={{ "--meter": (b.minggu / maks) * 100, width: 90 } as CSSProperties}
                        aria-hidden="true"
                      />
                      <b className="num">{b.minggu}</b>
                    </span>
                  </td>
                  <td className="num">{b.sesi}</td>
                  <td className="num">{b.kelompok}</td>
                  <td>
                    {b.ganda ? (
                      <Tooltip label={t.gandaTip}>
                        <span tabIndex={0}>
                          <Pill tone="warn">{b.ganda}×</Pill>
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="hint">·</span>
                    )}
                  </td>
                  <td>
                    {b.ganti ? (
                      <Pill tone="accent">{b.ganti}×</Pill>
                    ) : (
                      <span className="hint">·</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LabTab({ rows, c }: { rows: SesiLaporan[]; c: Ctx }) {
  const { t, lang } = c;
  const ids = rows.slice(0, 500).map((r) => r.id);
  const kunci = ids.join(",");
  const [data, setData] = useState<Ringkasan | null>(null);
  const [fail, setFail] = useState(false);
  useEffect(() => {
    let alive = true;
    setData(null);
    setFail(false);
    getJson<{ ok: boolean; ringkasan: Ringkasan }>(
      `/api/session/feedback?scope=lab&sesiIds=${kunci}`,
    )
      .then((d) => alive && (d.ok ? setData(d.ringkasan) : setFail(true)))
      .catch(() => alive && setFail(true));
    return () => {
      alive = false;
    };
  }, [kunci]);
  if (fail) return <p className="empty-note">{t.err}</p>;
  if (!data) return <span className="skeleton" style={{ height: 220 }} />;
  return (
    <div className="rp-g2">
      <section className="panel">
        <h2 className="panel__title">{t.labTitle}</h2>
        <div className="row">
          <b className="rp-big">{data.rataRata == null ? "·" : fmt1(data.rataRata, lang)}</b>
          <span className="hint">{t.labOf(data.jumlah)}</span>
        </div>
        <div className="rp-spread" role="list" aria-label={t.labTitle}>
          {[5, 4, 3, 2, 1].map((n) => {
            const v = data.sebaran[n - 1];
            return (
              <div key={n} className="rp-spread__row" role="listitem">
                <span className="num hint">{n}</span>
                <span
                  className="meter"
                  aria-hidden="true"
                  style={{ "--meter": data.jumlah ? (v / data.jumlah) * 100 : 0 } as CSSProperties}
                />
                <span className="num hint">{v}</span>
              </div>
            );
          })}
        </div>
        <div className="row">
          {data.chips.map((ch) => (
            <Pill key={ch.chip}>
              {LABEL_CHIP[ch.chip]?.[lang] ?? ch.chip} · {ch.n}
            </Pill>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2 className="panel__title">{t.latest}</h2>
        {data.komentar.length === 0 ? (
          <p className="hint">{t.noFeedback}</p>
        ) : (
          data.komentar.slice(0, 4).map((k) => (
            <blockquote key={k.pada + k.teks} className="rp-quote">
              <p>{k.teks}</p>
              <span className="hint">{tanggalPanjang(tanggalWib(k.pada), lang)}</span>
            </blockquote>
          ))
        )}
      </section>
    </div>
  );
}

function AuditTab({ f, c }: { f: Filter; c: Ctx }) {
  const { t, lang, dir } = c;
  // ?audit=konsol (Konsol Pi's "See the Record") opens on that filter.
  const [jenis, setJenis] = useState<JenisAudit | "all">(() => {
    const q =
      typeof location !== "undefined" ? new URLSearchParams(location.search).get("audit") : null;
    return isJenisAudit(q) ? q : "all";
  });
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [rekam, setRekam] = useState<string | null>(null);
  const [ctx, setCtx] = useState<AuditKonteks>({ sesi: [], kelompok: [], jadwal: [], server: [] });
  const [lagi, setLagi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(false);
  const qs = (sebelum?: number) => {
    const p = new URLSearchParams();
    if (jenis !== "all") p.set("jenis", jenis);
    if (f.asisten !== "all") p.set("aktor", f.asisten);
    if (f.dari) p.set("dari", f.dari);
    if (f.sampai) p.set("sampai", f.sampai);
    if (sebelum) p.set("sebelum", String(sebelum));
    return p.toString();
  };
  const ambil = async (sebelum?: number) => {
    const d = await getJson<{
      ok: boolean;
      audit: AuditRow[];
      lagi: boolean;
      konteks: AuditKonteks;
    }>(`/api/session/audit?${qs(sebelum)}`);
    if (!d.ok) throw new Error("audit");
    return d;
  };
  useEffect(() => {
    let alive = true;
    setRows(null);
    setFail(false);
    ambil()
      .then((d) => {
        if (!alive) return;
        setRows(d.audit);
        setCtx(d.konteks);
        setLagi(d.lagi);
      })
      .catch(() => alive && setFail(true));
    return () => {
      alive = false;
    };
  }, [jenis, f.asisten, f.dari, f.sampai]);
  const more = async () => {
    if (!rows?.length) return;
    setBusy(true);
    try {
      const d = await ambil(rows[rows.length - 1].id);
      setRows([...rows, ...d.audit]);
      setCtx({
        sesi: [...ctx.sesi, ...d.konteks.sesi],
        kelompok: [...ctx.kelompok, ...d.konteks.kelompok],
        jadwal: [...ctx.jadwal, ...d.konteks.jadwal],
        server: [...ctx.server, ...d.konteks.server],
      });
      setLagi(d.lagi);
    } catch {
      window.Toast?.show(t.err, "danger");
    }
    setBusy(false);
  };
  const b = bantuAudit(
    lang,
    ctx,
    (nim) => dir.nama(nim),
    (s) => SLOT_MULAI[s] ?? "",
  );
  const waktu = (iso: string) => {
    return `${tanggalPanjang(tanggalWib(iso), lang)} · ${jamWib(iso)}`;
  };
  return (
    <div className="stack">
      <div className="rp-scrollx">
        <div className="seg" role="radiogroup" aria-label={t.audLabel}>
          {(["all", ...JENIS_AUDIT] as const).map((j) => (
            <button
              key={j}
              type="button"
              role="radio"
              aria-checked={jenis === j}
              onClick={() => setJenis(j)}
            >
              {t.aud[j]}
            </button>
          ))}
        </div>
      </div>
      <section className="panel">
        {fail ? (
          <p className="hint">{t.err}</p>
        ) : rows === null ? (
          <span className="skeleton" style={{ height: 200 }} />
        ) : rows.length === 0 ? (
          <p className="hint">{t.noAudit}</p>
        ) : (
          <div className="rp-stops rp-stops--aud">
            {rows.map((r) => {
              const k = kalimatAudit(r, b);
              const Ic = k.icon;
              return (
                <div key={r.id} className={`rp-stops__row${k.danger ? " is-danger" : ""}`}>
                  <span className="mono hint">{waktu(r.pada)}</span>
                  <span className="rp-audline">
                    <Ic size={20} aria-hidden="true" />
                    <span>
                      <b>{dir.nama(r.aktorNim)}</b> {k.teks}
                    </span>
                  </span>
                  {k.transkrip ? (
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => setRekam(k.transkrip ?? null)}
                    >
                      <FileTextIcon size={16} aria-hidden="true" />
                      {t.transkrip}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {lagi && rows && (
          <div className="panel__actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void more()}>
              {t.more}
            </button>
          </div>
        )}
      </section>
      <Dialog
        open={rekam !== null}
        onOpenChange={(o) => !o && setRekam(null)}
        title={t.transkripTitle}
        description={t.transkripDesc}
        size="xl"
        lang={lang}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setRekam(null)}>
            {t.close}
          </button>
        }
      >
        <pre className="rp-transkrip" tabIndex={0}>
          {rekam}
        </pre>
      </Dialog>
    </div>
  );
}

function PayTab({ c, onOpenPay }: { c: Ctx; onOpenPay: () => void }) {
  const { data } = useBayar(true);
  // Everyone sees their own earnings; Admins and the Treasurer also get the
  // semester's cash fund. One card alone is centred.
  if (!data?.admin) {
    return (
      <div className="panel--solo">
        <EarningsCard lang={c.lang} nim={c.me} />
      </div>
    );
  }
  return (
    <div className="rp-g2">
      <EarningsCard lang={c.lang} nim={c.me} />
      <KasTotals data={data} c={c} onOpenPay={onOpenPay} />
    </div>
  );
}

const KAS = {
  id: {
    title: "Uang Kas Semester Ini",
    kotor: "kotor semua asisten",
    kas: "uang kas",
    bersih: "bersih",
    masuk: "Transfer balik yang sudah masuk",
    cAs: "Asisten",
    cK: "Kotor",
    cKas: "Kas",
    cB: "Bersih",
    cBalik: "Transfer Balik",
    lunas: "Lunas",
    belum: "Belum",
    open: "Buka Pembayaran",
  },
  en: {
    title: "This Semester's Cash Fund",
    kotor: "gross, all assistants",
    kas: "cash fund",
    bersih: "net",
    masuk: "Transfers back already in",
    cAs: "Assistant",
    cK: "Gross",
    cKas: "Fund",
    cB: "Net",
    cBalik: "Transfer Back",
    lunas: "Paid",
    belum: "Not Yet",
    open: "Open Payments",
  },
  zh: {
    title: "本学期的团队基金",
    kotor: "总额，全部助教",
    kas: "团队基金",
    bersih: "净额",
    masuk: "已收到的转回",
    cAs: "助教",
    cK: "总额",
    cKas: "基金",
    cB: "净额",
    cBalik: "转回",
    lunas: "已付",
    belum: "还没有",
    open: "打开付款",
  },
};

function KasTotals({
  data,
  c,
  onOpenPay,
}: {
  data: NonNullable<ReturnType<typeof useBayar>["data"]>;
  c: Ctx;
  onOpenPay: () => void;
}) {
  const { lang, dir, t } = c;
  const k = KAS[lang];
  const total = jumlahkan(data.units);
  const masuk = data.transfer.filter((x) => x.jenis === "balik").reduce((a, x) => a + x.jumlah, 0);
  const per = new Map<string, typeof data.units>();
  for (const u of data.units) per.set(u.nimPenilai, [...(per.get(u.nimPenilai) ?? []), u]);
  const baris = [...per.entries()]
    .map(([nim, us]) => {
      const j = jumlahkan(us);
      const balik = data.transfer
        .filter((x) => x.nim === nim && x.jenis === "balik")
        .reduce((a, x) => a + x.jumlah, 0);
      const persen = [...new Set(us.map((u) => u.kasPersen))];
      return { nim, j, lunas: nim === data.bendahara || balik >= j.kas, persen };
    })
    .sort((a, b) => dir.nama(a.nim).localeCompare(dir.nama(b.nim)));
  const xlsx = () =>
    void ekspor(
      "xlsx",
      `uang-kas-${data.semester}`,
      k.title,
      "",
      [k.cAs, k.cK, k.cKas, k.cB, k.cBalik],
      baris.map((r) => [
        dir.nama(r.nim),
        r.j.kotor,
        r.j.kas,
        r.j.bersih,
        r.lunas ? k.lunas : k.belum,
      ]),
      lang,
    ).then(() => window.Toast?.show(t.exported(baris.length, "XLSX"), "ok"));
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{k.title}</h2>
        <Pill tone="violet">{data.kas.persen}%</Pill>
      </div>
      <div className="rp-kastot">
        <div className="rp-stat">
          <b className="num">{rupiah(total.kotor)}</b>
          <span>{k.kotor}</span>
        </div>
        <div className="rp-stat">
          <b className="num">{rupiah(total.kas)}</b>
          <span>{k.kas}</span>
        </div>
        <div className="rp-stat">
          <b className="num">{rupiah(total.bersih)}</b>
          <span>{k.bersih}</span>
        </div>
      </div>
      <div className="stack stack--sm">
        <div className="row row--between">
          <span className="label-caps">{k.masuk}</span>
          <span className="num">
            {rupiah(masuk)} / {rupiah(total.kas)}
          </span>
        </div>
        <span
          className="meter"
          style={
            { "--meter": total.kas ? Math.min(100, (masuk / total.kas) * 100) : 0 } as CSSProperties
          }
          aria-hidden="true"
        />
      </div>
      <div className="rp-scrollx">
        <table className="rp-table rp-table--tight">
          <thead>
            <tr>
              <th>{k.cAs}</th>
              <th>{k.cK}</th>
              <th>{k.cKas}</th>
              <th>{k.cB}</th>
              <th>{k.cBalik}</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((r) => (
              <tr key={r.nim}>
                <td>{dir.nama(r.nim)}</td>
                <td className="num">{rupiah(r.j.kotor)}</td>
                <td className="num">
                  {rupiah(r.j.kas)}{" "}
                  {r.persen.some((p) => p !== data.kas.persen) && (
                    <Pill tone="violet">{r.persen.join("/")}%</Pill>
                  )}
                </td>
                <td className="num">
                  <b>{rupiah(r.j.bersih)}</b>
                </td>
                <td>
                  {r.lunas ? <Pill tone="ok">{k.lunas}</Pill> : <Pill tone="warn">{k.belum}</Pill>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel__actions row--end">
        <button type="button" className="btn btn--sm" onClick={xlsx}>
          <FileXlsIcon size={18} aria-hidden="true" />
          {t.exportView}
        </button>
        <button type="button" className="btn btn--inverse btn--sm" onClick={onOpenPay}>
          {k.open}
        </button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- home */

export default function Home({
  rows,
  c,
  f,
  setF,
  tab,
  setTab,
  onOpen,
  onDocs,
  onOpenPay,
}: {
  rows: SesiLaporan[];
  c: Ctx;
  f: Filter;
  setF: (f: Filter) => void;
  tab: TabHome;
  setTab: (t: TabHome) => void;
  onOpen: (id: number) => void;
  onDocs: () => void;
  onOpenPay: () => void;
}) {
  const { t, lang, dir } = c;
  const shown = useMemo(() => rows.filter(cocok(f)), [rows, f]);
  const exportView = (fmt: Format) => {
    const kepala = [
      t.col.tanggal,
      "Slot",
      t.col.modul,
      t.col.kelas,
      t.col.asisten,
      t.col.hadir,
      t.col.nilai,
      t.col.lab,
    ];
    const baris = shown.map((s) => [
      tanggalPanjang(s.tanggal, lang),
      s.slot ? `${s.slot} · ${jamSlot(s.slot, s.mulai)}` : s.mulai,
      modulLabel(s.modul, lang),
      kelasLabel(s.kelas, lang),
      [...new Set(s.pasangan.map((p) => dir.nama(p.nim)))].join(", "),
      `${s.hadir[0]}/${s.hadir[1]}`,
      statusLaporan(s) === "jalan" ? t.st.jalan : `${s.dinilai[0]}/${s.dinilai[1]}`,
      s.lab.n ? Math.round((s.lab.jumlah / s.lab.n) * 10) / 10 : null,
    ]);
    const range =
      f.dari && f.sampai
        ? t.rangeTip(tanggalPanjang(f.dari, lang), tanggalPanjang(f.sampai, lang))
        : t.presets.all;
    void ekspor(
      fmt,
      `laporan-sesi-${hariIniWib()}`,
      t.title,
      `${range} · ${t.match(shown.length)}`,
      kepala,
      baris,
      lang,
    )
      .then(() => window.Toast?.show(t.exported(shown.length, fmt.toUpperCase()), "ok"))
      .catch(() => window.Toast?.show(t.err, "danger"));
  };
  return (
    <div className="rp rp--home">
      <header className="page-header">
        <div className="page-header__row">
          <div className="page-header__heading">
            <span className="page-header__eyebrow">{t.eyebrow}</span>
            <h1 className="page-header__title">{t.title}</h1>
          </div>
          <div className="page-header__actions">
            <button type="button" className="btn btn--inverse" onClick={onDocs}>
              <NotePencilIcon size={18} aria-hidden="true" />
              {t.written}
            </button>
          </div>
        </div>
      </header>
      <FilterBar f={f} setF={setF} c={c} onExport={exportView} />
      <TabLine
        label={t.tabsLabel}
        value={tab}
        onChange={setTab}
        tabs={TAB_HOME.map((v) => ({
          v,
          label: t.tabs[v],
          n: v === "sesi" ? shown.length : undefined,
        }))}
      />
      <Fade k={tab}>
        {tab === "sesi" && <SessionsTab rows={shown} c={c} onOpen={onOpen} />}
        {tab === "ringkasan" && <OverviewTab rows={shown} c={c} />}
        {tab === "beban" && <LoadTab rows={shown} c={c} />}
        {tab === "kejadian" && <IncidentsTab rows={shown} t={t} lang={lang} dir={dir} />}
        {tab === "lab" && <LabTab rows={shown} c={c} />}
        {tab === "audit" && <AuditTab f={f} c={c} />}
        {tab === "bayar" && <PayTab c={c} onOpenPay={onOpenPay} />}
      </Fade>
    </div>
  );
}
