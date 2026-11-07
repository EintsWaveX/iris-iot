// @vitest-environment jsdom
/**
 * The Skeleton's hidden "loading" word must not depend on `document`: the
 * server (no document) and the browser have to produce the same HTML, or
 * React throws a hydration mismatch (#418) on /en and /zh pages.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Skeleton from "../Skeleton";

describe("Skeleton", () => {
  it("renders the same markup whatever the page language is", () => {
    const markup = (lang: string) => {
      document.documentElement.lang = lang;
      return renderToStaticMarkup(h(Skeleton, { height: 120 }));
    };
    const id = markup("id");
    expect(markup("en")).toBe(id);
    expect(markup("zh-Hans")).toBe(id);
    for (const word of ["Memuat", "Loading", "加载中"]) expect(id).toContain(word);
  });

  it("keeps an explicit label as the only word", () => {
    const out = renderToStaticMarkup(h(Skeleton, { height: 120, label: "Tunggu" }));
    expect(out).toContain("Tunggu");
    expect(out).not.toContain("Loading");
  });
});
