/**
 * One sketch of the Code step (Phase 9 Stage 7d, mockup p-module › Code):
 * the file switch, a ring of blanks right, the pin panel toggle and the
 * download on one head row; a chip per blank that jumps to its line; the
 * code with a line gutter, where every line holding a blank keeps a faint
 * band in its blank's state colour and the line you are on breathes.
 *
 * Modes:
 * - now: a Praktikan in this module's session. Each blank is checked by
 *   the server on Enter or blur and saved either way; the group's answers
 *   arrive on a poll, and a groupmate's correct blank turns read only in
 *   the group colour with their name under the code.
 * - done: the same Praktikan's answers afterwards, read only.
 * - asisten: no answers of their own. Show Answers (CodeStep) fills every
 *   blank with the key, served by /api/modul/kunci to Asisten only, and
 *   unlocks the complete file.
 *
 * A Praktikan's browser never holds a correct answer: every verdict comes
 * back from POST /api/modul/cek as a boolean and a "why" line.
 *
 * Typing keeps its text: the input is controlled by `isi`, which is only
 * replaced by the group's saved answer when the blank is not focused and
 * holds no unchecked edit (terapkanDraft).
 */
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  CheckCircleIcon,
  CheckIcon,
  DownloadSimpleIcon,
  SidebarSimpleIcon,
  StarIcon,
} from "@phosphor-icons/react";
import type { BlankSegment, Segment } from "../../lib/blanks";
import { BLANK_MARK, detectLang, tokenize, type Token } from "../../lib/highlight";
import { needsPersonalization, personalizeSegments } from "../../lib/group-identity";
import { startPolling } from "../../scripts/polling";
import IconButton from "../ui/IconButton";
import { ProgressRing } from "../ui/Display";
import type { Lang } from "../../lib/kelas";
import { C } from "./codeStrings";

export type CodeMode = "now" | "done" | "asisten";

export interface BerkasEntry {
  slug: string;
  judul: string;
  segments: Segment[];
}

type Saved = Record<string, { isi: string; benar: boolean; saya?: boolean; oleh?: string | null }>;

interface BlankState {
  isi: string;
  benar: boolean;
  /** A groupmate's correct answer (read only for this student). */
  teman: boolean;
  kenapa?: string;
  checking: boolean;
  checkedIsi?: string;
}

type St = "empty" | "ok" | "bad" | "peer" | "key";

type Item = { t: "tok"; tok: Token; text: string } | { t: "blank"; seg: BlankSegment };

const POLL_MS = 15_000;

interface Props {
  lang: Lang;
  mode: CodeMode;
  modul: number;
  /** The sketch's language track, for the download. */
  bahasa: "id" | "en";
  file: BerkasEntry;
  files: BerkasEntry[];
  onPick: (slug: string) => void;
  showKeys: boolean;
  /** The pin panel toggle on the head row. */
  pinsOpen: boolean;
  onPins: () => void;
  wide: boolean;
  /** The pin panel, rendered beside the code when open on a wide screen. */
  side?: ReactNode;
}

