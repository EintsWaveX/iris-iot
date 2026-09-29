/**
 * /schedule and /en/schedule (Phase 8): the teaching schedule, assistants
 * only.
 *
 * - A week grid (Senin to Sabtu by the four slots). Each cell lists the
 *   default assistant per group in group order, in that group's hue, marks
 *   the International class and "segera" (announced, no assistants yet),
 *   and highlights the viewer's own slots.
 * - Picking a cell opens its editor: class, status, the assistant for each
 *   group, and the ranked substitutes with their Ngajar FIT / Angkatan 24
 *   tags (the sheet's colours do not survive a copy, so they are set here).
 * - "Impor dari sheet": paste the sheet's two blocks as TSV, preview the
 *   result with unknown codes flagged, then replace the semester.
 * - Phones get a day-by-day list instead of the grid.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, CalendarRange, Lock, TriangleAlert, X } from "lucide-react";
import Dialog from "../ui/Dialog";
import Drawer from "../ui/Drawer";
import Confirm from "../ui/Confirm";
import Dropdown from "../ui/Dropdown";
import SegmentedControl from "../ui/SegmentedControl";
import { Switch } from "../ui/Controls";
import { StateView } from "../ui/Display";
import { getJson, href, postJson, useMe } from "../../lib/app";
import { useMinWidth } from "../../lib/hooks";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { hariDariTanggal, semesterDariTanggal, type TagPengganti } from "../../lib/jadwal-parser";
import type { Kelas, Lang } from "../../lib/kelas";
import "./SchedulePage.css";

interface Row {
  hari: number;
  slot: number;
  kelas: Kelas;
  status: "aktif" | "segera";
  asisten: string[];
  pengganti: { kode: string; tag: TagPengganti }[];
}
interface Asisten {
  nim: string;
  kode: string;
  nama: string;
}

const HARI = [1, 2, 3, 4, 5, 6];
const SLOTS = [1, 2, 3, 4];

const T = {
  id: {
    title: "Jadwal mengajar",
    sub: "Asisten default per kelompok dan pengganti tiap slot. Pilih satu slot untuk mengubahnya.",
    semester: "Semester",
    mine: "Sorot slot saya",
    import: "Impor dari sheet",
    hari: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
    slot: (n: number) => `Slot ${n}`,
    inter: "INTER",
    segera: "Segera",
    none: "Tidak ada praktikum",
    you: "Kamu",
    legend: "Keterangan",
    editH: "Ubah slot",
    pick: "Pilih salah satu slot di jadwal untuk melihat dan mengubah asistennya.",
    kelas: "Kelas",
    reguler: "Reguler",
    internasional: "Internasional",
    segeraSw: "Segera (belum ada asisten)",
    groups: "Asisten per kelompok",
    kelompok: (k: number) => `Kelompok ${k}`,
    empty: "Kosong",
    subs: "Pengganti berurutan",
    noSubs: "Belum ada pengganti.",
    addSub: "Tambah pengganti",
    tag: "Tanda",
    tagNone: "Biasa",
    fit: "Ngajar FIT",
    a24: "Angkt 24",
    up: "Naikkan",
    down: "Turunkan",
    remove: "Hapus",
    save: "Simpan slot",
    saved: "Slot tersimpan.",
    fail: "Gagal menyimpan. Coba lagi.",
    unsaved: "Ada perubahan yang belum disimpan.",
    loadFail: "Gagal memuat jadwal.",
    retry: "Coba lagi",
    forbiddenH: "Khusus asisten",
    forbidden: "Halaman jadwal hanya untuk asisten.",
    home: "Ke beranda",
    impH: "Impor jadwal dari sheet",
    impBody:
      "Salin blok dari sheet JADWAL NGAJAR (pilih sel lalu Ctrl+C) dan tempel di sini. Warna sel tidak ikut tersalin, jadi tanda FIT dan Angkt 24 diatur setelahnya.",
    impDefault: "Blok ASISTEN DEFAULT",
    impPeng: "Blok ASISTEN PENGGANTI (boleh kosong)",
    preview: "Pratinjau",
    previewing: "Memeriksa…",
    result: (n: number) => `${n} slot terbaca`,
    unknown: "Kode tidak dikenal",
    strange: "Sel diabaikan",
    replace: "Ganti jadwal semester ini",
    replaceH: "Ganti seluruh jadwal semester?",
    replaceBody: "Jadwal yang ada untuk semester ini dihapus dan diganti dengan hasil pratinjau.",
    replaced: (n: number) => `${n} slot tersimpan.`,
    emptySheet: "Tidak ada slot yang terbaca dari tempelan ini.",
    cancel: "Batal",
    close: "Tutup",
    resize: "Ubah lebar panel",
    mySlots: (n: number) => `${n} slot mengajar minggu ini`,
  },
  en: {
    title: "Teaching schedule",
    sub: "The default assistant per group and the substitutes for every slot. Pick a slot to change it.",
    semester: "Semester",
    mine: "Highlight my slots",
    import: "Import from sheet",
    hari: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    slot: (n: number) => `Slot ${n}`,
    inter: "INTER",
    segera: "Soon",
    none: "No practicum",
    you: "You",
    legend: "Legend",
    editH: "Edit slot",
    pick: "Pick a slot in the schedule to see and change its assistants.",
    kelas: "Class",
    reguler: "Regular",
    internasional: "International",
    segeraSw: "Soon (no assistants yet)",
    groups: "Assistant per group",
    kelompok: (k: number) => `Group ${k}`,
    empty: "Empty",
    subs: "Ranked substitutes",
    noSubs: "No substitutes yet.",
    addSub: "Add a substitute",
    tag: "Tag",
    tagNone: "None",
    fit: "Teaches FIT",
    a24: "Batch 24",
    up: "Move up",
    down: "Move down",
    remove: "Remove",
    save: "Save slot",
    saved: "Slot saved.",
    fail: "Could not save. Try again.",
    unsaved: "There are unsaved changes.",
    loadFail: "Could not load the schedule.",
    retry: "Try again",
    forbiddenH: "Assistants only",
    forbidden: "The schedule page is for assistants.",
    home: "Go home",
    impH: "Import the schedule from the sheet",
    impBody:
      "Copy the blocks from the JADWAL NGAJAR sheet (select the cells, then Ctrl+C) and paste them here. Cell colours do not survive a copy, so the FIT and Batch 24 tags are set afterwards.",
    impDefault: "ASISTEN DEFAULT block",
    impPeng: "ASISTEN PENGGANTI block (optional)",
    preview: "Preview",
    previewing: "Checking…",
    result: (n: number) => `${n} ${n === 1 ? "slot" : "slots"} read`,
    unknown: "Unknown codes",
    strange: "Cells ignored",
    replace: "Replace this semester's schedule",
    replaceH: "Replace the whole semester's schedule?",
    replaceBody: "The existing schedule for this semester is deleted and replaced by the preview.",
    replaced: (n: number) => `${n} ${n === 1 ? "slot" : "slots"} saved.`,
    emptySheet: "No slots could be read from this paste.",
    cancel: "Cancel",
    close: "Close",
    resize: "Resize panel",
    mySlots: (n: number) => `${n} teaching slots this week`,
  },
};
type Tx = (typeof T)["id"];

function semesterLabel(s: string, lang: Lang): string {
  const [y, jenis] = s.split("-");
  const n = Number(y);
  const tahun = jenis === "ganjil" ? `${n}/${n + 1}` : `${n - 1}/${n}`;
  const nama =
    jenis === "ganjil" ? (lang === "en" ? "Odd" : "Ganjil") : lang === "en" ? "Even" : "Genap";
  return `${nama} ${tahun}`;
}

function semesterTetangga(s: string): string[] {
  const [y, jenis] = s.split("-");
  const n = Number(y);
  return jenis === "ganjil"
    ? [`${n}-genap`, s, `${n + 1}-genap`]
    : [`${n - 1}-ganjil`, s, `${n}-ganjil`];
}

/* ----------------------------------------------------------------- cell */

