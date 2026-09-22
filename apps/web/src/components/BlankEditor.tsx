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
import "./BlankEditor.css";

interface Props {
  modul: number;
  berkas: string;
  bahasa: "id" | "en";
  segments: Segment[];
  downloadLabel: string;
  downloadHint: string;
  masukHint: string;
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
  const [locked, setLocked] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetch(`/api/modul/draft?modul=${modul}&berkas=${berkas}`)
      .then((r) => r.json())
      .then((data) => {
        if (!mounted.current) return;
        if (!data.ok) {
          setLocked(true);
          return;
        }
        setState((prev) => {
          const next = { ...prev };
          for (const [nomorStr, entry] of Object.entries(
            data.jawaban as Record<string, { isi: string; benar: boolean }>,
          )) {
            const nomor = Number(nomorStr);
            if (next[nomor]) {
              next[nomor] = {
                ...next[nomor],
                isi: entry.isi,
                benar: entry.benar,
                checkedIsi: entry.isi,
              };
            }
          }
          return next;
        });
      })
      .catch(() => {
        if (mounted.current) setLocked(true);
      })
      .finally(() => {
        if (mounted.current) setLoaded(true);
      });
    return () => {
      mounted.current = false;
    };
  }, [modul, berkas]);

  function onChange(nomor: number, isi: string) {
    setState((prev) => ({ ...prev, [nomor]: { ...prev[nomor], isi } }));
  }

  async function checkBlank(nomor: number) {
    if (locked) return;
    const entry = state[nomor];
    if (!entry || entry.isi.trim().length === 0 || entry.isi === entry.checkedIsi) return;

    setState((prev) => ({ ...prev, [nomor]: { ...prev[nomor], checking: true } }));
    try {
      const res = await fetch("/api/modul/cek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modul, berkas, nomor, jawaban: entry.isi }),
      });
      const data = await res.json();
      setState((prev) => ({
        ...prev,
        [nomor]: {
          ...prev[nomor],
          checking: false,
          benar: Boolean(data.benar),
          kenapa: data.kenapa,
          checkedIsi: prev[nomor].isi,
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
      {locked && <p className="blank-editor__locked">{masukHint}</p>}
      <pre className="blank-editor__code">
        {segments.map((seg, i) => {
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
                onBlur={() => checkBlank(seg.nomor)}
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
          className="blank-editor__download"
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
