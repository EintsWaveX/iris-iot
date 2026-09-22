/**
 * The cursor-follow spotlight on Card.astro's hover ring (Stage 4). One
 * delegated `mousemove` listener on `document` rather than one per card:
 * Card is a plain Astro component with no persisted state, so its DOM nodes
 * are destroyed and recreated by every ClientRouter navigation, but this
 * module itself is a singleton ES import that only ever runs its top-level
 * code once (the browser's module cache dedupes it across page swaps) --
 * binding to `document` instead of to individual `.card` elements means
 * there is nothing to re-bind after a swap.
 *
 * Gated off entirely, not just visually, under prefers-reduced-motion and
 * on any device without a fine pointer: a touch screen has no cursor to
 * follow, so tracking touch coordinates would draw a ring that lags a full
 * finger-width behind the last tap for no benefit.
 */
function onMove(event: MouseEvent) {
  const card = (event.target as HTMLElement).closest<HTMLElement>(".card");
  if (!card) return;
  const rect = card.getBoundingClientRect();
  card.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
  card.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
}

let active = false;

function setActive(shouldBeActive: boolean) {
  if (shouldBeActive === active) return;
  active = shouldBeActive;
  if (active) {
    document.addEventListener("mousemove", onMove);
  } else {
    document.removeEventListener("mousemove", onMove);
  }
}

function fineCursorAvailable() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

if (fineCursorAvailable()) {
  setActive(!(window.Motion?.isReduced() ?? false));
  window.Motion?.onReducedChange((isReduced) => setActive(!isReduced));
}
