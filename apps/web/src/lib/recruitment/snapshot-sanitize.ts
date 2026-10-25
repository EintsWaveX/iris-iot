/**
 * Reference snapshots, the sanitizer (EXAM-ENGINE 8.1, prompt 09). Pure: a
 * page's HTML in, a self contained document out, and no network here (the
 * API fetches the images this module asks for).
 *
 * The page is read by a real HTML parser (parse5) and written again from an
 * allowlist, never by a regex over HTML:
 * - Tags outside the list are unwrapped (their text stays); script, style,
 *   template, iframe, object, embed, form, the form controls, math, base,
 *   meta and link go with their content.
 * - Attributes outside the list go: every on*, style, srcdoc, formaction,
 *   xlink:href and data-*. All page CSS goes; the stored document carries
 *   IRIS's own reader stylesheet.
 * - A link to the same page stays a link, every other one becomes an inert
 *   span with the address as a tooltip.
 * - An image is named in a job; the API fetches it with the same guards as
 *   the page and puts a `data:` URI in its place. An inline <svg> becomes an
 *   <img> with a data URI, because SVG loaded as an image never runs script.
 *
 * `verifySnapshot` reads a stored document back with the same parser and
 * lists everything the allowlist would not have written; the API refuses to
 * store a document that has any.
 */
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { tokenize } from "../highlight.js";

type PNode = DefaultTreeAdapterMap["node"];
type PElement = DefaultTreeAdapterMap["element"];
type PParent = DefaultTreeAdapterMap["parentNode"];

/* ------------------------------------------------------------------ types */

export type SNode =
  | { t: "text"; v: string }
  | { t: "el"; tag: string; a: Record<string, string>; k: SNode[]; job?: number };

export interface ImgJob {
  id: number;
  /** Absolute URLs to try, best first; empty when there is nothing to fetch */
  srcs: string[];
  /** Ready made: an image that was already a data: URI, or an inline <svg> */
  data?: string;
  alt: string;
  title?: string;
  width?: string;
  height?: string;
}

export interface Sanitized {
  title: string;
  host: string;
  url: string;
  rootSelector: string;
  root: SNode[];
  jobs: ImgJob[];
}

export interface SanitizeOptions {
  /** The address the page was fetched from (after redirects) */
  url: string;
  /** Overrides the host's default content root */
  selector?: string;
}

export const MAX_IMAGES = 40;
export const MAX_IMAGE_BYTES = 1024 * 1024;
/** srcset candidates above this width are not worth the bytes */
const SRCSET_MAX_W = 1600;

/* -------------------------------------------------------------- allowlist */

const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "template",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "option",
  "optgroup",
  "datalist",
  "math",
  "base",
  "meta",
  "link",
  "title",
  "head",
  "audio",
  "video",
  "canvas",
  "source",
  "track",
  "param",
  "dialog",
]);

const KEEP = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "div",
  "span",
  "section",
  "article",
  "header",
  "footer",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  "pre",
  "code",
  "kbd",
  "samp",
  "var",
  "blockquote",
  "em",
  "strong",
  "b",
  "i",
  "u",
  "s",
  "sub",
  "sup",
  "small",
  "mark",
  "br",
  "hr",
  "img",
  "figure",
  "figcaption",
  "details",
  "summary",
  "a",
]);
const VOID = new Set(["br", "hr", "img", "col"]);

/** Attributes any kept tag may carry */
const ATTR_ANY = new Set(["id", "lang", "dir", "title"]);
const ATTR_TAG: Record<string, string[]> = {
  th: ["colspan", "rowspan"],
  td: ["colspan", "rowspan"],
  col: ["span"],
  colgroup: ["span"],
  img: ["alt", "width", "height"],
};
const ID_OK = /^[\w:.\-]{1,200}$/;
const NUM_OK = /^\d{1,5}$/;

/* ---------------------------------------------------------------- helpers */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const isEl = (n: PNode): n is PElement => "tagName" in n;
const kids = (n: PNode): PNode[] => ("childNodes" in n ? n.childNodes : []);
const attr = (n: PElement, name: string) => n.attrs.find((a) => a.name === name)?.value;

