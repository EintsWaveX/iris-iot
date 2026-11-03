/**
 * The one paginator for every long list in the app (ported from RAMCES, 2026-11-03).
 *
 *   const pg = usePager(rows, { id: "kandidat", size: 20, reset: [query, filter] });
 *   ...pg.rows.map(...)
 *   <Pager pg={pg} noun="CaAs" lang={lang} />
 *
 * Two rules, both learned the hard way in RAMCES:
 *   1. Slice AFTER filtering AND sorting. Pass the hook the list exactly as it
 *      should read on screen; paging an unsorted list shows the right count of
 *      the wrong rows.
 *   2. Search and filters change the DATA, never hide rows in the DOM. List
 *      the filter values in `reset` so a new filter goes back to page 1.
 *
 * The bar reads "Menampilkan 1-20 dari 114 CaAs", first / previous / a window of
 * numbers / next / last, a jump box once there are more than 3 pages, and a
 * per-page choice (5, 10, 20, 50, 100 or all). The chosen size is remembered
 * per list `id` (localStorage, guarded). Nothing shows while a list has 5 rows
 * or fewer.
 */
import { useState } from "react";
import {
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import { dict } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import "./Pager.css";

export const PAGE_SIZES = [5, 10, 20, 50, 100] as const;
export type PageSize = number | "all";

const T = dict({
  id: {
    showing: (a: number, b: number, n: number, noun: string) =>
      `Menampilkan ${a}-${b} dari ${n}${noun ? ` ${noun}` : ""}`,
    first: "Halaman pertama",
    prev: "Sebelumnya",
    next: "Berikutnya",
    last: "Halaman terakhir",
    page: (n: number) => `Halaman ${n}`,
    jump: "Ke halaman",
    jumpLabel: (n: number) => `Loncat ke halaman, 1 sampai ${n}`,
    perPage: "Per halaman",
    perPageLabel: "Jumlah baris per halaman",
    all: "Semua",
    nav: "Halaman",
  },
  en: {
    showing: (a: number, b: number, n: number, noun: string) =>
      `Showing ${a}-${b} of ${n}${noun ? ` ${noun}` : ""}`,
    first: "First page",
    prev: "Previous",
    next: "Next",
    last: "Last page",
    page: (n: number) => `Page ${n}`,
    jump: "Go to page",
    jumpLabel: (n: number) => `Jump to a page, 1 to ${n}`,
    perPage: "Per page",
    perPageLabel: "Rows per page",
    all: "All",
    nav: "Pages",
  },
  zh: {
    showing: (a: number, b: number, n: number, noun: string) =>
      `显示第 ${a}-${b} 条，共 ${n} 条${noun ? ` ${noun}` : ""}`,
    first: "第一页",
    prev: "上一页",
    next: "下一页",
    last: "最后一页",
    page: (n: number) => `第 ${n} 页`,
    jump: "跳到第",
    jumpLabel: (n: number) => `跳到某一页，1 到 ${n}`,
    perPage: "每页",
    perPageLabel: "每页行数",
    all: "全部",
    nav: "分页",
  },
});

/** What lists are made of, so the count reads right in each language ("dari 114 CaAs"). */
export const NOUN = dict({
  id: {
    caas: "CaAs",
    soal: "soal",
    peserta: "peserta",
    tim: "tim",
    asisten: "asisten",
    baris: "baris",
    acara: "acara",
    kiriman: "kiriman",
  },
  en: {
    caas: "CaAs",
    soal: "questions",
    peserta: "examinees",
    tim: "teams",
    asisten: "assistants",
    baris: "rows",
    acara: "events",
    kiriman: "submissions",
  },
  zh: {
    caas: "CaAs",
    soal: "题",
    peserta: "考生",
    tim: "组",
    asisten: "助教",
    baris: "行",
    acara: "活动",
    kiriman: "提交",
  },
});

export interface PagerState<T> {
  id: string;
  /** The rows of the current page. */
  rows: T[];
  total: number;
  pages: number;
  page: number;
  size: PageSize;
  /** 1-based first and last row shown (0 when empty). */
  from: number;
  to: number;
  setPage: (p: number) => void;
  setSize: (s: PageSize) => void;
}

const keyOf = (id: string) => `iris-pager-${id}`;

function readSize(id: string, fallback: PageSize): PageSize {
  try {
    const v = localStorage.getItem(keyOf(id));
    if (v === "all") return "all";
    const n = Number(v);
    if ((PAGE_SIZES as readonly number[]).includes(n)) return n;
  } catch {
    /* private window or blocked storage: the default stands */
  }
  return fallback;
}

/**
 * Pages an already filtered and sorted list. `reset` lists the values that
 * change what the list holds (search text, filters, the chosen stage...): when
 * any of them changes the list goes back to page 1.
 */
export function usePager<T>(
  items: readonly T[],
  { id, size: first = 20, reset = [] }: { id: string; size?: number; reset?: readonly unknown[] },
): PagerState<T> {
  const [size, setSizeState] = useState<PageSize>(() => readSize(id, first));
  const [page, setPageState] = useState(1);
  const resetKey = JSON.stringify(reset);
  const [seen, setSeen] = useState(resetKey);
  // A new filter starts again at page 1 (state adjusted while rendering, so no frame shows the old page).
  if (seen !== resetKey) {
    setSeen(resetKey);
    setPageState(1);
  }
  const total = items.length;
  const per = size === "all" ? Math.max(total, 1) : size;
  const pages = Math.max(1, Math.ceil(total / per));
  // A list that shrank under the reader (a row removed, a refresh) clamps instead of showing an empty page.
  const at = Math.min(Math.max(page, 1), pages);
  const start = (at - 1) * per;
  return {
    id,
    rows: items.slice(start, start + per),
    total,
    pages,
    page: at,
    size,
    from: total ? start + 1 : 0,
    to: Math.min(start + per, total),
    setPage: (p) => setPageState(Math.min(Math.max(p, 1), pages)),
    setSize: (s) => {
      setSizeState(s);
      setPageState(1);
      try {
        localStorage.setItem(keyOf(id), String(s));
      } catch {
        /* storage blocked: the choice lasts until the page closes */
      }
    },
  };
}

/** A compact window around the current page: 1 … 4 5 [6] 7 8 … 20. */
function windowOf(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const lo = Math.max(2, page - 2);
  const hi = Math.min(pages - 1, page + 2);
  if (lo > 2) out.push("…");
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

export default function Pager<T>({
  pg,
  noun = "",
  lang = "id",
}: {
  pg: PagerState<T>;
  /** What is being paged ("CaAs", "soal"), so the count reads right. */
  noun?: string;
  lang?: Lang;
}) {
  const t = T[lang];
  const [typed, setTyped] = useState<string | null>(null);
  if (pg.total <= PAGE_SIZES[0]) return null;
  const go = (p: number) => {
    if (p !== pg.page) pg.setPage(p);
  };
  const jump = () => {
    const raw = parseInt(typed ?? "", 10);
    setTyped(null);
    if (!Number.isNaN(raw)) go(Math.min(Math.max(raw, 1), pg.pages));
  };
  const btn = (label: React.ReactNode, to: number, tip: string, off: boolean) => (
    <button
      type="button"
      className="pager__btn"
      disabled={off}
      aria-label={tip}
      title={tip}
      onClick={() => go(to)}
    >
      {label}
    </button>
  );
  return (
    <div className="pager">
      <p className="pager__count num" aria-live="polite">
        {t.showing(pg.from, pg.to, pg.total, noun)}
      </p>
      {pg.pages > 1 && (
        <nav className="pager__nums" aria-label={t.nav}>
          {btn(<CaretDoubleLeftIcon size={14} aria-hidden="true" />, 1, t.first, pg.page === 1)}
          {btn(<CaretLeftIcon size={14} aria-hidden="true" />, pg.page - 1, t.prev, pg.page === 1)}
          {windowOf(pg.page, pg.pages).map((n, i) =>
            n === "…" ? (
              <span key={`g${i}`} className="pager__gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                className="pager__btn"
                aria-current={n === pg.page ? "page" : undefined}
                aria-label={t.page(n)}
                onClick={() => go(n)}
              >
                {n}
              </button>
            ),
          )}
          {btn(
            <CaretRightIcon size={14} aria-hidden="true" />,
            pg.page + 1,
            t.next,
            pg.page === pg.pages,
          )}
          {btn(
            <CaretDoubleRightIcon size={14} aria-hidden="true" />,
            pg.pages,
            t.last,
            pg.page === pg.pages,
          )}
        </nav>
      )}
      {pg.pages > 3 && (
        <label className="pager__field">
          <span>{t.jump}</span>
          <input
            type="number"
            className="pager__jump"
            min={1}
            max={pg.pages}
            inputMode="numeric"
            value={typed ?? pg.page}
            aria-label={t.jumpLabel(pg.pages)}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              jump();
            }}
            onBlur={() => typed !== null && jump()}
          />
        </label>
      )}
      <label className="pager__field">
        <span>{t.perPage}</span>
        <select
          className="pager__size"
          aria-label={t.perPageLabel}
          value={String(pg.size)}
          onChange={(e) => pg.setSize(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value="all">{t.all}</option>
        </select>
      </label>
    </div>
  );
}

/**
 * `usePager` as a component, for a list that sits after an early return or inside a sub-render
 * where a hook cannot go. `children` gets the page's rows and how many rows come before it
 * (so a rank column can read `offset + i + 1`); the bar is drawn under whatever it returns.
 */
export function Paged<T>({
  items,
  id,
  size,
  reset,
  noun,
  lang,
  children,
}: {
  items: readonly T[];
  id: string;
  size?: number;
  reset?: readonly unknown[];
  noun?: string;
  lang?: Lang;
  children: (rows: T[], offset: number) => React.ReactNode;
}) {
  const pg = usePager(items, { id, size, reset });
  return (
    <>
      {children(pg.rows, pg.from ? pg.from - 1 : 0)}
      <Pager pg={pg} noun={noun} lang={lang} />
    </>
  );
}
