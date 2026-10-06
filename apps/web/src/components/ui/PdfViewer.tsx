/**
 * One PDF viewer for the whole app: the assistant's slides and the public
 * module handbook on every module page share it.
 *
 * Phase 9 (mockup PdfMock): the app's own viewer on pdf.js instead of the
 * browser's, so it looks and works the same on every browser and phone.
 * 2026-10-07 (user: "follow the same signature as how browsers handle
 * PDF"): the bar now carries what a browser's own viewer has, in its order:
 * contents (outline, or page thumbnails when the file has none), the file
 * name, a page box with previous and next, zoom out, the zoom, zoom in, fit
 * to page or to width, rotate, find, download, print and full screen. Text
 * is selectable (pdf.js text layer). Full screen presents the file: one
 * page fits the screen, the arrow keys, Page Up and Down and Space turn
 * pages, and the bar hides until the mouse moves.
 *
 * Keys while the viewer has focus: Ctrl F finds, Ctrl + and Ctrl - zoom,
 * Ctrl 0 resets, the arrows turn pages when a whole page is on screen,
 * Home and End go to the first and last page.
 *
 * pdf.js loads only when a viewer mounts. If the file can't be read, the
 * viewer says so and still offers the download.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowCounterClockwiseIcon,
  ArrowsOutLineHorizontalIcon,
  CaretDownIcon,
  CaretUpIcon,
  CornersInIcon,
  CornersOutIcon,
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  FrameCornersIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PrinterIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import IconButton from "./IconButton";
import Popover from "./Popover";
import Tooltip from "./Tooltip";
import type { Lang } from "../../lib/kelas";
import { dict } from "../../lib/app";
import "./PdfViewer.css";

const T = dict({
  id: {
    contents: "Daftar Isi",
    prev: "Halaman Sebelumnya",
    next: "Halaman Berikutnya",
    pageBox: "Nomor halaman",
    of: (n: number) => `/ ${n}`,
    zoomOut: "Perkecil",
    zoomIn: "Perbesar",
    zoomReset: "Kembali ke 100%",
    fitPage: "Pas Satu Halaman",
    fitWidth: "Pas Lebar",
    rotate: "Putar",
    find: "Cari",
    findBox: "Cari di berkas",
    findPrev: "Hasil Sebelumnya",
    findNext: "Hasil Berikutnya",
    findClose: "Tutup Pencarian",
    findCount: (i: number, n: number) => `${i} dari ${n}`,
    findNone: "Tidak ketemu",
    download: "Unduh",
    print: "Cetak",
    printing: "Menyiapkan cetak...",
    more: "Lainnya",
    full: "Layar Penuh",
    fullExit: "Keluar Layar Penuh",
    loading: "Memuat berkas...",
    fail: "Berkas ini tidak bisa ditampilkan. Unduh untuk membukanya.",
    page: (n: number) => `Halaman ${n}`,
  },
  en: {
    contents: "Contents",
    prev: "Previous Page",
    next: "Next Page",
    pageBox: "Page number",
    of: (n: number) => `/ ${n}`,
    zoomOut: "Zoom Out",
    zoomIn: "Zoom In",
    zoomReset: "Back to 100%",
    fitPage: "Fit to Page",
    fitWidth: "Fit to Width",
    rotate: "Rotate",
    find: "Find",
    findBox: "Find in file",
    findPrev: "Previous Match",
    findNext: "Next Match",
    findClose: "Close Find",
    findCount: (i: number, n: number) => `${i} of ${n}`,
    findNone: "No matches",
    download: "Download",
    print: "Print",
    printing: "Getting it ready to print...",
    more: "More",
    full: "Full Screen",
    fullExit: "Exit Full Screen",
    loading: "Loading the file...",
    fail: "This file can't be shown here. Download it to open it.",
    page: (n: number) => `Page ${n}`,
  },
  zh: {
    contents: "目录",
    prev: "上一页",
    next: "下一页",
    pageBox: "页码",
    of: (n: number) => `/ ${n}`,
    zoomOut: "缩小",
    zoomIn: "放大",
    zoomReset: "恢复 100%",
    fitPage: "适合整页",
    fitWidth: "适合宽度",
    rotate: "旋转",
    find: "查找",
    findBox: "在文件中查找",
    findPrev: "上一个结果",
    findNext: "下一个结果",
    findClose: "关闭查找",
    findCount: (i: number, n: number) => `${i} / ${n}`,
    findNone: "没有结果",
    download: "下载",
    print: "打印",
    printing: "正在准备打印...",
    more: "更多",
    full: "全屏",
    fullExit: "退出全屏",
    loading: "正在加载文件...",
    fail: "这个文件无法在这里显示。下载后再打开。",
    page: (n: number) => `第 ${n} 页`,
  },
});

type Pdfjs = typeof import("pdfjs-dist");
let pdfjsReady: Promise<Pdfjs> | null = null;
function loadPdfjs(): Promise<Pdfjs> {
  pdfjsReady ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjsReady;
}

interface TocItem {
  title: string;
  page: number;
  depth: number;
}

/** The zoom stops a browser's viewer uses; 100 % is the fit. */
const ZOOMS = [50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300];
const PAD_Y = 36;
const PAD_X = 32;

