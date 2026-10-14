/**
 * The slot editor (Phase 9 Stage 4, mockup s-slot), inside the Schedule's
 * drawer. Every slot opens it, No Practicum included.
 *
 * - Class type, the slot status (Aktif, Segera, Libur for the slot's next
 *   date only, Tidak Ada Praktikum in the sheet's orange or red), the start
 *   window and the group count.
 * - One card per group: the semester's Asisten (Tetap), and the next date's
 *   kind: Pengganti or Sukarela (who teaches that date instead) or Izin
 *   (who covers; Cari Pengganti asks one person or tells everyone).
 * - The ranked substitutes with their FIT and Angkatan 24 marks.
 *
 * Without the Schedule right everything is read only, except the start
 * window for the slot's own Asisten (POST /api/session/jendela).
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
  LockSimpleIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import IconButton from "../ui/IconButton";
import Pill from "../ui/Pill";
import SegmentedControl from "../ui/SegmentedControl";
import Tooltip from "../ui/Tooltip";
import { Stepper } from "../ui/Controls";
import { postJson, tanggalPanjang } from "../../lib/app";
import { kelompokLabel, statusOrangLabel, slotLabel as slotName } from "../../lib/labels";
import { KELOMPOK_DEFAULT, KELOMPOK_MAKS, SLOT_MULAI } from "../../lib/jadwal";
import { JENDELA_MAX, JENDELA_MIN } from "../../lib/sesi-mulai";
import { orangTanggal, pasanganSemester, type MingguSlot } from "../../lib/penugasan-minggu";
import type { TagPengganti } from "../../lib/jadwal-parser";
import type { Kelas, Lang } from "../../lib/kelas";
import { pesanJ, type Jx } from "./strings";
import type { JadwalRow, OrangJadwal, PengaturanJendela } from "./types";
// Its styles live with the Schedule; Tim › Penugasan Slot opens it too.
import "./SchedulePage.css";

type StatusDraft = "aktif" | "segera" | "libur" | "kosong";
type Kind = "tetap" | "pengganti" | "sukarela" | "izin";

interface Draft {
  kelas: Kelas;
  status: StatusDraft;
  warna: "oranye" | "merah";
  n: number;
  who: string[];
  kind: Kind[];
  cover: string[];
  subs: { kode: string; tag: TagPengganti }[];
  win: number | null;
}

function awal(row: JadwalRow | undefined, m: MingguSlot | undefined, baru = false): Draft {
  const n = row?.jumlahKelompok ?? KELOMPOK_DEFAULT;
  const who = pasanganSemester(row?.asisten ?? [], n).map((k) => k ?? "");
  const kursi = m?.kursi ?? [];
  const kind: Kind[] = who.map((_, i) => {
    const k = kursi[i];
    if (!k) return "tetap";
    if (k.izin) return "izin";
    return k.jenis;
  });
  const cover = who.map((_, i) => {
    const k = kursi[i];
    return k && (k.izin || k.jenis !== "tetap") ? (k.kode ?? "") : "";
  });
  return {
    kelas: row?.kelas ?? "reguler",
    status: m?.status ?? row?.status ?? (baru ? "aktif" : "kosong"),
    warna: row?.warnaKosong ?? "oranye",
    n,
    who,
    kind,
    cover,
    subs: row?.pengganti ?? [],
    win: row?.jendelaMulaiMenit ?? null,
  };
}

export interface SlotEditorHandle {
  save: () => Promise<boolean>;
}

interface Props {
  t: Jx;
  lang: Lang;
  semester: string;
  /** True for the semester in progress (the next date's seats apply). */
  kini: boolean;
  hari: number;
  slot: number;
  row: JadwalRow | undefined;
  minggu: MingguSlot | undefined;
  orang: OrangJadwal[];
  jendela: PengaturanJendela;
  meKode: string;
  meNim: string;
  bolehJadwal: boolean;
  onDirty: (d: boolean) => void;
  onSaved: () => void;
  /** Tim › Penugasan Slot's week: the date this many weeks past the next */
  geser?: number;
  /** A slot being added (Penugasan Slot's Tambah Slot): starts Aktif */
  baru?: boolean;
  /** Toasts its own saved message (Penugasan Slot says one of its own) */
  diam?: boolean;
}

