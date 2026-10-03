/**
 * Journal captures (Phase 9 Stage 7f, mockup p-live "Capture last 5").
 *
 * - JTable / DistTable: the paper journal's tables, same headers, units and
 *   footer as the worksheets (jurnal-tabel.ts), on a paper-white card.
 * - CaptureDialog: snapshots the last five complete records, copies them as
 *   TSV or CSV, and saves them to the group's journal (jurnal_tangkapan).
 *   Module 4 adds the Near / Middle / Far distance table, marked from the
 *   Hunter's smoothed RSSI.
 * - useTangkapan / CaptureList: the saved captures, read only.
 */
import { useCallback, useEffect, useState } from "react";
import {
  CameraIcon,
  CopySimpleIcon,
  FileCsvIcon,
  FloppyDiskIcon,
  MapPinIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import TabLine from "../ui/TabLine";
import Fade from "../ui/Fade";
import { useMinWidth } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import type { LiveRecord } from "../../lib/live-records";
import {
  JARAK,
  JURNAL,
  barisJurnal,
  jLang,
  rataJurnal,
  tsvJarak,
  tsvJurnal,
  type JRow,
  type JarakBaris,
} from "../../lib/jurnal-tabel";
import { CV } from "./captureStrings";

const jam = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export function JTable({ lang, modul, rows }: { lang: Lang; modul: number; rows: JRow[] }) {
  const def = JURNAL[modul];
  if (!def) return null;
  const j = def[jLang(lang)];
  const avg = rataJurnal(modul, rows);
  return (
    <div className="paper">
      <table className="jtable">
        <thead>
          <tr>
            {j.cols.map(([h, u]) => (
              <th key={h}>
                <span>{h}</span>
                {u && <small>{u}</small>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {def.keys.map((k) => (
                <td key={k} className={k === "tx" || k === "rx" ? "mono" : "num"}>
                  {k === "trial" ? `${i + 1}.` : (r[k] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={j.span}>{j.foot}</td>
            {avg.map((x, i) => (
              <td key={i} className="num">
                {x ?? ""}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function DistTable({
  lang,
  marks,
  setMarks,
}: {
  lang: Lang;
  marks: JarakBaris[];
  setMarks?: (m: JarakBaris[]) => void;
}) {
  const j = JARAK[jLang(lang)];
  const set = (i: number, p: Partial<JarakBaris>) =>
    setMarks?.(marks.map((x, k) => (k === i ? { ...x, ...p } : x)));
  return (
    <div className="paper">
      <table className="jtable jtable--dist">
        <thead>
          <tr>
            {j.cols.map(([h, u]) => (
              <th key={h}>
                <span>{h}</span>
                {u && <small>{u}</small>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {j.rows.map((pos, i) => {
            const m = marks[i];
            return (
              <tr key={pos}>
                <td>
                  <b>{pos}</b>
                </td>
                <td>
                  {setMarks ? (
                    <input
                      className="jin num"
                      inputMode="decimal"
                      aria-label={`${j.cols[1][0]} ${pos}`}
                      value={m.real}
                      maxLength={8}
                      onChange={(e) => set(i, { real: e.target.value.replace(/[^\d.,]/g, "") })}
                    />
                  ) : (
                    m.real
                  )}
                </td>
                <td className="num">{m.halus ?? ""}</td>
                <td className="num">{m.est ?? ""}</td>
                <td>
                  {setMarks ? (
                    <span className="jyn" role="group" aria-label={`${j.cols[4][0]} ${pos}`}>
                      {[true, false].map((v) => (
                        <button
                          key={String(v)}
                          type="button"
                          aria-pressed={m.obs === v}
                          onClick={() => set(i, { obs: m.obs === v ? null : v })}
                        >
                          {v ? j.yes : j.no}
                        </button>
                      ))}
                    </span>
                  ) : m.obs == null ? (
                    ""
                  ) : m.obs ? (
                    j.yes
                  ) : (
                    j.no
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const KOSONG: JarakBaris[] = [0, 1, 2].map(() => ({ real: "", halus: null, est: null, obs: null }));
const terisi = (m: JarakBaris) => m.real !== "" || m.halus !== null || m.obs !== null;

function unduhCsv(tsv: string, name: string) {
  const csv = tsv
    .split("\n")
    .map((l) =>
      l
        .split("\t")
        .map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
        .join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function CaptureDialog({
  lang,
  modul,
  group,
  records,
  open,
  onOpenChange,
  onSaved,
}: {
  lang: Lang;
  modul: number;
  group: number;
  records: LiveRecord[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const t = CV[lang];
  const wide = useMinWidth(640);
  const [snap, setSnap] = useState<{ rows: JRow[]; at: Date }>(() => ({
    rows: [],
    at: new Date(),
  }));
  const [tab, setTab] = useState<"paket" | "jarak">("paket");
  const [marks, setMarks] = useState<JarakBaris[]>(KOSONG);
  const [busy, setBusy] = useState(false);

  const take = useCallback(
    () => setSnap({ rows: barisJurnal(modul, records), at: new Date() }),
    [modul, records],
  );
  // A fresh snapshot each time the dialog opens; the open table stays still.
  useEffect(() => {
    if (open) take();
  }, [open]);

  const latest = [...records].reverse().find((r) => !r.lost && r.nilai.rssiHalus !== undefined);
  const halus = latest?.nilai.rssiHalus ?? null;
  const est = latest?.nilai.jarak ?? null;
  const posRows = JARAK[jLang(lang)].rows;

  const tsv = () =>
    tab === "jarak" ? tsvJarak(jLang(lang), marks) : tsvJurnal(modul, jLang(lang), snap.rows);
  async function salin() {
    try {
      await navigator.clipboard.writeText(tsv());
      window.Toast?.show(t.copied, "ok");
    } catch {
      window.Toast?.show(t.copyFail, "danger");
    }
  }

  async function simpan() {
    const jobs: { jenis: "paket" | "jarak"; baris: Record<string, unknown>[] }[] = [];
    if (snap.rows.length) jobs.push({ jenis: "paket", baris: snap.rows });
    if (modul === 4 && marks.some(terisi))
      jobs.push({
        jenis: "jarak",
        baris: marks.map((m, i) => ({
          posisi: i + 1,
          real: m.real,
          halus: m.halus,
          est: m.est,
          obs: m.obs,
        })),
      });
    if (!jobs.length) return;
    setBusy(true);
    try {
      for (const j of jobs) {
        const r = await fetch("/api/session/tangkapan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modul, ...j }),
        });
        const d = (await r.json().catch(() => ({ ok: false }))) as { ok: boolean; kode?: string };
        if (!d.ok) {
          window.Toast?.show(d.kode === "tidak_ada_sesi" ? t.noSession : t.failed, "danger");
          return;
        }
      }
      window.Toast?.show(t.saved, "ok");
      onSaved();
      onOpenChange(false);
    } catch {
      window.Toast?.show(t.failed, "danger");
    } finally {
      setBusy(false);
    }
  }

  const canSave = snap.rows.length > 0 || (modul === 4 && marks.some(terisi));
  const body = (
    <div className="stack capture">
      <div className="row row--between">
        <span className="hint">
          {snap.rows.length ? t.taken(jam(snap.at), snap.rows.length) : t.none}
        </span>
        <span className="row capture__tools">
          <IconButton sm icon={CopySimpleIcon} label={t.copy} onClick={() => void salin()} />
          <IconButton
            sm
            icon={FileCsvIcon}
            label={t.csv}
            onClick={() =>
              unduhCsv(
                tsv(),
                `tangkapan-modul${modul}-kelompok${group}${tab === "jarak" ? "-jarak" : ""}.csv`,
              )
            }
          />
        </span>
      </div>
      {modul === 4 && (
        <TabLine
          value={tab}
          onChange={setTab}
          label={t.title}
          tabs={[
            { v: "paket", label: t.tabPacket },
            { v: "jarak", label: t.tabDist },
          ]}
        />
      )}
      <Fade k={tab}>
        {tab === "jarak" ? (
          <div className="stack">
            <DistTable lang={lang} marks={marks} setMarks={setMarks} />
            <p className="hint">{t.nowHalus(halus, est)}</p>
            <div className="capture__marks">
              {posRows.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={halus === null}
                  onClick={() =>
                    setMarks(marks.map((x, k) => (k === i ? { ...x, halus, est } : x)))
                  }
                >
                  <MapPinIcon aria-hidden="true" />
                  {t.mark(p)}
                </button>
              ))}
            </div>
            <p className="hint">{t.distHint}</p>
          </div>
        ) : snap.rows.length ? (
          <JTable lang={lang} modul={modul} rows={snap.rows} />
        ) : null}
      </Fade>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={wide ? t.desc(modul) : undefined}
      sheet={!wide}
      size="lg"
      lang={lang}
      alt={
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            take();
            window.Toast?.show(t.againDone);
          }}
        >
          <CameraIcon aria-hidden="true" />
          {t.again}
        </button>
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.close}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canSave || busy}
            onClick={() => void simpan()}
          >
            <FloppyDiskIcon aria-hidden="true" />
            {busy ? t.saving : t.save}
          </button>
        </>
      }
    >
      {body}
    </Dialog>
  );
}

/* ------------------------------------------------------------ saved */

export interface Tangkapan {
  id: number;
  sesiId: number | null;
  kelompokNomor: number;
  modul: number;
  jenis: "paket" | "jarak";
  baris: Record<string, string | number | boolean | null>[];
  nim: string;
  dibuatPada: string;
}

/** A Praktikan's saved captures for one module (their own group). */
export function useTangkapan(modul: number, enabled: boolean) {
  const [rows, setRows] = useState<Tangkapan[] | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch(`/api/session/tangkapan?modul=${modul}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; tangkapan?: Tangkapan[] }) => {
        if (alive) setRows(d.ok ? (d.tangkapan ?? []) : []);
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [modul, enabled, n]);
  return { rows, reload: () => setN((x) => x + 1) };
}

const keJarak = (b: Tangkapan["baris"]): JarakBaris[] =>
  [0, 1, 2].map((i) => {
    const r = b[i] ?? {};
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    return {
      real: typeof r.real === "string" ? r.real : "",
      halus: num(r.halus),
      est: num(r.est),
      obs: typeof r.obs === "boolean" ? r.obs : null,
    };
  });

/** The newest saved packet table (and Module 4's distance table), read only. */
export function CaptureList({
  lang,
  modul,
  rows,
}: {
  lang: Lang;
  modul: number;
  rows: Tangkapan[];
}) {
  const t = CV[lang];
  const paket = rows.find((r) => r.jenis === "paket");
  const jarak = rows.find((r) => r.jenis === "jarak");
  if (!paket && !jarak) return <p className="hint">{t.listEmpty}</p>;
  return (
    <div className="stack">
      {paket && (
        <>
          <span className="hint">{t.savedAt(jam(paket.dibuatPada))}</span>
          <JTable lang={lang} modul={modul} rows={paket.baris as JRow[]} />
        </>
      )}
      {jarak && (
        <>
          <span className="hint">{t.savedAt(jam(jarak.dibuatPada))}</span>
          <DistTable lang={lang} marks={keJarak(jarak.baris)} />
        </>
      )}
    </div>
  );
}