/** The outline as a flat list with page numbers (entries without one are dropped). */
async function readOutline(doc: PDFDocumentProxy): Promise<TocItem[]> {
  const outline = await doc.getOutline().catch(() => null);
  if (!outline) return [];
  const out: TocItem[] = [];
  const walk = async (items: typeof outline, depth: number) => {
    for (const it of items) {
      try {
        const dest = typeof it.dest === "string" ? await doc.getDestination(it.dest) : it.dest;
        const ref = dest?.[0];
        const page =
          ref && typeof ref === "object" ? (await doc.getPageIndex(ref)) + 1 : Number(ref) + 1;
        if (Number.isFinite(page)) out.push({ title: it.title, page, depth });
      } catch {
        /* an entry pointing nowhere is left out */
      }
      if (it.items?.length && depth < 2) await walk(it.items, depth + 1);
    }
  };
  await walk(outline, 0);
  return out;
}

/** A page's text, lower case, for Find. */
async function pageText(doc: PDFDocumentProxy, n: number): Promise<string> {
  const pg = await doc.getPage(n);
  const tc = await pg.getTextContent();
  return tc.items
    .map((it) => ("str" in it ? it.str : ""))
    .join(" ")
    .toLowerCase();
}

function countIn(text: string, q: string): number {
  let n = 0;
  for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) n++;
  return n;
}

/** Marks each match of the query inside the text layer, just the matched
 *  letters (the text itself stays transparent over the picture). */
function highlight(host: ParentNode, q: string) {
  host.querySelectorAll<HTMLElement>(".textLayer span").forEach((s) => {
    if (s.classList.contains("highlight")) return;
    const asli = s.dataset.asli ?? s.textContent ?? "";
    const low = asli.toLowerCase();
    if (!q || !low.includes(q)) {
      if (s.dataset.asli !== undefined) {
        s.textContent = asli;
        delete s.dataset.asli;
      }
      return;
    }
    s.dataset.asli = asli;
    const parts: Node[] = [];
    let at = 0;
    for (let i = low.indexOf(q); i >= 0; i = low.indexOf(q, i + q.length)) {
      if (i > at) parts.push(document.createTextNode(asli.slice(at, i)));
      const m = document.createElement("span");
      m.className = "highlight appended";
      m.textContent = asli.slice(i, i + q.length);
      parts.push(m);
      at = i + q.length;
    }
    if (at < asli.length) parts.push(document.createTextNode(asli.slice(at)));
    s.replaceChildren(...parts);
  });
}

const THUMB_W = 116;

