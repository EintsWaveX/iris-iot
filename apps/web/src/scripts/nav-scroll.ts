/**
 * Nav.astro's swept hairline (Stage 4): invisible at the top of a page,
 * fades in once the page has actually scrolled, so the sticky bar only
 * separates itself from the content once there is content to separate
 * itself from.
 *
 * A singleton module rather than a per-page script: this file's top-level
 * code only ever runs once (the browser's module cache dedupes it across
 * every ClientRouter navigation), so the `scroll` listener is attached
 * exactly once and is never rebound. What DOES need rebinding is which
 * `.nav` element it points at, since Nav.astro is not `transition:persist`
 * and gets a fresh DOM node on every swap -- solved by never caching the
 * reference at all and re-querying it inside the handler itself.
 */
const SCROLL_THRESHOLD = 4;

function updateScrolled() {
  const nav = document.querySelector<HTMLElement>(".nav");
  if (!nav) return;
  nav.dataset.scrolled = window.scrollY > SCROLL_THRESHOLD ? "yes" : "no";
}

window.addEventListener("scroll", updateScrolled, { passive: true });
document.addEventListener("astro:page-load", updateScrolled);
updateScrolled();
