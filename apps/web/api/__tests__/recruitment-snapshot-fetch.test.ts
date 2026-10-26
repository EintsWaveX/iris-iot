/**
 * The snapshot fetcher's guards (EXAM-ENGINE 8.1, prompt 09) against a fake
 * network: every redirect is checked like the first request, a name that has
 * one private answer is refused, and the connection goes to the address that
 * was checked.
 */
import { describe, expect, it } from "vitest";
import {
  SnapshotError,
  decodeHtml,
  fetchGuarded,
  kunciRef,
  snapshotUpload,
  snapshotUrl,
  type GetOptions,
  type Net,
  type RawResponse,
} from "../_lib/recruitment-snapshot";
import { verifySnapshot } from "../../src/lib/recruitment/snapshot-sanitize";

const enc = (s: string) => new TextEncoder().encode(s);
const html = (body: string, ct = "text/html; charset=utf-8"): RawResponse => ({
  status: 200,
  headers: { "content-type": ct },
  body: enc(body),
});
const redirect = (to: string, status = 302): RawResponse => ({
  status,
  headers: { location: to },
  body: new Uint8Array(),
});
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/** A fake network: DNS from a table, pages from another, every request recorded. */
function fake(
  pages: Record<string, RawResponse | (() => Promise<RawResponse>)>,
  dns: Record<string, string[]> = {},
) {
  const log: { url: string; ip: string }[] = [];
  const net: Net = {
    async resolve(host) {
      const a = dns[host] ?? ["93.184.216.34"];
      if (a.length === 0) throw new Error("ENOTFOUND");
      return a;
    },
    async get(url, ip) {
      log.push({ url: url.href, ip });
      const p = pages[url.href];
      if (!p) return { status: 404, headers: {}, body: new Uint8Array() };
      return typeof p === "function" ? p() : p;
    },
  };
  return { net, log };
}
const opt = (): GetOptions => ({
  maxBytes: 1000,
  accept: "*/*",
  signal: new AbortController().signal,
});
const fails = async (p: Promise<unknown>, kode: string) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e, kode).toBeInstanceOf(SnapshotError);
  expect((e as SnapshotError).kode).toBe(kode);
};

describe("fetchGuarded", () => {
  it("connects to the address it checked, not to the name", async () => {
    const g = fake({ "https://b.example/x": html("hi") }, { "b.example": ["93.184.216.34"] });
    await fetchGuarded("https://b.example/x", g.net, opt());
    expect(g.log).toEqual([{ url: "https://b.example/x", ip: "93.184.216.34" }]);
  });

  it("refuses a name when any one of its answers is private", async () => {
    const f = fake(
      { "https://a.example/": html("x") },
      { "a.example": ["93.184.216.34", "10.0.0.7"] },
    );
    await fails(fetchGuarded("https://a.example/", f.net, opt()), "alamat_terlarang");
    expect(f.log).toEqual([]);
  });

  it("checks a redirect like a first request", async () => {
    for (const to of [
      "http://127.0.0.1/admin",
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost/",
      "http://[::1]/",
      "file:///etc/passwd",
      "ftp://a.example/x",
      `https://${"name"}@a.example/`,
    ]) {
      const f = fake({ "https://a.example/start": redirect(to) });
      const e = await fetchGuarded("https://a.example/start", f.net, opt()).catch((x) => x);
      expect(e, to).toBeInstanceOf(SnapshotError);
      expect(f.log.length, to).toBe(1);
    }
  });

  it("refuses a redirect to a name that resolves privately", async () => {
    const f = fake(
      { "https://a.example/start": redirect("https://evil.example/") },
      { "evil.example": ["192.168.0.10"] },
    );
    await fails(fetchGuarded("https://a.example/start", f.net, opt()), "alamat_terlarang");
    expect(f.log.map((l) => l.url)).toEqual(["https://a.example/start"]);
  });

  it("follows relative redirects and stops after five", async () => {
    const ok = fake({
      "https://a.example/a": redirect("/b"),
      "https://a.example/b": redirect("c"),
      "https://a.example/c": html("done"),
    });
    const r = await fetchGuarded("https://a.example/a", ok.net, opt());
    expect(r.url.href).toBe("https://a.example/c");
    const loop = fake({ "https://a.example/a": redirect("/a") });
    await fails(fetchGuarded("https://a.example/a", loop.net, opt()), "terlalu_banyak_alihan");
    expect(loop.log).toHaveLength(6);
  });

  it("a page that is not 200 is an error, and a failed lookup is unreachable", async () => {
    await fails(fetchGuarded("https://a.example/missing", fake({}).net, opt()), "status_salah");
    await fails(
      fetchGuarded("https://none.example/", fake({}, { "none.example": [] }).net, opt()),
      "tak_terjangkau",
    );
  });

  it("turns an abort into waktu_habis", async () => {
    const ctl = new AbortController();
    const net: Net = {
      resolve: async () => ["93.184.216.34"],
      get: (_u, _i, o) =>
        new Promise((_, rej) =>
          o.signal.addEventListener("abort", () => rej(new Error("aborted"))),
        ),
    };
    const p = fetchGuarded("https://a.example/", net, {
      maxBytes: 1,
      accept: "*/*",
      signal: ctl.signal,
    });
    ctl.abort();
    await fails(p, "waktu_habis");
  });

  it("passes the size cap's error through", async () => {
    const net: Net = {
      resolve: async () => ["93.184.216.34"],
      get: async () => {
        throw new SnapshotError("terlalu_besar");
      },
    };
    await fails(fetchGuarded("https://a.example/", net, opt()), "terlalu_besar");
  });
});

