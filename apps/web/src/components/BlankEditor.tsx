/**
 * The interactive Code step (Stage 8), replacing Stage 7's read-only
 * highlighted <pre>. Renders a sketch's text/blank segments (from
 * blanks.ts, computed server-side from the same public source Stage 7
 * already ships) with each blank as a small inline input, checked against
 * the server on blur and persisted either way so a reload restores drafts.
 *
 * Never holds a correct answer client-side: every verdict comes back from
 * POST /api/modul/cek as a boolean plus an already-decided "why" line, and
 * a wrong guess gets no more information than a blank one did.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Segment } from "../lib/blanks";
import { needsPersonalization, personalizeSegments } from "../lib/group-identity";
import { startPolling } from "../scripts/polling";
import "./BlankEditor.css";

type DraftJawaban = Record<string, { isi: string; benar: boolean }>;

const DRAFT_POLL_MS = 15_000;

interface Props {
  modul: number;
  berkas: string;
  bahasa: "id" | "en";
  segments: Segment[];
  downloadLabel: string;
  downloadHint: string;
  masukHint: string;
  sesiBerubahHint: string;
}

interface BlankState {
  isi: string;
  benar: boolean;
  kenapa?: string;
  checking: boolean;
  checkedIsi?: string;
}

export default function BlankEditor({
  modul,
  berkas,
  bahasa,
  segments,
  downloadLabel,
  downloadHint,
  masukHint,
  sesiBerubahHint,
}: Props) {
  const blankNomors = useMemo(
    () =>
      segments
        .filter((s): s is Extract<Segment, { kind: "blank" }> => s.kind === "blank")
        .map((s) => s.nomor),
    [segments],
  );
  const total = blankNomors.length;

  const [state, setState] = useState<Record<number, BlankState>>(() =>
    Object.fromEntries(blankNomors.map((n) => [n, { isi: "", benar: false, checking: false }])),
  );
  const [loaded, setLoaded] = useState(false);
  // "sesi_berganti" (P6.2/B9) also reopens the login modal, since it means
  // a new session has started since this cookie was issued and the editor
  // needs a fresh sign-in to attribute this group's next save correctly --
  // every other lock reason just shows masukHint and waits.
  const [lockedReason, setLockedReason] = useState<"masuk" | "sesiBerubah" | null>(null);
  const locked = lockedReason !== null;
  // Starts as the generic template's own segments (group 1's identity, if
  // this berkas carries one) and is replaced once a logged-in group's own
  // number comes back from the draft fetch below -- see group-identity.ts's
  // header for why "generic" is never what actually gets flashed.
  const [displaySegments, setDisplaySegments] = useState<Segment[]>(segments);
  const mounted = useRef(true);
  const fokusNomor = useRef<number | null>(null);

  // Merges the group's saved answers into the editor. The whole group
  // shares one set of answers, so a groupmate's checked blank has to show
  // up here too -- but never on top of what this student is typing: a
  // blank that has focus, or holds an edit not yet checked, keeps its
  // local text.
  function terapkanDraft(jawaban: DraftJawaban) {
    setState((prev) => {
      const next = { ...prev };
      for (const [nomorStr, entry] of Object.entries(jawaban)) {
        const nomor = Number(nomorStr);
        const lokal = next[nomor];
        if (!lokal) continue;
        const adaEditLokal = lokal.isi !== (lokal.checkedIsi ?? "") && lokal.isi !== "";
        if (fokusNomor.current === nomor || adaEditLokal || lokal.checking) continue;
        if (lokal.isi === entry.isi && lokal.benar === entry.benar) continue;
        next[nomor] = {
          ...lokal,
          isi: entry.isi,
          benar: entry.benar,
          checkedIsi: entry.isi,
          kenapa: lokal.isi === entry.isi ? lokal.kenapa : undefined,
        };
      }
      return next;
    });
  }

  useEffect(() => {
    mounted.current = true;
    fetch(`/api/modul/draft?modul=${modul}&berkas=${berkas}`)
      .then((r) => r.json())
      .then((data) => {
        if (!mounted.current) return;
        if (!data.ok) {
          setLockedReason(data.kode === "sesi_berganti" ? "sesiBerubah" : "masuk");
          if (data.kode === "sesi_berganti") window.Modal?.open("login-modal");
          return;
        }
        terapkanDraft(data.jawaban as DraftJawaban);

        const nomorKelompok = data.nomorKelompok;
        if (typeof nomorKelompok === "number" && needsPersonalization(berkas)) {
          try {
            setDisplaySegments(personalizeSegments(berkas, segments, nomorKelompok));
          } catch (err) {
            // A malformed sync stays a loud CI failure (sync_sketches.py's
            // own check, and the vitest cross-check against answer-keys.ts)
            // -- but a viewer already looking at this page should still see
            // SOMETHING rather than a crashed component, so this falls back
            // to the generic segments already showing instead of throwing.
            console.error(err);
          }
        }
      })
      .catch(() => {
        if (mounted.current) setLockedReason("masuk");
      })
      .finally(() => {
        if (mounted.current) setLoaded(true);
      });
    return () => {
      mounted.current = false;
    };
  }, [modul, berkas]);

  // Groupmates' answers arrive on this poll (Stage 20's replacement for
  // the retired Firebase strand). Only once signed in and loaded; a
  // hidden tab stops polling by itself (see polling.ts).
  useEffect(() => {
    if (!loaded || locked) return;
    let first = true;
    const stop = startPolling(async () => {
      if (first) {
        first = false; // the mount fetch above already covered this tick
        return;
      }
      try {
        const data = await fetch(`/api/modul/draft?modul=${modul}&berkas=${berkas}`).then((r) =>
          r.json(),
        );
        if (!mounted.current) return;
        if (data.ok) terapkanDraft(data.jawaban as DraftJawaban);
        else if (data.kode === "sesi_berganti") {
          setLockedReason("sesiBerubah");
          window.Modal?.open("login-modal");
        } else if (data.kode === "belum_masuk" || data.kode === "peran_salah") {
          setLockedReason("masuk");
        }
      } catch {
        // Try again next tick.
      }
    }, DRAFT_POLL_MS);
    return stop;
  }, [loaded, locked, modul, berkas]);

  function onChange(nomor: number, isi: string) {
    setState((prev) => ({ ...prev, [nomor]: { ...prev[nomor], isi } }));
  }

  async function checkBlank(nomor: number) {
    if (locked) return;
    const entry = state[nomor];
    if (!entry || entry.checking || entry.isi.trim().length === 0) return;
    if (entry.isi === entry.checkedIsi) return;

    setState((prev) => ({ ...prev, [nomor]: { ...prev[nomor], checking: true } }));
    try {
      const res = await fetch("/api/modul/cek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modul, berkas, nomor, jawaban: entry.isi }),
      });
      const data = await res.json();
      if (!data.ok) {
        // Not a verdict: an expired sign-in or a rejected request used to
        // be shown as "wrong" (benar false, marked checked), telling a
        // student a correct answer was incorrect. Leave it unchecked, and
        // lock the editor behind the sign-in hint when that is the cause.
        if (data.kode === "sesi_berganti") {
          setLockedReason("sesiBerubah");
          window.Modal?.open("login-modal");
        } else if (data.kode === "belum_masuk" || data.kode === "peran_salah") {
          setLockedReason("masuk");
        }
        setState((prev) => ({ ...prev, [nomor]: { ...prev[nomor], checking: false } }));
        return;
      }
      setState((prev) => ({
        ...prev,
        [nomor]: {
          ...prev[nomor],
          checking: false,
          benar: Boolean(data.benar),
          kenapa: data.kenapa,
          checkedIsi: entry.isi,
        },
      }));
    } catch {
      setState((prev) => ({ ...prev, [nomor]: { ...prev[nomor], checking: false } }));
    }
  }

  const benarCount = blankNomors.filter((n) => state[n]?.benar).length;
  const lengkap = loaded && total > 0 && benarCount === total;

  return (
    <div className="blank-editor">
      {locked && (
        <p className="blank-editor__locked">
          {lockedReason === "sesiBerubah" ? sesiBerubahHint : masukHint}
        </p>
      )}
      <pre className="blank-editor__code">
        {displaySegments.map((seg, i) => {
          if (seg.kind === "text") return seg.text;
          const entry = state[seg.nomor];
          const width = Math.max(4, (entry?.isi.length ?? 0) + 2);
          return (
            <span
              key={i}
              className="blank-editor__field"
              data-state={
                entry?.checking
                  ? "checking"
                  : entry?.checkedIsi === entry?.isi && entry?.isi
                    ? entry?.benar
                      ? "benar"
                      : "salah"
                    : "netral"
              }
            >
              <input
                type="text"
                id={`blank-${berkas}-${seg.nomor}`}
                name={`blank-${berkas}-${seg.nomor}`}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={locked}
                aria-label={seg.hint}
                title={seg.hint}
                style={{ width: `${width}ch` }}
                value={entry?.isi ?? ""}
                onChange={(e) => onChange(seg.nomor, e.target.value)}
                onFocus={() => {
                  fokusNomor.current = seg.nomor;
                }}
                onBlur={() => {
                  if (fokusNomor.current === seg.nomor) fokusNomor.current = null;
                  void checkBlank(seg.nomor);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void checkBlank(seg.nomor);
                  }
                }}
              />
              {entry?.checkedIsi === entry?.isi && entry?.isi && entry.benar && entry.kenapa && (
                <span className="blank-editor__kenapa" role="status">
                  {entry.kenapa}
                </span>
              )}
            </span>
          );
        })}
      </pre>

      <div className="blank-editor__footer">
        <span className="blank-editor__progress">
          {benarCount}/{total}
        </span>
        <a
          className="btn btn--ghost btn--sm blank-editor__download"
          data-disabled={lengkap ? "no" : "yes"}
          href={
            lengkap
              ? `/api/modul/unduh?modul=${modul}&berkas=${berkas}&bahasa=${bahasa}`
              : undefined
          }
          aria-disabled={!lengkap}
          title={lengkap ? downloadLabel : downloadHint}
        >
          {downloadLabel}
        </a>
      </div>
    </div>
  );
}
