/**
 * The reference snapshot's sanitizer (EXAM-ENGINE 8.1, prompt 09): an
 * allowlist over a real HTML parser. Every attack of 8.3's fixture list
 * stays out of the stored document, links leave nothing clickable, and
 * anchors still work.
 */
import { describe, expect, it } from "vitest";
import {
  contentSelectors,
  render,
  sanitize,
  selectFirst,
  verifySnapshot,
  type Sanitized,
} from "../recruitment/snapshot-sanitize";
import { parse } from "parse5";

const URL0 = "https://example.org/docs/page.html";

/** The whole stored document for a body, with every image skipped. */
function doc(html: string, selector?: string, url = URL0) {
  const s = sanitize(`<!doctype html><title>T</title><body>${html}</body>`, { url, selector });
  return { s, out: render(s, { images: new Map(), fetchedAt: new Date("2026-10-25T06:00:00Z") }) };
}
/** Only the body of the stored document. */
const body = (out: string) => out.slice(out.indexOf("<main"), out.indexOf("</main>") + 7);

const noViolations = (out: string) => expect(verifySnapshot(out)).toEqual([]);

describe("what is dropped", () => {
  it("script, with its content", () => {
    const { out } = doc(`<p>a</p><script>alert(1)</script><p>b</p>`);
    expect(body(out)).not.toMatch(/script|alert/i);
    expect(out).toContain("<p>a</p>");
    expect(out).toContain("<p>b</p>");
    noViolations(out);
  });

  it("every on* attribute and style, srcdoc, formaction, data-*", () => {
    const { out } = doc(
      `<p onclick="x()" style="background:url(http://evil/x.png)" data-a="1" onmouseover="y()" id="k" lang="id">t</p>`,
    );
    expect(body(out)).toContain('<p id="k" lang="id">t</p>');
    expect(body(out)).not.toMatch(/onclick|onmouseover|style=|data-a|url\(/i);
    noViolations(out);
  });

  it("javascript: links, also with an entity in the scheme, and data: html links", () => {
    for (const href of [
      "javascript:alert(1)",
      "jav&#x09;ascript:alert(1)",
      "  JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:x",
      "//evil.example/x",
    ]) {
      const { out } = doc(`<p><a href="${href}">go</a></p>`);
      expect(body(out), href).not.toMatch(/<a\b/);
      expect(body(out), href).not.toMatch(/href=/i);
      expect(body(out), href).toContain("go");
      noViolations(out);
    }
  });

  it("<base>, meta refresh, link and title in the body", () => {
    const { out } = doc(
      `<base href="https://evil/"><meta http-equiv="refresh" content="0;url=https://evil/"><link rel="stylesheet" href="https://evil/x.css"><p>ok</p>`,
    );
    expect(out).not.toMatch(/evil/);
    expect(out).not.toMatch(/<base|http-equiv|<link/i);
    noViolations(out);
  });

  it("form, controls, iframe, object, embed, template, noscript tricks", () => {
    const { out } = doc(
      [
        `<form action="https://evil/"><input name=a value=secret><button>Kirim</button><textarea>t</textarea><select><option>o</option></select></form>`,
        `<iframe src="https://evil/"></iframe><object data="https://evil/x"></object><embed src="https://evil/y">`,
        `<template><img src=x onerror=alert(1)></template>`,
        `<noscript><style></noscript><img src=x onerror=alert(1)></style></noscript>`,
        `<p>sisa</p>`,
      ].join(""),
    );
    const b = body(out);
    expect(b).not.toMatch(
      /<form|<input|<button|<textarea|<select|<option|<iframe|<object|<embed|<template/i,
    );
    expect(b).not.toMatch(/evil|onerror|alert|secret/i);
    expect(b).toContain("sisa");
    noViolations(out);
  });

  it("inline SVG becomes an image and its script goes", () => {
    const { s, out } = doc(
      `<p>a</p><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)"><script>alert(2)</script><foreignObject><div onclick="x()">h</div></foreignObject><rect width="5" height="5"/></svg>`,
    );
    expect(body(out)).not.toMatch(/<svg|<script|onload|alert|foreignObject/i);
    const job = s.jobs[0];
    expect(job.data).toMatch(/^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(job.data!.split(",")[1], "base64").toString("utf8");
    expect(svg).toContain("<rect");
    expect(svg).not.toMatch(/script|onload|alert|foreignObject|onclick/i);
    // The page with its image filled in has the data URI, nothing else.
    const full = render(s, { images: new Map([[job.id, job.data!]]), fetchedAt: new Date() });
    expect(full).toContain('src="data:image/svg+xml;base64,');
    noViolations(full);
  });

  it("math is dropped whole", () => {
    const { out } = doc(
      `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math><p>z</p>`,
    );
    expect(body(out)).not.toMatch(/math|alert|onerror/i);
    noViolations(out);
  });

  it("all page CSS, including <style> and url() to another host", () => {
    const { out } = doc(`<style>p{background:url(//evil/x.png)}</style><p style="color:red">t</p>`);
    expect(body(out)).not.toMatch(/style|url\(|evil/i);
    noViolations(out);
  });

  it("img with onerror, srcset and a source on another host keeps no URL at all", () => {
    const { s, out } = doc(
      `<img src="https://evil/x.png" srcset="https://evil/a.png 1x, https://evil/b.png 2x" onerror="alert(1)" alt="gambar">`,
    );
    // Before the fetch the page carries nothing but a placeholder.
    expect(body(out)).not.toMatch(/evil|onerror|srcset|https?:/i);
    expect(body(out)).toContain("[gambar dilewati]");
    // The fetcher is told which URLs to try, best first, as absolute addresses.
    expect(s.jobs[0].srcs[0]).toBe("https://evil/b.png");
    noViolations(out);
  });
});

describe("what is kept", () => {
  it("headings, lists, tables, code, definition lists, details", () => {
    const html = `
      <h2 id="a">Judul</h2><p>Isi <strong>tebal</strong> dan <code>kode</code></p>
      <ul><li>satu</li><li>dua</li></ul>
      <table><thead><tr><th colspan="2">H</th></tr></thead><tbody><tr><td rowspan="2">x</td><td>y</td></tr></tbody></table>
      <dl><dt>t</dt><dd>d</dd></dl><details><summary>s</summary>p</details>
      <pre class="language-cpp"><code>int x = 1;</code></pre>`;
    const { out } = doc(html);
    for (const frag of [
      '<h2 id="a">Judul</h2>',
      "<strong>tebal</strong>",
      "<li>dua</li>",
      '<th colspan="2">H</th>',
      '<td rowspan="2">x</td>',
      "<dt>t</dt><dd>d</dd>",
      "<details><summary>s</summary>p</details>",
    ])
      expect(body(out)).toContain(frag);
    noViolations(out);
  });

  it("unknown wrappers are unwrapped, their text stays", () => {
    const { out } = doc(
      `<nav><span>menu</span></nav><center><font color="red">hai</font></center>`,
    );
    expect(body(out)).toContain("menu");
    expect(body(out)).toContain("hai");
    expect(body(out)).not.toMatch(/<nav|<center|<font|color=/);
  });

  it("escapes text and attribute values", () => {
    const { out } = doc(`<p title='a"b<c'>1 &lt; 2 &amp; "q"</p>`);
    expect(body(out)).toContain('title="a&quot;b&lt;c"');
    expect(body(out)).toContain("1 &lt; 2 &amp; &quot;q&quot;");
    noViolations(out);
  });

  it("code blocks with a known language are re-highlighted, others are plain text", () => {
    const { out } = doc(
      `<div class="highlight highlight-source-c++"><pre><span class="pl-k">int</span> x = <span class="pl-c1">1</span>; // hai</pre></div>` +
        `<pre class="language-python"><code>print("a")</code></pre>` +
        `<pre><code>teks biasa</code></pre>`,
    );
    const b = body(out);
    expect(b).toContain('<span class="tok--type">int</span>');
    expect(b).toContain('<span class="tok--comment">// hai</span>');
    expect(b).toContain('<span class="tok--string">&quot;a&quot;</span>');
    expect(b).toContain("<pre><code>teks biasa</code></pre>");
    expect(b).not.toMatch(/pl-k|pl-c1/);
    noViolations(out);
  });
});

describe("links", () => {
  it("one that leaves the page is a dotted span with the address as a tooltip", () => {
    const { out } = doc(
      `<p><a href="https://other.example/x?y=1">ke luar</a> <a href="../up/z.html">relatif</a></p>`,
    );
    expect(body(out)).toContain(
      '<span class="ref-link" title="https://other.example/x?y=1">ke luar</span>',
    );
    expect(body(out)).toContain(
      '<span class="ref-link" title="https://example.org/up/z.html">relatif</span>',
    );
    expect(body(out)).not.toMatch(/<a\b/);
    noViolations(out);
  });

  it("an anchor to an id that exists stays a link", () => {
    const { out } = doc(`<h2 id="alat">Alat</h2><p><a href="#alat">lihat</a></p>`);
    expect(body(out)).toContain('<a href="#alat">lihat</a>');
    noViolations(out);
  });

  it("an anchor to nothing becomes inert", () => {
    const { out } = doc(`<p><a href="#hilang">x</a></p>`);
    expect(body(out)).not.toMatch(/<a\b/);
    expect(body(out)).toContain('<span class="ref-link">x</span>');
  });

  it("a GitHub anchor goes to user-content-", () => {
    const { out } = doc(
      `<h2>Isi<a id="user-content-pasang" class="anchor" href="#pasang">#</a></h2><p><a href="#pasang">pasang</a></p>`,
    );
    expect(body(out)).toContain('<a href="#user-content-pasang">pasang</a>');
    noViolations(out);
  });

  it("the page's own address with a fragment is an in-page link", () => {
    const { out } = doc(
      `<dt id="socket.socket">s</dt><p><a href="page.html#socket.socket">s</a></p>`,
    );
    expect(body(out)).toContain('<a href="#socket.socket">s</a>');
  });

  it("a named anchor without href keeps its id as a span", () => {
    const { out } = doc(`<a id="x" name="x"></a><p><a href="#x">go</a></p>`);
    expect(body(out)).toContain('<span id="x"></span>');
    expect(body(out)).toContain('<a href="#x">go</a>');
  });
});

describe("the content root", () => {
  const page = `<header>HEAD</header><nav>NAV</nav><main><article class="markdown-body">ISI</article></main><aside>SIDE</aside>`;

  it("takes the host's selector and drops the rest", () => {
    const { out, s } = doc(page, undefined, "https://github.com/a/b");
    expect(body(out)).toContain("ISI");
    expect(body(out)).not.toMatch(/HEAD|NAV|SIDE/);
    expect(s.rootSelector).toBe("article.markdown-body");
  });

  it("falls back from main to article to body", () => {
    expect(doc(`<p>x</p>`).s.rootSelector).toBe("body");
    expect(doc(`<article>A</article>`).s.rootSelector).toBe("article");
    expect(doc(`<div role="main">M</div>`).s.rootSelector).toBe("[role=main]");
  });

  it("an override wins, and a selector that finds nothing falls back", () => {
    expect(body(doc(`<div class="x">X</div><p>Y</p>`, ".x").out)).not.toContain("Y");
    const s = doc(`<p>only</p>`, "#nope").s;
    expect(s.rootSelector).toBe("body");
  });

  it("the selector engine reads tag, id, class, attribute and descendant", () => {
    const root = parse(
      `<body><main><article class="a b" data-k="v"><p id="p">x</p></article></main></body>`,
    );
    const hit = (sel: string) => selectFirst(root as never, sel) !== null;
    for (const sel of [
      "main article",
      "article.a.b",
      "main > article",
      "[data-k=v]",
      "p#p",
      "article p",
      "body",
    ])
      expect(hit(sel), sel).toBe(true);
    for (const sel of ["main > p", "article.c", "[data-k=w]", "section"])
      expect(hit(sel), sel).toBe(false);
  });

  it("default selectors per host", () => {
    expect(contentSelectors("github.com")[0]).toBe("article.markdown-body");
    expect(contentSelectors("docs.python.org")[0]).toBe("[role=main]");
    expect(contentSelectors("docs.arduino.cc")[0]).toBe("main article");
    expect(contentSelectors("anything.example").slice(0, 3)).toEqual([
      "main",
      "article",
      "[role=main]",
    ]);
  });
});

describe("images", () => {
  it("a data: image in the page is kept as it is, a lazy data-src is preferred", () => {
    const px = "data:image/png;base64,iVBORw0KGgo=";
    const { s } = doc(
      `<img src="${px}" alt="a"><img src="data:image/gif;base64,R0lGOD" data-src="/img/real.png" alt="b">`,
    );
    expect(s.jobs[0].data).toBe(px);
    expect(s.jobs[1].data).toBeUndefined();
    expect(s.jobs[1].srcs).toEqual(["https://example.org/img/real.png"]);
  });

  it("srcset: the largest candidate up to 1600 px", () => {
    const { s } = doc(`<img src="/s.png" srcset="/a.png 400w, /b.png 1200w, /c.png 3200w">`);
    expect(s.jobs[0].srcs[0]).toBe("https://example.org/b.png");
  });

  it("a data: URI that is not an image is not a job", () => {
    const { s, out } = doc(`<img src="data:text/html;base64,PHNjcmlwdD4=" alt="x">`);
    expect(s.jobs[0].data).toBeUndefined();
    expect(s.jobs[0].srcs).toEqual([]);
    expect(body(out)).toContain("[gambar dilewati]");
  });

  it("limits the jobs to forty", () => {
    const many = Array.from({ length: 55 }, (_, i) => `<img src="/i${i}.png">`).join("");
    const { s, out } = doc(many);
    expect(s.jobs.filter((j) => j.srcs.length > 0 || j.data)).toHaveLength(40);
    expect(body(out).match(/\[gambar dilewati\]/g)).toHaveLength(55);
  });

  it("a filled image carries only its data URI, size and alt", () => {
    const { s } = doc(`<img src="/a.png" width="100" height="50" alt="foto" title="t">`);
    const full = render(s, {
      images: new Map([[s.jobs[0].id, "data:image/png;base64,AAAA"]]),
      fetchedAt: new Date(),
    });
    expect(body(full)).toContain(
      '<img src="data:image/png;base64,AAAA" alt="foto" title="t" width="100" height="50">',
    );
    noViolations(full);
  });
});

describe("the stored document", () => {
  it("is self contained and says where it came from", () => {
    const { out, s } = doc(`<p>x</p>`);
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain('<meta charset="utf-8">');
    expect(out).toContain("<title>T</title>");
    expect(out).toContain("example.org");
    expect(out).toContain("25 Oktober 2026");
    expect(s.title).toBe("T");
    expect(out).not.toMatch(/<script|<link|https?:\/\/[^"' ]+\.(css|js)/);
  });

  it("takes the title from the first h1 when the page has none", () => {
    const s = sanitize(`<body><h1>Halo <em>dunia</em></h1><p>x</p></body>`, { url: URL0 });
    expect(s.title).toBe("Halo dunia");
  });

  it("the verifier flags what must never be there", () => {
    expect(
      verifySnapshot(`<!doctype html><html><body><script>1</script></body></html>`),
    ).not.toEqual([]);
    expect(
      verifySnapshot(`<!doctype html><html><body><p onclick="x">a</p></body></html>`),
    ).not.toEqual([]);
    expect(
      verifySnapshot(`<!doctype html><html><body><a href="https://x">a</a></body></html>`),
    ).not.toEqual([]);
    expect(
      verifySnapshot(`<!doctype html><html><body><img src="https://x/y.png"></body></html>`),
    ).not.toEqual([]);
    expect(
      verifySnapshot(`<!doctype html><html><body><p style="x">a</p></body></html>`),
    ).not.toEqual([]);
  });
});

/** A page of the kind 8.3 lists, run through the whole sanitizer as one attack bundle. */
describe("a hostile page in one piece", () => {
  it("leaves nothing the verifier objects to", () => {
    const hostile = [
      `<script src="https://evil/x.js"></script>`,
      `<a href="javascript:alert(1)" onclick="x()">1</a>`,
      `<a href="jav&#x09;ascript:alert(1)">2</a>`,
      `<a href="data:text/html;base64,PHNjcmlwdD4=">3</a>`,
      `<img src=x onerror=alert(1)>`,
      `<iframe srcdoc="<script>alert(1)</script>"></iframe>`,
      `<svg onload="alert(1)"><script>alert(2)</script></svg>`,
      `<div style="background:url(https://evil/x)">d</div>`,
      `<meta http-equiv=refresh content="0;url=https://evil/">`,
      `<base href="https://evil/">`,
      `<form action="https://evil/"><input name=a></form>`,
      `<object data="x"></object><embed src="y">`,
      `<p onmouseover="alert(1)" data-x="1" class="c" style="x">ok</p>`,
      `<img srcset="https://evil/a.png 1x" src="//evil/b.png">`,
    ].join("\n");
    const { out } = doc(hostile);
    noViolations(out);
    expect(out).not.toMatch(/alert|evil|javascript/i);
    expect(out).toContain("ok");
  });
});

// Typed so the unused type import stays honest.
export type _S = Sanitized;