function textOf(n: PNode): string {
  if (n.nodeName === "#text") return (n as DefaultTreeAdapterMap["textNode"]).value;
  if (isEl(n)) {
    if (n.tagName === "br") return "\n";
    if (DROP_WITH_CONTENT.has(n.tagName) && n.tagName !== "title") return "";
  }
  return kids(n).map(textOf).join("");
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function absolute(href: string | undefined, base: string): URL | null {
  if (!href) return null;
  try {
    return new URL(href.trim(), base);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- selector engine */

interface Simple {
  tag?: string;
  id?: string;
  classes: string[];
  attrs: { name: string; value?: string }[];
}
type Step = { simple: Simple; child: boolean };

function parseSelector(sel: string): Step[] | null {
  const out: Step[] = [];
  const toks = sel
    .trim()
    .replace(/\s*>\s*/g, " > ")
    .split(/\s+/)
    .filter(Boolean);
  let child = false;
  for (const tok of toks) {
    if (tok === ">") {
      child = true;
      continue;
    }
    const s: Simple = { classes: [], attrs: [] };
    const re = /^([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=([^\]]*))?\]/y;
    let pos = 0;
    while (pos < tok.length) {
      re.lastIndex = pos;
      const m = re.exec(tok);
      if (!m) return null;
      if (m[1]) s.tag = m[1].toLowerCase();
      else if (m[2]) s.id = m[2];
      else if (m[3]) s.classes.push(m[3]);
      else if (m[4]) s.attrs.push({ name: m[4], value: m[5]?.replace(/^["']|["']$/g, "") });
      pos = re.lastIndex;
    }
    out.push({ simple: s, child });
    child = false;
  }
  return out.length ? out : null;
}

function matchSimple(n: PElement, s: Simple): boolean {
  if (s.tag && n.tagName !== s.tag) return false;
  if (s.id && attr(n, "id") !== s.id) return false;
  if (s.classes.length) {
    const have = (attr(n, "class") ?? "").split(/\s+/);
    if (!s.classes.every((c) => have.includes(c))) return false;
  }
  return s.attrs.every((a) => {
    const v = attr(n, a.name);
    return a.value === undefined ? v !== undefined : v === a.value;
  });
}

/** Matches the last step on `n`, and the steps before it on its ancestors. */
function matchChain(n: PElement, steps: Step[], i: number, parents: PElement[]): boolean {
  if (!matchSimple(n, steps[i].simple)) return false;
  if (i === 0) return true;
  const up = parents;
  if (steps[i].child) {
    const p = up[up.length - 1];
    return !!p && matchChain(p, steps, i - 1, up.slice(0, -1));
  }
  for (let j = up.length - 1; j >= 0; j--)
    if (matchChain(up[j], steps, i - 1, up.slice(0, j))) return true;
  return false;
}

/** The first element in document order matching the selector, or null. */
export function selectFirst(root: PNode, sel: string): PElement | null {
  const steps = parseSelector(sel);
  if (!steps) return null;
  let found: PElement | null = null;
  const walk = (n: PNode, parents: PElement[]) => {
    if (found) return;
    if (isEl(n) && matchChain(n, steps, steps.length - 1, parents)) {
      found = n;
      return;
    }
    const next = isEl(n) ? [...parents, n] : parents;
    for (const c of kids(n)) walk(c, next);
  };
  walk(root, []);
  return found;
}

/** The content root candidates for a host, in order (8.1 step 3). */
export function contentSelectors(host: string, override?: string): string[] {
  const o = override?.trim();
  const h = host.toLowerCase();
  const base =
    h === "github.com" || h.endsWith(".github.com")
      ? ["article.markdown-body"]
      : h === "docs.arduino.cc"
        ? ["main article", "main"]
        : h === "docs.python.org" ||
            h === "docs.espressif.com" ||
            h.endsWith(".readthedocs.io") ||
            h.endsWith(".readthedocs.org")
          ? ["[role=main]", "div.body"]
          : [];
  const generic = ["main", "article", "[role=main]", "body"];
  return [...(o ? [o] : []), ...base, ...generic.filter((g) => !base.includes(g))];
}

/* ------------------------------------------------------------------- svg */

const SVG_TAGS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "title",
  "desc",
  "symbol",
  "marker",
]);
const SVG_ATTR_BAD = /^(on|href$|xlink:href$|style$|src$|srcdoc$|formaction$)/i;

function svgNode(n: PNode): string {
  if (n.nodeName === "#text") return esc((n as DefaultTreeAdapterMap["textNode"]).value);
  if (!isEl(n) || !SVG_TAGS.has(n.tagName)) return "";
  let attrs = "";
  for (const a of n.attrs) {
    const name = a.prefix ? `${a.prefix}:${a.name}` : a.name;
    if (!/^[A-Za-z][\w:.-]*$/.test(name) || SVG_ATTR_BAD.test(name)) continue;
    if (/url\(\s*(?!["']?#)/i.test(a.value) || /javascript:/i.test(a.value)) continue;
    if (name === "xmlns") continue;
    attrs += ` ${name}="${esc(a.value)}"`;
  }
  return `<${n.tagName}${attrs}>${kids(n).map(svgNode).join("")}</${n.tagName}>`;
}

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** An inline <svg>, with script and everything unsafe left out, as an image. */
function svgToDataUri(n: PElement): string | null {
  const inner = svgNode(n).replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (inner.length > MAX_IMAGE_BYTES) return null;
  return `data:image/svg+xml;base64,${toBase64(inner)}`;
}

/**
 * An SVG file fetched as an image, sanitized the same way as an inline one
 * (script, foreignObject, event handlers and external references go), or
 * null when it is not an SVG or is too big.
 */
export function svgFileToDataUri(text: string): string | null {
  if (text.length > MAX_IMAGE_BYTES) return null;
  const doc = parse(text.replace(/^﻿/, "").replace(/<\?xml[^>]*\?>/i, ""), {
    scriptingEnabled: false,
  });
  const svg = selectFirst(doc, "svg");
  return svg ? svgToDataUri(svg) : null;
}

/* ------------------------------------------------------------- languages */

const LANG_CLASS: [RegExp, "cpp" | "py"][] = [
  [/(?:^|[\s-])(?:language|lang)-(?:cpp|c\+\+|c|ino|arduino|cxx|hpp|h)(?:\s|$)/i, "cpp"],
  [/(?:^|\s)highlight-source-(?:c\+\+|c|cpp|arduino|ino)(?:\s|$)/i, "cpp"],
  [/(?:^|\s)highlight-(?:cpp|c|arduino|ino|c\+\+)(?:\s|$)/i, "cpp"],
  [/(?:^|[\s-])(?:language|lang)-(?:py|python|python3|py3)(?:\s|$)/i, "py"],
  [/(?:^|\s)highlight-source-python(?:\s|$)/i, "py"],
  [/(?:^|\s)highlight-(?:python|python3|py|default)(?:\s|$)/i, "py"],
];
function langFrom(classes: string): "cpp" | "py" | null {
  for (const [re, l] of LANG_CLASS) if (re.test(classes)) return l;
  return null;
}
const MAX_HIGHLIGHT = 20_000;

/* --------------------------------------------------------------- the walk */

const ANCHOR_ID = /^[\w:.\-]+$/;

interface Ctx {
  base: URL;
  jobs: ImgJob[];
  ids: Set<string>;
  /** Class strings of the ancestors, for the language of a code block */
  classes: string;
}

function imageSrcs(n: PElement, base: URL): string[] {
  const out: string[] = [];
  const add = (u: string | undefined) => {
    const a = absolute(u, base.href);
    if (a && (a.protocol === "http:" || a.protocol === "https:") && !out.includes(a.href))
      out.push(a.href);
  };
  const lazy = attr(n, "data-src") ?? attr(n, "data-original") ?? attr(n, "data-lazy-src");
  const set = attr(n, "srcset") ?? attr(n, "data-srcset");
  if (set) {
    const cands = set
      .split(",")
      .map((c) => c.trim().split(/\s+/))
      .filter((c) => c[0])
      .map(([u, d]) => ({
        u,
        w: d?.endsWith("w") ? Number(d.slice(0, -1)) : 0,
        x: d?.endsWith("x") ? Number(d.slice(0, -1)) : 1,
      }));
    const byW = cands.filter((c) => c.w > 0 && c.w <= SRCSET_MAX_W).sort((a, b) => b.w - a.w);
    const byX = cands.filter((c) => c.w === 0).sort((a, b) => b.x - a.x);
    for (const c of [...byW, ...byX]) add(c.u);
  }
  add(lazy);
  const src = attr(n, "src");
  // A lazy placeholder is not worth fetching when the real address is named.
  if (!(lazy && (!src || src.startsWith("data:")))) add(src);
  return out;
}

const DATA_IMG = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i;

function imageNode(n: PElement, ctx: Ctx): SNode {
  const id = ctx.jobs.length;
  const job: ImgJob = {
    id,
    srcs: [],
    alt: attr(n, "alt") ?? "",
    title: attr(n, "title"),
    width: NUM_OK.test(attr(n, "width") ?? "") ? attr(n, "width") : undefined,
    height: NUM_OK.test(attr(n, "height") ?? "") ? attr(n, "height") : undefined,
  };
  const src = (attr(n, "src") ?? "").trim();
  const lazy = attr(n, "data-src") ?? attr(n, "data-original") ?? attr(n, "data-lazy-src");
  if (DATA_IMG.test(src) && !lazy && src.length <= MAX_IMAGE_BYTES * 1.4) job.data = src;
  else job.srcs = imageSrcs(n, ctx.base);
  ctx.jobs.push(job);
  return { t: "el", tag: "img", a: {}, k: [], job: id };
}

function codeNode(n: PElement, ctx: Ctx): SNode {
  const text = textOf(n).replace(/^\n/, "");
  const lang = langFrom(
    `${ctx.classes} ${attr(n, "class") ?? ""} ${kids(n)
      .map((c) => (isEl(c) ? (attr(c, "class") ?? "") : ""))
      .join(" ")}`,
  );
  let inner: SNode[];
  if (lang && text.length <= MAX_HIGHLIGHT) {
    inner = tokenize(text, lang).map((tk) =>
      tk.kind
        ? { t: "el", tag: "span", a: { class: `tok--${tk.kind}` }, k: [{ t: "text", v: tk.text }] }
        : { t: "text", v: tk.text },
    );
  } else inner = [{ t: "text", v: text }];
  return {
    t: "el",
    tag: "pre",
    a: {},
    k: [{ t: "el", tag: "code", a: lang ? { class: `language-${lang}` } : {}, k: inner }],
  };
}

function walk(n: PNode, ctx: Ctx): SNode[] {
  if (n.nodeName === "#text") {
    const v = (n as DefaultTreeAdapterMap["textNode"]).value;
    return v ? [{ t: "text", v }] : [];
  }
  if (!isEl(n)) return [];
  const tag = n.tagName;
  if (n.namespaceURI === "http://www.w3.org/2000/svg") {
    if (tag !== "svg") return [];
    const uri = svgToDataUri(n);
    const id = ctx.jobs.length;
    ctx.jobs.push({ id, srcs: [], data: uri ?? undefined, alt: "" });
    return [{ t: "el", tag: "img", a: {}, k: [], job: id }];
  }
  if (n.namespaceURI !== "http://www.w3.org/1999/xhtml") return [];
  if (DROP_WITH_CONTENT.has(tag)) return [];
  if (tag === "img") return [imageNode(n, ctx)];
  if (tag === "pre") return [codeNode(n, ctx)];
  const here = { ...ctx, classes: `${ctx.classes} ${attr(n, "class") ?? ""}` };
  const inner = kids(n).flatMap((c) => walk(c, here));
  if (!KEEP.has(tag)) return inner;
  const a: Record<string, string> = {};
  const allow = ATTR_TAG[tag] ?? [];
  for (const at of n.attrs) {
    if (at.name === "id") {
      if (ID_OK.test(at.value)) {
        a.id = at.value;
        ctx.ids.add(at.value);
      }
    } else if (ATTR_ANY.has(at.name) && at.name !== "id") {
      if (at.name === "dir" ? /^(ltr|rtl|auto)$/i.test(at.value) : true) a[at.name] = at.value;
    } else if (allow.includes(at.name) && at.name !== "alt" && NUM_OK.test(at.value))
      a[at.name] = at.value;
  }
  if (tag === "a") {
    const el: SNode = { t: "el", tag: "a", a: { ...a }, k: inner };
    const href = attr(n, "href");
    if (href !== undefined) el.a["data-href"] = href;
    return [el];
  }
  if (tag === "code") {
    const cls = attr(n, "class") ?? "";
    const l = langFrom(cls);
    if (l) a.class = `language-${l}`;
  }
  return [{ t: "el", tag, a, k: inner }];
}

/* ----------------------------------------------------------------- links */

/** The address of `u` without its fragment */
const bare = (u: URL) => `${u.origin}${u.pathname}${u.search}`;

function resolveLinks(nodes: SNode[], ctx: Ctx): SNode[] {
  return nodes.map((n): SNode => {
    if (n.t !== "el") return n;
    const k = resolveLinks(n.k, ctx);
    if (n.tag !== "a") return { ...n, k };
    const href = n.a["data-href"];
    const keep = { ...n.a };
    delete keep["data-href"];
    const span = (title?: string): SNode => ({
      t: "el",
      tag: "span",
      a: { ...(keep.id ? { id: keep.id } : {}), class: "ref-link", ...(title ? { title } : {}) },
      k,
    });
    // A named anchor with no address: keep its id for links that point at it.
    if (href === undefined)
      return k.length === 0 && !keep.id
        ? { t: "text", v: "" }
        : { t: "el", tag: "span", a: keep.id ? { id: keep.id } : {}, k };
    const h = href.trim();
    let frag: string | null = null;
    let abs: URL | null = null;
    if (h.startsWith("#")) frag = h.slice(1);
    else {
      abs = absolute(h, ctx.base.href);
      if (
        abs &&
        (abs.protocol === "http:" || abs.protocol === "https:") &&
        bare(abs) === bare(ctx.base)
      )
        frag = abs.hash.slice(1);
    }
    if (frag !== null) {
      let f = frag;
      try {
        f = decodeURIComponent(frag);
      } catch {
        /* keep as written */
      }
      const target = ctx.ids.has(f)
        ? f
        : ctx.ids.has(`user-content-${f}`)
          ? `user-content-${f}`
          : null;
      if (target && ANCHOR_ID.test(target))
        return { t: "el", tag: "a", a: { ...keep, href: `#${target}` }, k };
      return span();
    }
    if (
      abs &&
      (abs.protocol === "http:" || abs.protocol === "https:") &&
      !abs.username &&
      !abs.password
    )
      return span(abs.href);
    return span();
  });
}

/* ------------------------------------------------------------- sanitize */

/** A page's HTML as the allowlist keeps it, with the images it wants fetched. */
export function sanitize(html: string, opt: SanitizeOptions): Sanitized {
  const doc = parse(html, { scriptingEnabled: false });
  const base = new URL(opt.url);
  const host = base.host;
  let rootEl: PElement | null = null;
  let rootSelector = "body";
  for (const sel of contentSelectors(host, opt.selector)) {
    const hit = selectFirst(doc, sel);
    if (hit) {
      rootEl = hit;
      rootSelector = sel;
      break;
    }
  }
  const ctx: Ctx = { base, jobs: [], ids: new Set(), classes: "" };
  const walked = rootEl ? kids(rootEl).flatMap((c) => walk(c, ctx)) : [];
  // The first <title>, else the first <h1>.
  const t = selectFirst(doc, "title");
  const h1 = selectFirst(doc, "h1");
  const title = squash(t ? textOf(t) : "") || squash(h1 ? textOf(h1) : "") || host;
  const root = resolveLinks(walked, ctx);
  // Past the cap an image is skipped, however it was named.
  let live = 0;
  for (const j of ctx.jobs) {
    if (j.data || j.srcs.length) {
      if (++live > MAX_IMAGES) {
        j.data = undefined;
        j.srcs = [];
      }
    }
  }
  return { title, host, url: base.href, rootSelector, root, jobs: ctx.jobs };
}

/* ---------------------------------------------------------------- render */

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
/** A full date in WIB, like the rest of the copy */
function dateWib(d: Date): string {
  const w = new Date(d.getTime() + 7 * 3600_000);
  return `${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]} ${w.getUTCFullYear()}`;
}

function ser(n: SNode, images: Map<number, string>, jobs: ImgJob[]): string {
  if (n.t === "text") return esc(n.v);
  if (n.tag === "img" && n.job !== undefined) {
    const data = images.get(n.job);
    const job = jobs[n.job];
    if (!data || !DATA_IMG.test(data)) return '<span class="ref-skip">[gambar dilewati]</span>';
    let s = `<img src="${data}" alt="${esc(job?.alt ?? "")}"`;
    if (job?.title) s += ` title="${esc(job.title)}"`;
    if (job?.width) s += ` width="${job.width}"`;
    if (job?.height) s += ` height="${job.height}"`;
    return `${s}>`;
  }
  let at = "";
  for (const [k, v] of Object.entries(n.a)) at += ` ${k}="${esc(v)}"`;
  if (VOID.has(n.tag)) return `<${n.tag}${at}>`;
  return `<${n.tag}${at}>${n.k.map((c) => ser(c, images, jobs)).join("")}</${n.tag}>`;
}

/**
 * IRIS's own reader look for every source. Nothing in it loads anything: the
 * served document's CSP allows inline style, data: images and nothing else.
 */
export const READER_CSS = `
:root{color-scheme:dark light;--bg:#0f1218;--fg:#e4e7ee;--dim:#98a1b3;--line:rgba(255,255,255,.1);--code:rgba(255,255,255,.06);--acc:#9db4ff;--kw:#c3a6ff;--ty:#6fd6e3;--st:#8fe3b0;--nu:#f5c77e;--fn:#7cc4ff;--pp:#ff9ecf;--co:#ffb38a}
@media (prefers-color-scheme:light){:root{--bg:#fbfbfd;--fg:#1b2030;--dim:#5b6478;--line:rgba(0,0,0,.12);--code:rgba(0,0,0,.05);--acc:#3558d6;--kw:#6a3fc8;--ty:#0a6f7c;--st:#1d7a3e;--nu:#8a5a00;--fn:#0b5ea8;--pp:#b0236e;--co:#a04a12}}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;padding:0 18px 48px;color:var(--fg);font:15px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere}
.ref-head{display:flex;flex-direction:column;gap:2px;padding:16px 0 12px;margin-bottom:14px;border-bottom:1px solid var(--line)}
.ref-head b{font-size:17px}
.ref-head span{color:var(--dim);font-size:12px}
.ref-body{max-width:78ch;margin:0 auto}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.5em 0 .5em}
h1{font-size:1.5em}h2{font-size:1.3em}h3{font-size:1.12em}
p,ul,ol,dl,table,pre,blockquote,details,figure{margin:0 0 1em}
ul,ol{padding-left:1.4em}
dt{font-weight:600;margin-top:.6em}
dd{margin:0 0 .4em 1.2em}
code,kbd,samp,var{font:.92em/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
:not(pre)>code,kbd,samp{background:var(--code);padding:.1em .35em;border-radius:4px}
pre{background:var(--code);padding:12px 14px;border-radius:8px;overflow:auto;border:1px solid var(--line)}
pre code{font-variant-ligatures:none;white-space:pre;background:none;padding:0}
blockquote{margin-left:0;padding:.1em 1em;border-left:3px solid var(--line);color:var(--dim)}
table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%}
th,td{border:1px solid var(--line);padding:6px 10px;vertical-align:top;text-align:left}
th{background:var(--code)}
img{max-width:100%;height:auto}
hr{border:0;border-top:1px solid var(--line);margin:1.5em 0}
summary{cursor:pointer;color:var(--acc)}
a{color:var(--acc);text-decoration:underline}
.ref-link{text-decoration:underline dotted;text-underline-offset:3px;text-decoration-color:var(--dim);cursor:default}
.ref-skip{color:var(--dim);font-style:italic}
.tok--keyword{color:var(--kw)}.tok--type{color:var(--ty)}.tok--string{color:var(--st)}.tok--number{color:var(--nu)}.tok--func{color:var(--fn)}.tok--preproc,.tok--deco{color:var(--pp)}.tok--const{color:var(--co)}.tok--comment{color:var(--dim);font-style:italic}
`
  .replace(/\n+/g, "\n")
  .trim();

export interface RenderOptions {
  /** Job id to the data: URI the API fetched for it */
  images: Map<number, string>;
  fetchedAt: Date;
}

/** The stored document: reader stylesheet, a header line, the sanitized page. */
export function render(s: Sanitized, opt: RenderOptions): string {
  const body = s.root.map((n) => ser(n, opt.images, s.jobs)).join("");
  return [
    "<!doctype html>",
    '<html lang="id"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(s.title)}</title>`,
    `<style>${READER_CSS}</style></head><body>`,
    `<header class="ref-head"><b>${esc(s.title)}</b><span>${esc(s.host)} · diambil ${dateWib(opt.fetchedAt)}</span></header>`,
    `<main class="ref-body">${body}</main>`,
    "</body></html>",
  ].join("\n");
}

/* ---------------------------------------------------------------- verify */

const OUT_TAGS = new Set([...KEEP, "html", "head", "body", "title", "meta", "style", "main"]);
const OUT_ATTR_ANY = new Set([
  "id",
  "lang",
  "dir",
  "title",
  "colspan",
  "rowspan",
  "span",
  "width",
  "height",
  "alt",
]);
const CLASS_OK =
  /^(ref-link|ref-skip|ref-head|ref-body|tok--(keyword|type|string|number|func|preproc|deco|const|comment)|language-(cpp|py))$/;

/** Everything in a stored document the allowlist would not have written. */
export function verifySnapshot(html: string): string[] {
  const bad: string[] = [];
  const doc = parse(html, { scriptingEnabled: false });
  let styles = 0;
  const visit = (n: PNode, inBody: boolean) => {
    if (isEl(n)) {
      const tag = n.tagName;
      if (!OUT_TAGS.has(tag) || n.namespaceURI !== "http://www.w3.org/1999/xhtml")
        bad.push(`<${tag}>`);
      if (tag === "style") {
        if (++styles > 1 || inBody) bad.push("<style>");
        const css = kids(n).map(textOf).join("");
        if (/url\(|@import|expression\(/i.test(css)) bad.push("css");
      }
      if (tag === "meta") {
        const ok =
          (n.attrs.length === 1 && n.attrs[0].name === "charset") ||
          (attr(n, "name") === "viewport" && n.attrs.length === 2);
        if (!ok) bad.push("<meta>");
      }
      for (const a of n.attrs) {
        const name = a.name;
        if (/^on/i.test(name) || name === "style" || name === "srcdoc" || name === "formaction") {
          bad.push(`${tag}@${name}`);
        } else if (name === "class") {
          if (!a.value.split(/\s+/).every((c) => CLASS_OK.test(c))) bad.push(`${tag}@class`);
        } else if (name === "href") {
          if (tag !== "a" || !a.value.startsWith("#")) bad.push(`${tag}@href`);
        } else if (name === "src") {
          if (tag !== "img" || !DATA_IMG.test(a.value)) bad.push(`${tag}@src`);
        } else if (name === "charset" || name === "name" || name === "content") {
          if (tag !== "meta") bad.push(`${tag}@${name}`);
        } else if (!OUT_ATTR_ANY.has(name)) bad.push(`${tag}@${name}`);
      }
    }
    const inside = inBody || (isEl(n) && n.tagName === "body");
    for (const c of kids(n)) visit(c, inside);
  };
  visit(doc as PParent, false);
  return bad;
}