describe("snapshotUrl", () => {
  const PAGE = `<!doctype html><html><head><title>Rujukan</title><style>p{background:url(//x)}</style></head><body>
    <nav>menu</nav><main><h1>Judul</h1><p id="a">Isi <a href="https://other.example/z">luar</a> <a href="#a">dalam</a></p>
    <img src="/gambar.png" alt="g"><img src="/besar.png" alt="b"><img src="http://10.0.0.1/x.png" alt="p"><img src="/palsu.png" alt="h">
    <pre class="language-cpp"><code>int x;</code></pre></main></body></html>`;

  it("fetches, sanitizes and inlines the images it may, skipping the rest", async () => {
    const f = fake({
      "https://a.example/ref": html(PAGE),
      "https://a.example/gambar.png": {
        status: 200,
        headers: { "content-type": "image/png" },
        body: PNG,
      },
      "https://a.example/besar.png": async () => {
        throw new SnapshotError("terlalu_besar");
      },
      "https://a.example/palsu.png": {
        status: 200,
        headers: { "content-type": "image/png" },
        body: enc("<html>bukan gambar</html>"),
      },
    });
    const s = await snapshotUrl("https://a.example/ref", {
      net: f.net,
      now: new Date("2026-10-25T06:00:00Z"),
    });
    expect(s.title).toBe("Rujukan");
    expect(s.selector).toBe("main");
    expect(s.html).toContain('<img src="data:image/png;base64,');
    expect(s.html.match(/\[gambar dilewati\]/g)).toHaveLength(3);
    expect(s.html).toContain('<span class="ref-link" title="https://other.example/z">luar</span>');
    expect(s.html).toContain('<a href="#a">dalam</a>');
    expect(s.html).not.toMatch(/menu|url\(/);
    expect(verifySnapshot(s.html)).toEqual([]);
    expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(s.bytes.length).toBeGreaterThan(100);
    // The private image was never requested.
    expect(f.log.map((l) => l.url)).not.toContain("http://10.0.0.1/x.png");
    expect(kunciRef(1, s.sha256)).toBe(`recruitment/1/ref/${s.sha256}.html`);
  });

  it("makes a pre of plain text and refuses other types", async () => {
    const t = await snapshotUrl("https://a.example/t", {
      net: fake({
        "https://a.example/t": html("jika a < b & c maka berhenti", "text/plain; charset=utf-8"),
      }).net,
    });
    expect(t.html).toContain("<pre><code>jika a &lt; b &amp; c maka berhenti</code></pre>");
    await fails(
      snapshotUrl("https://a.example/p", {
        net: fake({ "https://a.example/p": html("%PDF-", "application/pdf") }).net,
      }),
      "jenis_salah",
    );
  });

  it("an SVG file is sanitized before it is inlined", async () => {
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="3" height="3"/></svg>`;
    const f = fake({
      "https://a.example/s": html(`<main><img src="/d.svg" alt="d"></main>`),
      "https://a.example/d.svg": {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
        body: enc(svg),
      },
    });
    const s = await snapshotUrl("https://a.example/s", { net: f.net });
    const m = /src="data:image\/svg\+xml;base64,([^"]+)"/.exec(s.html);
    expect(m).not.toBeNull();
    const out = Buffer.from(m![1], "base64").toString("utf8");
    expect(out).toContain("<rect");
    expect(out).not.toMatch(/script|onload|alert/);
  });
});

describe("a page with nothing to read", () => {
  // docs.arduino.cc sends its text in a script; the sanitizer keeps no script, so
  // the snapshot would be a title and a blank page (found on the real site).
  const SHELL = `<!doctype html><title>Arduino</title><body><main id="__next"></main><script>window.__DATA__={"text":"hidden"}</script></body>`;

  it("is refused as kosong instead of stored blank", async () => {
    const f = fake({ "https://a.example/js": html(SHELL) });
    await fails(snapshotUrl("https://a.example/js", { net: f.net }), "kosong");
    expect(() => snapshotUpload(SHELL)).toThrowError(expect.objectContaining({ kode: "kosong" }));
  });

  it("is not refused for a short page that has a picture or a few real lines", async () => {
    const f = fake({
      "https://a.example/pendek": html(
        `<title>P</title><main><h1>digitalWrite()</h1><p>Menulis HIGH atau LOW ke satu pin.</p></main>`,
      ),
    });
    await expect(snapshotUrl("https://a.example/pendek", { net: f.net })).resolves.toBeDefined();
    expect(
      snapshotUpload(`<body><img src="data:image/png;base64,iVBORw0KGgo=" alt="skema"></body>`)
        .html,
    ).toContain("data:image/png");
  });
});

describe("snapshotUpload and decoding", () => {
  it("an uploaded page keeps data: images and fetches nothing", () => {
    const s = snapshotUpload(
      `<title>Unggah</title><body><img src="data:image/png;base64,iVBORw0KGgo=" alt="a"><img src="https://x.example/y.png"><a href="https://x.example/">tautan</a><script>alert(1)</script></body>`,
      { title: "Judul Saya" },
    );
    expect(s.title).toBe("Judul Saya");
    expect(s.html).toContain('<img src="data:image/png;base64,iVBORw0KGgo="');
    expect(s.html).toContain("[gambar dilewati]");
    expect(s.html).not.toMatch(/alert|<script/);
    expect(verifySnapshot(s.html)).toEqual([]);
  });

  it("reads the charset from the header or the page", () => {
    const latin = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
    expect(decodeHtml(latin, "text/html; charset=iso-8859-1")).toBe("café");
    const withMeta = new Uint8Array([...enc('<meta charset="iso-8859-1">'), 0xe9]);
    expect(decodeHtml(withMeta, "text/html")).toContain("é");
    expect(decodeHtml(enc("ok"), "text/html; charset=nonsense")).toBe("ok");
  });
});
