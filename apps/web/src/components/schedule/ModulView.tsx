/**
 * Jadwal › Per Modul: which Asisten holds which group in each module, for
 * every slot of the semester. The semester's switch turns it on; off, every
 * group keeps the same Asisten all semester and the lists wait.
 *
 * Admins, DEV and the Pencipta (hakPenuh) edit; everyone else reads. Edits
 * are a draft until Simpan: a slot's dialog picks per group and module from
 * its own default Asisten, and Acak / Putar fill a slot (or all of them)
 * while the modules a slot already taught stay as they are (their lists
 * can't be picked by hand either).
 *
 * Synced with the Schedule's drawer (2026-10-15): the drawer edits a date's
 * module list, the same data; Lihat di Jadwal opens a slot's drawer, and the
 * drawer's Buka Per Modul comes back here with that slot flashed.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LockSimpleIcon } from "@phosphor-icons/react";
import BackButton from "../ui/BackButton";
import Confirm from "../ui/Confirm";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import Pill from "../ui/Pill";
import TabLine from "../ui/TabLine";
import Tooltip from "../ui/Tooltip";
import { Stepper, Switch } from "../ui/Controls";
import { postJson } from "../../lib/app";
import { useMinWidth } from "../../lib/hooks";
import { useBelumSimpan } from "../../lib/belum-simpan";
import { SLOT_MULAI } from "../../lib/jadwal";
import {
  hariLabel,
  kelompokLabel,
  klpLabel,
  modulLabel,
  slotLabel as slotName,
} from "../../lib/labels";
import { pasanganSemester } from "../../lib/penugasan-minggu";
import {
  acakModul,
  daftarModul,
  kolam,
  MODUL_BAWAAN,
  MODUL_MAKS,
  putar,
  ulang,
} from "../../lib/penugasan-modul";
import type { Lang } from "../../lib/kelas";
import { J } from "./strings";
import type { DataJadwal, JadwalRow } from "./types";

type Daftar = Record<number, string[] | null>;
type Draf = Record<number, Daftar>;

const LOCALE: Record<Lang, string> = { id: "id-ID", en: "en-GB", zh: "zh-CN" };

/** "19 sampai 24 Oktober" from the week's Monday and Saturday. */
function rentang(lang: Lang, senin: string, sabtu: string): string {
  const f = (d: string, opt: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(LOCALE[lang], { timeZone: "UTC", ...opt }).format(
      new Date(`${d}T00:00:00Z`),
    );
  const a = f(senin, { day: "numeric" });
  const b = f(sabtu, { day: "numeric", month: "long" });
  return lang === "en" ? `${a} to ${b}` : lang === "zh" ? `${a} 至 ${b}` : `${a} sampai ${b}`;
}

const bawaanDari = (j: JadwalRow) =>
  pasanganSemester(j.asisten, j.jumlahKelompok).map((k) => k ?? "");

function drafAwal(rows: JadwalRow[], modul: readonly number[]): Draf {
  const out: Draf = {};
  for (const j of rows) {
    out[j.id] = {};
    for (const m of modul) out[j.id][m] = j.asistenModul?.[String(m)] ?? null;
  }
  return out;
}

export default function ModulView({
  lang,
  semester,
  data,
  meKode,
  boleh,
  onBack,
  onSaved,
  sorot,
  onJadwal,
}: {
  lang: Lang;
  semester: string;
  data: DataJadwal;
  meKode: string;
  boleh: boolean;
  onBack: () => void;
  onSaved: () => void;
  /** A slot to flash once drawn (from the drawer's Buka Per Modul) */
  sorot?: { hari: number; slot: number } | null;
  /** Opens a slot's drawer in the Schedule */
  onJadwal?: (hari: number, slot: number) => void;
}) {
  const t = J[lang];
  const p = t.pm;
  const lebar = useMinWidth(1100);
  const rows = useMemo(
    () =>
      data.jadwal
        .filter((j) => j.semester === semester && j.status !== "kosong")
        .sort((a, b) => a.hari - b.hari || a.slot - b.slot),
    [data, semester],
  );
  const [jumlah, setJumlah] = useState(data.jumlahModul ?? MODUL_BAWAAN);
  useEffect(() => setJumlah(data.jumlahModul ?? MODUL_BAWAAN), [data.jumlahModul]);
  const modulList = useMemo(() => daftarModul(jumlah), [jumlah]);
  const awal = useMemo(() => drafAwal(rows, modulList), [rows, modulList]);
  const [draf, setDraf] = useState<Draf>(awal);
  // A new saved state (a save, someone else's change, the module count)
  // becomes the draft unless there are edits waiting.
  const awalLalu = useRef(awal);
  useEffect(() => {
    const lalu = awalLalu.current;
    awalLalu.current = awal;
    setDraf((d) => (JSON.stringify(d) === JSON.stringify(lalu) ? awal : d));
  }, [awal]);
  const [bergilir, setBergilir] = useState(!!data.bergilir);
  const [tab, setTab] = useState("1");
  const [ubah, setUbah] = useState<number | null>(null);
  // Leaving with unsaved changes asks first: back, or to a slot's drawer.
  const [tanya, setTanya] = useState<null | (() => void)>(null);
  const [busy, setBusy] = useState(false);
  const diajar = data.diajar ?? {};
  const berubah = rows.filter((j) => JSON.stringify(draf[j.id]) !== JSON.stringify(awal[j.id]));
  useBelumSimpan(berubah.length > 0);
  const pergi = (fn: () => void) => (berubah.length ? setTanya(() => fn) : fn());

  // The drawer's Buka Per Modul: that slot, flashed like the Schedule's ?slot=
  useEffect(() => {
    if (!sorot) return;
    const id = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `.pmview [data-slot="${sorot.hari}-${sorot.slot}"]`,
      );
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.dataset.fokus = "yes";
      window.setTimeout(() => delete el.dataset.fokus, 3200);
    });
    return () => cancelAnimationFrame(id);
  }, [sorot]);

  const efektif = (j: JadwalRow, m: number, d: Draf = draf) => d[j.id]?.[m] ?? bawaanDari(j);
  const semua = (j: JadwalRow, d: Draf = draf) =>
    Object.fromEntries(modulList.map((m) => [m, efektif(j, m, d)])) as Record<number, string[]>;
  const tetapDi = (j: JadwalRow, d: Draf = draf) =>
    Object.fromEntries((diajar[String(j.id)] ?? []).map((m) => [m, efektif(j, m, d)]));

  /** A slot's lists after Acak, Putar or Bawaan; taught modules stay. */
  function isiSlot(j: JadwalRow, cara: "acak" | "putar" | "bawaan", d: Draf): Daftar {
    const n = j.jumlahKelompok;
    const tetap = tetapDi(j, d);
    const baru: Record<number, string[] | null> =
      cara === "acak"
        ? acakModul(j.asisten, n, Math.random, tetap, modulList)
        : cara === "putar"
          ? putar(j.asisten, n, modulList)
          : Object.fromEntries(modulList.map((m) => [m, null]));
    const out: Daftar = {};
    for (const m of modulList) out[m] = m in tetap ? (d[j.id]?.[m] ?? null) : baru[m];
    return out;
  }
  const semuaSlot = (cara: "acak" | "putar") =>
    setDraf((d) => {
      const n: Draf = { ...d };
      for (const j of rows) if (kolam(j.asisten).length) n[j.id] = isiSlot(j, cara, d);
      return n;
    });

  async function aturSwitch(v: boolean) {
    setBergilir(v);
    try {
      const r = await postJson<{ ok: boolean }>("/api/session/schedule", { semester, bergilir: v });
      if (!r.ok) throw new Error();
      window.Toast?.show(v ? p.onToast : p.offToast, "ok");
      onSaved();
    } catch {
      setBergilir(!v);
      window.Toast?.show(t.fail, "danger");
    }
  }

  /** Jumlah Modul: saved at once, like the switch; refused over a draft. */
  async function aturJumlah(v: number) {
    if (v === jumlah) return;
    if (berubah.length) return window.Toast?.show(p.countLock, "warn");
    const lama = jumlah;
    setJumlah(v);
    if (Number(tab) > v) setTab(String(v));
    try {
      const r = await postJson<{ ok: boolean }>("/api/session/schedule", {
        semester,
        jumlahModul: v,
      });
      if (!r.ok) throw new Error();
      window.Toast?.show(p.countSaved(v), "ok");
      onSaved();
    } catch {
      setJumlah(lama);
      window.Toast?.show(t.fail, "danger");
    }
  }

  async function simpan() {
    setBusy(true);
    try {
      const r = await postJson<{ ok: boolean; kode?: string; disimpan?: number }>(
        "/api/session/schedule",
        {
          semester,
          pasanganModul: berubah.map((j) => ({ hari: j.hari, slot: j.slot, modul: draf[j.id] })),
        },
      );
      if (!r.ok) {
        window.Toast?.show(r.kode === "kode_di_luar_slot" ? p.outside : t.fail, "danger");
        return;
      }
      window.Toast?.show(p.saved(r.disimpan ?? berubah.length), "ok");
      onSaved();
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }

  const klpOf = (j: JadwalRow, nomor: number) =>
    data.klp?.[`${j.hari}-${j.slot}`]?.[String(nomor)] ?? null;
  const adaKlp = (j: JadwalRow) => Object.keys(data.klp?.[`${j.hari}-${j.slot}`] ?? {}).length > 0;
  const slotJudul = (j: JadwalRow) =>
    `${hariLabel(j.hari, lang)} · ${slotName(j.slot, lang)} · ${SLOT_MULAI[j.slot]}`;
  const minggu = data.modulMinggu ?? {};
  const kepala = (m: number) => {
    const w = minggu[String(m)];
    return (
      <>
        <b>{modulLabel(m, lang)}</b>
        <span className="hint">{w ? rentang(lang, w.senin, w.sabtu) : p.weekNone}</span>
      </>
    );
  };

  /** One module's seats of a slot, group by group. `rata`: another module
   *  of the row carries the taught mark, so this one keeps its line empty
   *  and the groups stay level across the row. */
  const kursi = (j: JadwalRow, m: number, rata = false) => {
    const list = efektif(j, m);
    const lagi = ulang(semua(j), kolam(j.asisten))[m] ?? [];
    const sudah = (diajar[String(j.id)] ?? []).includes(m);
    return (
      <div className="pmseats" data-taught={sudah ? "yes" : undefined}>
        {sudah ? (
          <Pill tone="teal">{p.taught}</Pill>
        ) : (
          rata && <span className="pmseats__flag" aria-hidden="true" />
        )}
        <ul className="pmseats__list">
          {list.map((k, g) => (
            <li key={g} className="pmseat">
              <Pill group={g + 1} className="pmseat__g">
                {g + 1}
              </Pill>
              {adaKlp(j) && (
                <span className="pmseat__klp">
                  {klpLabel(klpOf(j, g + 1)) && <Pill mono>{klpLabel(klpOf(j, g + 1))}</Pill>}
                </span>
              )}
              {k ? (
                <span className={`acode${k === meKode ? " acode--me" : ""}`}>{k}</span>
              ) : (
                <span className="hint">{p.open0}</span>
              )}
              {lagi[g] && (
                <Tooltip label={p.repeatTip}>
                  <span tabIndex={0}>
                    <Pill tone="warn">{p.repeat}</Pill>
                  </span>
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const tanda = (j: JadwalRow) => (
    <span className="row pmslot__tags">
      {j.kelas === "internasional" && <Pill tone="violet">{t.inter}</Pill>}
      <Pill tone={modulList.some((m) => draf[j.id]?.[m]) ? "accent" : undefined}>
        {modulList.some((m) => draf[j.id]?.[m]) ? p.custom : p.asDefault}
      </Pill>
    </span>
  );
  /** Ubah over Lihat di Jadwal (2x1, the main one on top), pinned to the
   *  slot's bottom at its full width. */
  const tombol = (j: JadwalRow) =>
    (boleh || onJadwal) && (
      <div className="pmacts">
        {boleh && (
          <button type="button" className="btn btn--sm btn--primary" onClick={() => setUbah(j.id)}>
            {p.ubah}
          </button>
        )}
        {onJadwal && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => pergi(() => onJadwal(j.hari, j.slot))}
          >
            {p.lihatJadwal}
          </button>
        )}
      </div>
    );

  const sedang = rows.find((j) => j.id === ubah) ?? null;

  return (
    <div className="jpage pmview">
      <BackButton lang={lang} label={p.back} onClick={() => pergi(onBack)} />
      <div className="jpage__head">
        <div className="page-header__heading">
          <span className="page-header__eyebrow">{t.eyebrow}</span>
          <h1 className="page-header__title">{p.title}</h1>
        </div>
        {boleh && rows.length > 0 && (
          <div className="jtools">
            <button type="button" className="btn" onClick={() => semuaSlot("putar")}>
              {p.putarAll}
            </button>
            <button type="button" className="btn" onClick={() => semuaSlot("acak")}>
              {p.acakAll}
            </button>
          </div>
        )}
      </div>

      <section className="panel pmmode">
        <label className="pmmode__switch">
          <Switch
            on={bergilir}
            onChange={(v) => void aturSwitch(v)}
            label={p.switchL}
            disabled={!boleh}
          />
          <span className="stack stack--sm">
            <b>{p.switchL}</b>
            <span className="hint">{bergilir ? p.onHint : p.offHint}</span>
          </span>
        </label>
        <div className="pmmode__weeks">
          <span className="label">{p.weeks}</span>
          <ul className="pmweeks">
            {modulList.map((m) => (
              <li
                key={m}
                style={{ "--m": `var(--mod-${m}, var(--hairline-strong))` } as CSSProperties}
              >
                {kepala(m)}
              </li>
            ))}
          </ul>
          <span className="hint">{p.weekHint}</span>
        </div>
        <div className="row row--between pmmode__count">
          <span className="stack stack--sm">
            <b>{p.count}</b>
            <span className="hint">{p.countHint}</span>
          </span>
          {boleh ? (
            <Stepper
              value={jumlah}
              onChange={(v) => void aturJumlah(v)}
              min={1}
              max={MODUL_MAKS}
              label={p.count}
              lessLabel={t.fewer}
              moreLabel={t.more}
            />
          ) : (
            <b className="num">{jumlah}</b>
          )}
        </div>
      </section>

      {!boleh ? (
        <div className="banner banner--lock">
          <LockSimpleIcon size={20} aria-hidden="true" />
          <span>{p.ro}</span>
        </div>
      ) : (
        <p className="hint">{p.toolsHint}</p>
      )}

      {berubah.length > 0 && (
        <div className="pmbar panel">
          <Pill tone="accent">{p.changes(berubah.length)}</Pill>
          <span className="grow" />
          <button type="button" className="btn btn--ghost" onClick={() => setDraf(awal)}>
            {t.discard}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void simpan()}
          >
            {t.save}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="hint">{p.noSlots}</p>
      ) : lebar ? (
        <div
          className="pmtable"
          role="table"
          aria-label={p.title}
          style={{ "--n": modulList.length } as CSSProperties}
        >
          <div className="pmtable__row pmtable__head" role="row">
            <span role="columnheader" />
            {modulList.map((m) => (
              <span
                key={m}
                role="columnheader"
                className="pmtable__mod"
                style={{ "--m": `var(--mod-${m}, var(--hairline-strong))` } as CSSProperties}
              >
                {kepala(m)}
              </span>
            ))}
          </div>
          {rows.map((j) => (
            <div
              key={j.id}
              className="pmtable__row"
              role="row"
              data-slot={`${j.hari}-${j.slot}`}
              data-intl={j.kelas === "internasional" ? "yes" : undefined}
            >
              <div role="rowheader" className="pmslot">
                <b>{slotJudul(j)}</b>
                {tanda(j)}
                {tombol(j)}
              </div>
              {modulList.map((m) => (
                <div key={m} role="cell">
                  {kursi(j, m, (diajar[String(j.id)] ?? []).length > 0)}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <>
          <TabLine
            label={p.modTabs}
            value={tab}
            onChange={setTab}
            tabs={modulList.map((m) => ({ v: String(m), label: modulLabel(m, lang) }))}
          />
          <p className="hint">
            {minggu[tab] ? rentang(lang, minggu[tab]!.senin, minggu[tab]!.sabtu) : p.weekNone}
          </p>
          <div className="pmcards">
            {rows.map((j) => (
              <section
                key={j.id}
                className="panel pmcard"
                data-slot={`${j.hari}-${j.slot}`}
                data-intl={j.kelas === "internasional" ? "yes" : undefined}
              >
                <div className="pmslot">
                  <b>{slotJudul(j)}</b>
                  {tanda(j)}
                </div>
                {kursi(j, Number(tab))}
                {tombol(j)}
              </section>
            ))}
          </div>
        </>
      )}

      {sedang && (
        <SlotDialog
          key={sedang.id}
          lang={lang}
          j={sedang}
          judul={slotJudul(sedang)}
          awal={draf[sedang.id]}
          diajar={diajar[String(sedang.id)] ?? []}
          modulList={modulList}
          klp={data.klp?.[`${sedang.hari}-${sedang.slot}`]}
          isi={(cara, d) => isiSlot(sedang, cara, { ...draf, [sedang.id]: d })}
          onClose={() => setUbah(null)}
          onApply={(d) => {
            setDraf((x) => ({ ...x, [sedang.id]: d }));
            setUbah(null);
          }}
        />
      )}

      <Confirm
        open={tanya !== null}
        onOpenChange={(o) => !o && setTanya(null)}
        title={t.unsavedTitle}
        body={p.leaveBody}
        confirmLabel={t.discard}
        cancelLabel={t.stay}
        lang={lang}
        onConfirm={() => {
          const lanjut = tanya;
          setTanya(null);
          setDraf(awal);
          lanjut?.();
        }}
      />
    </div>
  );
}

/** One slot's groups by module, its own default Asisten to pick from. */
function SlotDialog({
  lang,
  j,
  judul,
  awal,
  diajar,
  modulList,
  klp,
  isi,
  onClose,
  onApply,
}: {
  lang: Lang;
  j: JadwalRow;
  judul: string;
  awal: Daftar;
  diajar: number[];
  modulList: readonly number[];
  klp?: Record<string, string>;
  isi: (cara: "acak" | "putar" | "bawaan", d: Daftar) => Daftar;
  onClose: () => void;
  onApply: (d: Daftar) => void;
}) {
  const t = J[lang];
  const p = t.pm;
  const sempit = !useMinWidth(720);
  const [d, setD] = useState<Daftar>(awal);
  const [tab, setTab] = useState("1");
  const bawaan = bawaanDari(j);
  const pool = kolam(j.asisten);
  const opsi = [{ value: "", label: p.open0 }, ...pool.map((k) => ({ value: k, label: k }))];
  const list = (m: number) => d[m] ?? bawaan;
  const lagi = ulang(Object.fromEntries(modulList.map((m) => [m, list(m)])), pool);
  const pasang = (m: number, g: number, k: string) =>
    setD((x) => {
      const l = [...(x[m] ?? bawaan)];
      l[g] = k;
      return { ...x, [m]: l };
    });
  const modul = sempit ? [Number(tab)] : [...modulList];
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={p.dlgTitle}
      description={judul}
      size="xl"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onApply(d)}>
            {p.apply}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="hint">{p.dlgHint}</p>
        <div className="pmdlg__tools">
          <button type="button" className="btn btn--sm" onClick={() => setD(isi("putar", d))}>
            {p.putar}
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setD(isi("acak", d))}>
            {p.acak}
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setD(isi("bawaan", d))}>
            {p.bawaan}
          </button>
        </div>
        {sempit && (
          <TabLine
            label={p.modTabs}
            value={tab}
            onChange={setTab}
            tabs={modulList.map((m) => ({ v: String(m), label: modulLabel(m, lang) }))}
          />
        )}
        <div className="pmdlg__grid" style={{ "--cols": modul.length } as CSSProperties}>
          <span />
          {modul.map((m) => (
            <span key={m} className="pmdlg__mod">
              {!sempit && <b>{modulLabel(m, lang)}</b>}
              {diajar.includes(m) && <Pill tone="teal">{p.taught}</Pill>}
            </span>
          ))}
          {bawaan.map((_, g) => (
            <div key={g} className="pmdlg__row">
              <span className="pmdlg__g">
                <Pill group={g + 1}>{kelompokLabel(g + 1, lang)}</Pill>
                {klp?.[String(g + 1)] && <Pill mono>{klpLabel(klp[String(g + 1)])}</Pill>}
              </span>
              {modul.map((m) => (
                <div key={m} className="pmdlg__cell" data-repeat={lagi[m]?.[g] ? "yes" : undefined}>
                  <Dropdown
                    id={`pm-${j.id}-${m}-${g}`}
                    label={`${kelompokLabel(g + 1, lang)}, ${modulLabel(m, lang)}`}
                    hideLabel
                    options={opsi}
                    value={list(m)[g] ?? ""}
                    onChange={(v) => pasang(m, g, v)}
                    disabled={diajar.includes(m)}
                  />
                  {lagi[m]?.[g] && <span className="hint pmdlg__lagi">{p.repeat}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