function Cell({
  row,
  t,
  myCode,
  highlight,
  selected,
  onPick,
}: {
  row: Row | undefined;
  t: Tx;
  myCode: string;
  highlight: boolean;
  selected: boolean;
  onPick: () => void;
}) {
  const mine = Boolean(row && myCode && row.asisten.includes(myCode));
  return (
    <button
      type="button"
      className="jcell"
      data-state={!row ? "none" : row.status === "segera" ? "soon" : "on"}
      data-inter={row?.kelas === "internasional" ? "yes" : undefined}
      data-mine={highlight && mine ? "yes" : undefined}
      data-dim={highlight && !mine ? "yes" : undefined}
      aria-pressed={selected}
      onClick={onPick}
    >
      {!row ? (
        <span className="jcell__none">{t.none}</span>
      ) : (
        <>
          <span className="jcell__tags">
            {row.kelas === "internasional" && <span className="jcell__inter">{t.inter}</span>}
            {row.status === "segera" && <span className="jcell__soon">{t.segera}</span>}
            {mine && <span className="jcell__you">{t.you}</span>}
          </span>
          <span className="jcell__codes">
            {row.asisten.map((k, i) => (
              <span
                key={`${k}-${i}`}
                className="jcell__code"
                data-me={k === myCode ? "yes" : undefined}
                style={{ "--g": `var(--group-${i + 1})` } as CSSProperties}
              >
                <small>{i + 1}</small>
                {k}
              </span>
            ))}
          </span>
          {row.pengganti.length > 0 && <span className="jcell__subs">+{row.pengganti.length}</span>}
        </>
      )}
    </button>
  );
}

