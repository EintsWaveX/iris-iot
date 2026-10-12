/**
 * The running board's pieces (Phase 10, mockup c12-run), all from live data:
 *
 * - useMatriks: every group against every blank (GET /api/modul/matriks),
 *   with the waiting hint requests.
 * - SessionTrack: start to end with the now line, the extension zone and a
 *   mark for each moment (start, first right blank, hands, hint requests,
 *   the announcement).
 * - Counters: here, blanks right, hands, stuck blanks, data, scores sent;
 *   each one goes to its answer.
 * - Rail: the groups, neediest first, with All, Mine and Help.
 * - Feed: the room's moments, newest first, each with its way in, and a
 *   blank stuck in several groups called out with Announce.
 * - Matrix: groups against blanks, a count per blank and per group.
 */
import { useMemo, useState, type CSSProperties } from "react";
import {
  ArrowRightIcon,
  HandIcon,
  KeyIcon,
  MegaphoneIcon,
  SparkleIcon,
  WifiSlashIcon,
} from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import Tooltip from "../ui/Tooltip";
import IconButton from "../ui/IconButton";
import SegmentedControl from "../ui/SegmentedControl";
import { Switch } from "../ui/Controls";
import { getJson, namaKelompok } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import { AngkaGulir, Sorot } from "../ui/Sorot";
import { useAliran } from "../../lib/aliran-ruang";
import { useSiaran } from "../../lib/siaran";
import { kelompokLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import { jamLab } from "../shared/Instruments";
import { R, type Rx } from "./runStrings";
import type { NilaiLive } from "./data";
import type { AsistenRef, GroupRow, SesiRunning, Stuck } from "./types";

/* ------------------------------------------------------------ the data */

export interface SelMatriks {
  isi: string;
  benar: boolean;
  percobaan: number;
  salah: number;
  oleh: string | null;
  olehNim?: string | null;
  pada: string | null;
  kunci: string;
}

export interface Matriks {
  modul: number;
  berkas: {
    slug: string;
    path: string;
    blank: { nomor: number; soal: string; baris: number; kode: string }[];
  }[];
  sel: Record<string, Record<string, SelMatriks>>;
  minta: { kelompokId: number; soal: string; catatan: string; pada: string }[];
}

export function useMatriks(on: boolean, lang: Lang, sesiId: number | null = null) {
  const poll = usePoll(
    () =>
      getJson<{ ok: boolean } & Matriks>(`/api/modul/matriks?lang=${lang}`).then((d) =>
        d.ok ? d : null,
      ),
    60_000,
    on,
    ["sesi"],
    0,
    lang,
  );
  // Phase 12: a checked blank lands in its cell straight from the session
  // room; a first try (no cell yet, so no key on screen) or a hint asks again.
  const status = useAliran(
    { ruang: "sesi", sesiId, aktif: on && sesiId !== null },
    ["jawaban", "petunjuk"],
    (m) => {
      const d = m.d as Partial<JawabanAliran> | null;
      const cur = poll.data;
      const lama = d?.kelompokId && d.soal ? cur?.sel[d.kelompokId]?.[d.soal] : undefined;
      if (m.j !== "jawaban" || !d || !lama || lama.olehNim !== d.oleh) return poll.refresh();
      poll.ubah((x) =>
        x
          ? {
              ...x,
              sel: {
                ...x.sel,
                [d.kelompokId!]: {
                  ...x.sel[d.kelompokId!],
                  [d.soal!]: {
                    ...lama,
                    isi: d.isi ?? lama.isi,
                    benar: !!d.benar,
                    salah: d.salah ?? lama.salah,
                    percobaan: d.percobaan ?? lama.percobaan,
                    pada: d.pada ?? lama.pada,
                  },
                },
              },
              // A right answer closes that blank's waiting hint requests.
              minta: d.benar
                ? x.minta.filter((r) => !(r.kelompokId === d.kelompokId && r.soal === d.soal))
                : x.minta,
            }
          : x,
      );
    },
    () => poll.refresh(),
  );
  useSiaran(["jawaban", "petunjuk"], poll.refresh, on && status !== "live");
  return poll;
}

/** A blank result from the session room (api/modul cek) */
interface JawabanAliran {
  kelompokId: number;
  soal: string;
  isi: string;
  benar: boolean;
  salah: number;
  percobaan: number;
  oleh: string;
  pada: string;
}

/** One blank as a column: its question code and a short label, "P3" for
 *  the third blank of a publisher file when a module has several files. */
export interface Kolom {
  soal: string;
  label: string;
  slug: string;
  kode: string;
}

export function kolomDari(m: Matriks | null): Kolom[] {
  if (!m) return [];
  const many = m.berkas.length > 1;
  const huruf = m.berkas.map((b) => (b.slug.split("_").pop() ?? b.slug).charAt(0).toUpperCase());
  const unik = new Set(huruf).size === huruf.length;
  return m.berkas.flatMap((b, i) =>
    b.blank.map((x) => ({
      soal: x.soal,
      slug: b.slug,
      kode: x.kode,
      label: many ? `${unik ? huruf[i] : i + 1}${unik ? "" : "."}${x.nomor}` : String(x.nomor),
    })),
  );
}

export type CellState = "b" | "w" | "e";
export const cellOf = (s: SelMatriks | undefined): CellState =>
  !s ? "e" : s.benar ? "b" : s.isi.trim() || s.percobaan > 0 ? "w" : "e";

/** Where a click goes: a view, a group, its tab, one blank. */
export interface GoTo {
  view?: "board" | "matrix" | "table" | "prep";
  g?: number;
  tab?: WorkTab;
  b?: string;
}
export type WorkTab = "ringkasan" | "blank" | "nilai" | "anggota";

const menitSejak = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));

