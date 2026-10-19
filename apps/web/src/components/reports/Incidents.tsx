/**
 * Incidents (Phase 9 Stage 6b, mockups r-home Incidents and r-session):
 * system lines (start, pairing changes, borrowed SeeLabs accounts, raised
 * hands, announcements) and Asisten notes, in time order on tab stops.
 * Notes can be added, edited and deleted (Delete asks, then offers Undo);
 * system lines have no edit buttons, as the server refuses them.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { getJson, tanggalPanjang } from "../../lib/app";
import { hariIniWib } from "../../lib/jadwal";
import { modulLabel } from "../../lib/labels";
import { kejadianAsisten, type Kejadian, type SesiLaporan } from "../../lib/laporan";
import type { Lang } from "../../lib/kelas";
import type { Direktori } from "../../lib/people";
import Dialog from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import Pill from "../ui/Pill";
import { TimeField } from "../ui/Controls";
import { SesiPick } from "./pickers";
import { jamKejadian, kalimatKejadian, kirim, labelSesi, type TagKejadian } from "./data";
import type { Tx } from "./strings";
import { useSiaran } from "../../lib/siaran";

const API = "/api/session/kejadian";
const TONE: Record<TagKejadian, "violet" | "warn" | "accent" | "teal" | undefined> = {
  sistem: undefined,
  asisten: "accent",
  pasangan: "violet",
  seelabs: "warn",
  tangan: "teal",
};

/** The time "HH:MM" of an instant, in WIB. */
function jamWib(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(11, 16);
}

export function useKejadian(sesiIds: number[]) {
  const kunci = sesiIds.join(",");
  const [rows, setRows] = useState<Kejadian[] | null>(null);
  const [fail, setFail] = useState(false);
  useSiaran(["laporan", "sesi"], () => void load());
  const load = useCallback(async () => {
    if (!kunci) {
      setRows([]);
      return;
    }
    try {
      const d = await getJson<{ ok: boolean; kejadian: Kejadian[] }>(`${API}?sesiIds=${kunci}`);
      if (!d.ok) throw new Error("kejadian");
      setRows(d.kejadian);
      setFail(false);
    } catch {
      setFail(true);
    }
  }, [kunci]);
  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);
  return { rows, setRows, fail, load };
}

export function IncidentList({
  rows,
  t,
  lang,
  dir,
  onChanged,
}: {
  rows: Kejadian[];
  t: Tx;
  lang: Lang;
  dir: Direktori;
  onChanged: () => void;
}) {
  const [edit, setEdit] = useState<Kejadian | null>(null);
  const [txt, setTxt] = useState("");
  const [del, setDel] = useState<Kejadian | null>(null);
  const [busy, setBusy] = useState(false);
  const simpan = async () => {
    if (!edit) return;
    setBusy(true);
    const r = await kirim(API, { aksi: "ubah", id: edit.id, teks: txt });
    setBusy(false);
    if (!r.ok) return void window.Toast?.show(t.err, "danger");
    setEdit(null);
    window.Toast?.show(t.incUpdated, "ok");
    onChanged();
  };
  const hapus = async () => {
    if (!del) return;
    const k = del;
    setBusy(true);
    const r = await kirim(API, { aksi: "hapus", id: k.id });
    setBusy(false);
    if (!r.ok) return void window.Toast?.show(t.err, "danger");
    setDel(null);
    onChanged();
    window.Toast?.show(t.incDeleted, "ok", {
      action: {
        label: t.undo,
        onClick: () =>
          void kirim(API, { aksi: "pulih", id: k.id }).then((r) => {
            if (!r.ok) window.Toast?.show(t.err, "danger");
            onChanged();
          }),
      },
    });
  };
  return (
    <>
      <div className="rp-stops rp-stops--inc">
        {rows.map((k) => {
          const { tag, teks } = kalimatKejadian(k, lang, (n) => dir.nama(n));
          const sendiri = kejadianAsisten(k);
          const d = k.detail as { diubahOleh?: string };
          return (
            <div key={k.id} className="rp-stops__row">
              <span className="mono hint">{jamKejadian(k, lang)}</span>
              <Pill tone={TONE[tag]}>{t.tag[tag]}</Pill>
              <span>
                {teks}
                {sendiri && (
                  <span className="hint" style={{ display: "block" }}>
                    {t.writtenBy(dir.nama(d.diubahOleh ?? k.aktorNim))}
                    {d.diubahOleh ? ` · ${t.edited}` : ""}
                  </span>
                )}
              </span>
              <span className="rp-incact">
                {sendiri && (
                  <>
                    <IconButton
                      sm
                      icon={PencilSimpleIcon}
                      label={t.edit}
                      onClick={() => {
                        setEdit(k);
                        setTxt((k.detail as { teks?: string }).teks ?? "");
                      }}
                    />
                    <IconButton
                      sm
                      kind="danger"
                      icon={TrashIcon}
                      label={t.del}
                      onClick={() => setDel(k)}
                    />
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <Dialog
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={t.editInc}
        description={edit ? jamKejadian(edit, lang) : undefined}
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setEdit(null)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || txt.trim().length < 4}
              onClick={() => void simpan()}
            >
              {t.save}
            </button>
          </>
        }
      >
        <label className="field">
          <span className="field__label">{t.incText}</span>
          <textarea
            className="rp-textarea"
            value={txt}
            maxLength={1000}
            onChange={(e) => setTxt(e.target.value)}
          />
        </label>
        <span className="hint">{t.incEditHint}</span>
      </Dialog>
      <Dialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={t.incDelAsk}
        description={del ? jamKejadian(del, lang) : undefined}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDel(null)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => void hapus()}
            >
              {t.del}
            </button>
          </>
        }
      >
        <p>{t.incDelBody}</p>
      </Dialog>
    </>
  );
}

/** Add Incident: the session (when the caller hasn't fixed one), the time
 *  and what happened. */
export function AddIncident({
  open,
  onClose,
  sesi,
  t,
  lang,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  /** The sessions to pick from, newest first; one means it's fixed. */
  sesi: Pick<SesiLaporan, "id" | "tanggal" | "slot" | "mulai" | "modul" | "kelas">[];
  t: Tx;
  lang: Lang;
  onAdded: () => void;
}) {
  const [sesiId, setSesiId] = useState(sesi[0]?.id ?? 0);
  const [jam, setJam] = useState("");
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  const pilih = sesi.find((s) => s.id === sesiId);
  /** Today's session: now; an earlier one: its start time. */
  const jamAwal = (s: (typeof sesi)[number] | undefined) => {
    const now = jamWib(new Date().toISOString());
    return s && (s.tanggal !== hariIniWib() || now < s.mulai) ? s.mulai : now;
  };
  useEffect(() => {
    if (!open) return;
    setSesiId(sesi[0]?.id ?? 0);
    setTxt("");
    setJam(jamAwal(sesi[0]));
  }, [open]);
  const tambah = async () => {
    if (!pilih) return;
    setBusy(true);
    const r = await kirim(API, { aksi: "tambah", sesiId: pilih.id, jam, teks: txt.trim() });
    setBusy(false);
    if (!r.ok) return void window.Toast?.show(t.err, "danger");
    onClose();
    window.Toast?.show(t.incAdded, "ok");
    onAdded();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t.addInc}
      description={
        pilih ? `${labelSesi(pilih, lang)} · ${modulLabel(pilih.modul, lang)}` : undefined
      }
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !pilih || txt.trim().length < 4}
            onClick={() => void tambah()}
          >
            {t.add}
          </button>
        </>
      }
    >
      {sesi.length > 1 && (
        <SesiPick
          rows={sesi}
          value={sesiId}
          onPick={(r) => {
            setSesiId(r.id);
            setJam(jamAwal(r));
          }}
          t={t}
          lang={lang}
          autoSingle
          onClear={() => setSesiId(0)}
        />
      )}
      <div className="field">
        <span className="field__label" id="inc-jam-l">
          {t.jam}
        </span>
        <TimeField
          id="inc-jam"
          value={jam}
          onChange={setJam}
          label={t.jam}
          labelledBy="inc-jam-l"
          lang={lang}
        />
      </div>
      <label className="field">
        <span className="field__label">{t.incText}</span>
        <textarea
          className="rp-textarea"
          value={txt}
          maxLength={1000}
          placeholder={t.incPh}
          onChange={(e) => setTxt(e.target.value)}
        />
      </label>
      <span className="hint">{t.incHint}</span>
    </Dialog>
  );
}

