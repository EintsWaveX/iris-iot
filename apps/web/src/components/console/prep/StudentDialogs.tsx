/**
 * Adding Praktikan to the semester's list (Phase 9 Stage 3, mockup c-prep):
 * one by hand (NIM checked as you type: digits, 10 or 12 long, no repeat;
 * optionally straight into a group), many pasted from a spreadsheet, or a
 * whole XLSX file. The file is read in the browser (read-excel-file); the
 * NIM, Name and Class columns are found by their headers on every sheet,
 * and a sheet named like "International" makes its rows International.
 * Each way previews the rows with OK or the reason it is skipped.
 */
import { useMemo, useState } from "react";
import { ListDashesIcon, UploadSimpleIcon, UserPlusIcon, WarningIcon } from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import Dropdown from "../../ui/Dropdown";
import Pill from "../../ui/Pill";
import SegmentedControl from "../../ui/SegmentedControl";
import { FileDrop } from "../../ui/Controls";
import { KELOMPOK_NAMA, postJson } from "../../../lib/app";
import { kelasLabel, kelompokLabel } from "../../../lib/labels";
import type { Kelas, Lang } from "../../../lib/kelas";
import type { Px } from "../prepStrings";

const NIM_RE = /^\d{10}(\d{2})?$/;

interface Baris {
  sheet?: string;
  i: number;
  nim: string;
  nama: string;
  kelas: Kelas;
  err: string | null;
}

function cekBaris(rows: Omit<Baris, "err">[], taken: Set<string>, p: Px): Baris[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    const err = !NIM_RE.test(r.nim)
      ? p.errNim
      : taken.has(r.nim)
        ? p.errTaken
        : !r.nama.trim()
          ? p.errName
          : seen.has(r.nim)
            ? p.errDup
            : null;
    seen.add(r.nim);
    return { ...r, err };
  });
}

async function kirim(rows: { nim: string; nama: string; kelas: Kelas }[]) {
  return postJson<{ ok: boolean; ditambah?: number; dilewati?: unknown[] }>(
    "/api/session/praktikan",
    { rows },
  ).catch(() => ({ ok: false, ditambah: 0, dilewati: [] }));
}