/** One page as a small picture in the contents panel, drawn when it scrolls into view. */
function Thumb({
  doc,
  n,
  ratio,
  label,
  current,
  onClick,
}: {
  doc: PDFDocumentProxy;
  n: number;
  ratio: number;
  label: string;
  current: boolean;
  onClick: () => void;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const host = box.current;
    if (!host) return;
    let task: RenderTask | null = null;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e?.isIntersecting || host.querySelector("canvas")) return;
      io.disconnect();
      const pg = await doc.getPage(n);
      const base = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: (THUMB_W * 2) / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      task = pg.render({ canvas, viewport: vp });
      try {
        await task.promise;
        host.appendChild(canvas);
      } catch {
        /* the panel closed first */
      }
    });
    io.observe(host);
    return () => {
      io.disconnect();
      task?.cancel();
    };
  }, [doc, n]);
  useEffect(() => {
    if (current) btn.current?.scrollIntoView({ block: "nearest" });
  }, [current]);
  return (
    <button
      ref={btn}
      type="button"
      className="pdfv__thumb"
      aria-current={current ? "true" : undefined}
      aria-label={label}
      onClick={onClick}
    >
      <span
        ref={box}
        className="pdfv__thumbpage"
        style={{ width: THUMB_W, height: Math.round(THUMB_W * ratio) }}
        aria-hidden="true"
      />
      <span className="num">{n}</span>
    </button>
  );
}

