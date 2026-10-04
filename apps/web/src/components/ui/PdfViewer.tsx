/**
 * One PDF viewer for the whole app: the assistant's slides on the dashboard
 * and the public module handbook on every module page share it.
 *
 * Phase 9 (mockup PdfMock): the app's own viewer on pdf.js instead of the
 * browser's, so it looks and works the same on every browser and phone. A
 * dark bar carries the contents toggle (the PDF's own outline, or page
 * thumbnails when the file has none), the file
 * name, "page / pages · zoom", zoom out and in (60 to 200 %, 100 % fits the
 * width) and download. Pages render as they scroll into view.
 *
 * pdf.js loads only when a viewer mounts. If the file can't be read, the
 * viewer says so and still offers the download.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DownloadSimpleIcon,
  ListBulletsIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import IconButton from "./IconButton";
import Tooltip from "./Tooltip";
import type { Lang } from "../../lib/kelas";
import { dict } from "../../lib/app";
import "./PdfViewer.css";

const T = dict({
  id: {
    contents: "Daftar Isi",
    zoomOut: "Perkecil",
    zoomIn: "Perbesar",
    download: "Unduh",
    loading: "Memuat berkas...",
    fail: "Berkas ini tidak bisa ditampilkan. Unduh untuk membukanya.",
    page: (n: number) => `Halaman ${n}`,
  },
  en: {
    contents: "Contents",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    download: "Download",
    loading: "Loading the file...",
    fail: "This file can't be shown here. Download it to open it.",
    page: (n: number) => `Page ${n}`,
  },
  zh: {
    contents: "目录",
    zoomOut: "缩小",
    zoomIn: "放大",
    download: "下载",
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

const ZOOM_MIN = 60;
const ZOOM_MAX = 200;
const ZOOM_STEP = 20;

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

export default function PdfViewer({
  url,
  name,
  lang,
  shape = "slides",
}: {
  url: string;
  name: string;
  lang: Lang;
  /** "slides" is 16:9; "page" is a tall frame for documents. */
  shape?: "slides" | "page";
}) {
  const t = T[lang];
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [fail, setFail] = useState(false);
  const [ratios, setRatios] = useState<number[]>([]);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);

  // Load the file (again when the address changes).
  useEffect(() => {
    let dead = false;
    let task: ReturnType<Pdfjs["getDocument"]> | null = null;
    setDoc(null);
    setFail(false);
    setToc([]);
    setPage(1);
    loadPdfjs()
      .then((lib) => {
        if (dead) return null;
        task = lib.getDocument({ url });
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

  // The page width follows the frame (100 % fits it) and the zoom.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [doc]);
  const fit = Math.max(0, Math.min(width - 32, shape === "page" ? 900 : 1600));
  const pageW = Math.round((fit * zoom) / 100);

  // Render the pages in view (and re-render them after a zoom).
  useEffect(() => {
    if (!doc || !pageW) return;
    const tasks = new Map<number, RenderTask>();
    const done = new Set<number>();
    const draw = async (i: number) => {
      if (done.has(i)) return;
      done.add(i);
      const host = pageEls.current[i - 1];
      if (!host) return;
      const pg = await doc.getPage(i);
      const base = pg.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = pg.getViewport({ scale: (pageW / base.width) * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.setAttribute("aria-hidden", "true");
      const task = pg.render({ canvas, viewport: vp });
      tasks.set(i, task);
      try {
        await task.promise;
        host.querySelector("canvas")?.remove();
        host.appendChild(canvas);
      } catch {
        /* cancelled by a newer zoom */
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
      io.disconnect();
      tasks.forEach((task) => task.cancel());
    };
  }, [doc, pageW]);

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

  // Keep the same page in view across a zoom.
  const zoomTo = (z: number) => {
    const keep = page;
    setZoom(z);
    requestAnimationFrame(() => pageEls.current[keep - 1]?.scrollIntoView({ block: "start" }));
  };

  const goTo = (n: number) => {
    const el = pageEls.current[n - 1];
    const box = scroller.current;
    if (!el || !box) return;
    box.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
    if (window.matchMedia("(max-width: 719px)").matches) setTocOpen(false);
  };

  const pages = doc?.numPages ?? 0;
  return (
    <div className="pdfv" data-shape={shape}>
      <div className="pdfv__bar">
        <IconButton
          icon={ListBulletsIcon}
          label={t.contents}
          sm
          pressed={tocOpen}
          disabled={!doc}
          onClick={() => setTocOpen((o) => !o)}
        />
        <b className="pdfv__name" title={name}>
          {name}
        </b>
        <span className="num pdfv__pos" aria-live="polite">
          {pages ? `${page} / ${pages} · ${zoom}%` : `${zoom}%`}
        </span>
        <IconButton
          icon={MagnifyingGlassMinusIcon}
          label={t.zoomOut}
          sm
          disabled={zoom <= ZOOM_MIN}
          onClick={() => zoomTo(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
        />
        <IconButton
          icon={MagnifyingGlassPlusIcon}
          label={t.zoomIn}
          sm
          disabled={zoom >= ZOOM_MAX}
          onClick={() => zoomTo(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
        />
        <Tooltip label={t.download}>
          <a className="iconbtn iconbtn--sm" href={url} download={name} aria-label={t.download}>
            <DownloadSimpleIcon aria-hidden="true" />
          </a>
        </Tooltip>
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
        <div className="pdfv__scroll" ref={scroller} onScroll={onScroll} tabIndex={0}>
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
            ratios.map((r, i) => (
              <div
                key={`${url}-${i}`}
                ref={(el) => {
                  pageEls.current[i] = el;
                }}
                className="pdfv__page"
                data-page={i + 1}
                role="img"
                aria-label={t.page(i + 1)}
                style={{ width: pageW, height: Math.round(pageW * r) }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
