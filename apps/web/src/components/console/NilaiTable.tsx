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
 * - Sama Rata (the inspector's choice, shared): a score typed for a present
 *   Praktikan fills that column for the group's present members. Each row
 *   has a Tidak Hadir switch: every field 0, left out of Sama Rata.
 */
import { Fragment, useState, type CSSProperties, type KeyboardEvent } from "react";
import { namaAsisten, useDirektori } from "../../lib/people";
import { LockSimpleIcon } from "@phosphor-icons/react";
import { ScoreInput, Switch } from "../ui/Controls";
import SegmentedControl from "../ui/SegmentedControl";
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
import type { AsistenRef, GroupRow, NilaiAnggota } from "./types";
import { useCaraNilai } from "./caraNilai";
import { useTandaAbsen } from "./TandaAbsen";
import KirimNilai from "./KirimNilai";
import { PD } from "./seelabs/panduanStrings";
import Nil from "../ui/Nil";

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
  const [cara, setCara] = useCaraNilai();
  const rata = cara === "rata";
  const holderOf = (nim: string) => {
    const k = data?.kelompok.find((x) => x.anggota.some((a) => a.nim === nim));
    return namaAsisten(asisten.get((k && data?.pemilik[k.id]) ?? ""));
  };
  const absen = useTandaAbsen(t, lang, nilai, (a) => holderOf(a.nim));
  const [menandai, setMenandai] = useState<number | null>(null);

  if (!data) {
    return (
      <section className="panel">
        <span className="skeleton" style={{ height: 320 }} />
      </section>
    );
  }

  const canEdit = (kid: number) => !data.pemilik[kid] || data.pemilik[kid] === meNim;

  // Members who never signed in this session and still have empty fields.
  const belumMasuk = (kid: number) => {
    const lk = groups.find((g) => g.id === kid);
    const k = data.kelompok.find((x) => x.id === kid);
    return (k?.anggota ?? [])
      .filter(
        (a) =>
          !a.absen && !a.lengkap && !(lk?.anggota.find((x) => x.nim === a.nim)?.hadir ?? false),
      )
      .map((a) => a.nim);
  };
  async function tandaiSemua(kid: number) {
    const nims = belumMasuk(kid);
    setMenandai(kid);
    let ok = 0;
    for (const n of nims) if ((await nilai.setAbsen(n, true)) === "ok") ok++;
    setMenandai(null);
    window.Toast?.show(t.markedAbsent(ok, nims.length - ok), ok === nims.length ? "ok" : "danger");
  }
  const tombolAbsen = (kid: number) => {
    const n = belumMasuk(kid).length;
    if (!n || !canEdit(kid)) return null;
    return (
      <button
        type="button"
        className="btn btn--sm btn--ghost"
        disabled={menandai !== null}
        data-loading={menandai === kid ? "yes" : "no"}
        onClick={() => void tandaiSemua(kid)}
      >
        <span className="btn__label">{t.markAbsent(n)}</span>
        <span className="btn__spinner" aria-hidden="true" />
      </button>
    );
  };

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
    // Sama Rata: a present Praktikan's score goes to the group's present
    // members; a Tidak Hadir one stays their own.
    const group = data!.kelompok.find((x) => x.id === kid);
    const me = group?.anggota.find((a) => a.nim === nim);
    const r =
      rata && group && me && !me.absen
        ? await nilai.saveMany(
            group.anggota.filter((a) => !a.absen).map((a) => a.nim),
            k,
            raw,
          )
        : await nilai.save(nim, k, raw);
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
          hadir && !a.absen ? "ya" : "tidak",
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
          {sg.akun ? <b className="mono">{kode(sg.akun)}</b> : <Nil />}
          <StatusPill t={sl} status={sg.status} />
        </span>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={!sg.akun}
          title={!sg.akun ? sl.pickAccountFirst : undefined}
          onClick={() => setSheet(nomor)}
        >
          {sl.copyFor}
        </button>
      </span>
    );
  }
  const sheetGroup = sheet !== null ? seelabs?.kelompok.find((x) => x.nomor === sheet) : null;

  const absenSwitch = (a: NilaiAnggota, kid: number) => (
    <Switch
      on={a.absen}
      label={t.absenFor(a.nama)}
      disabled={!canEdit(kid)}
      onChange={(on) => absen.ubah(a, on)}
    />
  );

  const cell = (nim: string, nama: string, k: string, kid: number, stored: number | undefined) => {
    const key = `${nim}.${k}`;
    // Phase 13: a TP graded per question in Penilaian is read only here.
    const dariTp = k === "TP" && !!data.tpDari?.includes(nim);
    const ro = !canEdit(kid) || dariTp;
    const holder = namaAsisten(asisten.get(data.pemilik[kid] ?? ""));
    return (
      <ScoreInput
        className="ctl-score--table"
        value={draft[key] ?? (stored != null ? String(stored) : "")}
        state={nilai.states[key] ?? "idle"}
        flash={nilai.flash[key]}
        readOnlyReason={dariTp ? t.tpDariPenilaian : ro ? t.readOnly(holder) : undefined}
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
          <span className="hint">{rata ? t.rataTable : t.tableHint}</span>
          <SegmentedControl
            value={cara}
            onValueChange={(v) => setCara(v === "rata" ? "rata" : "orang")}
            aria-label={t.caraLabel}
            options={[
              { value: "orang", label: t.caraOrang },
              { value: "rata", label: t.caraRata },
            ]}
          />
          <button type="button" className="btn" onClick={() => onSeelabs("panduan")}>
            {PD[lang].btn}
          </button>
          <button type="button" className="btn" onClick={xlsx}>
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
                <th scope="col" className="ntable__absen">
                  {t.absen}
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
                      <th colSpan={data.komponen.length + 4}>
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
                          {tombolAbsen(k.id)}
                          <KirimNilai
                            t={t}
                            nilai={nilai}
                            kelompokId={k.id}
                            canEdit={canEdit(k.id)}
                            compact
                          />
                        </span>
                      </th>
                    </tr>
                    {k.anggota.map((a) => (
                      <tr
                        key={a.nim}
                        data-lengkap={a.lengkap ? "yes" : undefined}
                        data-absen={a.absen ? "yes" : undefined}
                      >
                        <td className="ntable__name">
                          <span className="truncate">{a.nama}</span>
                        </td>
                        <td className="ntable__nim mono">{a.nim}</td>
                        <td className="ntable__absen">{absenSwitch(a, k.id)}</td>
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
              {tombolAbsen(k.id)}
              <KirimNilai t={t} nilai={nilai} kelompokId={k.id} canEdit={canEdit(k.id)} compact />
              {k.anggota.map((a) => (
                <div key={a.nim} className="ncard" data-absen={a.absen ? "yes" : undefined}>
                  <div className="row row--between">
                    <b className="truncate">{a.nama}</b>
                    <span className="num hint">
                      {t.total} {a.total}
                    </span>
                  </div>
                  <span className="scores__absen">
                    <span className="hint">{t.absen}</span>
                    {absenSwitch(a, k.id)}
                  </span>
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
      {absen.dialog}
    </section>
  );
}
