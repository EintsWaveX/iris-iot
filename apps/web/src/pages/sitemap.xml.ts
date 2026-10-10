/**
 * The public pages for search engines, each with its three language twins.
 * Signed in pages are left out (they carry noindex as well).
 */
import type { APIRoute } from "astro";
import { SITE_URL } from "../lib/lab";

const PAGES = [
  "/",
  "/modules",
  "/modules/1",
  "/modules/2",
  "/modules/3",
  "/modules/4",
  "/login",
  "/privacy",
  "/terms",
];

function twin(path: string, lang: "id" | "en" | "zh"): string {
  if (lang === "id") return path;
  return path === "/" ? `/${lang}/` : `/${lang}${path}`;
}

export const GET: APIRoute = () => {
  const urls = PAGES.flatMap((path) =>
    (["id", "en", "zh"] as const).map((lang) => {
      const links = (["id", "en", "zh"] as const)
        .map(
          (l) =>
            `    <xhtml:link rel="alternate" hreflang="${l === "zh" ? "zh-Hans" : l}" href="${SITE_URL}${twin(path, l)}"/>`,
        )
        .join("\n");
      return `  <url>\n    <loc>${SITE_URL}${twin(path, lang)}</loc>\n${links}\n  </url>`;
    }),
  );
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `${urls.join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