/** Every page drawn once as an image, then the browser's print dialog for just those. */
async function printPages(doc: PDFDocumentProxy, rot: number): Promise<void> {
  const box = document.createElement("div");
  box.className = "pdfv-print";
  const urls: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const base = pg.getViewport({ scale: 1, rotation: (pg.rotate + rot) % 360 });
    const vp = pg.getViewport({
      scale: 1600 / base.width,
      rotation: (pg.rotate + rot) % 360,
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await pg.render({ canvas, viewport: vp }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) continue;
    const u = URL.createObjectURL(blob);
    urls.push(u);
    const img = document.createElement("img");
    img.src = u;
    img.alt = "";
    box.appendChild(img);
  }
  document.body.appendChild(box);
  await Promise.all(
    [...box.querySelectorAll("img")].map((im) =>
      im.complete ? null : new Promise((r) => im.addEventListener("load", r, { once: true })),
    ),
  );
  const root = document.documentElement;
  root.classList.add("pdfv-printing");
  const done = () => {
    root.classList.remove("pdfv-printing");
    box.remove();
    urls.forEach((u) => URL.revokeObjectURL(u));
  };
  window.addEventListener("afterprint", done, { once: true });
  window.print();
  // Browsers that never fire afterprint still clean up.
  window.setTimeout(() => {
    if (box.isConnected && !window.matchMedia("print").matches) done();
  }, 60_000);
}

export default function PdfViewer({
  url,
  name,
  lang,
  shape = "slides",
  className,
}: {
  url: string;
  name: string;
  lang: Lang;
  /** "slides" opens fitting a whole page; "page" (documents) opens fitting the width. */
  shape?: "slides" | "page";
  className?: string;
}) {
  const t = T[lang];
  const [lib, setLib] = useState<Pdfjs | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [fail, setFail] = useState(false);
  const [ratios, setRatios] = useState<number[]>([]);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [fit, setFit] = useState<"page" | "width">(shape === "slides" ? "page" : "width");
  const [rot, setRot] = useState(0);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [barW, setBarW] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [fs, setFs] = useState(false);
  const [idle, setIdle] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<number[] | null>(null);
  const [hit, setHit] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const findBox = useRef<HTMLInputElement>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const texts = useRef<string[] | null>(null);
  const qRef = useRef("");
  const before = useRef<{ fit: "page" | "width"; zoom: number } | null>(null);

  // Load the file (again when the address changes).
  useEffect(() => {
    let dead = false;
    let task: ReturnType<Pdfjs["getDocument"]> | null = null;
    setDoc(null);
    setFail(false);
    setToc([]);
    setPage(1);
    setRot(0);
    texts.current = null;
    setHits(null);
    loadPdfjs()
      .then((l) => {
        if (dead) return null;
        setLib(l);
        task = l.getDocument({ url });
        return task.promise;
      })
      .then(async (d) => {
        if (!d || dead) return;
        // Every page's height over width, so the placeholders take their
        // real size before anything renders.
        const rs: number[] = [];
        for (let i = 1; i <= d.numPages; i++) {
          const pg = await d.getPage(i);
          const vp = pg.getViewport({ scale: 1 });
          rs.push(vp.height / vp.width);
        }
        if (dead) return;
        setRatios(rs);
        setDoc(d);
        setToc(await readOutline(d));
      })
      .catch(() => !dead && setFail(true));
    return () => {
      dead = true;
      void task?.destroy();
    };
  }, [url]);

  // The frame's inner size: 100 % fits it (the whole page, or its width).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(on);
    ro.observe(el);
    on();
    return () => ro.disconnect();
  }, [doc]);

  // The viewer's own width decides the compact bar.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBarW(el.clientWidth));
    ro.observe(el);
    setBarW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // A quarter turn swaps a page's sides.
  const turned = rot % 180 !== 0;
  const ratioOf = (i: number) => {
    const r = ratios[i] ?? 9 / 16;
    return turned ? 1 / r : r;
  };
  const tallest = ratios.length ? Math.max(...ratios.map((_, i) => ratioOf(i))) : 9 / 16;
  // Full screen uses the whole screen; the frame keeps a margin round the page.
  const availW = Math.max(0, size.w - (fs ? 0 : PAD_X));
  const availH = Math.max(0, size.h - (fs ? 0 : PAD_Y));
  const fitW = Math.min(availW, shape === "page" && !fs ? 900 : 4000);
  const base = fit === "page" ? Math.min(availW, availH / tallest) : fitW;
  const pageW = Math.round((base * zoom) / 100);
  // In full screen the next page starts a whole screen further down.
  const fsGap = fs ? Math.max(16, Math.round(size.h - pageW * tallest)) : undefined;

  // Render the pages in view, with their text layer (again after a zoom or a turn).
  useEffect(() => {
    if (!doc || !lib || !pageW) return;
    const tasks = new Map<number, RenderTask>();
    const done = new Set<number>();
    let dead = false;
    const draw = async (i: number) => {
      if (done.has(i)) return;
      done.add(i);
      const host = pageEls.current[i - 1];
      if (!host) return;
      const pg = await doc.getPage(i);
      const rotation = (pg.rotate + rot) % 360;
      const one = pg.getViewport({ scale: 1, rotation });
      const css = pg.getViewport({ scale: pageW / one.width, rotation });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = pg.getViewport({ scale: css.scale * dpr, rotation });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.setAttribute("aria-hidden", "true");
      const task = pg.render({ canvas, viewport: vp });
      tasks.set(i, task);
      try {
        await task.promise;
      } catch {
        return; /* cancelled by a newer zoom */
      }
      if (dead) return;
      host.replaceChildren(canvas);
      // Selectable text over the picture, like the browser's viewer.
      host.style.setProperty("--total-scale-factor", String(css.scale));
      host.style.setProperty("--scale-factor", String(css.scale));
      const layer = document.createElement("div");
      layer.className = "textLayer";
      host.appendChild(layer);
      try {
        await new lib.TextLayer({
          textContentSource: pg.streamTextContent(),
          container: layer,
          viewport: css,
        }).render();
        highlight(layer, qRef.current);
      } catch {
        layer.remove();
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) void draw(Number((e.target as HTMLElement).dataset.page));
        }
      },
      { root: scroller.current, rootMargin: "600px 0px" },
    );
    pageEls.current.forEach((el) => el && io.observe(el));
    return () => {
      dead = true;
      io.disconnect();
      tasks.forEach((task) => task.cancel());
    };
  }, [doc, lib, pageW, rot]);

  // The page counter follows the scroll: the page under the frame's middle.
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const mid = el.getBoundingClientRect().top + el.clientHeight / 2;
    let cur = 1;
    pageEls.current.forEach((p, i) => {
      if (p && p.getBoundingClientRect().top <= mid) cur = i + 1;
    });
    setPage(cur);
  }, []);

  const pages = doc?.numPages ?? 0;

  /** Brings page n into view: centred when a whole page fits, else its top. */
  const goTo = useCallback((n: number, smooth = true) => {
    const el = pageEls.current[n - 1];
    const box = scroller.current;
    if (!el || !box) return;
    const centre = el.offsetHeight <= box.clientHeight;
    const top = centre
      ? el.offsetTop - (box.clientHeight - el.offsetHeight) / 2
      : el.offsetTop - 12;
    // Neighbouring pages glide; a far jump (Home, End, the page box) lands at once.
    const near = Math.abs(top - box.scrollTop) <= box.clientHeight * 2.5;
    box.scrollTo({ top: Math.max(0, top), behavior: smooth && near ? "smooth" : "auto" });
    setPage(n);
    if (window.matchMedia("(max-width: 719px)").matches) setTocOpen(false);
  }, []);
  const step = (d: number) => goTo(Math.min(pages, Math.max(1, page + d)));

  // Keep the same page in view across a zoom, a fit change or a turn.
  const keep = (f: () => void) => {
    const p = page;
    f();
    requestAnimationFrame(() => requestAnimationFrame(() => goTo(p, false)));
  };
  const zoomBy = (d: 1 | -1) =>
    keep(() =>
      setZoom((z) =>
        d > 0 ? (ZOOMS.find((s) => s > z) ?? z) : ([...ZOOMS].reverse().find((s) => s < z) ?? z),
      ),
    );

  // Full screen presents the file: whole pages, the bar out of the way.
  const toggleFull = () => {
    const el = root.current;
    if (!el) return;
    if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  };
  // One listener for the viewer's life; it reads the latest page and view.
  const latest = useRef({ page, fit, zoom });
  latest.current = { page, fit, zoom };
  useEffect(() => {
    const on = () => {
      const now = document.fullscreenElement === root.current && root.current !== null;
      setFs(now);
      const { page: p, fit, zoom } = latest.current;
      if (now) {
        before.current = { fit, zoom };
        setFit("page");
        setZoom(100);
        setTocOpen(false);
        scroller.current?.focus();
      } else if (before.current) {
        setFit(before.current.fit);
        setZoom(before.current.zoom);
        before.current = null;
      }
      requestAnimationFrame(() => requestAnimationFrame(() => goTo(p, false)));
    };
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, [goTo]);

  // In full screen the bar hides 2.5 s after the mouse stops.
  useEffect(() => {
    if (!fs) {
      setIdle(false);
      return;
    }
    let timer = window.setTimeout(() => setIdle(true), 2500);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 2500);
    };
    const el = root.current;
    el?.addEventListener("pointermove", wake);
    return () => {
      window.clearTimeout(timer);
      el?.removeEventListener("pointermove", wake);
    };
  }, [fs]);

  // Find: every page's text once, then the matches in page order.
  const runFind = async (q: string) => {
    const s = q.trim().toLowerCase();
    qRef.current = s;
    if (root.current) highlight(root.current, s);
    if (!doc || !s) {
      setHits(null);
      return;
    }
    if (!texts.current) {
      const all: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) all.push(await pageText(doc, i));
      texts.current = all;
    }
    const list: number[] = [];
    texts.current.forEach((tx, i) => {
      for (let k = countIn(tx, s); k > 0; k--) list.push(i + 1);
    });
    setHits(list);
    const first = Math.max(
      0,
      list.findIndex((p) => p >= page),
    );
    setHit(first);
    if (list.length) goTo(list[first]!);
  };
  const nextHit = (d: 1 | -1) => {
    if (!hits?.length) return;
    const i = (hit + d + hits.length) % hits.length;
    setHit(i);
    goTo(hits[i]!);
  };
  const openFind = () => {
    setFindOpen(true);
    requestAnimationFrame(() => findBox.current?.select());
  };
  const closeFind = () => {
    setFindOpen(false);
    setQuery("");
    setHits(null);
    qRef.current = "";
    if (root.current) highlight(root.current, "");
    scroller.current?.focus();
  };

  // Esc in the find box or the page box clears that box only. A dialog
  // around the viewer listens for Esc on the document in the capture phase,
  // so the box has to catch it earlier, on the window.
  const closeFindRef = useRef(closeFind);
  closeFindRef.current = closeFind;
  useEffect(() => {
    const on = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (!el || !root.current?.contains(el)) return;
      if (el.classList.contains("pdfv__findbox")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeFindRef.current();
      } else if (el.classList.contains("pdfv__pagebox")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setDraft(null);
        scroller.current?.focus();
      }
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, []);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "f") {
      e.preventDefault();
      openFind();
      return;
    }
    if (mod && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      zoomBy(1);
      return;
    }
    if (mod && e.key === "-") {
      e.preventDefault();
      zoomBy(-1);
      return;
    }
    if (mod && e.key === "0") {
      e.preventDefault();
      keep(() => setZoom(100));
      return;
    }
    const el = e.target as HTMLElement;
    if (mod || e.altKey || el.closest("input, textarea, select")) return;
    // A whole page on screen turns like slides; a zoomed page scrolls.
    const slides = fs || (fit === "page" && zoom <= 100);
    const fwd = ["ArrowRight", ...(slides ? ["ArrowDown", "PageDown", " "] : [])];
    const back = ["ArrowLeft", ...(slides ? ["ArrowUp", "PageUp"] : [])];
    if (fwd.includes(e.key) && !(e.key === " " && el.tagName === "BUTTON")) {
      e.preventDefault();
      step(e.shiftKey && e.key === " " ? -1 : 1);
    } else if (back.includes(e.key)) {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      goTo(1);
    } else if (e.key === "End") {
      e.preventDefault();
      goTo(pages);
    }
  };

  const doPrint = async () => {
    if (!doc || printing) return;
    setPrinting(true);
    try {
      await printPages(doc, rot);
    } finally {
      setPrinting(false);
    }
  };

  const commitDraft = () => {
    const n = Number(draft);
    setDraft(null);
    if (Number.isInteger(n) && n >= 1 && n <= pages) goTo(n);
  };

  const snap = fit === "page" && zoom <= 100;
  // A narrow frame (a phone) keeps one row, like a browser's mobile viewer:
  // pages and find on the bar, the rest under More.
  const compact = barW > 0 && barW < 640;
  return (
    <div
      ref={root}
      className={"pdfv" + (className ? ` ${className}` : "")}
      data-shape={shape}
      data-fs={fs ? "yes" : "no"}
      data-idle={fs && idle && !findOpen ? "yes" : "no"}
      data-snap={snap ? "yes" : "no"}
      onKeyDown={onKey}
    >
      <div className="pdfv__bar" data-compact={compact ? "yes" : "no"}>
        <div className="pdfv__grp pdfv__grp--name">
          <IconButton
            icon={ListBulletsIcon}
            label={t.contents}
            sm
            pressed={tocOpen}
            disabled={!doc || fs}
            onClick={() => setTocOpen((o) => !o)}
          />
          {findOpen ? (
            <div className="pdfv__find" role="search">
              <input
                ref={findBox}
                className="pdfv__findbox"
                type="text"
                enterKeyHint="search"
                aria-label={t.findBox}
                placeholder={t.findBox}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (hits && qRef.current === query.trim().toLowerCase())
                      nextHit(e.shiftKey ? -1 : 1);
                    else void runFind(query);
                  }
                }}
              />
              <span className="num pdfv__findn" aria-live="polite">
                {hits === null ? "" : hits.length ? t.findCount(hit + 1, hits.length) : t.findNone}
              </span>
              <IconButton
                icon={CaretUpIcon}
                label={t.findPrev}
                sm
                disabled={!hits?.length}
                onClick={() => nextHit(-1)}
              />
              <IconButton
                icon={CaretDownIcon}
                label={t.findNext}
                sm
                disabled={!hits?.length}
                onClick={() => nextHit(1)}
              />
              <IconButton icon={XIcon} label={t.findClose} sm onClick={closeFind} />
            </div>
          ) : (
            !compact && (
              <b className="pdfv__name" title={name}>
                {name}
              </b>
            )
          )}
        </div>

        <div className="pdfv__grp" hidden={compact && findOpen}>
          <IconButton
            icon={CaretUpIcon}
            label={t.prev}
            sm
            disabled={!doc || page <= 1}
            onClick={() => step(-1)}
          />
          <input
            className="pdfv__pagebox num"
            inputMode="numeric"
            aria-label={t.pageBox}
            disabled={!doc}
            value={draft ?? String(page)}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              } else if (e.key === "Escape") setDraft(null);
            }}
          />
          <span className="num pdfv__pos">{t.of(pages || 1)}</span>
          <IconButton
            icon={CaretDownIcon}
            label={t.next}
            sm
            disabled={!doc || page >= pages}
            onClick={() => step(1)}
          />
        </div>

        <div className="pdfv__grp" hidden={compact}>
          <IconButton
            icon={MagnifyingGlassMinusIcon}
            label={t.zoomOut}
            sm
            disabled={!doc || zoom <= ZOOMS[0]!}
            onClick={() => zoomBy(-1)}
          />
          <Tooltip label={t.zoomReset}>
            <button
              type="button"
              className="pdfv__zoom num"
              disabled={!doc || zoom === 100}
              onClick={() => keep(() => setZoom(100))}
            >
              {zoom}%
            </button>
          </Tooltip>
          <IconButton
            icon={MagnifyingGlassPlusIcon}
            label={t.zoomIn}
            sm
            disabled={!doc || zoom >= ZOOMS[ZOOMS.length - 1]!}
            onClick={() => zoomBy(1)}
          />
          <IconButton
            icon={fit === "page" ? ArrowsOutLineHorizontalIcon : FrameCornersIcon}
            label={fit === "page" ? t.fitWidth : t.fitPage}
            sm
            disabled={!doc || fs}
            onClick={() =>
              keep(() => {
                setFit((f) => (f === "page" ? "width" : "page"));
                setZoom(100);
              })
            }
          />
          <IconButton
            icon={ArrowCounterClockwiseIcon}
            label={t.rotate}
            sm
            disabled={!doc}
            onClick={() => keep(() => setRot((r) => (r + 270) % 360))}
          />
        </div>

        <div className="pdfv__grp pdfv__grp--end" hidden={compact && findOpen}>
          <IconButton
            icon={MagnifyingGlassIcon}
            label={t.find}
            sm
            pressed={findOpen}
            disabled={!doc}
            onClick={() => (findOpen ? closeFind() : openFind())}
          />
          {compact && (
            <>
              <IconButton
                icon={fs ? CornersInIcon : CornersOutIcon}
                label={fs ? t.fullExit : t.full}
                sm
                disabled={!doc}
                onClick={toggleFull}
              />
              <Popover
                open={moreOpen}
                onOpenChange={setMoreOpen}
                align="end"
                trigger={
                  <button
                    type="button"
                    className="iconbtn iconbtn--sm"
                    aria-label={t.more}
                    aria-pressed={moreOpen}
                    disabled={!doc}
                  >
                    <DotsThreeVerticalIcon size={18} weight="bold" aria-hidden="true" />
                  </button>
                }
              >
                <div className="pdfv__menu" role="menu" aria-label={t.more}>
                  <div className="pdfv__mzoom">
                    <button
                      type="button"
                      role="menuitem"
                      className="pdfv__mi"
                      aria-label={t.zoomOut}
                      disabled={zoom <= ZOOMS[0]!}
                      onClick={() => zoomBy(-1)}
                    >
                      <MagnifyingGlassMinusIcon size={18} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="pdfv__mi num"
                      aria-label={t.zoomReset}
                      onClick={() => keep(() => setZoom(100))}
                    >
                      {zoom}%
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="pdfv__mi"
                      aria-label={t.zoomIn}
                      disabled={zoom >= ZOOMS[ZOOMS.length - 1]!}
                      onClick={() => zoomBy(1)}
                    >
                      <MagnifyingGlassPlusIcon size={18} aria-hidden="true" />
                    </button>
                  </div>
                  {!fs && (
                    <button
                      type="button"
                      role="menuitem"
                      className="pdfv__mi"
                      onClick={() => {
                        setMoreOpen(false);
                        keep(() => {
                          setFit((f) => (f === "page" ? "width" : "page"));
                          setZoom(100);
                        });
                      }}
                    >
                      {fit === "page" ? (
                        <ArrowsOutLineHorizontalIcon size={18} aria-hidden="true" />
                      ) : (
                        <FrameCornersIcon size={18} aria-hidden="true" />
                      )}
                      {fit === "page" ? t.fitWidth : t.fitPage}
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="pdfv__mi"
                    onClick={() => keep(() => setRot((r) => (r + 270) % 360))}
                  >
                    <ArrowCounterClockwiseIcon size={18} aria-hidden="true" />
                    {t.rotate}
                  </button>
                  <a
                    role="menuitem"
                    className="pdfv__mi"
                    href={url}
                    download={name}
                    onClick={() => setMoreOpen(false)}
                  >
                    <DownloadSimpleIcon size={18} aria-hidden="true" />
                    {t.download}
                  </a>
                  <button
                    type="button"
                    role="menuitem"
                    className="pdfv__mi"
                    disabled={printing}
                    onClick={() => {
                      setMoreOpen(false);
                      void doPrint();
                    }}
                  >
                    <PrinterIcon size={18} aria-hidden="true" />
                    {printing ? t.printing : t.print}
                  </button>
                </div>
              </Popover>
            </>
          )}
          {!compact && (
            <>
              <Tooltip label={t.download}>
                <a
                  className="iconbtn iconbtn--sm"
                  href={url}
                  download={name}
                  aria-label={t.download}
                >
                  <DownloadSimpleIcon size={18} aria-hidden="true" />
                </a>
              </Tooltip>
              <IconButton
                icon={PrinterIcon}
                label={printing ? t.printing : t.print}
                sm
                disabled={!doc || printing}
                onClick={() => void doPrint()}
              />
              <IconButton
                icon={fs ? CornersInIcon : CornersOutIcon}
                label={fs ? t.fullExit : t.full}
                sm
                disabled={!doc}
                onClick={toggleFull}
              />
            </>
          )}
        </div>
      </div>
      <div className="pdfv__body">
        {tocOpen && doc && (
          <nav
            className={"pdfv__toc" + (toc.length ? "" : " pdfv__toc--thumbs")}
            aria-label={t.contents}
          >
            {toc.length > 0
              ? toc.map((it, i) => (
                  <button
                    key={i}
                    type="button"
                    className="pdfv__tocitem"
                    data-depth={it.depth}
                    aria-current={it.page === page ? "true" : undefined}
                    onClick={() => goTo(it.page)}
                  >
                    <span>{it.title}</span>
                    <span className="num">{it.page}</span>
                  </button>
                ))
              : ratios.map((r, i) => (
                  <Thumb
                    key={`${url}-t${i}`}
                    doc={doc}
                    n={i + 1}
                    ratio={r}
                    label={t.page(i + 1)}
                    current={page === i + 1}
                    onClick={() => goTo(i + 1)}
                  />
                ))}
          </nav>
        )}
        <div
          className="pdfv__scroll"
          ref={scroller}
          onScroll={onScroll}
          tabIndex={0}
          style={fsGap !== undefined ? { gap: fsGap, paddingBlock: fsGap / 2 } : undefined}
        >
          {fail ? (
            <div className="pdfv__state">
              <WarningIcon size={22} aria-hidden="true" />
              <span>{t.fail}</span>
              <a className="btn btn--sm" href={url} download={name}>
                <DownloadSimpleIcon size={16} aria-hidden="true" />
                {t.download}
              </a>
            </div>
          ) : !doc ? (
            <div className="pdfv__state">
              <span className="pdfv__spin" aria-hidden="true" />
              <span>{t.loading}</span>
            </div>
          ) : (
            ratios.map((_, i) => (
              <div
                key={`${url}-${i}`}
                ref={(el) => {
                  pageEls.current[i] = el;
                }}
                className="pdfv__page"
                data-page={i + 1}
                role="group"
                aria-label={t.page(i + 1)}
                style={{ width: pageW, height: Math.round(pageW * ratioOf(i)) }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