/** Reports › Incidents: the filtered sessions' logs, newest session first. */
export function IncidentsTab({
  rows,
  t,
  lang,
  dir,
}: {
  rows: SesiLaporan[];
  t: Tx;
  lang: Lang;
  dir: Direktori;
}) {
  const [src, setSrc] = useState<"all" | "sys" | "as">("all");
  const [add, setAdd] = useState(false);
  const sesi = useMemo(() => rows.slice(0, 60), [rows]);
  const { rows: kej, fail, load } = useKejadian(sesi.map((s) => s.id));
  const per = useMemo(() => {
    const m = new Map<number, Kejadian[]>();
    for (const k of kej ?? []) {
      const asisten = kejadianAsisten(k);
      if (src === "sys" && asisten) continue;
      if (src === "as" && !asisten) continue;
      m.set(k.sesiId, [...(m.get(k.sesiId) ?? []), k]);
    }
    return m;
  }, [kej, src]);
  return (
    <div className="stack">
      <div className="rp-toolbar">
        <div className="seg" role="radiogroup" aria-label={t.srcLabel}>
          {(["all", "sys", "as"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={src === v}
              onClick={() => setSrc(v)}
            >
              {t.src[v]}
            </button>
          ))}
        </div>
        <button type="button" className="btn" disabled={!sesi.length} onClick={() => setAdd(true)}>
          {t.addInc}
        </button>
      </div>
      <section className="panel">
        {fail ? (
          <p className="hint">{t.err}</p>
        ) : kej === null ? (
          <span className="skeleton" style={{ height: 200 }} />
        ) : per.size === 0 ? (
          <p className="hint">{t.noIncidentsAll}</p>
        ) : (
          sesi
            .filter((s) => per.has(s.id))
            .map((s) => (
              <div key={s.id} className="stack stack--sm rp-sesshead">
                <h3 className="panel__title">
                  {tanggalPanjang(s.tanggal, lang)} · {modulLabel(s.modul, lang)}
                  {s.slot
                    ? ` · ${lang === "zh" ? "时段" : "Slot"} ${s.slot}`
                    : ` · ${t.susulanAt(s.mulai)}`}
                </h3>
                <IncidentList
                  rows={per.get(s.id)!}
                  t={t}
                  lang={lang}
                  dir={dir}
                  onChanged={() => void load()}
                />
              </div>
            ))
        )}
      </section>
      <AddIncident
        open={add}
        onClose={() => setAdd(false)}
        sesi={sesi}
        t={t}
        lang={lang}
        onAdded={() => void load()}
      />
    </div>
  );
}
