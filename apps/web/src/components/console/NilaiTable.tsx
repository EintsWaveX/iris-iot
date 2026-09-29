/**
 * Tabel nilai (P8.1): the whole session's scores in one grid, for bulk
 * entry and export. Shares the live score state with the inspector, so a
 * number typed in either place (or by another assistant) shows in both.
 *
 * - Groups held by someone else are read only, with the holder's code.
 * - Enter / Shift+Enter move down / up the same column, like a spreadsheet;
 *   Tab moves across.
 * - The CSV download and the Seelabs helper keep their Stage 12 logic.
 * - Below 820px the grid becomes one card per student with big fields,
 *   because eight columns do not fit a phone.
 */
import { Fragment, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Lock } from "lucide-react";
import { ScoreInput } from "../ui/Controls";
import { UpdatedAgo } from "../ui/Display";
import { unduhCsv } from "../../lib/csv";
import { buildSeelabsBookmarklet, buildSeelabsSnippet } from "../../lib/seelabs-helper";
import { useMinWidth } from "../../lib/hooks";
import type { Strings } from "./strings";
import type { NilaiLive } from "./data";
import type { AsistenRef, GroupRow } from "./types";

export default function NilaiTable({
  t,
  sesiId,
  nilai,
  groups,
  asisten,
  meNim,
}: {
  t: Strings;
  sesiId: number;
  nilai: NilaiLive;
  groups: GroupRow[];
  asisten: Map<string, AsistenRef>;
  meNim: string;
}) {
  const wide = useMinWidth(820);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [helper, setHelper] = useState<{ bookmarklet: string; snippet: string } | null>(null);
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
    const holder = asisten.get(data!.pemilik[kid] ?? "")?.kode ?? "?";
    if (r === "range") window.Toast?.show(t.scoreRange, "danger");
    else if (r === "owner") window.Toast?.show(t.notOwner(holder), "danger");
    else if (r === "fail") window.Toast?.show(t.fail, "danger");
  }

  function moveRow(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const cell = e.currentTarget.closest("td");
    const row = cell?.parentElement;
    if (!cell || !row) return;
    const col = Array.prototype.indexOf.call(row.children, cell);
    let target = e.shiftKey ? row.previousElementSibling : row.nextElementSibling;
    while (target && !target.children[col]?.querySelector("input:not([readonly])")) {
      target = e.shiftKey ? target.previousElementSibling : target.nextElementSibling;
    }
    (target?.children[col]?.querySelector("input") as HTMLInputElement | null)?.focus();
  }

  function csv() {
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
    unduhCsv(
      `nilai-sesi-${sesiId}.csv`,
      ["NIM", "Nama", "Kelompok", "Hadir", "Blank benar", "Blank total", ...data!.komponen],
      baris,
    );
  }

  function makeHelper() {
    const list = data!.kelompok.flatMap((k) =>
      k.anggota.map((a) => ({ nim: a.nim, nama: a.nama, skor: a.skor })),
    );
    setHelper({
      bookmarklet: buildSeelabsBookmarklet(`Sesi ${sesiId}`, list),
      snippet: buildSeelabsSnippet(`Sesi ${sesiId}`, list),
    });
  }

  const cell = (nim: string, nama: string, k: string, kid: number, stored: number | undefined) => {
    const key = `${nim}.${k}`;
    const ro = !canEdit(kid);
    const holder = asisten.get(data.pemilik[kid] ?? "")?.kode ?? "?";
    return (
      <ScoreInput
        className="ctl-score--table"
        value={draft[key] ?? (stored != null ? String(stored) : "")}
        placeholder="·"
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
        <div className="stack stack--sm">
          <h2 className="panel__title">{t.tableTitle}</h2>
          <p className="panel__sub">{t.tableHint}</p>
        </div>
        <div className="row">
          <UpdatedAgo since={nilai.updatedAt} template={t.updated} />
          <button type="button" className="btn btn--secondary" onClick={csv}>
            {t.csv}
          </button>
          <button type="button" className="btn btn--secondary" onClick={makeHelper}>
            {t.seelabs}
          </button>
        </div>
      </div>

      {helper && (
        <div className="ntable__helper">
          <p className="hint">{t.seelabsBody}</p>
          <a
            href={helper.bookmarklet}
            className="btn btn--primary"
            onClick={(e) => e.preventDefault()}
            draggable
          >
            <span className="btn__label">{t.seelabsLink}</span>
          </a>
          <p className="hint">{t.seelabsSnippet}</p>
          <textarea
            readOnly
            rows={4}
            className="field__input mono console-textarea"
            value={helper.snippet}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}

      {wide ? (
        <div className="ntable__scroll">
          <table className="ntable__grid">
            <thead>
              <tr>
                <th scope="col" className="ntable__nim">
                  {t.nim}
                </th>
                <th scope="col" className="ntable__name">
                  {t.name}
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
                          <span className="g-stripe" style={{ height: 18 }} />
                          {t.groupFull(k.nomor)}
                          <span
                            className={`code-badge${holder ? "" : " code-badge--empty"}`}
                            data-me={data.pemilik[k.id] === meNim ? "yes" : undefined}
                          >
                            {holder?.kode ?? "?"}
                          </span>
                          {!canEdit(k.id) && (
                            <span className="hint row">
                              <Lock size={14} aria-hidden="true" />{" "}
                              {t.lockedBy(holder?.kode ?? "?")}
                            </span>
                          )}
                        </span>
                      </th>
                    </tr>
                    {k.anggota.map((a) => (
                      <tr key={a.nim} data-lengkap={a.lengkap ? "yes" : undefined}>
                        <td className="ntable__nim mono">{a.nim}</td>
                        <td className="ntable__name">
                          <span className="truncate">{a.nama}</span>
                        </td>
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