/** "Central/Client: Bluetooth Low Energy (ESP32)" to "Central/Client". */
function shortLabel(judul: string): string {
  return judul.split(":")[0].trim();
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function BlankFile(p: Props) {
  const { lang, mode, modul, file } = p;
  const t = C[lang];
  const berkas = file.slug;
  const nomors = useMemo(
    () => file.segments.filter((s): s is BlankSegment => s.kind === "blank").map((s) => s.nomor),
    [file.segments],
  );
  const total = nomors.length;

  const [state, setState] = useState<Record<number, BlankState>>(() =>
    Object.fromEntries(
      nomors.map((n) => [n, { isi: "", benar: false, teman: false, checking: false }]),
    ),
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const [loaded, setLoaded] = useState(mode === "asisten");
  const [lockedReason, setLockedReason] = useState<"masuk" | "sesiBerubah" | "terkunci" | null>(
    null,
  );
  const locked = lockedReason !== null;
  const [segments, setSegments] = useState<Segment[]>(file.segments);
  const [grup, setGrup] = useState<number | null>(null);
  const [kunci, setKunci] = useState<Record<string, string> | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [flash, setFlash] = useState<number[]>([]);
  const [lastPeer, setLastPeer] = useState<{ nomor: number; oleh: string | null } | null>(null);
  const [why, setWhy] = useState<{ nomor: number; text: string } | null>(null);
  const fokus = useRef<number | null>(null);
  const mounted = useRef(true);
  const flashTimer = useRef<number | undefined>(undefined);
  const box = useRef<HTMLDivElement | null>(null);

  const readOnly = mode !== "now" || locked;

  /** Merges the group's saved answers, never over a blank being typed in. */
  function terapkanDraft(saved: Saved, tandai = false) {
    const next = { ...stateRef.current };
    const berubah: number[] = [];
    let peer: { nomor: number; oleh: string | null } | null = null;
    for (const [k, e] of Object.entries(saved ?? {})) {
      const nomor = Number(k);
      const lokal = next[nomor];
      if (!lokal) continue;
      const editLokal = lokal.isi !== "" && lokal.isi !== (lokal.checkedIsi ?? "");
      if (fokus.current === nomor || editLokal || lokal.checking) continue;
      const teman = e.benar && e.saya === false;
      if (lokal.isi === e.isi && lokal.benar === e.benar && lokal.teman === teman) continue;
      next[nomor] = {
        ...lokal,
        isi: e.isi,
        benar: e.benar,
        teman,
        checkedIsi: e.isi,
        kenapa: lokal.isi === e.isi ? lokal.kenapa : undefined,
      };
      berubah.push(nomor);
      if (tandai && teman) peer = { nomor, oleh: e.oleh ?? null };
    }
    if (berubah.length === 0) return;
    stateRef.current = next;
    setState(next);
    if (peer) {
      setLastPeer(peer);
      setWhy(null);
    }
    if (tandai) {
      setFlash(berubah);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => mounted.current && setFlash([]), 1400);
    }
  }

  function onFail(kode: string | undefined) {
    if (kode === "sesi_berganti") {
      setLockedReason("sesiBerubah");
      window.LoginDialog?.open();
    } else if (kode === "modul_terkunci") setLockedReason("terkunci");
    else if (kode === "belum_masuk" || kode === "peran_salah") setLockedReason("masuk");
  }

  const draftUrl = `/api/modul/draft?modul=${modul}&berkas=${berkas}`;

  // The group's answers, once, then on a poll while the session runs.
  useEffect(() => {
    mounted.current = true;
    if (mode === "asisten") return;
    fetch(draftUrl)
      .then((r) => r.json())
      .then((d) => {
        if (!mounted.current) return;
        if (!d.ok) {
          onFail(d.kode);
          if (!d.kode || d.kode === "kelompok_tidak_diketahui") setLockedReason("masuk");
          return;
        }
        terapkanDraft(d.jawaban as Saved);
        const n = d.nomorKelompok;
        if (typeof n === "number") {
          setGrup(n);
          if (needsPersonalization(berkas)) {
            try {
              setSegments(personalizeSegments(berkas, file.segments, n));
            } catch (err) {
              console.error(err);
            }
          }
        }
      })
      .catch(() => mounted.current && setLockedReason("masuk"))
      .finally(() => mounted.current && setLoaded(true));
    return () => {
      mounted.current = false;
    };
  }, [modul, berkas, mode]);

  useEffect(() => {
    if (mode !== "now" || !loaded || locked) return;
    let first = true;
    return startPolling(async () => {
      if (first) {
        first = false;
        return;
      }
      try {
        const d = await fetch(draftUrl).then((r) => r.json());
        if (!mounted.current) return;
        if (d.ok) terapkanDraft(d.jawaban as Saved, true);
        else onFail(d.kode);
      } catch {
        // The next tick tries again.
      }
    }, POLL_MS);
  }, [mode, loaded, locked, modul, berkas]);

  // The key, for an Asisten who switched Show Answers on.
  useEffect(() => {
    if (mode !== "asisten" || !p.showKeys || kunci) return;
    fetch(`/api/modul/kunci?modul=${modul}&berkas=${berkas}`)
      .then((r) => r.json())
      .then((d) => {
        if (!mounted.current) return;
        if (d.ok) setKunci(d.kunci);
        else window.Toast?.show(t.keyError, "warn");
      })
      .catch(() => window.Toast?.show(t.keyError, "warn"));
  }, [mode, p.showKeys, modul, berkas]);

  const keys = mode === "asisten" && p.showKeys && kunci !== null;

  async function check(nomor: number) {
    if (readOnly) return;
    const e = stateRef.current[nomor];
    if (!e || e.checking || e.teman) return;
    const isi = e.isi;
    if (isi.trim() === "" || isi === e.checkedIsi) return;
    setState((s) => ({ ...s, [nomor]: { ...s[nomor], checking: true } }));
    try {
      const d = await fetch("/api/modul/cek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modul, berkas, nomor, jawaban: isi }),
      }).then((r) => r.json());
      if (!d.ok) {
        // Not a verdict (an expired sign-in, a rejected request): the blank
        // stays unchecked rather than being marked wrong.
        onFail(d.kode);
        setState((s) => ({ ...s, [nomor]: { ...s[nomor], checking: false } }));
        return;
      }
      setState((s) => ({
        ...s,
        [nomor]: {
          ...s[nomor],
          checking: false,
          benar: Boolean(d.benar),
          teman: false,
          kenapa: d.kenapa,
          checkedIsi: isi,
        },
      }));
      if (d.benar && d.kenapa) {
        setWhy({ nomor, text: d.kenapa });
        setLastPeer(null);
      }
    } catch {
      setState((s) => ({ ...s, [nomor]: { ...s[nomor], checking: false } }));
    }
  }

  function stOf(n: number): St {
    if (mode === "asisten") return keys ? "key" : "empty";
    const e = state[n];
    if (!e || !e.isi || e.checkedIsi !== e.isi) return "empty";
    if (!e.benar) return "bad";
    return e.teman ? "peer" : "ok";
  }

  const right = nomors.filter((n) => state[n]?.benar).length;
  const shownRight = mode === "asisten" ? (keys ? total : 0) : right;
  const complete = loaded && total > 0 && (mode === "asisten" ? keys : right === total);

  // Back online: send every answer typed while the network was gone (the
  // state keeps them; a failed send left them unchecked).
  const checkRef = useRef(check);
  checkRef.current = check;
  useEffect(() => {
    const on = () => {
      for (const [n, e] of Object.entries(stateRef.current))
        if (e && e.isi.trim() && e.isi !== e.checkedIsi && !e.teman)
          void checkRef.current(Number(n));
    };
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);

  // The first blank still to do is the line you start on.
  useEffect(() => {
    if (!loaded || target !== null) return;
    const todo = nomors.find((n) => !stateRef.current[n]?.benar);
    setTarget(todo ?? nomors[0] ?? null);
  }, [loaded]);

  // Colour the sketch once per template, then cut it into lines, each
  // knowing which blanks it holds.
  const lines = useMemo(() => {
    const full = segments.map((s) => (s.kind === "text" ? s.text : BLANK_MARK)).join("");
    const tokens = tokenize(full, detectLang(full));
    const blanks = segments.filter((s): s is BlankSegment => s.kind === "blank");
    const out: Item[][] = [[]];
    let b = 0;
    for (const tok of tokens) {
      tok.text.split(BLANK_MARK).forEach((part, pi) => {
        if (pi > 0 && blanks[b]) out[out.length - 1].push({ t: "blank", seg: blanks[b++] });
        part.split("\n").forEach((piece, li) => {
          if (li > 0) out.push([]);
          if (piece) out[out.length - 1].push({ t: "tok", tok, text: piece });
        });
      });
    }
    return out;
  }, [segments]);

  const lineOf = useMemo(() => {
    const m = new Map<number, number>();
    lines.forEach((items, i) => {
      for (const it of items) if (it.t === "blank") m.set(it.seg.nomor, i);
    });
    return m;
  }, [lines]);

  function jump(n: number, focus = true) {
    setTarget(n);
    requestAnimationFrame(() => {
      const scroller = box.current;
      const el = scroller?.querySelector<HTMLElement>(`[data-blank="${n}"]`);
      const ln = el?.closest<HTMLElement>(".cl");
      if (!scroller || !el || !ln) return;
      scroller.scrollTop = Math.max(0, ln.offsetTop - scroller.clientHeight / 2 + 20);
      const r = scroller.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight)
        scroller.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (focus) el.querySelector("input")?.focus({ preventScroll: true });
    });
  }

  function step(from: number, dir: 1 | -1) {
    const i = nomors.indexOf(from);
    const n = nomors[i + dir];
    if (n !== undefined) jump(n);
  }

  async function download() {
    if (!complete) {
      window.Toast?.show(t.downloadFirst, "warn");
      return;
    }
    const url =
      mode === "asisten"
        ? `/api/modul/kunci?modul=${modul}&berkas=${berkas}&unduh=1&bahasa=${p.bahasa}`
        : `/api/modul/unduh?modul=${modul}&berkas=${berkas}&bahasa=${p.bahasa}`;
    try {
      const r = await fetch(url);
      if ((r.headers.get("Content-Type") ?? "").includes("json")) {
        window.Toast?.show(t.downloadFirst, "warn");
        return;
      }
      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1];
      saveBlob(await r.blob(), name ?? berkas);
    } catch {
      window.Toast?.show(t.keyError, "warn");
    }
  }

  function renderBlank(seg: BlankSegment) {
    const n = seg.nomor;
    const e = state[n];
    const s = stOf(n);
    const value = keys ? (kunci?.[n] ?? "") : (e?.isi ?? "");
    const width = Math.max(7, value.length + 3) + (s === "ok" ? 2 : 0);
    return (
      <span
        key={`b${n}`}
        className={`blank blank--${s}`}
        data-blank={n}
        data-flash={flash.includes(n) ? "yes" : undefined}
        data-checking={e?.checking ? "yes" : undefined}
      >
        <input
          type="text"
          id={`blank-${berkas}-${n}`}
          name={`blank-${berkas}-${n}`}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={t.blank(n, seg.hint)}
          placeholder={`(${n})`}
          readOnly={readOnly || s === "peer"}
          aria-invalid={s === "bad" || undefined}
          style={{ width: `${width}ch` }}
          value={value}
          onFocus={() => {
            fokus.current = n;
            setTarget(n);
          }}
          onChange={(ev) => {
            if (readOnly || s === "peer") return;
            const isi = ev.target.value;
            stateRef.current = { ...stateRef.current, [n]: { ...stateRef.current[n], isi } };
            setState(stateRef.current);
          }}
          onBlur={() => {
            if (fokus.current === n) fokus.current = null;
            void check(n);
          }}
          onKeyDown={(ev) => {
            if (ev.altKey && (ev.key === "ArrowDown" || ev.key === "ArrowUp")) {
              ev.preventDefault();
              step(n, ev.key === "ArrowDown" ? 1 : -1);
            } else if (ev.key === "Enter") {
              ev.preventDefault();
              void check(n);
            }
          }}
        />
        {s === "ok" && (
          <span className="blank__tick" aria-hidden="true">
            <CheckIcon size={14} weight="bold" />
          </span>
        )}
      </span>
    );
  }

  const nb = total;
  // Done mode's "History, read only" banner is the page's own (ModuleSteps).
  const banner = locked ? (
    <div className="banner banner--warn">
      <span>
        {lockedReason === "sesiBerubah"
          ? t.newSession
          : lockedReason === "terkunci"
            ? t.locked
            : t.signIn}
      </span>
    </div>
  ) : null;

  return (
    <div
      className="stack codestep__file"
      style={grup ? ({ "--g": `var(--group-${grup})` } as CSSProperties) : undefined}
    >
      {banner}
      <div className="codehead">
        {p.files.length > 1 ? (
          <div className="seg codehead__files" role="tablist" aria-label={t.file} data-segfit="off">
            {p.files.map((f) => (
              <button
                key={f.slug}
                type="button"
                role="tab"
                aria-selected={f.slug === berkas}
                onClick={() => p.onPick(f.slug)}
              >
                <span className="truncate">{shortLabel(f.judul)}</span>
              </button>
            ))}
          </div>
        ) : (
          <b className="truncate">{shortLabel(file.judul)}</b>
        )}
        <span className="codehead__tools">
          <ProgressRing
            value={shownRight}
            max={nb}
            color="var(--ok)"
            label={`${shownRight}/${nb}`}
          />
          <IconButton
            icon={SidebarSimpleIcon}
            label={p.wide ? (p.pinsOpen ? t.pinsHide : t.pinsShow) : t.pins}
            pressed={p.wide ? p.pinsOpen : undefined}
            onClick={p.onPins}
          />
          <IconButton
            icon={DownloadSimpleIcon}
            label={complete ? t.download : t.downloadLocked}
            kind={complete ? undefined : "ghost"}
            onClick={() => void download()}
          />
        </span>
      </div>

      <div className="blanknav" role="list" aria-label={t.lines}>
        {nomors.map((n) => (
          <span role="listitem" key={n}>
            <button
              type="button"
              className="blankchip"
              data-st={stOf(n)}
              aria-current={n === target ? "true" : undefined}
              onClick={() => jump(n)}
            >
              <span className="blankchip__dot" aria-hidden="true" />
              {t.line((lineOf.get(n) ?? 0) + 1)}
              <span className="hint">({n})</span>
            </button>
          </span>
        ))}
      </div>

      <div className={p.side ? "codegrid codegrid--side" : "codegrid"}>
        <div className="panel codecard">
          <div
            className="code"
            ref={box}
            tabIndex={0}
            aria-label={`${t.code}: ${shortLabel(file.judul)}`}
            data-loading={loaded ? undefined : "yes"}
          >
            {lines.map((items, i) => {
              const ks = items.flatMap((it) => (it.t === "blank" ? [it.seg.nomor] : []));
              const sts = ks.map(stOf);
              const tgt = target !== null && ks.includes(target);
              const todo =
                ks.length > 0 && sts.some((x) => x !== "ok" && x !== "peer" && x !== "key");
              const lst = tgt
                ? stOf(target)
                : ks.length
                  ? (sts.find((x) => x === "bad") ?? sts[0])
                  : undefined;
              return (
                <div
                  key={i}
                  className={`cl${todo ? " cl--todo" : ""}${tgt ? " cl--target" : ""}${ks.length ? " cl--blank" : ""}`}
                  data-st={lst}
                >
                  <span className="ln" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="cl__t">
                    {items.map((it, j) =>
                      it.t === "blank" ? (
                        renderBlank(it.seg)
                      ) : it.tok.kind ? (
                        <span key={j} className={`tok tok--${it.tok.kind}`}>
                          {it.text}
                        </span>
                      ) : (
                        <Fragment key={j}>{it.text}</Fragment>
                      ),
                    )}
                    {items.length === 0 && " "}
                  </span>
                </div>
              );
            })}
          </div>
          {mode === "now" && (lastPeer || why) && (
            <div className="codefoot">
              {lastPeer && (
                <>
                  <span className="codefoot__peer">{t.peer}</span>
                  <span className="hint">
                    {lastPeer.oleh
                      ? t.peerBy(lastPeer.oleh, lastPeer.nomor)
                      : t.peerSome(lastPeer.nomor)}
                  </span>
                </>
              )}
              {why && (
                <span className="codefoot__why">
                  <CheckCircleIcon aria-hidden="true" />
                  <b>({why.nomor})</b>
                  <span className="hint">{why.text}</span>
                </span>
              )}
            </div>
          )}
        </div>
        {p.side}
      </div>

      {complete ? (
        <div className="banner banner--ok codestep__done">
          <StarIcon aria-hidden="true" />
          <b>{t.allRight}</b>
          <span className="grow" />
          <button type="button" className="btn btn--primary" onClick={() => void download()}>
            <DownloadSimpleIcon aria-hidden="true" />
            {t.download}
          </button>
        </div>
      ) : mode === "now" && !locked ? (
        <span className="hint">{t.keysHint}</span>
      ) : null}
      <span className="visually-hidden" role="status">
        {t.progress(shownRight, nb)}
      </span>
    </div>
  );
}