/** A blank stuck in the most groups (wrong and not right), if 2 or more. */
export function blankMacet(
  m: Matriks | null,
  kolom: Kolom[],
): { k: Kolom; w: number; a: number; n: number } | null {
  if (!m) return null;
  const groups = Object.keys(m.sel);
  let best: { k: Kolom; w: number; a: number; n: number } | null = null;
  for (const k of kolom) {
    let w = 0;
    let a = 0;
    for (const g of groups) {
      const c = cellOf(m.sel[g]?.[k.soal]);
      if (c === "w") w++;
      if (c === "b") a++;
    }
    if (w >= 2 && (!best || w > best.w)) best = { k, w, a, n: groups.length };
  }
  return best;
}

/* ---------------------------------------------------- the session track */

export function SessionTrack({
  sesi,
  durasi,
  groups,
  tangan,
  mtx,
  now,
  lang,
}: {
  sesi: SesiRunning;
  durasi: number;
  groups: GroupRow[];
  tangan: Record<string, string>;
  mtx: Matriks | null;
  now: number;
  lang: Lang;
}) {
  const r = R[lang];
  const a = sesi.mulaiPada ? Date.parse(sesi.mulaiPada) : now;
  const z = a + durasi * 60_000;
  const span = z + 30 * 60_000 - a;
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - a) / span) * 100));
  const nomor = (id: number | string) =>
    kelompokLabel(groups.find((g) => String(g.id) === String(id))?.nomor ?? 0, lang);
  const marks: { t: number; k: string; l: string }[] = [];
  if (sesi.mulaiPada) marks.push({ t: a, k: "sesi", l: r.mark.sesi });
  if (mtx) {
    let first: { t: number; g: string } | null = null;
    for (const [g, cells] of Object.entries(mtx.sel))
      for (const c of Object.values(cells))
        if (c.benar && c.pada && (!first || Date.parse(c.pada) < first.t))
          first = { t: Date.parse(c.pada), g };
    if (first) marks.push({ t: first.t, k: "blank", l: r.mark.blank(nomor(first.g)) });
    for (const x of mtx.minta)
      marks.push({ t: Date.parse(x.pada), k: "minta", l: r.mark.minta(nomor(x.kelompokId)) });
  }
  for (const [g, iso] of Object.entries(tangan))
    marks.push({ t: Date.parse(iso), k: "bantu", l: r.mark.bantu(nomor(g)) });
  if (sesi.pengumumanPada)
    marks.push({ t: Date.parse(sesi.pengumumanPada), k: "info", l: r.mark.info });
  const hhmm = (t: number) => jamLab(new Date(t).toISOString());
  return (
    <div className="strack" aria-label={r.trackAria} role="group">
      <div className="strack__bar" style={{ "--m": `var(--mod-${sesi.modul})` } as CSSProperties}>
        <span className="strack__done" style={{ width: `${pct(now)}%` }} />
        <Tooltip label={r.extZone}>
          <span className="strack__ext" style={{ left: `${pct(z)}%` }} tabIndex={0} />
        </Tooltip>
        {marks.map((m, i) => (
          <Tooltip key={`${m.k}${i}`} label={`${hhmm(m.t)} · ${m.l}`}>
            <span
              className="strack__mark"
              data-k={m.k}
              style={{ left: `${pct(m.t)}%` }}
              tabIndex={0}
            />
          </Tooltip>
        ))}
        <span className="strack__now" style={{ left: `${pct(now)}%` }}>
          <b className="mono">{hhmm(now)}</b>
        </span>
      </div>
      <div className="strack__ends mono">
        <span>{hhmm(a)}</span>
        <span>{r.ends(hhmm(z))}</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- counters */

export function Counters({
  groups,
  stuck,
  tangan,
  mtx,
  kolom,
  nilai,
  go,
  lang,
}: {
  groups: GroupRow[];
  stuck: Stuck[];
  tangan: Record<string, string>;
  mtx: Matriks | null;
  kolom: Kolom[];
  nilai: NilaiLive;
  go: (o: GoTo) => void;
  lang: Lang;
}) {
  const r = R[lang];
  const k = r.kpi;
  const aktif = groups.filter((g) => g.sesiAktif);
  const hadir = aktif.reduce((a, g) => a + g.hadir, 0);
  const total = aktif.reduce((a, g) => a + g.anggotaTotal, 0);
  const missing = aktif.find((g) => g.hadir < g.anggotaTotal);
  const benar = aktif.reduce((a, g) => a + g.benar, 0);
  const semua = aktif.reduce((a, g) => a + g.total, 0);
  const avg = aktif.length ? benar / aktif.length : 0;
  const hands = Object.entries(tangan).sort((x, y) => x[1].localeCompare(y[1]));
  const handG = hands[0] ? groups.find((g) => String(g.id) === hands[0][0]) : undefined;
  const macet = blankMacet(mtx, kolom);
  const pesan = aktif.reduce((a, g) => a + (g.telemetri?.count ?? 0), 0);
  const sunyi = aktif.filter((g) => (g.telemetri?.count ?? 0) === 0);
  const sent = Object.keys(nilai.data?.terkirim ?? {}).length;
  const tiles: {
    key: string;
    v: string;
    l: string;
    sub: string;
    tone?: "warn";
    /** A plain count ticks to its new value */
    n?: number;
    act: () => void;
  }[] = [
    {
      key: "hadir",
      v: `${hadir}/${total}`,
      l: k.hadir,
      sub: k.notIn(total - hadir),
      act: () => go(missing ? { g: missing.id, tab: "anggota" } : { view: "prep" }),
    },
    {
      key: "blank",
      v: `${benar}/${semua}`,
      l: k.blank,
      sub: k.perGroup(
        avg.toLocaleString(lang === "en" ? "en-GB" : "id-ID", { maximumFractionDigits: 1 }),
      ),
      act: () => go({ view: "matrix" }),
    },
    {
      key: "hand",
      v: String(hands.length),
      n: hands.length,
      l: k.hand,
      sub:
        handG && hands[0]
          ? k.handSub(kelompokLabel(handG.nomor, lang), menitSejak(hands[0][1]))
          : k.handNone,
      tone: hands.length ? "warn" : undefined,
      act: () => (handG ? go({ g: handG.id, tab: "ringkasan" }) : go({ view: "board" })),
    },
    {
      key: "stuck",
      v: String(stuck.length),
      n: stuck.length,
      l: k.stuck,
      sub: macet
        ? k.stuckSub(macet.k.label, macet.w)
        : stuck.length
          ? k.stuckIn(new Set(stuck.map((s) => s.kelompokId)).size)
          : k.stuckNone,
      tone: stuck.length ? "warn" : undefined,
      act: () => go({ view: "matrix" }),
    },
    {
      key: "data",
      v: pesan.toLocaleString("id-ID"),
      n: pesan,
      l: k.data,
      sub: k.dataSub(sunyi.length),
      tone: sunyi.length && pesan > 0 ? "warn" : undefined,
      act: () => go(sunyi[0] ? { g: sunyi[0].id, tab: "ringkasan" } : { view: "board" }),
    },
    {
      key: "sent",
      v: `${sent}/${aktif.length}`,
      l: k.sent,
      sub: k.sentSub,
      act: () => go({ view: "table" }),
    },
  ];
  return (
    <div className="kpis">
      {tiles.map((x) => (
        <button
          key={x.key}
          type="button"
          className="kpi sweep-hover"
          data-tone={x.tone}
          onClick={x.act}
        >
          <b className="mono">
            {x.n !== undefined ? (
              <AngkaGulir value={x.n} format={(v) => Math.round(v).toLocaleString("id-ID")} />
            ) : (
              <Sorot value={x.v}>{x.v}</Sorot>
            )}
          </b>
          <span className="kpi__l">{x.l}</span>
          <span className="kpi__sub">{x.sub}</span>
          <span className="kpi__go" aria-hidden="true">
            <ArrowRightIcon size={14} />
          </span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ rail */

export function attentionOf(
  g: GroupRow,
  tangan: Record<string, string>,
  minta: Set<number>,
  stuckBy: Map<number, number>,
): number {
  if (tangan[g.id] || minta.has(g.id)) return 0;
  if (stuckBy.get(g.id)) return 1;
  if (g.sesiAktif && (g.telemetri?.count ?? 0) === 0) return 2;
  return 3;
}

export function Rail({
  groups,
  stuck,
  tangan,
  pemilik,
  asisten,
  meNim,
  mtx,
  kolom,
  terkirim,
  sel,
  onPick,
  lang,
}: {
  groups: GroupRow[];
  stuck: Stuck[];
  tangan: Record<string, string>;
  pemilik: Record<string, string>;
  asisten: Map<string, AsistenRef>;
  meNim: string;
  mtx: Matriks | null;
  kolom: Kolom[];
  terkirim: Record<string, unknown>;
  sel: number | null;
  onPick: (id: number) => void;
  lang: Lang;
}) {
  const r = R[lang];
  const [f, setF] = useState<"semua" | "mine" | "help">("semua");
  const stuckBy = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of stuck) m.set(s.kelompokId, (m.get(s.kelompokId) ?? 0) + 1);
    return m;
  }, [stuck]);
  const minta = new Set((mtx?.minta ?? []).map((x) => x.kelompokId));
  let gs = [...groups].sort(
    (a, b) =>
      attentionOf(a, tangan, minta, stuckBy) - attentionOf(b, tangan, minta, stuckBy) ||
      a.nomor - b.nomor,
  );
  // When every running group is silent, say it once instead of on each card.
  const aktif = groups.filter((g) => g.sesiAktif);
  const semuaDiam = aktif.length > 0 && aktif.every((g) => (g.telemetri?.count ?? 0) === 0);
  if (f === "mine") gs = gs.filter((g) => pemilik[g.id] === meNim);
  if (f === "help") gs = gs.filter((g) => attentionOf(g, tangan, minta, stuckBy) < 3);
  return (
    <section className="panel rail" data-area="rail">
      <div className="panel__head">
        <h2 className="panel__title">{r.groups}</h2>
        <span className="hint">{r.neediest}</span>
      </div>
      {semuaDiam && (
        <span className="rail__note">
          <WifiSlashIcon size={14} aria-hidden="true" />
          {r.noDataAll}
        </span>
      )}
      <SegmentedControl
        fill
        value={f}
        onValueChange={(v) => setF(v as typeof f)}
        aria-label={r.groups}
        options={[
          { value: "semua", label: r.fAll },
          { value: "mine", label: r.fMine },
          { value: "help", label: r.fHelp },
        ]}
      />
      <div className="rail__list" role="list">
        {gs.map((g) => {
          const owner = pemilik[g.id] ?? null;
          const kode = owner ? (asisten.get(owner)?.kode ?? "?").toUpperCase() : "";
          const cells = mtx?.sel[g.id] ?? {};
          const nStuck = stuckBy.get(g.id) ?? 0;
          const quiet = !semuaDiam && g.sesiAktif && (g.telemetri?.count ?? 0) === 0;
          const hadir = g.anggota.filter((m) => m.hadir).length;
          return (
            <button
              key={g.id}
              type="button"
              role="listitem"
              className="grow-row rrow"
              style={
                {
                  "--g": `var(--group-${g.nomor})`,
                  "--p": g.total ? g.benar / g.total : 0,
                } as CSSProperties
              }
              aria-current={sel === g.id}
              data-idle={g.sesiAktif ? undefined : "yes"}
              onClick={() => onPick(g.id)}
            >
              <span className="gstar" aria-hidden="true">
                <i />
              </span>
              <span className="rrow__main">
                <span className="rrow__top">
                  <b>
                    {kelompokLabel(g.nomor, lang)} · {namaKelompok(g.nomor, g.nama)}
                  </b>
                  {g.nomor <= 10 && <kbd className="kbd">{g.nomor % 10}</kbd>}
                  {tangan[g.id] && (
                    <Pill tone="warn">
                      <HandIcon size={12} aria-hidden="true" />
                      {jamLab(tangan[g.id])}
                    </Pill>
                  )}
                  {minta.has(g.id) && (
                    <Pill tone="violet">
                      <SparkleIcon size={12} aria-hidden="true" />
                      {r.wantsHint}
                    </Pill>
                  )}
                  {nStuck > 0 && <Pill tone="warn">{r.stuckN(nStuck)}</Pill>}
                  {quiet && (
                    <Pill tone="warn">
                      <WifiSlashIcon size={12} aria-hidden="true" />
                      {r.noData}
                    </Pill>
                  )}
                  {terkirim[g.nomor] !== undefined && <Pill tone="ok">{r.sent}</Pill>}
                </span>
                <span className="rrow__meta">
                  {kode && (
                    <span className={`acode${owner === meNim ? " acode--me" : ""}`}>{kode}</span>
                  )}
                  <span className="rrow__dots" aria-label={r.attendance}>
                    {g.anggota.map((m) => (
                      <i key={m.nim} data-on={m.hadir ? "yes" : "no"} title={m.nama} />
                    ))}
                  </span>
                  <Sorot value={hadir} className="num hint">
                    {r.hereOf(hadir, g.anggota.length)}
                  </Sorot>
                  <span className="grow" />
                  <Sorot value={g.benar} className="num hint">
                    {r.blankOf(g.benar, g.total)}
                  </Sorot>
                </span>
                <span className="cells__row" style={{ "--c": "var(--g)" } as CSSProperties}>
                  {(kolom.length ? kolom : Array.from({ length: g.total }, () => null)).map(
                    (k, i) => {
                      const s = k ? cellOf(cells[k.soal]) : i < g.benar ? "b" : "e";
                      return (
                        <i
                          key={k?.soal ?? i}
                          data-on={s === "b" ? "yes" : "no"}
                          data-w={s === "w" ? "yes" : undefined}
                        />
                      );
                    },
                  )}
                </span>
              </span>
            </button>
          );
        })}
        {gs.length === 0 && <span className="hint">{r.noneHere}</span>}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ feed */

interface FeedRow {
  t: string;
  k: "minta" | "salah" | "bantu" | "blank";
  g: GroupRow;
  text: string;
  label: string;
  to: GoTo;
}

export function feedRows(
  groups: GroupRow[],
  tangan: Record<string, string>,
  mtx: Matriks | null,
  kolom: Kolom[],
  r: Rx,
): FeedRow[] {
  const out: FeedRow[] = [];
  const byId = new Map(groups.map((g) => [String(g.id), g]));
  const lbl = (soal: string) => kolom.find((k) => k.soal === soal)?.label ?? soal;
  for (const x of mtx?.minta ?? []) {
    const g = byId.get(String(x.kelompokId));
    if (g)
      out.push({
        t: x.pada,
        k: "minta",
        g,
        text: r.feed.ask(lbl(x.soal), x.catatan),
        label: r.go.answer,
        to: { g: g.id, tab: "blank", b: x.soal },
      });
  }
  for (const [id, iso] of Object.entries(tangan)) {
    const g = byId.get(id);
    if (g)
      out.push({
        t: iso,
        k: "bantu",
        g,
        text: r.feed.hand,
        label: r.go.open,
        to: { g: g.id, tab: "ringkasan" },
      });
  }
  for (const [id, cells] of Object.entries(mtx?.sel ?? {})) {
    const g = byId.get(id);
    if (!g) continue;
    let last = "";
    let right = 0;
    for (const [soal, c] of Object.entries(cells)) {
      if (c.benar) {
        right++;
        if (c.pada && c.pada > last) last = c.pada;
      } else if (c.salah >= 2 && c.pada)
        out.push({
          t: c.pada,
          k: "salah",
          g,
          text: r.feed.wrong(lbl(soal), c.salah, c.isi),
          label: r.go.see,
          to: { g: g.id, tab: "blank", b: soal },
        });
    }
    if (kolom.length && right === kolom.length && last)
      out.push({
        t: last,
        k: "blank",
        g,
        text: r.feed.done(right, kolom.length),
        label: r.go.score,
        to: { g: g.id, tab: "nilai" },
      });
  }
  return out.sort((a, b) => b.t.localeCompare(a.t));
}

export function Feed({
  rows,
  macet,
  onAnnounce,
  go,
  lang,
}: {
  rows: FeedRow[];
  macet: ReturnType<typeof blankMacet>;
  onAnnounce?: () => void;
  go: (o: GoTo) => void;
  lang: Lang;
}) {
  const r = R[lang];
  const tone = { minta: "violet", salah: "warn", bantu: "warn", blank: "ok" } as const;
  // Raised hands and hint requests wait on an Asisten: they come first.
  const need = rows.filter((i) => i.k === "minta" || i.k === "bantu");
  const rest = rows.filter((i) => i.k !== "minta" && i.k !== "bantu").slice(0, 40);
  const list = (items: FeedRow[]) => (
    <ol className="elog">
      {items.map((i, n) => (
        <li
          key={`${i.k}${i.t}${n}`}
          className="elog__row feed__row"
          style={{ "--g": `var(--group-${i.g.nomor})` } as CSSProperties}
        >
          <time className="mono" dateTime={i.t}>
            {jamLab(i.t)}
          </time>
          <span className="elog__tag mono" data-tone={tone[i.k]}>
            {r.tag[i.k]}
          </span>
          <span className="elog__text">
            <b className="feed__g">{kelompokLabel(i.g.nomor, lang)}</b> {i.text}
          </span>
          <IconButton
            icon={ArrowRightIcon}
            sm
            label={`${i.label}: ${kelompokLabel(i.g.nomor, lang)}`}
            onClick={() => go(i.to)}
          />
        </li>
      ))}
    </ol>
  );
  return (
    <section className="panel feed" data-area="feed">
      <div className="panel__head">
        <h2 className="panel__title">{r.room}</h2>
        <span className="dot dot--ok dot--pulse" aria-hidden="true" />
      </div>
      {rows.length === 0 ? (
        <p className="hint feed__empty">{r.roomEmpty}</p>
      ) : (
        <div className="feed__scroll">
          {need.length > 0 && (
            <>
              <span className="label-caps">{r.needYou}</span>
              {list(need)}
            </>
          )}
          {rest.length > 0 && (
            <>
              {need.length > 0 && <span className="label-caps">{r.roomRest}</span>}
              {list(rest)}
            </>
          )}
        </div>
      )}
      {macet && (
        <div className="feed__note">
          <SparkleIcon size={20} aria-hidden="true" />
          <span className="stack" style={{ gap: 2 }}>
            <b>{r.classNote(macet.k.label, macet.w)}</b>
            <span className="hint">{r.classNoteSub}</span>
          </span>
          {onAnnounce && (
            <button type="button" className="btn btn--sm" onClick={onAnnounce}>
              <MegaphoneIcon size={16} aria-hidden="true" />
              {r.announce}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- matrix */

export function Matrix({
  groups,
  mtx,
  kolom,
  showKey,
  setShowKey,
  onAnnounce,
  go,
  lang,
}: {
  groups: GroupRow[];
  mtx: Matriks | null;
  kolom: Kolom[];
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  onAnnounce?: () => void;
  go: (o: GoTo) => void;
  lang: Lang;
}) {
  const r = R[lang];
  const gs = groups.filter((g) => g.sesiAktif);
  const col = (k: Kolom) => gs.filter((g) => cellOf(mtx?.sel[g.id]?.[k.soal]) === "b").length;
  const wrongIn = (k: Kolom) => gs.filter((g) => cellOf(mtx?.sel[g.id]?.[k.soal]) === "w").length;
  const macet = blankMacet(mtx, kolom);
  const files = mtx?.berkas ?? [];
  const keyFor = (k: Kolom) => {
    for (const g of gs) {
      const c = mtx?.sel[g.id]?.[k.soal];
      if (c?.kunci) return c.kunci;
    }
    return "";
  };
  return (
    <section className="panel mtx">
      <div className="panel__head">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="panel__title">{r.mtxTitle}</h2>
          <span className="hint">{r.mtxSub}</span>
        </div>
        <Tooltip label={r.keysWarn}>
          <label className="mtx__keys">
            <KeyIcon size={16} aria-hidden="true" />
            <span className="hint">{r.keys}</span>
            <Switch on={showKey} onChange={setShowKey} label={r.keys} />
          </label>
        </Tooltip>
      </div>
      {!mtx ? (
        <span className="skeleton" style={{ height: 240 }} />
      ) : kolom.length === 0 ? (
        <p className="hint">{r.mtxEmpty}</p>
      ) : (
        <div className="mtx__wrap">
          <table className="mtx__t">
            <thead>
              {files.length > 1 && (
                <tr>
                  <th />
                  {files.map((f) => (
                    <th key={f.slug} colSpan={f.blank.length} className="mtx__file">
                      {f.path.split("/").pop()}
                    </th>
                  ))}
                  <th />
                </tr>
              )}
              <tr>
                <th />
                {kolom.map((k) => (
                  <th key={k.soal} scope="col">
                    <Tooltip
                      label={`${k.kode.replace(/_{4,}/, "____")}${showKey ? `  →  ${keyFor(k)}` : ""}`}
                    >
                      <span
                        className="mtx__h"
                        data-hot={col(k) <= 2 && wrongIn(k) > 0 ? "yes" : undefined}
                        tabIndex={0}
                        style={{ display: "grid", placeItems: "center" }}
                      >
                        {k.label}
                      </span>
                    </Tooltip>
                  </th>
                ))}
                <th className="mono">Σ</th>
              </tr>
            </thead>
            <tbody>
              {gs.map((g) => {
                const cells = mtx.sel[g.id] ?? {};
                return (
                  <tr key={g.id} style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}>
                    <th scope="row">
                      <button
                        type="button"
                        className="mtx__g"
                        onClick={() => go({ view: "board", g: g.id, tab: "blank" })}
                      >
                        <i />
                        {kelompokLabel(g.nomor, lang)} · {namaKelompok(g.nomor, g.nama)}
                      </button>
                    </th>
                    {kolom.map((k) => {
                      const c = cells[k.soal];
                      const s = cellOf(c);
                      return (
                        <td key={k.soal}>
                          <Tooltip
                            label={
                              s === "w"
                                ? r.cellWrong(c!.isi, c!.salah || c!.percobaan)
                                : s === "b"
                                  ? `${r.right}${c?.oleh ? ` · ${c.oleh}` : ""}${c?.pada ? ` · ${jamLab(c.pada)}` : ""}`
                                  : r.cellEmpty
                            }
                          >
                            <button
                              type="button"
                              className="mtx__c"
                              data-s={s}
                              data-hot={s === "w" && (c?.salah ?? 0) >= 2 ? "yes" : undefined}
                              aria-label={`${kelompokLabel(g.nomor, lang)} ${k.label}`}
                              onClick={() =>
                                go({ view: "board", g: g.id, tab: "blank", b: k.soal })
                              }
                            >
                              {s === "w" ? c!.salah || c!.percobaan : ""}
                            </button>
                          </Tooltip>
                        </td>
                      );
                    })}
                    <td className="mono num">{g.benar}</td>
                  </tr>
                );
              })}
              <tr className="mtx__sum">
                <th scope="row" className="hint">
                  {r.right}
                </th>
                {kolom.map((k) => (
                  <td key={k.soal} className="mono num">
                    {r.rightOf(col(k), gs.length)}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="mtx__legend">
        <span>
          <i data-s="b" />
          {r.legendRight}
        </span>
        <span>
          <i data-s="w" />
          {r.legendWrong}
        </span>
        <span>
          <i data-s="e" />
          {r.legendEmpty}
        </span>
      </div>
      {macet && (
        <div className="feed__note">
          <SparkleIcon size={20} aria-hidden="true" />
          <span className="stack" style={{ gap: 2 }}>
            <b>{r.mtxNote(macet.k.label, macet.a, macet.n, macet.w)}</b>
            <span className="hint">{r.mtxNoteSub}</span>
          </span>
          {onAnnounce && (
            <button type="button" className="btn btn--sm" onClick={onAnnounce}>
              <MegaphoneIcon size={16} aria-hidden="true" />
              {r.announceHint}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
