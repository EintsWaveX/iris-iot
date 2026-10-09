/**
 * One sketch of the Code step (mockups p-module › Code and p12-module): the
 * file switch, a ring of blanks right, the pin panel toggle and the
 * download on one head row; status badges (right, wrong, empty, hints) that
 * jump to the next blank in that state; a chip per blank that jumps to its
 * line; the code with a line gutter, where every line holding a blank keeps
 * a faint band in its blank's state colour and the line you are on breathes.
 * Beside the code (under it below 1280) the picked blank's card and the
 * group's hints.
 *
 * Help around a blank, never its answer:
 * - its line's comment, always;
 * - the written hint (Celah.bantuan), once the group got it wrong twice;
 * - hints the Asisten writes, asked for with Minta Petunjuk or sent unasked;
 * - the explanation, once it is right.
 * Hints show under the blank's line too, so a phone sees them in place.
 *
 * Modes:
 * - now: a Praktikan in this module's session. Each blank is checked by
 *   the server on Enter or blur and saved either way; the group's answers
 *   arrive live, and a groupmate's correct blank turns read only in the
 *   group colour with their name under the code.
 * - done: the same Praktikan's answers afterwards, read only.
 * - asisten: no answers of their own. Show Answers (CodeStep) fills every
 *   blank with the key, served by /api/modul/kunci to Asisten only, with
 *   each blank's explanation; the hint the Praktikan get is always shown.
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
  ChalkboardTeacherIcon,
  CheckCircleIcon,
  CheckIcon,
  DownloadSimpleIcon,
  HourglassMediumIcon,
  KeyIcon,
  PaperPlaneTiltIcon,
  SidebarSimpleIcon,
  SignInIcon,
  SparkleIcon,
  StarIcon,
} from "@phosphor-icons/react";
import type { BlankSegment, Segment } from "../../lib/blanks";
import { BLANK_MARK, detectLang, tokenize, type Token } from "../../lib/highlight";
import { needsPersonalization, personalizeSegments } from "../../lib/group-identity";
import { startPolling } from "../../scripts/polling";
import IconButton from "../ui/IconButton";
import Pill from "../ui/Pill";
import { ProgressRing } from "../ui/Display";
import type { Lang } from "../../lib/kelas";
import { C } from "./codeStrings";
import { openSignIn } from "../../lib/signin";
import { dengar } from "../../lib/siaran";
import { jamMenit, postJson } from "../../lib/app";

export type CodeMode = "now" | "done" | "asisten";

export interface BerkasEntry {
  slug: string;
  judul: string;
  /** The sketch's file name, shown on the file switch (mockup p-module). */
  path?: string;
  segments: Segment[];
}

type Saved = Record<
  string,
  {
    isi: string;
    benar: boolean;
    saya?: boolean;
    oleh?: string | null;
    asisten?: boolean;
    salah?: number;
    pada?: string;
    kenapa?: string;
    bantuan?: string;
  }
>;

interface BlankState {
  isi: string;
  benar: boolean;
  /** A groupmate's correct answer (read only for this student). */
  teman: boolean;
  kenapa?: string;
  /** The written hint, once the group got this blank wrong twice. */
  bantuan?: string;
  salah: number;
  oleh?: string | null;
  pada?: string;
  checking: boolean;
  checkedIsi?: string;
}

/** A hint request or a hint from the Asisten (api/_lib/petunjuk.ts). */
interface Minta {
  id: number;
  berkas: string;
  nomor: number;
  catatan: string;
  diminta: string | null;
  oleh: string | null;
  teks: string | null;
  dari: string | null;
  dijawab: string | null;
}

/** What an Asisten sees around a blank (kunci's `bantu`). */
interface Bantu {
  kenapa: string;
  bantuan: string;
  juga: string[];
}

type St = "empty" | "ok" | "bad" | "peer" | "key";
type Hitung = "right" | "wrong" | "empty" | "hint";

type Item = { t: "tok"; tok: Token; text: string } | { t: "blank"; seg: BlankSegment };

