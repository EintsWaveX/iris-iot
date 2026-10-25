/**
 * The panel's Penilaian tab (prompt 13): every candidate's scores with sort
 * and filter, the per-question statistics for Akademik, the void action,
 * Finalkan and the distributions. Panitia read the table; the statistics,
 * void and Finalkan need the bank right (the API refuses anyone else, this
 * page only hides what it already refuses). Live: it refetches on the
 * `recscore`, `recroom` and `reclive` topics, never on a timer.
 */
import { useMemo, useState } from "react";
import Dialog from "../../../../ui/Dialog";
import Dropdown from "../../../../ui/Dropdown";
import Pill from "../../../../ui/Pill";
import TabLine from "../../../../ui/TabLine";
import type { Lang } from "../../../../../lib/kelas";
import { isFail, recPost } from "../../../../../lib/recruitment/client";
import { useScoreStats, useScores } from "../../../../../lib/recruitment/score-client";
import type {
  FinalBlocker,
  FreezeResponse,
  ScoreRow,
  StatRow,
  VoidResponse,
} from "../../../../../lib/recruitment/score-api";
import type { Phase1Part } from "../../../../../lib/recruitment/exam-types";
import { PN } from "./penilaianStrings";
import Sebaran from "./Sebaran";

import "../../../recruitment-s3-score.css";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
type Bagian = "scores" | "stats" | "spread";

