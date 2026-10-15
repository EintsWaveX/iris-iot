/**
 * Jadwal › Per Modul: which Asisten holds which group in each module, for
 * every slot of the semester. The semester's switch turns it on; off, every
 * group keeps the same Asisten all semester and the lists wait.
 *
 * Admins, DEV and the Pencipta (hakPenuh) edit; everyone else reads. Edits
 * are a draft until Simpan: a slot's dialog picks per group and module from
 * its own default Asisten, and Acak / Putar fill a slot (or all of them)
 * while the modules a slot already taught stay as they are.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { CaretRightIcon, LockSimpleIcon } from "@phosphor-icons/react";
import BackButton from "../ui/BackButton";
import Confirm from "../ui/Confirm";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import Pill from "../ui/Pill";
import TabLine from "../ui/TabLine";
import Tooltip from "../ui/Tooltip";
import { Switch } from "../ui/Controls";
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
import { MODUL_PASANGAN, acakModul, kolam, putar, ulang } from "../../lib/penugasan-modul";
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

function drafAwal(rows: JadwalRow[]): Draf {
  const out: Draf = {};
  for (const j of rows) {
    out[j.id] = {};
    for (const m of MODUL_PASANGAN) out[j.id][m] = j.asistenModul?.[String(m)] ?? null;
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
}: {
  lang: Lang;
  semester: string;
  data: DataJadwal;
  meKode: string;
  boleh: boolean;
  onBack: () => void;
  onSaved: () => void;
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
  const awal = useMemo(() => drafAwal(rows), [rows]);
  const [draf, setDraf] = useState<Draf>(awal);
  const [bergilir, setBergilir] = useState(!!data.bergilir);
  const [tab, setTab] = useState("1");
  const [ubah, setUbah] = useState<number | null>(null);
  const [tanya, setTanya] = useState(false);
  const [busy, setBusy] = useState(false);
  const diajar = data.diajar ?? {};
  const berubah = rows.filter((j) => JSON.stringify(draf[j.id]) !== JSON.stringify(awal[j.id]));
  useBelumSimpan(berubah.length > 0);

  const efektif = (j: JadwalRow, m: number, d: Draf = draf) => d[j.id]?.[m] ?? bawaanDari(j);
  const semua = (j: JadwalRow, d: Draf = draf) =>
    Object.fromEntries(MODUL_PASANGAN.map((m) => [m, efektif(j, m, d)])) as Record<
      number,
      string[]
    >;
  const tetapDi = (j: JadwalRow, d: Draf = draf) =>
    Object.fromEntries((diajar[String(j.id)] ?? []).map((m) => [m, efektif(j, m, d)]));

  /** A slot's four lists after Acak, Putar or Bawaan; taught modules stay. */
  function isiSlot(j: JadwalRow, cara: "acak" | "putar" | "bawaan", d: Draf): Daftar {
    const n = j.jumlahKelompok;
    const tetap = tetapDi(j, d);
    const baru: Record<number, string[] | null> =
      cara === "acak"
        ? acakModul(j.asisten, n, Math.random, tetap)
        : cara === "putar"
          ? putar(j.asisten, n)
          : { 1: null, 2: null, 3: null, 4: null };
    const out: Daftar = {};
    for (const m of MODUL_PASANGAN) out[m] = m in tetap ? (d[j.id]?.[m] ?? null) : baru[m];
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
              <span className="pmseat__g hint num">{g + 1}</span>
              {adaKlp(j) && (
                <span className="pmseat__klp hint mono">{klpLabel(klpOf(j, g + 1)) ?? ""}</span>
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
      <Pill tone={MODUL_PASANGAN.some((m) => draf[j.id]?.[m]) ? "accent" : undefined}>
        {MODUL_PASANGAN.some((m) => draf[j.id]?.[m]) ? p.custom : p.asDefault}
      </Pill>
    </span>
  );
  const tombolUbah = (j: JadwalRow) =>
    boleh && (
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setUbah(j.id)}>
        {p.ubah}
        <CaretRightIcon size={14} weight="bold" aria-hidden="true" className="btn__go" />
      </button>
    );

  const sedang = rows.find((j) => j.id === ubah) ?? null;

  return (
    <div className="jpage pmview">
      <BackButton
        lang={lang}
        label={p.back}
        onClick={() => (berubah.length ? setTanya(true) : onBack())}
      />
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
            {MODUL_PASANGAN.map((m) => (
              <li key={m} style={{ "--m": `var(--mod-${m})` } as CSSProperties}>
                {kepala(m)}
              </li>
            ))}
          </ul>
          <span className="hint">{p.weekHint}</span>
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
        <div className="pmtable" role="table" aria-label={p.title}>
          <div className="pmtable__row pmtable__head" role="row">
            <span role="columnheader" />
            {MODUL_PASANGAN.map((m) => (
              <span
                key={m}
                role="columnheader"
                className="pmtable__mod"
                style={{ "--m": `var(--mod-${m})` } as CSSProperties}
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
              data-intl={j.kelas === "internasional" ? "yes" : undefined}
            >
              <div role="rowheader" className="pmslot">
                <b>{slotJudul(j)}</b>
                {tanda(j)}
                {tombolUbah(j)}
              </div>
              {MODUL_PASANGAN.map((m) => (
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
            tabs={MODUL_PASANGAN.map((m) => ({ v: String(m), label: modulLabel(m, lang) }))}
          />
          <p className="hint">
            {minggu[tab] ? rentang(lang, minggu[tab]!.senin, minggu[tab]!.sabtu) : p.weekNone}
          </p>
          <div className="pmcards">
            {rows.map((j) => (
              <section
                key={j.id}
                className="panel pmcard"
                data-intl={j.kelas === "internasional" ? "yes" : undefined}
              >
                <div className="pmslot">
                  <b>{slotJudul(j)}</b>
                  {tanda(j)}
                </div>
                {kursi(j, Number(tab))}
                {boleh && <div className="pmcard__acts">{tombolUbah(j)}</div>}
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
        open={tanya}
        onOpenChange={setTanya}
        title={t.unsavedTitle}
        body={p.leaveBody}
        confirmLabel={t.discard}
        cancelLabel={t.stay}
        lang={lang}
        onConfirm={() => {
          setDraf(awal);
          onBack();
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
  const lagi = ulang(Object.fromEntries(MODUL_PASANGAN.map((m) => [m, list(m)])), pool);
  const pasang = (m: number, g: number, k: string) =>
    setD((x) => {
      const l = [...(x[m] ?? bawaan)];
      l[g] = k;
      return { ...x, [m]: l };
    });
  const modul = sempit ? [Number(tab)] : [...MODUL_PASANGAN];
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
            tabs={MODUL_PASANGAN.map((m) => ({ v: String(m), label: modulLabel(m, lang) }))}
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
                {klp?.[String(g + 1)] && (
                  <span className="hint mono">{klpLabel(klp[String(g + 1)])}</span>
                )}
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
