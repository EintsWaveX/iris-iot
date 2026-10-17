/** What the robot read back from SeeLabs for one group (2026-10-17): a quiet
 *  "Sama dengan SeeLabs" line with Periksa Sekarang, or a banner when SeeLabs
 *  differs, lost the scores, or holds a group IRIS never sent, with IRIS's
 *  and SeeLabs's means side by side and Kirim Ulang ke SeeLabs. Every group
 *  of the page shares one poll of the session's read state. */
import { useState } from "react";
import { ArrowClockwiseIcon, WarningIcon } from "@phosphor-icons/react";
import { getJson, pageLang, postJson, sejak, useDetik } from "../../../lib/app";
import { usePollBersama } from "../../../lib/hooks";
import type { NilaiTersimpan, StatusBaca } from "../../../lib/seelabs-baca";
import { BC } from "./bacaStrings";
import "./robot.css";

export interface BacaKelompok {
  nomor: number;
  status: StatusBaca;
  akunNim: string;
  dibacaPada: string;
  seelabs: Record<string, NilaiTersimpan>;
  iris: Record<string, NilaiTersimpan>;
  nama: Record<string, string>;
}

export function useBacaSesi(sesiId: number | null) {
  return usePollBersama(
    `baca-sesi-${sesiId}`,
    () => getJson<{ ok: boolean; kelompok: BacaKelompok[] }>(`/api/session/robot?baca=${sesiId}`),
    120_000,
    sesiId !== null,
    ["seelabs", "nilai"],
  );
}

const angka = (n: number | undefined) =>
  n === undefined ? "" : Number.isInteger(n) ? String(n) : n.toFixed(2);

export default function SeelabsBaca({
  sesiId,
  nomor,
  canEdit,
  sent,
  onlyFlags = false,
}: {
  sesiId: number;
  nomor: number;
  canEdit: boolean;
  /** Kirim Nilai already went: a group with no read row says "not checked". */
  sent: boolean;
  /** The score table: only a group SeeLabs flags, no "Sama" line. */
  onlyFlags?: boolean;
}) {
  const lang = pageLang();
  const b = BC[lang];
  const { data, refresh } = useBacaSesi(sesiId);
  const [busy, setBusy] = useState(false);
  const now = useDetik();
  const row = data?.ok ? data.kelompok.find((k) => k.nomor === nomor) : undefined;
  if ((!row && !sent) || (onlyFlags && (!row || row.status === "sama"))) return null;

  async function periksa() {
    setBusy(true);
    const r = await postJson<{ ok: boolean; tugas?: number[] }>("/api/session/robot", {
      aksi: "periksa",
      sesiId,
    }).catch(() => ({ ok: false, tugas: [] }));
    setBusy(false);
    window.Toast?.show(
      !r.ok ? b.gagal : r.tugas?.length ? b.periksaOk : b.periksaTanpa,
      r.ok && r.tugas?.length ? "ok" : "danger",
    );
    refresh();
  }

  async function kirimUlang() {
    setBusy(true);
    const r = await postJson<{ ok: boolean; antre?: boolean }>("/api/session/robot", {
      aksi: "kirim_ulang",
      sesiId,
      kelompok: nomor,
    }).catch(() => ({ ok: false, antre: false }));
    setBusy(false);
    const ok = r.ok && r.antre !== false;
    window.Toast?.show(ok ? b.kirimUlangOk : b.gagal, ok ? "ok" : "danger");
    refresh();
  }

  const tombolPeriksa = (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      disabled={busy}
      onClick={() => void periksa()}
    >
      {b.periksa}
      <ArrowClockwiseIcon size={16} weight="bold" aria-hidden="true" />
    </button>
  );

  if (!row || row.status === "sama")
    return (
      <div className="slr-baca" data-s="sama">
        <span className="hint grow">
          {row ? `${b.sama} · ${b.dicek(sejak(row.dibacaPada, lang, now))}` : b.belumDicek}
        </span>
        {tombolPeriksa}
      </div>
    );

  const [judul, isi] =
    row.status === "beda"
      ? [b.bedaH, b.bedaBody]
      : row.status === "hilang"
        ? [b.hilangH, b.hilangBody]
        : [b.hanyaH, b.hanyaBody];
  const nims = [...new Set([...Object.keys(row.iris), ...Object.keys(row.seelabs)])].sort();
  const beda = (x?: number, y?: number) =>
    x !== undefined && y !== undefined && Math.abs(x - y) > 0.006;
  // TP and TA show only when they differ too (a group with no baseline).
  const kolom = (["tp", "ta", "praktikum", "jurnal"] as const).filter(
    (c) =>
      c === "praktikum" ||
      c === "jurnal" ||
      nims.some((n) => beda(row.iris[n]?.[c], row.seelabs[n]?.[c])),
  );
  const judulKolom = { tp: "TP", ta: "TA", praktikum: b.praktikum, jurnal: b.jurnal };

  return (
    <div className="slr-baca" data-s={row.status} role="status">
      <div className="banner banner--warn slr-note">
        <WarningIcon size={20} aria-hidden="true" />
        <span>
          <b>{judul}</b> {isi}
        </span>
      </div>
      {/* A SeeLabs-only group has no IRIS means to set beside SeeLabs's yet. */}
      {row.status !== "hanya_seelabs" && (
        <div className="slr-baca__scroll">
          <table className="slr-baca__tbl">
            <thead>
              <tr>
                <th rowSpan={2}>{b.kolNama}</th>
                {kolom.map((c) => (
                  <th key={c} colSpan={2}>
                    {judulKolom[c]}
                  </th>
                ))}
              </tr>
              <tr>
                {kolom.map((c) => [
                  <th key={`${c}-i`}>{b.kolIris}</th>,
                  <th key={`${c}-s`}>{b.kolSeelabs}</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {nims.map((nim) => {
                const i = row.iris[nim];
                const s = row.seelabs[nim];
                return (
                  <tr key={nim}>
                    <td>
                      <span className="slr-baca__nama">{row.nama[nim] ?? nim}</span>
                      <span className="hint mono">{nim}</span>
                    </td>
                    {kolom.map((c) => [
                      <td key={`${c}-i`} className="mono">
                        {angka(i?.[c])}
                      </td>,
                      <td
                        key={`${c}-s`}
                        className="mono"
                        data-beda={beda(i?.[c], s?.[c]) || undefined}
                      >
                        {angka(s?.[c])}
                      </td>,
                    ])}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="slr-baca__foot">
        <span className="hint grow">{b.dicek(sejak(row.dibacaPada, lang, now))}</span>
        {tombolPeriksa}
        {canEdit && sent && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={busy}
            onClick={() => void kirimUlang()}
          >
            {b.kirimUlang}
          </button>
        )}
      </div>
    </div>
  );
}

/** The score table's full-width row under a group SeeLabs flags; nothing
 *  otherwise (the group shares the page's one poll). */
export function SeelabsBacaBaris({
  colSpan,
  ...p
}: {
  colSpan: number;
  sesiId: number;
  nomor: number;
  canEdit: boolean;
  sent: boolean;
}) {
  const { data } = useBacaSesi(p.sesiId);
  const row = data?.ok ? data.kelompok.find((k) => k.nomor === p.nomor) : undefined;
  if (!row || row.status === "sama") return null;
  return (
    <tr className="ntable__baca">
      <td colSpan={colSpan}>
        <SeelabsBaca {...p} onlyFlags />
      </td>
    </tr>
  );
}