const tglWib = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(lang === "id" ? "id-ID" : lang === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/* ------------------------------------------------------------------ rows */

type SortKey = "name" | "logika" | "fitb" | "debugging" | "livecode" | "phase1" | "total";
const nilaiDari = (r: ScoreRow, k: SortKey): number | string =>
  k === "name"
    ? r.nama.toLowerCase()
    : k === "logika" || k === "fitb"
      ? r.parts[k].score
      : k === "livecode"
        ? (r.livecode ?? -1)
        : r[k];

function flagText(lang: Lang, r: ScoreRow): string[] {
  const t = PN[lang];
  const out: string[] = [];
  (["logika", "fitb", "kodingan", "mikro"] as const).forEach((p) => {
    const f = r.parts[p].flag;
    if (f) out.push(`${t.part[p]}: ${t.flags[f]}`);
  });
  if (r.liveFlag) out.push(`${t.col.livecode}: ${t.flags[r.liveFlag]}`);
  return out;
}

function Angka({ v, cap, lang }: { v: number | null; cap: number; lang: Lang }) {
  if (v === null) return <span className="hint">-</span>;
  return (
    <span className="sc-num" title={PN[lang].outOf(cap)}>
      <b className="num">{v}</b>
      <i style={{ width: `${Math.min(100, (v / cap) * 100)}%` }} />
    </span>
  );
}

function TabelNilai({
  lang,
  rows,
  rooms,
}: {
  lang: Lang;
  rows: ScoreRow[];
  rooms: { id: number; title: string }[];
}) {
  const t = PN[lang];
  const [q, setQ] = useState("");
  const [room, setRoom] = useState("semua");
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "total", desc: true });
  const tampil = useMemo(() => {
    const s = q.trim().toLowerCase();
    const l = rows.filter(
      (r) =>
        (room === "semua" || String(r.roomId) === room) &&
        (!s || r.nama.toLowerCase().includes(s) || r.nim.includes(s)),
    );
    const dir = sort.desc ? -1 : 1;
    return l.sort((a, b) => {
      const x = nilaiDari(a, sort.k);
      const y = nilaiDari(b, sort.k);
      return (x < y ? -1 : x > y ? 1 : a.nim < b.nim ? -1 : 1) * dir;
    });
  }, [rows, q, room, sort]);

  const th = (k: SortKey, label: string, num = true) => (
    <th
      className={num ? "num" : undefined}
      aria-sort={sort.k === k ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        className="sc-sort"
        aria-label={t.sortBy(label)}
        onClick={() => setSort({ k, desc: sort.k === k ? !sort.desc : k !== "name" })}
      >
        {label}
      </button>
    </th>
  );

  return (
    <div className="stack">
      <div className="sc-bar">
        <input
          className="field__input sc-search"
          type="search"
          value={q}
          placeholder={t.search}
          aria-label={t.search}
          onChange={(e) => setQ(e.target.value)}
        />
        {rooms.length > 1 && (
          <Dropdown
            id="rec-score-room"
            label={t.room}
            hideLabel
            value={room}
            onChange={setRoom}
            options={[
              { value: "semua", label: t.allRooms },
              ...rooms.map((r) => ({ value: String(r.id), label: r.title })),
            ]}
          />
        )}
        <span className="grow" />
        <span className="hint num">{t.shown(tampil.length, rows.length)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="empty-note">{t.empty}</p>
      ) : (
        <div className="sc-scroll">
          <table className="sc-table">
            <thead>
              <tr>
                {th("name", t.col.name, false)}
                {th("logika", t.col.logika)}
                {th("fitb", t.col.fitb)}
                {th("debugging", t.col.debugging)}
                {th("livecode", t.col.livecode)}
                {th("phase1", t.col.phase1)}
                {th("total", t.col.total)}
              </tr>
            </thead>
            <tbody>
              {tampil.map((r) => {
                const flags = flagText(lang, r);
                return (
                  <tr key={r.seatId}>
                    <td>
                      <span className="stack" style={{ gap: 0 }}>
                        <b>{r.nama || r.nim}</b>
                        <span className="hint mono">{r.nim}</span>
                        {flags.length > 0 && <span className="sc-flag">{flags.join("; ")}</span>}
                      </span>
                    </td>
                    <td className="num">
                      <Angka v={r.parts.logika.score} cap={1000} lang={lang} />
                    </td>
                    <td className="num">
                      <Angka v={r.parts.fitb.score} cap={1000} lang={lang} />
                    </td>
                    <td className="num">
                      <Angka v={r.debugging} cap={1000} lang={lang} />
                    </td>
                    <td className="num">
                      <Angka v={r.livecode} cap={1000} lang={lang} />
                    </td>
                    <td className="num">
                      <Angka v={r.phase1} cap={3000} lang={lang} />
                    </td>
                    <td className="num">
                      <Angka v={r.total} cap={4000} lang={lang} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ statistics */

function wrongText(lang: Lang, s: StatRow): string {
  const t = PN[lang];
  const w = s.wrong;
  if (!w) return t.wrongNone;
  const label =
    w.kind === "line"
      ? t.wrongLine(w.id)
      : w.kind === "blank"
        ? `${t.wrongBlank(w.id)}: ${w.text}`
        : w.kind === "slot"
          ? `${t.wrongLine(w.id.split(":")[0])}: ${w.text}`
          : w.text;
  return label;
}

/** A question worth a look: many seats saw it and almost none got it fully right. */
const patutCek = (s: StatRow) => !s.voided && s.n >= 5 && s.pv < 0.2;

function TabelSoal({
  lang,
  stats,
  frozen,
  onVoid,
}: {
  lang: Lang;
  stats: StatRow[];
  frozen: boolean;
  onVoid: (s: StatRow) => void;
}) {
  const t = PN[lang];
  const [part, setPart] = useState<"semua" | Phase1Part>("semua");
  const baris = useMemo(
    () =>
      stats
        .filter((s) => part === "semua" || s.part === part)
        .sort((a, b) => a.pv - b.pv || a.id - b.id),
    [stats, part],
  );
  return (
    <div className="stack">
      <p className="hint">{t.statsLede}</p>
      <div className="r3chips" role="group" aria-label={t.scol.q}>
        {(["semua", "logika", "fitb", "kodingan", "mikro"] as const).map((p) => (
          <Pill key={p} pressed={part === p} onClick={() => setPart(p)}>
            {p === "semua" ? t.allParts : t.part[p]}
          </Pill>
        ))}
      </div>
      {baris.length === 0 ? (
        <p className="empty-note">{t.statsEmpty}</p>
      ) : (
        <div className="sc-scroll">
          <table className="sc-table">
            <thead>
              <tr>
                <th>{t.scol.q}</th>
                <th className="num">{t.scol.n}</th>
                <th className="num">{t.scol.m}</th>
                <th className="num">{t.scol.p}</th>
                <th className="num">{t.scol.w}</th>
                <th>{t.scol.wrong}</th>
                <th>
                  <span className="sr">{t.scol.act}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {baris.map((s) => (
                <tr key={s.id} data-voided={s.voided ? "yes" : "no"}>
                  <td>
                    <span className="stack" style={{ gap: 0 }}>
                      <b>{s.title}</b>
                      <span className="hint">
                        {t.part[s.part]} · {s.format} · {s.lang}
                      </span>
                    </span>
                  </td>
                  <td className="num">{s.n}</td>
                  <td className="num">{s.m}</td>
                  <td className="num">
                    {s.pv.toFixed(2)}
                    {patutCek(s) && (
                      <>
                        {" "}
                        <Pill tone="warn" title={t.checkTip}>
                          {t.check}
                        </Pill>
                      </>
                    )}
                  </td>
                  <td className="num">{s.wv.toFixed(2)}</td>
                  <td>
                    {s.wrong ? (
                      <span className="stack" style={{ gap: 0 }}>
                        <span>{wrongText(lang, s)}</span>
                        <span className="hint">{t.wrongCount(s.wrong.n)}</span>
                      </span>
                    ) : (
                      <span className="hint">{t.wrongNone}</span>
                    )}
                  </td>
                  <td>
                    {s.voided && <Pill tone="danger">{t.voided}</Pill>}{" "}
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={frozen}
                      onClick={() => onVoid(s)}
                    >
                      <span className="btn__label">{s.voided ? t.unvoid : t.voidIt}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- tab */

export default function PenilaianTab({ lang }: { lang: Lang }) {
  const t = PN[lang];
  const sc = useScores(true);
  const bank = !!sc.data?.can.bank;
  const st = useScoreStats(bank);
  const [bagian, setBagian] = useState<Bagian>("scores");
  const [dlg, setDlg] = useState<null | "final" | "buka" | { void: StatRow }>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const d = sc.data;
  if (!d)
    return sc.updatedAt !== null ? (
      <p className="hint">{t.unavailable}</p>
    ) : (
      <span className="skeleton" style={{ height: 320 }} />
    );

  const beku = d.final !== null;
  const tabs: { v: Bagian; label: string }[] = [
    { v: "scores", label: t.tabs.scores },
    ...(bank ? [{ v: "stats" as const, label: t.tabs.stats }] : []),
    { v: "spread", label: t.tabs.spread },
  ];
  const aktif: Bagian = tabs.some((x) => x.v === bagian) ? bagian : "scores";

  function tutup() {
    if (busy) return;
    setDlg(null);
    setNote("");
  }
  async function kirim(aksi: string, body: Record<string, unknown>, ok: string) {
    setBusy(true);
    const r = await recPost<FreezeResponse | VoidResponse>(aksi, body);
    setBusy(false);
    if (isFail(r)) {
      const msg = t.errors[String(r.kode)] ?? t.errors.generic;
      const blok = Array.isArray(r.blockers) ? (r.blockers as FinalBlocker[]) : [];
      toast(blok.length ? t.blockers(blok[0]) : msg, "danger");
      return;
    }
    toast(ok);
    setDlg(null);
    setNote("");
    sc.refresh();
    st.refresh();
  }

  const voidRow = dlg && typeof dlg === "object" ? dlg.void : null;

  return (
    <div className="stack sc-tab">
      <div className="sc-head">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h2 className="h-title" style={{ margin: 0 }}>
            {t.title}
          </h2>
          <p className="hint">{t.lede}</p>
        </div>
        <div className="sc-head__act">
          <Pill lg tone={beku ? "ok" : "warn"}>
            {beku ? t.final : t.provisional}
          </Pill>
          {bank &&
            (beku ? (
              <button type="button" className="btn" onClick={() => setDlg("buka")}>
                <span className="btn__label">{t.unfreeze}</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary"
                disabled={d.blockers.length > 0}
                onClick={() => setDlg("final")}
              >
                <span className="btn__label">{t.finalize}</span>
              </button>
            ))}
        </div>
      </div>
      {d.final && (
        <span className="hint">
          {t.finalBy(d.final.byName ?? d.final.by, tglWib(d.final.at, lang))}
          {d.final.note ? `. ${d.final.note}` : ""}
        </span>
      )}
      {bank && !beku && d.blockers.length > 0 && (
        <ul className="sc-blockers">
          {d.blockers.map((b) => (
            <li key={b.kode}>{t.blockers(b)}</li>
          ))}
        </ul>
      )}

      {tabs.length > 1 && (
        <TabLine tabs={tabs} value={aktif} onChange={setBagian} label={t.tabs.aria} />
      )}
      {aktif === "scores" ? (
        <TabelNilai lang={lang} rows={d.rows} rooms={d.rooms} />
      ) : aktif === "stats" && st.data ? (
        <TabelSoal
          lang={lang}
          stats={st.data.stats}
          frozen={beku}
          onVoid={(s) => {
            setNote("");
            setDlg({ void: s });
          }}
        />
      ) : aktif === "spread" ? (
        <Sebaran lang={lang} rows={d.rows} />
      ) : (
        <span className="skeleton" style={{ height: 240 }} />
      )}

      <Dialog
        open={dlg === "final"}
        onOpenChange={(o) => !o && tutup()}
        title={t.finalizeTitle}
        description={t.finalizeBody}
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={tutup}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() =>
                void kirim("score-finalize", { note: note.trim() || undefined }, t.done)
              }
            >
              {busy ? t.saving : t.finalizeGo}
            </button>
          </>
        }
      >
        <label className="stack stack--sm">
          <span className="label-caps">{t.finalizeNote}</span>
          <textarea
            className="field__input"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </Dialog>

      <Dialog
        open={dlg === "buka"}
        onOpenChange={(o) => !o && tutup()}
        title={t.unfreezeTitle}
        description={t.unfreezeBody}
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={tutup}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || note.trim() === ""}
              onClick={() => void kirim("score-unfreeze", { note: note.trim() }, t.opened)}
            >
              {busy ? t.saving : t.unfreezeGo}
            </button>
          </>
        }
      >
        <label className="stack stack--sm">
          <span className="label-caps">{t.unfreezeNote}</span>
          <textarea
            className="field__input"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </Dialog>

      <Dialog
        open={voidRow !== null}
        onOpenChange={(o) => !o && tutup()}
        title={voidRow?.voided ? t.unvoidTitle : t.voidTitle}
        description={voidRow?.voided ? t.unvoidBody : t.voidBody}
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={tutup}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || note.trim() === ""}
              onClick={() =>
                voidRow &&
                void kirim(
                  voidRow.voided ? "question-unvoid" : "question-void",
                  { id: voidRow.id, note: note.trim() },
                  voidRow.voided ? t.unvoidDone : t.voidDone,
                )
              }
            >
              {busy ? t.saving : voidRow?.voided ? t.unvoid : t.voidIt}
            </button>
          </>
        }
      >
        <div className="stack">
          {voidRow && <b>{voidRow.title}</b>}
          <label className="stack stack--sm">
            <span className="label-caps">{t.voidNote}</span>
            <textarea
              className="field__input"
              rows={3}
              maxLength={500}
              value={note}
              placeholder={t.voidNotePh}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
      </Dialog>
    </div>
  );
}
