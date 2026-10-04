/**
 * Tabel nilai (P8.1): the whole session's scores in one grid, for bulk
 * entry and export. Shares the live score state with the inspector, so a
 * number typed in either place (or by another assistant) shows in both.
 *
 * - Groups held by someone else are read only, naming the holder.
 * - Enter / Shift+Enter save and move down / up the same column, like a
 *   spreadsheet; the arrow keys move between cells (mockup c-run table).
 * - The XLSX download keeps the Stage 12 columns. SeeLabs (Phase 9 Stage
 *   3g): each of my groups shows its SeeLabs account and status with "Salin
 *   untuk SeeLabs"; the full SeeLabs page opens from the board.
 * - Below 820px the grid becomes one card per student with big fields,
 *   because eight columns do not fit a phone.
 */
import { Fragment, useState, type CSSProperties, type KeyboardEvent } from "react";
import { namaAsisten, useDirektori } from "../../lib/people";
import { CopyIcon, DownloadSimpleIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { ScoreInput } from "../ui/Controls";
import Pill from "../ui/Pill";
import { unduhXlsx } from "../../lib/xlsx";
import { useMinWidth } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import SeelabsSheet, { StatusPill } from "./seelabs/SeelabsSheet";
import type { SeelabsTab } from "./seelabs/SeelabsView";
import type { SeelabsData } from "./seelabs/data";
import { SL } from "./seelabs/strings";
import type { Strings } from "./strings";
import type { NilaiLive } from "./data";
import type { AsistenRef, GroupRow } from "./types";

export default function NilaiTable({
  t,
  lang,
  sesiId,
  nilai,
  groups,
  asisten,
  meNim,
  seelabs,
  onSeelabs,
  onSeelabsChanged,
}: {
  t: Strings;
  lang: Lang;
  sesiId: number;
  nilai: NilaiLive;
  groups: GroupRow[];
  asisten: Map<string, AsistenRef>;
  meNim: string;
  seelabs: SeelabsData | null;
  onSeelabs: (tab?: SeelabsTab, nomor?: number | null) => void;
  onSeelabsChanged: () => void;
}) {
  const wide = useMinWidth(820);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<number | null>(null);
  const sl = SL[lang];
  const dir = useDirektori();
  const kode = (nim: string | null) =>
    nim ? (dir.byNim.get(nim)?.kode?.toUpperCase() ?? nim) : "?";
  const data = nilai.data;

  if (!data) {
    return (
      <section className="panel">
        <span className="skeleton" style={{ height: 320 }} />
      </section>
    );
  }

  const canEdit = (kid: number) => !data.pemilik[kid] || data.pemilik[kid] === meNim;

  async function commit(nim: string, k: string, kid: number) {
    const key = `${nim}.${k}`;
    const raw = draft[key];
    if (raw === undefined) return;
    // Drop the draft first so the blur that follows an Enter does not save twice.
    setDraft((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
    const r = await nilai.save(nim, k, raw);
    const holder = namaAsisten(asisten.get(data!.pemilik[kid] ?? ""));
    if (r === "range") window.Toast?.show(t.scoreRange, "danger");
    else if (r === "owner") window.Toast?.show(t.notOwner(holder), "danger");
    else if (r === "fail") window.Toast?.show(t.fail, "danger");
  }

  /** Enter, Shift+Enter and Up/Down move along the column; Left/Right move
   *  along the row. Only editable cells are stops. */
  function moveRow(e: KeyboardEvent<HTMLInputElement>) {
    const k = e.key;
    const cell = e.currentTarget.closest("td");
    const row = cell?.parentElement;
    if (!cell || !row) return;
    const open = (el: Element | null | undefined) =>
      el?.querySelector<HTMLInputElement>("input:not([readonly])") ?? null;
    if (k === "ArrowLeft" || k === "ArrowRight") {
      let next = k === "ArrowLeft" ? cell.previousElementSibling : cell.nextElementSibling;
      while (next && !open(next)) {
        next = k === "ArrowLeft" ? next.previousElementSibling : next.nextElementSibling;
      }
      if (!next) return;
      e.preventDefault();
      open(next)?.focus();
      return;
    }
    if (k !== "Enter" && k !== "ArrowUp" && k !== "ArrowDown") return;
    e.preventDefault();
    const up = k === "ArrowUp" || (k === "Enter" && e.shiftKey);
    const col = Array.prototype.indexOf.call(row.children, cell);
    let target = up ? row.previousElementSibling : row.nextElementSibling;
    while (target && !open(target.children[col])) {
      target = up ? target.previousElementSibling : target.nextElementSibling;
    }
    open(target?.children[col])?.focus();
  }

  function xlsx() {
    const baris: (string | number)[][] = [];
    for (const k of data!.kelompok) {
      const lk = groups.find((g) => g.id === k.id);
      for (const a of k.anggota) {
        const hadir = lk?.anggota.find((x) => x.nim === a.nim)?.hadir ?? false;
        baris.push([
          a.nim,
          a.nama,
          k.nomor,
          hadir ? "ya" : "tidak",
          lk?.benar ?? 0,
          lk?.total ?? 0,
          ...data!.komponen.map((c) => a.skor[c] ?? ""),
        ]);
      }
    }
    void unduhXlsx(
      `nilai-sesi-${sesiId}`,
      ["NIM", "Nama", "Kelompok", "Hadir", "Blank benar", "Blank total", ...data!.komponen],
      baris,
      "Nilai",
    );
  }

  /** My group's SeeLabs chip and copy button; others get "Hanya lihat". */
  function seelabsBits(nomor: number, kid: number) {
    const sg = seelabs?.kelompok.find((x) => x.nomor === nomor);
    if (!sg) return null;
    if (data!.pemilik[kid] !== meNim && sg.akun !== meNim) return null;
    return (
      <span className="row ntable__see">
        <span className="seechip">
          <span className="hint">{sl.seelabsLabel}</span>
          <b className="mono">{sg.akun ? kode(sg.akun) : "·"}</b>
          <StatusPill t={sl} status={sg.status} />
        </span>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={!sg.akun}
          title={!sg.akun ? sl.pickAccountFirst : undefined}
          onClick={() => setSheet(nomor)}
        >
          <CopyIcon size={16} aria-hidden="true" />
          {sl.copyFor}
        </button>
      </span>
    );
  }
  const sheetGroup = sheet !== null ? seelabs?.kelompok.find((x) => x.nomor === sheet) : null;

  const cell = (nim: string, nama: string, k: string, kid: number, stored: number | undefined) => {
    const key = `${nim}.${k}`;
    const ro = !canEdit(kid);
    const holder = namaAsisten(asisten.get(data.pemilik[kid] ?? ""));
    return (
      <ScoreInput
        className="ctl-score--table"
        value={draft[key] ?? (stored != null ? String(stored) : "")}
        state={nilai.states[key] ?? "idle"}
        flash={nilai.flash[key]}
        readOnlyReason={ro ? t.readOnly(holder) : undefined}
        aria-label={t.scoreFor(k, nama)}
        onValue={(x) => setDraft((d) => ({ ...d, [key]: x }))}
        onBlur={() => void commit(nim, k, kid)}
        onKeyDown={moveRow}
        onFocus={(e) => e.currentTarget.select()}
      />
    );
  };

  return (
    <section className="panel ntable">
      <div className="panel__head">
        <h2 className="panel__title">{t.tableTitle}</h2>
        <span className="row ntable__tools">
          <span className="hint">{t.tableHint}</span>
          <button type="button" className="btn" onClick={xlsx}>
            <DownloadSimpleIcon size={18} aria-hidden="true" />
            {t.xlsx}
          </button>
        </span>
      </div>

      {seelabs && sheetGroup && (
        <SeelabsSheet
          open
          onOpenChange={(o) => !o && setSheet(null)}
          t={sl}
          lang={lang}
          data={seelabs}
          g={sheetGroup}
          nama={dir.nama}
          kode={kode}
          onHow={() => onSeelabs("pasang")}
          onChanged={onSeelabsChanged}
        />
      )}

      {wide ? (
        <div className="ntable__scroll">
          <table className="ntable__grid">
            <thead>
              <tr>
                <th scope="col" className="ntable__name">
                  {t.name}
                </th>
                <th scope="col" className="ntable__nim">
                  {t.nim}
                </th>
                {data.komponen.map((k) => (
                  <th scope="col" key={k}>
                    {k}
                  </th>
                ))}
                <th scope="col" className="ntable__total">
                  {t.total}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.kelompok.map((k) => {
                const holder = asisten.get(data.pemilik[k.id] ?? "");
                return (
                  <Fragment key={k.id}>
                    <tr
                      className="ntable__group"
                      style={{ "--g": `var(--group-${k.nomor})` } as CSSProperties}
                    >
                      <th colSpan={data.komponen.length + 3}>
                        <span className="row">
                          <Pill group={k.nomor}>{t.groupFull(k.nomor)}</Pill>
                          {holder ? (
                            <span>{namaAsisten(holder)}</span>
                          ) : (
                            <span className="hint">{t.notHeld}</span>
                          )}
                          {!canEdit(k.id) && (
                            <Pill>
                              <LockSimpleIcon size={14} aria-hidden="true" />
                              {t.viewOnlyPill}
                            </Pill>
                          )}
                          {seelabsBits(k.nomor, k.id)}
                        </span>
                      </th>
                    </tr>
                    {k.anggota.map((a) => (
                      <tr key={a.nim} data-lengkap={a.lengkap ? "yes" : undefined}>
                        <td className="ntable__name">
                          <span className="truncate">{a.nama}</span>
                        </td>
                        <td className="ntable__nim mono">{a.nim}</td>
                        {data.komponen.map((c) => (
                          <td key={c}>{cell(a.nim, a.nama, c, k.id, a.skor[c])}</td>
                        ))}
                        <td className="ntable__total num">{a.total}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="stack">
          {data.kelompok.map((k) => (
            <div
              key={k.id}
              className="ncards"
              style={{ "--g": `var(--group-${k.nomor})` } as CSSProperties}
            >
              <h3 className="ncards__head">
                <span className="g-stripe" style={{ height: 18 }} />
                {t.groupFull(k.nomor)}
              </h3>
              {seelabsBits(k.nomor, k.id)}
              {k.anggota.map((a) => (
                <div key={a.nim} className="ncard">
                  <div className="row row--between">
                    <b className="truncate">{a.nama}</b>
                    <span className="num hint">
                      {t.total} {a.total}
                    </span>
                  </div>
                  <div className="ncard__grid">
                    {data.komponen.map((c) => (
                      <label key={c} className="scores__cell">
                        <span className="scores__k">{c}</span>
                        {cell(a.nim, a.nama, c, k.id, a.skor[c])}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