// A safety net only: groupmates' answers and hints arrive live.
const POLL_MS = 60_000;
const SALAH_UNTUK_BANTUAN = 2;

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
  /** Lihat Sebagai Praktikan: the group an Asisten acts for (own = full control). */
  wakil?: { nomor: number; own: boolean };
  /** An Asisten's pick of whose file to read (group identity lines, keys). */
  grupLihat?: number;
  /** The blank to open on (a deep link), instead of the first one to do. */
  awal?: number;
}

/** "Central/Client: Bluetooth Low Energy (ESP32)" to "Central/Client". */
function shortLabel(judul: string): string {
  return judul.split(":")[0].trim();
}

/** The file name, free to wrap after each underscore on a narrow switch. */
function FileName({ f }: { f: BerkasEntry }) {
  if (!f.path) return <>{shortLabel(f.judul)}</>;
  const parts = f.path.split("_");
  return (
    <>
      {parts.map((x, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {i < parts.length - 1 ? `${x}_` : x}
        </Fragment>
      ))}
    </>
  );
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
  const blanks = useMemo(
    () => file.segments.filter((s): s is BlankSegment => s.kind === "blank"),
    [file.segments],
  );
  const nomors = useMemo(() => blanks.map((s) => s.nomor), [blanks]);
  const total = nomors.length;

  const [state, setState] = useState<Record<number, BlankState>>(() =>
    Object.fromEntries(
      nomors.map((n) => [n, { isi: "", benar: false, teman: false, salah: 0, checking: false }]),
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
  const [bantu, setBantu] = useState<Record<string, Bantu>>({});
  const [minta, setMinta] = useState<Minta[]>([]);
  const mintaRef = useRef<Minta[] | null>(null);
  const [tanya, setTanya] = useState<number | null>(null);
  const [kirim, setKirim] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  const [flash, setFlash] = useState<number[]>([]);
  const [lastPeer, setLastPeer] = useState<{
    nomor: number;
    oleh: string | null;
    asisten?: boolean;
  } | null>(null);
  const fokus = useRef<number | null>(null);
  const mounted = useRef(true);
  const flashTimer = useRef<number | undefined>(undefined);
  const box = useRef<HTMLDivElement | null>(null);

  const readOnly = mode !== "now" || locked || (p.wakil !== undefined && !p.wakil.own);
  // Asking is the group's own: not an Asisten viewing as them, not history.
  const bolehMinta = mode === "now" && !locked && p.wakil === undefined;

  /** Merges the group's saved answers, never over a blank being typed in;
   *  tries, hints and who filled it always follow. */
  function terapkanDraft(saved: Saved, tandai = false) {
    const next = { ...stateRef.current };
    const berubah: number[] = [];
    let peer: { nomor: number; oleh: string | null; asisten?: boolean } | null = null;
    let ubah = false;
    for (const [k, e] of Object.entries(saved ?? {})) {
      const nomor = Number(k);
      const lokal = next[nomor];
      if (!lokal) continue;
      const meta = {
        salah: e.salah ?? lokal.salah,
        bantuan: e.bantuan,
        oleh: e.oleh ?? null,
        pada: e.pada,
      };
      if (tandai && meta.bantuan && !lokal.bantuan) toast(t.hintOpened(nomor), "warn");
      const editLokal = lokal.isi !== "" && lokal.isi !== (lokal.checkedIsi ?? "");
      if (fokus.current === nomor || editLokal || lokal.checking) {
        next[nomor] = { ...lokal, salah: meta.salah, bantuan: meta.bantuan ?? lokal.bantuan };
        ubah = true;
        continue;
      }
      const teman = e.benar && e.saya === false;
      const sama = lokal.isi === e.isi && lokal.benar === e.benar && lokal.teman === teman;
      next[nomor] = {
        ...lokal,
        ...meta,
        isi: e.isi,
        benar: e.benar,
        teman,
        checkedIsi: e.isi,
        kenapa: e.benar ? (e.kenapa ?? lokal.kenapa) : undefined,
      };
      ubah = true;
      if (sama) continue;
      berubah.push(nomor);
      if (tandai && teman) peer = { nomor, oleh: e.oleh ?? null, asisten: e.asisten };
    }
    if (!ubah) return;
    stateRef.current = next;
    setState(next);
    if (peer) setLastPeer(peer);
    if (tandai && berubah.length) {
      setFlash(berubah);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => mounted.current && setFlash([]), 1400);
    }
  }

  /** The Asisten's hints: a toast for each one new since the last read. */
  function terapkanMinta(list: Minta[] | undefined) {
    const baru = (list ?? []).filter((m) => m.berkas === berkas);
    const lama = mintaRef.current;
    if (lama)
      for (const m of baru)
        if (m.teks && !lama.some((x) => x.id === m.id && x.teks))
          toast(t.hintArrived(m.nomor), "ok");
    mintaRef.current = baru;
    setMinta(baru);
  }

  function onFail(kode: string | undefined) {
    if (kode === "sesi_berganti") {
      setLockedReason("sesiBerubah");
    } else if (kode === "modul_terkunci") setLockedReason("terkunci");
    else if (kode === "belum_masuk" || kode === "peran_salah") setLockedReason("masuk");
  }

  const wakilQs = p.wakil ? `&kelompok=${p.wakil.nomor}` : "";
  const draftUrl = `/api/modul/draft?modul=${modul}&berkas=${berkas}&lang=${lang}${wakilQs}`;

  async function muatUlang() {
    try {
      const d = await fetch(draftUrl).then((r) => r.json());
      if (!mounted.current) return;
      if (d.ok) {
        terapkanDraft(d.jawaban as Saved, true);
        terapkanMinta(d.minta);
      } else onFail(d.kode);
    } catch {
      // The next tick tries again.
    }
  }

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
        terapkanMinta(d.minta);
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
    const stop = startPolling(async () => {
      if (first) {
        first = false;
        return;
      }
      await muatUlang();
    }, POLL_MS);
    // A groupmate's answer and an Asisten's hint show at once.
    const lepas = dengar(["jurnal", "jawaban", "petunjuk"], () => void muatUlang());
    return () => {
      stop();
      lepas();
    };
  }, [mode, loaded, locked, modul, berkas]);

  // An Asisten reads any group's file: its identity lines follow the pick.
  const lihat = mode === "asisten" ? (p.grupLihat ?? 1) : null;
  useEffect(() => {
    if (lihat === null) return;
    if (!needsPersonalization(berkas)) {
      setSegments(file.segments);
      return;
    }
    try {
      setSegments(personalizeSegments(berkas, file.segments, lihat));
    } catch (err) {
      console.error(err);
      setSegments(file.segments);
    }
  }, [lihat, berkas, file.segments]);

  // The key, the explanation and the hint, for an Asisten.
  useEffect(() => {
    if (mode !== "asisten") return;
    fetch(`/api/modul/kunci?modul=${modul}&berkas=${berkas}&kelompok=${lihat ?? 1}&lang=${lang}`)
      .then((r) => r.json())
      .then((d) => {
        if (!mounted.current) return;
        if (d.ok) {
          setKunci(d.kunci);
          setBantu(d.bantu ?? {});
        } else if (p.showKeys) toast(t.keyError, "warn");
      })
      .catch(() => p.showKeys && toast(t.keyError, "warn"));
  }, [mode, modul, berkas, lihat, lang]);

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
        body: JSON.stringify({
          modul,
          berkas,
          nomor,
          jawaban: isi,
          bahasa: p.bahasa,
          lang,
          ...(p.wakil ? { kelompok: p.wakil.nomor } : {}),
        }),
      }).then((r) => r.json());
      if (!d.ok) {
        // Not a verdict (an expired sign-in, a rejected request): the blank
        // stays unchecked rather than being marked wrong.
        onFail(d.kode);
        setState((s) => ({ ...s, [nomor]: { ...s[nomor], checking: false } }));
        return;
      }
      const sebelum = stateRef.current[nomor];
      if (!d.benar && d.bantuan && !sebelum?.bantuan) toast(t.hintOpened(nomor), "warn");
      setState((s) => ({
        ...s,
        [nomor]: {
          ...s[nomor],
          checking: false,
          benar: Boolean(d.benar),
          teman: false,
          kenapa: d.kenapa,
          salah: typeof d.salah === "number" ? d.salah : s[nomor].salah,
          bantuan: d.benar ? undefined : (d.bantuan ?? s[nomor].bantuan),
          checkedIsi: isi,
        },
      }));
      if (d.benar) {
        setLastPeer(null);
        setTarget(nomor);
      }
    } catch {
      setState((s) => ({ ...s, [nomor]: { ...s[nomor], checking: false } }));
    }
  }

  async function mintaPetunjuk(nomor: number, catatan: string) {
    setKirim(true);
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/modul/minta", {
        modul,
        berkas,
        nomor,
        catatan,
      });
      if (!r.ok) throw new Error(r.kode);
      toast(t.askSent(nomor), "ok");
      setTanya(null);
      await muatUlang();
    } catch {
      toast(t.askFail, "danger");
    } finally {
      setKirim(false);
    }
  }

  async function batalMinta(id: number) {
    try {
      await postJson("/api/modul/minta-batal", { id });
      await muatUlang();
    } catch {
      toast(t.askFail, "danger");
    }
  }

  function stOf(n: number): St {
    if (mode === "asisten") return keys ? "key" : "empty";
    const e = state[n];
    if (!e || !e.isi || e.checkedIsi !== e.isi) return "empty";
    if (!e.benar) return "bad";
    return e.teman ? "peer" : "ok";
  }

  /** The Asisten's hints for one blank, and its waiting request. */
  const dariAsisten = (n: number) => minta.filter((m) => m.nomor === n && m.teks);
  const menunggu = (n: number) => minta.find((m) => m.nomor === n && !m.teks && m.diminta);
  const adaBantuan = (n: number) =>
    !state[n]?.benar && (!!state[n]?.bantuan || dariAsisten(n).length > 0);

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
    if (p.awal !== undefined && nomors.includes(p.awal)) {
      jump(p.awal, false);
      return;
    }
    const todo = nomors.find((n) => !stateRef.current[n]?.benar);
    const n = todo ?? nomors[0];
    if (n === undefined) return;
    // Its line comes into the code box; the page itself stays put.
    jump(n, false, false);
  }, [loaded]);

  // The code box's visible width, so notes under a line wrap inside it
  // while the code itself scrolls sideways.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => el.style.setProperty("--code-vw", `${el.clientWidth}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Colour the sketch once per template, then cut it into lines, each
  // knowing which blanks it holds.
  const lines = useMemo(() => {
    const full = segments.map((s) => (s.kind === "text" ? s.text : BLANK_MARK)).join("");
    const tokens = tokenize(full, detectLang(full));
    const bl = segments.filter((s): s is BlankSegment => s.kind === "blank");
    const out: Item[][] = [[]];
    let b = 0;
    for (const tok of tokens) {
      tok.text.split(BLANK_MARK).forEach((part, pi) => {
        if (pi > 0 && bl[b]) out[out.length - 1].push({ t: "blank", seg: bl[b++] });
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

  /** Brings a blank into view: its line to the middle of the code box, the
   *  box sideways until the input shows, the page until the box shows. */
  function jump(n: number, focus = true, page = true) {
    setTarget(n);
    requestAnimationFrame(() => {
      const scroller = box.current;
      const el = scroller?.querySelector<HTMLElement>(`[data-blank="${n}"]`);
      const ln = el?.closest<HTMLElement>(".cl");
      if (!scroller || !el || !ln) return;
      scroller.scrollTop = Math.max(0, ln.offsetTop - scroller.clientHeight / 2 + 20);
      const er = el.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      if (er.right > sr.right - 24) scroller.scrollLeft += er.right - sr.right + 48;
      else if (er.left < sr.left + 56) scroller.scrollLeft -= sr.left + 56 - er.left;
      const r = scroller.getBoundingClientRect();
      // The code and the blank card beside it come in together, just under
      // the sticky bars (the grid's scroll-margin-top).
      if (page && (r.top < 80 || r.bottom > window.innerHeight))
        (scroller.closest(".codegrid") ?? scroller).scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
      if (focus) el.querySelector("input")?.focus({ preventScroll: true });
    });
  }

  function step(from: number, dir: 1 | -1) {
    const i = nomors.indexOf(from);
    const n = nomors[i + dir];
    if (n !== undefined) jump(n);
  }

  /** Blanks per status badge, in number order. */
  const per: Record<Hitung, number[]> = {
    right: nomors.filter((n) => ["ok", "peer"].includes(stOf(n))),
    wrong: nomors.filter((n) => stOf(n) === "bad"),
    empty: nomors.filter((n) => stOf(n) === "empty"),
    hint: nomors.filter((n) => adaBantuan(n)),
  };

  /** The next blank after the one you are on with that status, wrapping. */
  function lompat(k: Hitung) {
    const list = per[k];
    if (list.length === 0) return;
    const now = target === null ? -1 : nomors.indexOf(target);
    const next = list.find((n) => nomors.indexOf(n) > now) ?? list[0];
    jump(next, k !== "right");
  }

  async function download() {
    if (!complete) {
      toast(t.downloadFirst, "warn");
      return;
    }
    const url =
      mode === "asisten"
        ? `/api/modul/kunci?modul=${modul}&berkas=${berkas}&unduh=1&bahasa=${p.bahasa}&kelompok=${lihat ?? 1}`
        : `/api/modul/unduh?modul=${modul}&berkas=${berkas}&bahasa=${p.bahasa}`;
    try {
      const r = await fetch(url);
      if ((r.headers.get("Content-Type") ?? "").includes("json")) {
        toast(t.downloadFirst, "warn");
        return;
      }
      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1];
      saveBlob(await r.blob(), name ?? berkas);
    } catch {
      toast(t.keyError, "warn");
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

  /** The notes under one blank's line: hints while it is open, the
   *  explanation on the line you are on once it is right. */
  function notes(n: number): ReactNode[] {
    const e = state[n];
    const out: ReactNode[] = [];
    if (mode === "asisten") {
      if (n !== target) return out;
      const b = bantu[n];
      if (b?.bantuan)
        out.push(
          <Note key="h" tone="hint" icon={<SparkleIcon />} label={t.hintModule} text={b.bantuan} />,
        );
      if (keys && b?.kenapa)
        out.push(
          <Note key="k" tone="ok" icon={<CheckCircleIcon />} label={t.explain} text={b.kenapa} />,
        );
      return out;
    }
    if (e?.benar) {
      if (n === target && e.kenapa)
        out.push(
          <Note key="k" tone="ok" icon={<CheckCircleIcon />} label={t.explain} text={e.kenapa} />,
        );
      return out;
    }
    if (e?.bantuan)
      out.push(
        <Note key="h" tone="hint" icon={<SparkleIcon />} label={t.hintModule} text={e.bantuan} />,
      );
    for (const m of dariAsisten(n))
      out.push(
        <Note
          key={`m${m.id}`}
          tone="asisten"
          icon={<ChalkboardTeacherIcon />}
          label={`${m.dari ?? ""} · ${m.dijawab ? jamMenit(m.dijawab) : ""}`}
          text={m.teks ?? ""}
        />,
      );
    return out;
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
      {lockedReason !== "terkunci" && (
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => openSignIn(undefined, { ikut: lockedReason === "sesiBerubah" })}
        >
          <SignInIcon size={16} aria-hidden="true" />
          {t.signInBtn}
        </button>
      )}
    </div>
  ) : null;

  const pilih = target !== null && nomors.includes(target) ? target : (nomors[0] ?? null);
  const pilihSeg = blanks.find((b) => b.nomor === pilih);
  const kartu =
    pilih !== null && pilihSeg ? (
      <BlankCard
        t={t}
        mode={mode}
        n={pilih}
        st={stOf(pilih)}
        line={(lineOf.get(pilih) ?? 0) + 1}
        tip={pilihSeg.hint}
        e={state[pilih]}
        dariAsisten={dariAsisten(pilih)}
        menunggu={menunggu(pilih)}
        bolehMinta={bolehMinta}
        tanya={tanya === pilih}
        kirim={kirim}
        onTanya={(on) => setTanya(on ? pilih : null)}
        onMinta={(catatan) => void mintaPetunjuk(pilih, catatan)}
        onBatal={(id) => void batalMinta(id)}
        kunci={keys ? (kunci?.[pilih] ?? "") : null}
        bantu={bantu[pilih]}
      />
    ) : null;
  const log =
    mode !== "asisten" ? (
      <HintLog t={t} nomors={nomors} state={state} minta={minta} onJump={(n) => jump(n)} />
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
                title={shortLabel(f.judul)}
              >
                <span className="codehead__name">
                  <FileName f={f} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <b className="codehead__name" title={shortLabel(file.judul)}>
            <FileName f={file} />
          </b>
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

      {mode !== "asisten" && (
        <div className="blankcount" role="group" aria-label={t.countLabel}>
          {(
            [
              ["right", t.badgeRight],
              ["wrong", t.badgeWrong],
              ["empty", t.badgeEmpty],
              ["hint", t.badgeHint],
            ] as [Hitung, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className="blankcount__b"
              data-k={k}
              disabled={per[k].length === 0}
              aria-label={t.jumpNext(label, per[k].length)}
              title={t.jumpNext(label, per[k].length)}
              onClick={() => lompat(k)}
            >
              {k === "hint" ? (
                <SparkleIcon size={16} aria-hidden="true" />
              ) : (
                <span className="blankcount__dot" aria-hidden="true" />
              )}
              <span>{label}</span>
              <b className="num">{per[k].length}</b>
            </button>
          ))}
        </div>
      )}

      <div className="blanknav" role="list" aria-label={t.lines}>
        {nomors.map((n) => {
          const w = menunggu(n);
          return (
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
                {mode !== "asisten" && adaBantuan(n) ? (
                  <SparkleIcon className="blankchip__ic" size={15} aria-label={t.hint} />
                ) : mode !== "asisten" && w ? (
                  <HourglassMediumIcon className="blankchip__ic" size={15} aria-label={t.waiting} />
                ) : null}
              </button>
            </span>
          );
        })}
      </div>

      <div className={p.wide ? "codegrid codegrid--side" : "codegrid"}>
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
              const bawah = ks.flatMap(notes);
              return (
                <Fragment key={i}>
                  <div
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
                  {bawah.length > 0 && <div className="clnotes">{bawah}</div>}
                </Fragment>
              );
            })}
          </div>
          {mode === "now" && lastPeer && (
            <div className="codefoot">
              <span className="codefoot__peer">{t.peer}</span>
              <span className="hint">
                {lastPeer.oleh
                  ? t.peerBy(lastPeer.oleh, lastPeer.nomor)
                  : lastPeer.asisten
                    ? t.peerAsisten(lastPeer.nomor)
                    : t.peerSome(lastPeer.nomor)}
              </span>
            </div>
          )}
        </div>
        {p.wide && (
          <aside className="stack codeside">
            {kartu}
            {log}
            {p.side}
          </aside>
        )}
      </div>

      {!p.wide && (
        <div className="codebelow">
          {kartu}
          {log}
        </div>
      )}

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

function toast(msg: string, tone: "ok" | "warn" | "danger") {
  window.Toast?.show(msg, tone);
}

/* ------------------------------------------------------- under a line */

function Note({
  tone,
  icon,
  label,
  text,
}: {
  tone: "hint" | "ok" | "asisten";
  icon: ReactNode;
  label: string;
  text: string;
}) {
  return (
    <div className="clnote" data-tone={tone}>
      <span className="clnote__ic" aria-hidden="true">
        {icon}
      </span>
      <span>
        <b>{label}</b> {text}
      </span>
    </div>
  );
}

/* ------------------------------------------------------ the blank card */

type T = (typeof C)["id"];

function BlankCard(p: {
  t: T;
  mode: CodeMode;
  n: number;
  st: St;
  line: number;
  tip: string;
  e: BlankState | undefined;
  dariAsisten: Minta[];
  menunggu: Minta | undefined;
  bolehMinta: boolean;
  tanya: boolean;
  kirim: boolean;
  onTanya: (on: boolean) => void;
  onMinta: (catatan: string) => void;
  onBatal: (id: number) => void;
  kunci: string | null;
  bantu: Bantu | undefined;
}) {
  const { t, n, st, e } = p;
  const pill =
    st === "ok" || st === "peer" ? (
      <Pill tone="ok">
        <CheckIcon size={14} weight="bold" aria-hidden="true" />
        {t.stRight}
      </Pill>
    ) : st === "bad" ? (
      <Pill tone="warn">{t.stWrong(e?.salah || 1)}</Pill>
    ) : st === "key" ? (
      <Pill tone="violet">{t.stKey}</Pill>
    ) : (
      <Pill>{t.stEmpty}</Pill>
    );

  return (
    <section className="panel pblank" data-st={st} aria-live="polite">
      <div className="pblank__head">
        <h3 className="panel__title">{t.blankTitle(n)}</h3>
        {pill}
      </div>
      <p className="hint">{t.lineTip(p.line, p.tip)}</p>

      {p.mode === "asisten" ? (
        <>
          {p.kunci !== null ? (
            <div className="pblank__key">
              <KeyIcon aria-hidden="true" />
              <span className="pblank__txt">
                <b>{t.keyLabel}</b>
                <code className="mono">{p.kunci}</code>
                {(p.bantu?.juga.length ?? 0) > 0 && (
                  <span className="hint">
                    {t.accepted}: <code className="mono">{p.bantu!.juga.join(", ")}</code>
                  </span>
                )}
              </span>
            </div>
          ) : (
            <p className="hint">{t.keysOff}</p>
          )}
          {p.kunci !== null && p.bantu?.kenapa && (
            <Box tone="ok" icon={<CheckCircleIcon />} label={t.explain} text={p.bantu.kenapa} />
          )}
          {p.bantu?.bantuan && (
            <Box tone="hint" icon={<SparkleIcon />} label={t.hintStudents} text={p.bantu.bantuan} />
          )}
        </>
      ) : (
        <>
          {st === "bad" && e?.isi && (
            <p className="hint">
              {t.lastAnswer}: <code className="mono">{e.isi}</code>
            </p>
          )}
          {e?.oleh && e.pada && st !== "empty" && (
            <p className="hint">{t.filledBy(e.oleh, jamMenit(e.pada))}</p>
          )}
          {e?.benar ? (
            e.kenapa && (
              <Box tone="ok" icon={<CheckCircleIcon />} label={t.explain} text={e.kenapa} />
            )
          ) : (
            <>
              {e?.bantuan ? (
                <Box tone="hint" icon={<SparkleIcon />} label={t.hintModule} text={e.bantuan} />
              ) : (
                p.mode === "now" && (
                  <p className="hint">
                    {t.hintLocked(Math.max(1, SALAH_UNTUK_BANTUAN - (e?.salah ?? 0)))}
                  </p>
                )
              )}
              {p.dariAsisten.map((m) => (
                <Box
                  key={m.id}
                  tone="asisten"
                  icon={<ChalkboardTeacherIcon />}
                  label={`${m.dari ?? ""} · ${m.dijawab ? jamMenit(m.dijawab) : ""}`}
                  text={m.teks ?? ""}
                />
              ))}
              {p.bolehMinta && <Ask {...p} />}
            </>
          )}
        </>
      )}
    </section>
  );
}

function Box({
  tone,
  icon,
  label,
  text,
}: {
  tone: "hint" | "ok" | "asisten";
  icon: ReactNode;
  label: string;
  text: string;
}) {
  return (
    <div className="pblank__box" data-tone={tone}>
      <span className="pblank__ic" aria-hidden="true">
        {icon}
      </span>
      <span className="pblank__txt">
        <b>{label}</b>
        <span>{text}</span>
      </span>
    </div>
  );
}

/** Minta Petunjuk: an optional reason, then waiting with a cancel. */
function Ask(p: {
  t: T;
  menunggu: Minta | undefined;
  dariAsisten: Minta[];
  tanya: boolean;
  kirim: boolean;
  onTanya: (on: boolean) => void;
  onMinta: (catatan: string) => void;
  onBatal: (id: number) => void;
}) {
  const { t } = p;
  if (p.menunggu)
    return (
      <div className="pblank__wait">
        <span className="dot dot--warn dot--pulse" aria-hidden="true" />
        <span className="pblank__txt grow">
          <b>{t.waiting}</b>
          <span className="hint">
            {t.askedAt(p.menunggu.diminta ? jamMenit(p.menunggu.diminta) : "", p.menunggu.catatan)}
          </span>
        </span>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => p.onBatal(p.menunggu!.id)}
        >
          {t.cancelAsk}
        </button>
      </div>
    );
  if (p.tanya)
    return (
      <div className="stack stack--sm">
        <span className="field__label">{t.askWhat}</span>
        <div className="pblank__reasons">
          {t.askReasons.map((x) => (
            <button
              key={x}
              type="button"
              className="btn btn--sm"
              disabled={p.kirim}
              onClick={() => p.onMinta(x)}
            >
              {x}
            </button>
          ))}
        </div>
        <div className="pblank__acts">
          <button type="button" className="btn btn--sm" onClick={() => p.onTanya(false)}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            disabled={p.kirim}
            onClick={() => p.onMinta("")}
          >
            <PaperPlaneTiltIcon size={16} aria-hidden="true" />
            {t.askNoNote}
          </button>
        </div>
      </div>
    );
  return (
    <div className="stack stack--sm">
      <button
        type="button"
        className="btn btn--primary pblank__ask"
        onClick={() => p.onTanya(true)}
      >
        <SparkleIcon size={18} aria-hidden="true" />
        {p.dariAsisten.length ? t.askAnother : t.askHint}
      </button>
      <span className="hint">{t.askNote}</span>
    </div>
  );
}

/* --------------------------------------------------------- the hint log */

function HintLog(p: {
  t: T;
  nomors: number[];
  state: Record<number, BlankState>;
  minta: Minta[];
  onJump: (n: number) => void;
}) {
  const { t } = p;
  const rows: { key: string; at: string; n: number; tone: string; text: string }[] = [];
  for (const n of p.nomors) {
    const e = p.state[n];
    if (e?.bantuan && !e.benar)
      rows.push({ key: `b${n}`, at: e.pada ?? "", n, tone: "hint", text: e.bantuan });
  }
  for (const m of p.minta)
    rows.push({
      key: `m${m.id}`,
      at: m.dijawab ?? m.diminta ?? "",
      n: m.nomor,
      tone: m.teks ? "asisten" : "wait",
      text: m.teks ?? t.logWaiting,
    });
  rows.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section className="panel hintlog">
      <div className="pblank__head">
        <h3 className="panel__title">{t.logTitle}</h3>
        <Pill>{rows.length}</Pill>
      </div>
      {rows.length === 0 ? (
        <p className="hint">{t.logEmpty}</p>
      ) : (
        <ol className="hintlog__list">
          {rows.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                className="hintlog__row"
                data-tone={r.tone}
                onClick={() => p.onJump(r.n)}
              >
                <time className="mono hint">{r.at ? jamMenit(r.at) : ""}</time>
                <span className="hintlog__tag mono">({r.n})</span>
                <span className="hintlog__text">{r.text}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