function PreviewTable({
  rows,
  p,
  lang,
  sheet,
}: {
  rows: Baris[];
  p: Px;
  lang: Lang;
  sheet?: boolean;
}) {
  return (
    <div className="prevtable">
      <table className="tim-table">
        <thead>
          <tr>
            {sheet && <th>{p.sheet}</th>}
            <th>{p.row}</th>
            <th>{p.nim}</th>
            <th>{p.name}</th>
            <th>{p.kelas}</th>
            <th>{p.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.sheet ?? ""}-${r.i}`}>
              {sheet && <td>{r.sheet}</td>}
              <td className="tnum">{r.i}</td>
              <td className="mono">{r.nim || "·"}</td>
              <td>{r.nama}</td>
              <td>
                <Pill tone={r.kelas === "internasional" ? "violet" : undefined}>
                  {kelasLabel(r.kelas, lang)}
                </Pill>
              </td>
              <td>{r.err ? <Pill tone="danger">{r.err}</Pill> : <Pill tone="ok">{p.ok}</Pill>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- add */

export function AddStudentDialog({
  p,
  lang,
  taken,
  groups,
  onClose,
  onAdded,
}: {
  p: Px;
  lang: Lang;
  taken: Set<string>;
  groups: { nomor: number; n: number; aktif: boolean }[];
  onClose: () => void;
  onAdded: (rows: { nim: string; nama: string }[], nomor: number | null) => Promise<void> | void;
}) {
  const [mode, setMode] = useState<"one" | "many">("one");
  const [nim, setNim] = useState("");
  const [nama, setNama] = useState("");
  const [kelas, setKelas] = useState<Kelas>("reguler");
  const [grp, setGrp] = useState("none");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);

  const nimErr = !nim
    ? null
    : !/^\d+$/.test(nim)
      ? p.nimErrDigits
      : nim.length !== 10 && nim.length !== 12
        ? p.nimErrLen
        : taken.has(nim)
          ? p.nimErrTaken
          : null;
  const okOne = !!nim && !nimErr && nama.trim().length > 2;

  const rows = useMemo(
    () =>
      cekBaris(
        paste
          .split("\n")
          .filter((x) => x.trim())
          .map((ln, i) => {
            const [n = "", nm = "", k = ""] = ln.split(/\t|,|;/).map((x) => x.trim());
            return {
              i: i + 1,
              nim: n,
              nama: nm,
              kelas: /inter/i.test(k) ? "internasional" : "reguler",
            };
          }),
        taken,
        p,
      ),
    [paste, taken, p],
  );
  const good = rows.filter((r) => !r.err);

  async function add() {
    setBusy(true);
    const list =
      mode === "one"
        ? [{ nim, nama: nama.trim(), kelas }]
        : good.map((r) => ({ nim: r.nim, nama: r.nama, kelas: r.kelas }));
    const r = await kirim(list);
    setBusy(false);
    if (!r.ok) return window.Toast?.show(p.addFail, "danger");
    window.Toast?.show(
      list.length === 1 ? p.addedOne(list[0].nama) : p.addedMany(r.ditambah ?? 0),
      "ok",
    );
    await onAdded(list, mode === "one" && grp !== "none" ? Number(grp) : null);
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={p.addTitle}
      description={p.addDesc}
      lang={lang}
      size={mode === "many" ? "lg" : "md"}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {p.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || (mode === "one" ? !okOne : good.length === 0)}
            onClick={() => void add()}
          >
            <UserPlusIcon size={18} aria-hidden="true" />
            {mode === "one" ? p.addOne : p.addMany(good.length)}
          </button>
        </>
      }
    >
      <div className="stack">
        <SegmentedControl
          fill
          aria-label={p.addTitle}
          value={mode}
          onValueChange={(v) => setMode(v as "one" | "many")}
          options={[
            { value: "one", label: p.one },
            { value: "many", label: p.many },
          ]}
        />
        {mode === "one" ? (
          <div className="stack">
            <label className="field" data-invalid={nimErr ? "yes" : undefined}>
              <span className="field__label">{p.nim}</span>
              <input
                className="field__input mono"
                inputMode="numeric"
                placeholder="1032231300"
                value={nim}
                autoComplete="off"
                onChange={(e) => setNim(e.target.value.trim())}
              />
              {nimErr && (
                <span className="field__error">
                  <WarningIcon size={14} aria-hidden="true" /> {nimErr}
                </span>
              )}
            </label>
            <label className="field">
              <span className="field__label">{p.fullName}</span>
              <input
                className="field__input"
                placeholder={p.fullNamePh}
                value={nama}
                autoComplete="off"
                onChange={(e) => setNama(e.target.value)}
              />
            </label>
            <div className="field">
              <span className="field__label">{p.kelas}</span>
              <SegmentedControl
                fill
                aria-label={p.kelas}
                value={kelas}
                onValueChange={(v) => setKelas(v as Kelas)}
                options={[
                  { value: "reguler", label: kelasLabel("reguler", lang) },
                  { value: "internasional", label: kelasLabel("internasional", lang) },
                ]}
              />
            </div>
            <Dropdown
              id="add-grp"
              label={p.straight}
              value={grp}
              onChange={setGrp}
              options={[
                { value: "none", label: p.notYet },
                ...groups
                  .filter((g) => g.aktif)
                  .map((g) => ({
                    value: String(g.nomor),
                    label: `${kelompokLabel(g.nomor, lang)} · ${KELOMPOK_NAMA[g.nomor] ?? ""} (${g.n})`,
                  })),
              ]}
            />
          </div>
        ) : (
          <div className="stack">
            <label className="field">
              <span className="field__label">
                <ListDashesIcon size={14} aria-hidden="true" /> {p.pasteLabel}
              </span>
              <textarea
                className="field__input field__textarea mono"
                rows={6}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <span className="field__hint">{p.pasteHint}</span>
            </label>
            {rows.length > 0 && (
              <>
                <div className="row" style={{ gap: 8 }}>
                  <Pill tone="ok">{p.ready(good.length)}</Pill>
                  {rows.length - good.length > 0 && (
                    <Pill tone="danger">{p.skipped(rows.length - good.length)}</Pill>
                  )}
                </div>
                <PreviewTable rows={rows} p={p} lang={lang} />
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------ import */

/** Finds the header row and the NIM, Name and Class columns of a sheet. */
function bacaSheet(sheet: string, data: unknown[][]): Omit<Baris, "err">[] | null {
  const teks = (v: unknown) => (v == null ? "" : String(v).trim());
  let head = -1;
  let cNim = -1;
  let cNama = -1;
  let cKelas = -1;
  for (let r = 0; r < Math.min(6, data.length) && head < 0; r++) {
    const row = data[r].map((v) => teks(v).toLowerCase());
    const n = row.findIndex((v) => /\bnim\b/.test(v));
    const m = row.findIndex((v) => /\bnama\b|\bname\b/.test(v));
    if (n >= 0 && m >= 0) {
      head = r;
      cNim = n;
      cNama = m;
      cKelas = row.findIndex((v) => /\bkelas\b|\bclass\b/.test(v));
    }
  }
  if (head < 0) return null;
  const dasar: Kelas = /inter/i.test(sheet) ? "internasional" : "reguler";
  const out: Omit<Baris, "err">[] = [];
  for (let r = head + 1; r < data.length; r++) {
    const row = data[r];
    const rawNim = row[cNim];
    const nim =
      typeof rawNim === "number" ? String(Math.trunc(rawNim)) : teks(rawNim).replace(/\s+/g, "");
    const nama = teks(row[cNama]).replace(/\s+/g, " ");
    if (!nim && !nama) continue;
    const k = cKelas >= 0 ? teks(row[cKelas]) : "";
    out.push({
      sheet,
      i: r + 1,
      nim,
      nama,
      kelas: k ? (/inter/i.test(k) ? "internasional" : "reguler") : dasar,
    });
  }
  return out;
}

export function ImportXlsxDialog({
  p,
  lang,
  taken,
  onClose,
  onDone,
}: {
  p: Px;
  lang: Lang;
  taken: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [nama, setNama] = useState<string | null>(null);
  const [sheets, setSheets] = useState(0);
  const [rows, setRows] = useState<Baris[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const good = (rows ?? []).filter((r) => !r.err);

  async function onFile(f: File) {
    setErr(null);
    setRows(null);
    setNama(f.name);
    try {
      const { default: readExcelFile } = await import("read-excel-file/browser");
      const all = (await readExcelFile(f)) as { sheet: string; data: unknown[][] }[];
      setSheets(all.length);
      const found = all.map((s) => bacaSheet(s.sheet, s.data)).filter((x) => x !== null);
      if (!found.length) return setErr(p.impNoCols);
      setRows(cekBaris(found.flat(), taken, p));
    } catch {
      setErr(p.impRead);
    }
  }

  async function run() {
    setBusy(true);
    const r = await kirim(good.map((x) => ({ nim: x.nim, nama: x.nama, kelas: x.kelas })));
    setBusy(false);
    if (!r.ok) return window.Toast?.show(p.addFail, "danger");
    window.Toast?.show(p.impDone(r.ditambah ?? 0, (rows?.length ?? 0) - (r.ditambah ?? 0)), "ok");
    onDone();
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={p.impTitle}
      description={nama ? `${nama} · ${p.impSheets(sheets)}` : p.impHint}
      lang={lang}
      size="lg"
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {p.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || good.length === 0}
            onClick={() => void run()}
          >
            <UploadSimpleIcon size={18} aria-hidden="true" />
            {p.impDo(good.length)}
          </button>
        </>
      }
    >
      <div className="stack">
        <FileDrop
          accept={["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]}
          maxBytes={10 * 1024 * 1024}
          kinds="XLSX"
          busy={busy}
          onFile={(f) => void onFile(f)}
          lang={lang}
          compact={!!rows}
        />
        {err && (
          <span className="field__error">
            <WarningIcon size={14} aria-hidden="true" /> {err}
          </span>
        )}
        {rows && (
          <>
            <div className="row" style={{ gap: 8 }}>
              <Pill tone="ok">{p.ready(good.length)}</Pill>
              {rows.length - good.length > 0 && (
                <Pill tone="danger">{p.skipped(rows.length - good.length)}</Pill>
              )}
              <span className="hint">{p.impHint}</span>
            </div>
            <PreviewTable rows={rows} p={p} lang={lang} sheet />
          </>
        )}
      </div>
    </Dialog>
  );
}