const SlotEditor = forwardRef<SlotEditorHandle, Props>(function SlotEditor(p, ref) {
  const { t, lang, row, minggu: m } = p;
  const base = useMemo(() => awal(row, m, p.baru), [row, m, p.baru]);
  const [d, setD] = useState<Draft>(base);
  const [find, setFind] = useState<number | null>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  useEffect(() => p.onDirty(dirty), [dirty]);

  const byKode = useMemo(() => new Map(p.orang.map((o) => [o.kode.toUpperCase(), o])), [p.orang]);
  const nama = (k: string) => {
    const o = byKode.get(k);
    return o ? `${o.nama} (${o.kode.toUpperCase()})` : k;
  };
  const onSlot =
    !!m &&
    (orangTanggal(m.kursi, m.tugas).has(p.meKode) ||
      (row?.pengganti ?? []).some((x) => x.kode.toUpperCase() === p.meKode));
  const bolehWin = p.bolehJadwal || onSlot;
  const ro = !p.bolehJadwal;
  const tglLabel = m ? tanggalPanjang(m.tanggal, lang) : "";
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setAt = <K extends "who" | "kind" | "cover">(key: K, i: number, v: Draft[K][number]) =>
    setD((x) => {
      const a = [...x[key]] as Draft[K];
      a[i] = v;
      return { ...x, [key]: a };
    });

  const pickOpts = [
    { value: "", label: t.pick },
    ...p.orang.map((o) => ({
      value: o.kode.toUpperCase(),
      label: o.nama,
      chip: o.kode.toUpperCase(),
      note: o.status !== "aktif" ? t.notPickable(statusOrangLabel(o.status, lang)) : undefined,
      disabled: o.status !== "aktif",
    })),
  ];
  const coverOpts = (i: number) => {
    const subs = d.subs.map((s) => s.kode.toUpperCase());
    const rest = p.orang
      .map((o) => o.kode.toUpperCase())
      .filter((k) => !subs.includes(k) && k !== d.who[i]);
    return [
      { value: "", label: t.pickCover },
      ...[...subs, ...rest]
        .filter((k) => k !== d.who[i])
        .map((k) => {
          const o = byKode.get(k);
          const tag = d.subs.find((s) => s.kode.toUpperCase() === k)?.tag;
          return {
            value: k,
            label: nama(k) + (tag === "fit" ? " · FIT" : tag === "a24" ? ` · ${t.a24}` : ""),
            disabled: !o || o.status !== "aktif",
          };
        }),
    ];
  };

  async function save(): Promise<boolean> {
    try {
      if (ro) {
        if (!bolehWin) return false;
        const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/jendela", {
          hari: p.hari,
          slot: p.slot,
          menit: d.win,
        });
        if (!r.ok) {
          window.Toast?.show(pesanJ(t, r.kode), "danger");
          return false;
        }
        window.Toast?.show(t.savedWindow, "ok");
        p.onSaved();
        return true;
      }
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/schedule", {
        semester: p.semester,
        hari: p.hari,
        slot: p.slot,
        ...(p.geser ? { geser: p.geser } : {}),
        ubah: {
          kelas: d.kelas,
          status: d.status,
          ...(d.status === "kosong" ? { warnaKosong: d.warna } : {}),
          jumlahKelompok: d.n,
          asisten: d.who,
          pengganti: d.subs,
          jendela: d.win,
          ...(p.kini && d.status !== "kosong"
            ? {
                minggu: {
                  kursi: d.kind.map((k, i) => ({
                    nomor: i + 1,
                    jenis: k,
                    kode: k === "tetap" ? "" : d.cover[i],
                  })),
                },
              }
            : {}),
        },
      });
      if (!r.ok) {
        window.Toast?.show(pesanJ(t, r.kode), "danger");
        return false;
      }
      if (!p.diam) window.Toast?.show(t.saved, "ok");
      p.onSaved();
      return true;
    } catch {
      window.Toast?.show(t.fail, "danger");
      return false;
    }
  }
  useImperativeHandle(ref, () => ({ save }));

  const statusOpts: StatusDraft[] = p.kini
    ? ["aktif", "segera", "libur", "kosong"]
    : ["aktif", "segera", "kosong"];
  const off = d.status === "kosong";

  return (
    <div className="jedit">
      {p.kini && m && (
        <p className="jedit__when hint">{p.geser ? t.forDate(tglLabel) : t.nextDate(tglLabel)}</p>
      )}
      {ro && (
        <div className="banner banner--lock">
          <LockSimpleIcon size={20} aria-hidden="true" />
          <span>{t.readOnly}</span>
        </div>
      )}

      <fieldset className="jedit__set" disabled={ro}>
        <div className="field">
          <span className="field__label">{t.kelas}</span>
          <div className="jedit__kelas" data-kelas={d.kelas}>
            <SegmentedControl
              fill
              value={d.kelas}
              onValueChange={(v) => set({ kelas: v as Kelas })}
              aria-label={t.kelas}
              options={[
                { value: "reguler", label: t.reguler },
                { value: "internasional", label: t.internasional },
              ]}
            />
          </div>
        </div>

        <div className="field">
          <span className="field__label" id="jedit-status">
            {t.status}
          </span>
          <div className="slotstat" role="radiogroup" aria-labelledby="jedit-status">
            {statusOpts.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                className="slotstat__o"
                aria-checked={d.status === v}
                onClick={() => set({ status: v })}
              >
                <span className="jswatch slotstat__sw" data-c={v === "kosong" ? d.warna : v} />
                <span className="grow">{t.statusOpt[v]}</span>
                {d.status === v && <CheckIcon size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>
          {off && (
            <div className="slotstat__warna" role="radiogroup" aria-label={t.warna}>
              <span className="field__label">{t.warna}</span>
              {(["oranye", "merah"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  className="slotstat__o"
                  aria-checked={d.warna === v}
                  onClick={() => set({ warna: v })}
                >
                  <span className="jswatch slotstat__sw" data-c={v} />
                  <span className="grow">{t[v]}</span>
                  {d.warna === v && <CheckIcon size={16} aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
          <span className="field__hint">{t.statusHint[d.status]}</span>
        </div>
      </fieldset>

      {off ? (
        <div className="slotkept">
          <p className="hint slotstat__off">{t.offHidden}</p>
          <span className="field__label">{t.kept}</span>
          {d.who.some(Boolean) ? (
            <ul className="slotkept__list">
              {d.who.map((kode, i) => (
                <li key={i}>
                  <Pill group={i + 1}>{kelompokLabel(i + 1, lang)}</Pill>
                  <span className={kode ? "acode" : "hint"}>
                    {kode ? kode.toUpperCase() : t.keptNobody}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="hint">{t.keptNone(d.n)}</span>
          )}
        </div>
      ) : (
        <>
          <fieldset className="jedit__set" disabled={!bolehWin}>
            <div className="field">
              <span className="field__label">{t.window}</span>
              <div className="row jedit__win">
                <SegmentedControl
                  value={d.win == null ? "def" : "own"}
                  onValueChange={(v) =>
                    set({
                      win:
                        v === "def"
                          ? null
                          : Math.min(p.jendela.max, Math.max(p.jendela.min, p.jendela.default)),
                    })
                  }
                  aria-label={t.window}
                  options={[
                    { value: "def", label: t.windowDefault(p.jendela.default) },
                    { value: "own", label: t.windowOwn },
                  ]}
                />
                {d.win != null && (
                  <Stepper
                    value={d.win}
                    onChange={(v) => set({ win: v })}
                    min={p.bolehJadwal ? JENDELA_MIN : p.jendela.min}
                    max={p.bolehJadwal ? JENDELA_MAX : p.jendela.max}
                    step={5}
                    label={t.window}
                    fmt={t.minutes}
                    lessLabel={t.fewer}
                    moreLabel={t.more}
                  />
                )}
              </div>
              <span className="field__hint">
                {d.win == null
                  ? t.windowHintDefault
                  : t.windowHintOwn(
                      nama(
                        p.orang
                          .find((o) => o.nim === (row?.jendelaDiaturOleh ?? p.meNim))
                          ?.kode.toUpperCase() ?? p.meKode,
                      ),
                      p.jendela.min,
                      p.jendela.max,
                    )}
              </span>
            </div>
          </fieldset>

          <fieldset className="jedit__set" disabled={ro}>
            <div className="row row--between jedit__count">
              <span className="stack stack--sm">
                <b>{t.groups}</b>
                <span className="hint">{t.groupsHint}</span>
              </span>
              <Stepper
                value={d.n}
                onChange={(v) =>
                  setD((x) => ({
                    ...x,
                    n: v,
                    who: Array.from({ length: v }, (_, i) => x.who[i] ?? ""),
                    kind: Array.from({ length: v }, (_, i) => x.kind[i] ?? "tetap"),
                    cover: Array.from({ length: v }, (_, i) => x.cover[i] ?? ""),
                  }))
                }
                min={1}
                max={KELOMPOK_MAKS}
                label={t.groups}
                lessLabel={t.fewer}
                moreLabel={t.more}
              />
            </div>

            <div className="stack">
              <div className="row row--between">
                <h3 className="jedit__h">{t.pairTitle}</h3>
                <span className="hint">{t.pairHint}</span>
              </div>
              <div className="asggrid">
                {d.who.map((k, i) => {
                  const holds = k ? d.who.filter((x) => x === k).length : 0;
                  const kind = d.kind[i];
                  const izinTersimpan =
                    kind === "izin" &&
                    !!m?.izin.find((x) => x.kode === k && x.status !== "dibatalkan");
                  return (
                    <div
                      key={i}
                      className="asgrow"
                      data-st={kind}
                      style={{ "--g": `var(--group-${i + 1})` } as CSSProperties}
                    >
                      <div className="row row--between asgrow__head">
                        <Pill group={i + 1}>{kelompokLabel(i + 1, lang)}</Pill>
                        {holds > 1 && (
                          <Tooltip label={t.holdsTip}>
                            <span tabIndex={0}>
                              <Pill tone="warn">{t.holds(holds)}</Pill>
                            </span>
                          </Tooltip>
                        )}
                      </div>
                      <Dropdown
                        id={`jedit-g${i + 1}`}
                        label={kelompokLabel(i + 1, lang)}
                        hideLabel
                        value={k}
                        options={pickOpts}
                        onChange={(v) => setAt("who", i, v)}
                        disabled={ro}
                      />
                      {p.kini && (
                        <div className="asgrow__st">
                          <SegmentedControl
                            fill
                            value={kind}
                            onValueChange={(v) => setAt("kind", i, v as Kind)}
                            aria-label={`${t.kind} ${kelompokLabel(i + 1, lang)}`}
                            options={(["tetap", "pengganti", "sukarela", "izin"] as const).map(
                              (v) => ({ value: v, label: t.kinds[v] }),
                            )}
                          />
                        </div>
                      )}
                      {p.kini && kind !== "tetap" && (
                        <div className="asgrow__cover">
                          <span className="field__label">
                            {kind === "izin" ? t.whoCovers : t.whoTeaches(tglLabel)}
                          </span>
                          <Dropdown
                            id={`jedit-c${i + 1}`}
                            label={kind === "izin" ? t.whoCovers : t.whoTeaches(tglLabel)}
                            hideLabel
                            value={d.cover[i]}
                            options={coverOpts(i)}
                            onChange={(v) => setAt("cover", i, v)}
                            disabled={ro}
                          />
                          {!d.cover[i] && (
                            <span className="jedit__err">
                              <WarningIcon size={16} aria-hidden="true" />
                              {t.noCover}
                            </span>
                          )}
                          {d.cover[i] && k && kind !== "izin" && (
                            <span className="hint">{t.instead(nama(k))}</span>
                          )}
                          {kind === "izin" && !d.cover[i] && (
                            <span className="row">
                              <button
                                type="button"
                                className="btn btn--sm"
                                disabled={ro || !izinTersimpan || dirty}
                                title={!izinTersimpan || dirty ? t.saveFirst : undefined}
                                onClick={() => setFind(i)}
                              >
                                {t.findCover}
                              </button>
                              {(!izinTersimpan || dirty) && (
                                <span className="hint">{t.saveFirst}</span>
                              )}
                            </span>
                          )}
                          {t.kindHint[kind] && <span className="hint">{t.kindHint[kind]}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="stack">
              <div className="row row--between">
                <h3 className="jedit__h">{t.subsTitle}</h3>
                <span className="hint">{t.subsHint(d.subs.length)}</span>
              </div>
              <ol className="jsubs">
                {d.subs.map((s, i) => {
                  const k = s.kode.toUpperCase();
                  const o = byKode.get(k);
                  return (
                    <li key={`${k}-${i}`} className="subrow">
                      <span className="num hint jsubs__rank">{i + 1}</span>
                      <span className={`acode${o ? "" : " acode--unknown"}`}>{k}</span>
                      <span className="subrow__name">{o?.nama ?? t.unknownCode}</span>
                      <span className="row jsubs__tags">
                        {(["fit", "a24"] as const).map((tag) => (
                          <Pill
                            key={tag}
                            tone={s.tag === tag ? tag : undefined}
                            pressed={s.tag === tag}
                            onClick={() =>
                              set({
                                subs: d.subs.map((x, j) =>
                                  j === i ? { ...x, tag: x.tag === tag ? null : tag } : x,
                                ),
                              })
                            }
                          >
                            {tag === "fit" ? t.fit : t.a24}
                          </Pill>
                        ))}
                      </span>
                      <span className="row jsubs__moves">
                        <IconButton
                          icon={CaretUpIcon}
                          label={t.up}
                          kind="ghost"
                          sm
                          disabled={ro || i === 0}
                          onClick={() => {
                            const a = [...d.subs];
                            [a[i - 1], a[i]] = [a[i], a[i - 1]];
                            set({ subs: a });
                          }}
                        />
                        <IconButton
                          icon={CaretDownIcon}
                          label={t.down}
                          kind="ghost"
                          sm
                          disabled={ro || i === d.subs.length - 1}
                          onClick={() => {
                            const a = [...d.subs];
                            [a[i + 1], a[i]] = [a[i], a[i + 1]];
                            set({ subs: a });
                          }}
                        />
                        <IconButton
                          icon={XIcon}
                          label={t.removeSub}
                          kind="ghost"
                          sm
                          disabled={ro}
                          onClick={() => set({ subs: d.subs.filter((_, j) => j !== i) })}
                        />
                      </span>
                    </li>
                  );
                })}
              </ol>
              <Dropdown
                id="jedit-add-sub"
                label={t.addSub}
                hideLabel
                value=""
                options={[
                  { value: "", label: t.addSub },
                  ...p.orang
                    .filter(
                      (o) => !d.subs.some((s) => s.kode.toUpperCase() === o.kode.toUpperCase()),
                    )
                    .map((o) => ({
                      value: o.kode.toUpperCase(),
                      label: `${o.nama} (${o.kode.toUpperCase()})`,
                      disabled: o.status !== "aktif",
                    })),
                ]}
                onChange={(v) => v && set({ subs: [...d.subs, { kode: v, tag: null }] })}
                disabled={ro}
              />
              <span className="hint">{t.swapsLogged}</span>
            </div>
          </fieldset>
        </>
      )}

      {find !== null && row && m && (
        <FindCover
          t={t}
          lang={lang}
          row={row}
          minggu={m}
          nomor={find + 1}
          excused={d.who[find]}
          orang={p.orang}
          onClose={() => setFind(null)}
          onDone={p.onSaved}
        />
      )}
    </div>
  );
});

export default SlotEditor;

/* --------------------------------------------------------- Find Cover */

function FindCover({
  t,
  lang,
  row,
  minggu: m,
  nomor,
  excused,
  orang,
  onClose,
  onDone,
}: {
  t: Jx;
  lang: Lang;
  row: JadwalRow;
  minggu: MingguSlot;
  nomor: number;
  excused: string;
  orang: OrangJadwal[];
  onClose: () => void;
  onDone: () => void;
}) {
  // Busy: teaching or helping that date, or excused that date.
  const sibuk = orangTanggal(m.kursi, m.tugas);
  for (const x of m.izin) if (x.status !== "dibatalkan") sibuk.add(x.kode.toUpperCase());
  const diminta = new Set(m.tugas.filter((x) => x.status === "diminta").map((x) => x.nim));
  const [asked, setAsked] = useState<Set<string>>(diminta);
  const free = orang.filter(
    (o) =>
      o.status === "aktif" && !sibuk.has(o.kode.toUpperCase()) && o.kode.toUpperCase() !== excused,
  );
  const excusedNim = orang.find((o) => o.kode.toUpperCase() === excused)?.nim ?? "";
  const nama = (o: OrangJadwal) => `${o.nama} (${o.kode.toUpperCase()})`;
  const slotLabel = `${tanggalPanjang(m.tanggal, lang)} · ${slotName(row.slot, lang)} · ${SLOT_MULAI[row.slot]}`;
  const ex = orang.find((o) => o.kode.toUpperCase() === excused);

  async function minta(o: OrangJadwal) {
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/penugasan", {
      aksi: "minta",
      jadwalId: row.id,
      kelompok: nomor,
      nim: o.nim,
    }).catch(() => ({ ok: false, kode: undefined }));
    if (!r.ok) return window.Toast?.show(pesanJ(t, r.kode), "danger");
    setAsked((s) => new Set(s).add(o.nim));
    window.Toast?.show(t.askedToast(nama(o)), "ok");
    onDone();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.coverTitle(kelompokLabel(nomor, lang))}
      description={t.coverDesc(slotLabel, ex ? nama(ex) : excused)}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.close}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={async () => {
              const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/penugasan", {
                aksi: "umumkan",
                jadwalId: row.id,
                nim: excusedNim,
              }).catch(() => ({ ok: false, kode: undefined }));
              if (!r.ok) return window.Toast?.show(pesanJ(t, r.kode), "danger");
              window.Toast?.show(t.toldAll, "ok");
              onDone();
              onClose();
            }}
          >
            {t.tellAll}
          </button>
        </>
      }
    >
      <div className="stack">
        {free.length === 0 ? (
          <p className="hint">{t.coverNone}</p>
        ) : (
          <ul className="coverlist">
            {free.map((o) => (
              <li key={o.nim}>
                <span className="acode">{o.kode.toUpperCase()}</span>
                <b className="grow">{o.nama}</b>
                {asked.has(o.nim) ? (
                  <Pill tone="accent">{t.asked}</Pill>
                ) : (
                  <button type="button" className="btn btn--sm" onClick={() => void minta(o)}>
                    {t.ask}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <span className="hint">{t.coverHint}</span>
      </div>
    </Dialog>
  );
}