function WeekGrid({
  rows,
  t,
  myCode,
  highlight,
  sel,
  onPick,
  readOnly,
}: {
  rows: Row[];
  t: Tx;
  myCode: string;
  highlight: boolean;
  sel: { hari: number; slot: number } | null;
  onPick: (hari: number, slot: number) => void;
  readOnly?: boolean;
}) {
  const today = hariDariTanggal(hariIniWib());
  const at = (h: number, s: number) => rows.find((r) => r.hari === h && r.slot === s);
  return (
    <div className="jgrid-scroll">
      <div className="jgrid" data-readonly={readOnly ? "yes" : undefined} role="grid">
        <span className="jgrid__corner" />
        {HARI.map((h) => (
          <span
            key={h}
            className="jgrid__day"
            data-today={h === today ? "yes" : undefined}
            role="columnheader"
          >
            {t.hari[h]}
          </span>
        ))}
        {SLOTS.map((s) => (
          <div key={s} className="jgrid__row" role="row">
            <span className="jgrid__slot" role="rowheader">
              <b>{t.slot(s)}</b>
              <small className="mono">{SLOT_MULAI[s]}</small>
            </span>
            {HARI.map((h) => (
              <Cell
                key={h}
                row={at(h, s)}
                t={t}
                myCode={myCode}
                highlight={highlight}
                selected={sel?.hari === h && sel.slot === s}
                onPick={() => onPick(h, s)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- editor */

function SlotEditor({
  row,
  hari,
  slot,
  semester,
  asisten,
  t,
  onSaved,
  bare = false,
}: {
  bare?: boolean;
  row: Row | undefined;
  hari: number;
  slot: number;
  semester: string;
  asisten: Asisten[];
  t: Tx;
  onSaved: () => void;
}) {
  const base: Row = row ?? {
    hari,
    slot,
    kelas: "reguler",
    status: "aktif",
    asisten: [],
    pengganti: [],
  };
  const [draft, setDraft] = useState<Row>(base);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const nama = (k: string) => asisten.find((a) => a.kode.toUpperCase() === k)?.nama ?? "";
  const opsi = [
    { value: "", label: `(${t.empty})` },
    ...asisten.map((a) => ({ value: a.kode.toUpperCase(), label: `${a.kode} · ${a.nama}` })),
  ];

  function setGroup(i: number, kode: string) {
    const a = [...draft.asisten];
    while (a.length <= i) a.push("");
    a[i] = kode;
    while (a.length && !a[a.length - 1]) a.pop();
    setDraft({ ...draft, asisten: a });
  }
  function moveSub(i: number, d: -1 | 1) {
    const p = [...draft.pengganti];
    const j = i + d;
    if (j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]];
    setDraft({ ...draft, pengganti: p });
  }
  async function save() {
    setBusy(true);
    try {
      const d = await postJson<{ ok: boolean }>("/api/session/schedule", {
        semester,
        hari,
        slot,
        ubah: {
          kelas: draft.kelas,
          status: draft.status,
          asisten: draft.asisten.filter(Boolean),
          pengganti: draft.pengganti,
        },
      });
      if (!d.ok) throw new Error();
      window.Toast?.show(t.saved, "ok");
      onSaved();
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={bare ? "jedit jedit--bare" : "jedit"}>
      <div className="jedit__head">
        <span className="label-caps">{t.editH}</span>
        <b className="jedit__title">
          {t.hari[hari]} · {t.slot(slot)} · <span className="mono">{SLOT_MULAI[slot]}</span>
        </b>
      </div>

      <div className="jedit__row">
        <SegmentedControl
          value={draft.kelas}
          onValueChange={(v) => setDraft({ ...draft, kelas: v as Kelas })}
          aria-label={t.kelas}
          options={[
            { value: "reguler", label: t.reguler },
            { value: "internasional", label: t.internasional },
          ]}
        />
      </div>
      <Switch
        on={draft.status === "segera"}
        onChange={(v) => setDraft({ ...draft, status: v ? "segera" : "aktif" })}
        label={t.segeraSw}
        showLabel
      />

      <section className="jedit__sec">
        <h3>{t.groups}</h3>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="jedit__group"
            style={{ "--g": `var(--group-${i + 1})` } as CSSProperties}
          >
            <span className="jedit__gk">K{i + 1}</span>
            <div className="grow">
              <Dropdown
                id={`jadwal-k${i + 1}`}
                label={t.kelompok(i + 1)}
                hideLabel
                options={opsi}
                value={draft.asisten[i] ?? ""}
                onChange={(v) => setGroup(i, v)}
                disabled={draft.status === "segera"}
              />
            </div>
          </div>
        ))}
      </section>

      <section className="jedit__sec">
        <h3>{t.subs}</h3>
        {draft.pengganti.length === 0 ? (
          <p className="hint">{t.noSubs}</p>
        ) : (
          <ol className="jedit__subs">
            {draft.pengganti.map((p, i) => (
              <li key={`${p.kode}-${i}`}>
                <span className="jedit__rank num">{i + 1}</span>
                <span className="jedit__subname">
                  <b className="mono">{p.kode}</b>
                  <small className="hint">{nama(p.kode)}</small>
                </span>
                <span className="jedit__tags" role="group" aria-label={t.tag}>
                  {(["fit", "a24"] as const).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="jedit__tag"
                      data-tag={tag}
                      aria-pressed={p.tag === tag}
                      onClick={() => {
                        const ps = [...draft.pengganti];
                        ps[i] = { ...p, tag: p.tag === tag ? null : tag };
                        setDraft({ ...draft, pengganti: ps });
                      }}
                    >
                      {tag === "fit" ? t.fit : t.a24}
                    </button>
                  ))}
                </span>
                <span className="jedit__moves">
                  <button
                    type="button"
                    className="btn btn--icon btn--sm btn--quiet"
                    aria-label={t.up}
                    disabled={i === 0}
                    onClick={() => moveSub(i, -1)}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn btn--icon btn--sm btn--quiet"
                    aria-label={t.down}
                    disabled={i === draft.pengganti.length - 1}
                    onClick={() => moveSub(i, 1)}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn btn--icon btn--sm btn--quiet"
                    aria-label={t.remove}
                    onClick={() =>
                      setDraft({ ...draft, pengganti: draft.pengganti.filter((_, j) => j !== i) })
                    }
                  >
                    <X size={15} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="jedit__add">
          <div className="grow">
            <Dropdown
              id="jadwal-add-sub"
              label={t.addSub}
              hideLabel
              options={[
                { value: "", label: t.addSub },
                ...asisten
                  .filter((a) => !draft.pengganti.some((p) => p.kode === a.kode.toUpperCase()))
                  .map((a) => ({ value: a.kode.toUpperCase(), label: `${a.kode} · ${a.nama}` })),
              ]}
              value={adding}
              onChange={setAdding}
            />
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={!adding}
            onClick={() => {
              setDraft({ ...draft, pengganti: [...draft.pengganti, { kode: adding, tag: null }] });
              setAdding("");
            }}
          >
            {t.addSub}
          </button>
        </div>
      </section>

      <div className="jedit__foot">
        {dirty && <span className="hint">{t.unsaved}</span>}
        <button type="button" className="btn btn--primary" disabled={!dirty || busy} onClick={save}>
          {t.save}
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- import */

function ImportDialog({
  open,
  onOpenChange,
  semester,
  t,
  lang,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  semester: string;
  t: Tx;
  lang: Lang;
  onDone: () => void;
}) {
  const [def, setDef] = useState("");
  const [peng, setPeng] = useState("");
  const [busy, setBusy] = useState(false);
  const [pre, setPre] = useState<{ slot: Row[]; kodeTakDikenal: string[]; asing: string[] } | null>(
    null,
  );
  const [confirm, setConfirm] = useState(false);

  async function preview() {
    setBusy(true);
    try {
      const d = await postJson<{ ok: boolean; pratinjau?: typeof pre }>("/api/session/schedule", {
        semester,
        teksDefault: def,
        teksPengganti: peng,
      });
      setPre(d.ok && d.pratinjau ? d.pratinjau : null);
      if (!d.ok) window.Toast?.show(t.fail, "danger");
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }
  async function simpan() {
    setBusy(true);
    try {
      const d = await postJson<{ ok: boolean; kode?: string; disimpan?: number }>(
        "/api/session/schedule",
        {
          semester,
          teksDefault: def,
          teksPengganti: peng,
          simpan: true,
        },
      );
      if (d.ok) {
        window.Toast?.show(t.replaced(d.disimpan ?? 0), "ok");
        onDone();
        onOpenChange(false);
        setPre(null);
      } else window.Toast?.show(d.kode === "jadwal_kosong" ? t.emptySheet : t.fail, "danger");
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} title={t.impH} size="xl" lang={lang}>
        <div className="jimp">
          <p className="hint">{t.impBody}</p>
          <div className="jimp__areas">
            <label className="jimp__area">
              <span>{t.impDefault}</span>
              <textarea
                rows={6}
                value={def}
                onChange={(e) => setDef(e.target.value)}
                spellCheck={false}
              />
            </label>
            <label className="jimp__area">
              <span>{t.impPeng}</span>
              <textarea
                rows={6}
                value={peng}
                onChange={(e) => setPeng(e.target.value)}
                spellCheck={false}
              />
            </label>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn btn--secondary"
              disabled={!def.trim() || busy}
              onClick={preview}
            >
              {busy ? t.previewing : t.preview}
            </button>
            {pre && <span className="pill pill--accent">{t.result(pre.slot.length)}</span>}
          </div>
          {pre && (
            <>
              {(pre.kodeTakDikenal.length > 0 || pre.asing.length > 0) && (
                <div className="jimp__warn" role="status">
                  <TriangleAlert size={18} aria-hidden="true" />
                  <div className="stack stack--sm">
                    {pre.kodeTakDikenal.length > 0 && (
                      <span>
                        <b>{t.unknown}:</b>{" "}
                        <span className="mono">{pre.kodeTakDikenal.join(", ")}</span>
                      </span>
                    )}
                    {pre.asing.length > 0 && (
                      <span>
                        <b>{t.strange}:</b>{" "}
                        <span className="mono">{pre.asing.slice(0, 12).join(", ")}</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
              <WeekGrid
                rows={pre.slot}
                t={t}
                myCode=""
                highlight={false}
                sel={null}
                onPick={() => {}}
                readOnly
              />
              <div className="row row--end">
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy || pre.slot.length === 0}
                  onClick={() => setConfirm(true)}
                >
                  {t.replace}
                </button>
              </div>
            </>
          )}
        </div>
      </Dialog>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title={t.replaceH}
        body={t.replaceBody}
        confirmLabel={t.replace}
        cancelLabel={t.cancel}
        tone="danger"
        onConfirm={simpan}
        lang={lang}
      />
    </>
  );
}

/* ----------------------------------------------------------------- page */

export default function SchedulePage({ lang }: { lang: Lang }) {
  const t = T[lang];
  const me = useMe();
  const [semester, setSemester] = useState(() => semesterDariTanggal(hariIniWib()));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [asisten, setAsisten] = useState<Asisten[]>([]);
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState<{ hari: number; slot: number } | null>(null);
  const [highlight, setHighlight] = useState(true);
  const [imp, setImp] = useState(false);
  const [openDay, setOpenDay] = useState<number | null>(() => {
    const h = hariDariTanggal(hariIniWib());
    return h >= 1 && h <= 6 ? h : 1;
  });
  const grid = useMinWidth(640);
  const wide = useMinWidth(1680);

  function load() {
    setErr(false);
    getJson<{ ok: boolean; jadwal: Row[]; asisten: Asisten[] }>(
      `/api/session/schedule?semester=${semester}`,
    )
      .then((d) => {
        setRows(d.ok ? d.jadwal : []);
        setAsisten(d.asisten ?? []);
      })
      .catch(() => setErr(true));
  }
  useEffect(() => {
    if (me?.role === "asisten") load();
  }, [me, semester]);

  const myCode = (me?.kode ?? "").toUpperCase();
  const mine = useMemo(
    () => (rows ?? []).filter((r) => r.asisten.includes(myCode)).length,
    [rows, myCode],
  );

  if (me === undefined) return <span className="skeleton" style={{ height: 420 }} />;
  if (me?.role !== "asisten") {
    return (
      <StateView
        icon={<Lock size={28} />}
        title={t.forbiddenH}
        body={t.forbidden}
        actions={
          <a className="btn btn--primary" href={href(lang, "/")}>
            {t.home}
          </a>
        }
      />
    );
  }
  if (err) {
    return (
      <StateView
        tone="danger"
        icon={<CalendarRange size={28} />}
        title={t.loadFail}
        actions={
          <button type="button" className="btn btn--primary" onClick={load}>
            {t.retry}
          </button>
        }
      />
    );
  }

  const pick = (hari: number, slot: number) => {
    setSel({ hari, slot });
  };
  const selRow =
    sel && rows ? rows.find((r) => r.hari === sel.hari && r.slot === sel.slot) : undefined;

  return (
    <div className="jpage">
      <header className="jpage__head">
        <div className="stack stack--sm">
          <span className="label-caps">IRIS IoT</span>
          <h1 className="jpage__title">{t.title}</h1>
          <p className="hint jpage__sub">{t.sub}</p>
        </div>
        <div className="jpage__tools">
          <div className="jpage__sem">
            <Dropdown
              id="jadwal-semester"
              label={t.semester}
              hideLabel
              options={semesterTetangga(semesterDariTanggal(hariIniWib())).map((s) => ({
                value: s,
                label: semesterLabel(s, lang),
              }))}
              value={semester}
              onChange={(v) => {
                setSemester(v);
                setRows(null);
                setSel(null);
              }}
            />
          </div>
          <Switch on={highlight} onChange={setHighlight} label={t.mine} showLabel />
          <button type="button" className="btn btn--secondary" onClick={() => setImp(true)}>
            {t.import}
          </button>
        </div>
      </header>

      <div className="jpage__legend" aria-label={t.legend}>
        {[1, 2, 3, 4, 5].map((k) => (
          <span
            key={k}
            className="jpage__lg"
            style={{ "--g": `var(--group-${k})` } as CSSProperties}
          >
            <i />K{k}
          </span>
        ))}
        <span className="jcell__inter">{t.inter}</span>
        <span className="jcell__soon">{t.segera}</span>
        {myCode && (
          <span className="pill pill--accent">
            {myCode} · {t.mySlots(mine)}
          </span>
        )}
      </div>

      <div className="jpage__body" data-wide={wide ? "yes" : undefined}>
        <div className="jpage__main">
          {rows === null ? (
            <span className="skeleton" style={{ height: 420 }} />
          ) : grid ? (
            <WeekGrid
              rows={rows}
              t={t}
              myCode={myCode}
              highlight={highlight}
              sel={sel}
              onPick={pick}
            />
          ) : (
            <div className="jdays">
              {HARI.map((h) => {
                const open = openDay === h;
                const count = rows.filter((r) => r.hari === h).length;
                return (
                  <section key={h} className="jdays__day" data-open={open ? "yes" : undefined}>
                    <button
                      type="button"
                      className="jdays__head"
                      aria-expanded={open}
                      onClick={() => setOpenDay(open ? null : h)}
                    >
                      <b>{t.hari[h]}</b>
                      <span className="pill pill--mono">{count}</span>
                    </button>
                    {open && (
                      <div className="jdays__slots">
                        {SLOTS.map((s) => (
                          <div key={s} className="jdays__slot">
                            <span className="jgrid__slot">
                              <b>{t.slot(s)}</b>
                              <small className="mono">{SLOT_MULAI[s]}</small>
                            </span>
                            <Cell
                              row={rows.find((r) => r.hari === h && r.slot === s)}
                              t={t}
                              myCode={myCode}
                              highlight={highlight}
                              selected={sel?.hari === h && sel.slot === s}
                              onPick={() => pick(h, s)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
        {wide && (
          <aside className="jpage__side" id="jedit">
            {sel ? (
              <SlotEditor
                key={`${semester}-${sel.hari}-${sel.slot}`}
                row={selRow}
                hari={sel.hari}
                slot={sel.slot}
                semester={semester}
                asisten={asisten}
                t={t}
                onSaved={load}
              />
            ) : (
              <div className="jedit jedit--empty">
                <p className="hint">{t.pick}</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {!wide && (
        <Drawer
          open={sel !== null}
          onOpenChange={(o) => !o && setSel(null)}
          title={t.editH}
          storeKey="jadwal"
          defaultWidth={460}
          minWidth={360}
          closeLabel={t.close}
          resizeLabel={t.resize}
        >
          {sel && (
            <SlotEditor
              key={`${semester}-${sel.hari}-${sel.slot}`}
              row={selRow}
              hari={sel.hari}
              slot={sel.slot}
              semester={semester}
              asisten={asisten}
              t={t}
              onSaved={load}
              bare
            />
          )}
        </Drawer>
      )}

      <ImportDialog
        open={imp}
        onOpenChange={setImp}
        semester={semester}
        t={t}
        lang={lang}
        onDone={load}
      />
    </div>
  );
}
