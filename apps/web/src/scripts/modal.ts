/**
 * window.Modal = { open(id), close(id) }
 *
 * Deliberately not a framework component: modals are opened from plain
 * <button data-modal-open="id"> triggers scattered across static Astro
 * markup (some of it Modal's OWN body/actions slots, which other plain
 * <script> tags on the same page reach into by id -- see
 * dashboard/server.astro), so a global, dependency-free controller is the
 * simplest thing that can wire an arbitrary trigger to an arbitrary modal
 * without every page needing its own script. Converting Modal.astro's
 * shell into a React component was considered for Stage 4 alongside
 * Toast/Tabs, but its slotted content is static, id-addressed HTML that
 * plain scripts elsewhere on the page depend on finding in the DOM --
 * exactly the kind of content a framework island's hydration boundary
 * doesn't need to own. This file gets the same win Toast/Tabs' React
 * conversion gets (an external module instead of an inline <script>, so
 * it needs no CSP hash) without that risk.
 *
 * Stage 4 additions over the original inline version, the mechanics
 * ported from portfolio's project-gallery modal (see that repo's
 * script.js/style.css): a real focus trap (Tab wraps within the panel
 * instead of escaping it), focus returned to whichever element opened the
 * modal, and open/close toggling `inert` + `aria-hidden` + an `is-open`
 * class instead of the `hidden` attribute, so Modal.astro's opacity/scale
 * transition can actually run (`[hidden]` is `display: none`, which
 * cannot fade). `inert` blocks clicks and keyboard focus on the whole
 * closed subtree synchronously, the moment `close()` sets it -- a more
 * direct fix for "a closing backdrop must not intercept clicks" than
 * portfolio's `visibility: hidden` transition-delay trick, which predates
 * `inert` support.
 */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

let openId: string | null = null;
let lastFocused: HTMLElement | null = null;

function panelOf(id: string) {
  return document.getElementById(id);
}

function focusableIn(el: HTMLElement) {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (node) => node.offsetParent !== null,
  );
}

function trapFocus(event: KeyboardEvent, panel: HTMLElement) {
  const nodes = focusableIn(panel);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function open(id: string) {
  const el = panelOf(id);
  if (!el) return;
  lastFocused = document.activeElement as HTMLElement | null;
  el.inert = false;
  el.setAttribute("aria-hidden", "false");
  el.classList.add("is-open");
  openId = id;
  document.body.style.overflow = "hidden";
  focusableIn(el)[0]?.focus();
}

function close(id?: string) {
  const target = id ?? openId;
  if (!target) return;
  const el = panelOf(target);
  if (el) {
    el.inert = true;
    el.setAttribute("aria-hidden", "true");
    el.classList.remove("is-open");
  }
  if (target === openId) openId = null;
  document.body.style.overflow = "";
  lastFocused?.focus();
  lastFocused = null;
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const trigger = target.closest<HTMLElement>("[data-modal-open]");
  if (trigger) {
    open(trigger.getAttribute("data-modal-open")!);
    return;
  }
  const closer = target.closest<HTMLElement>("[data-modal-close]");
  if (closer) {
    const panel = closer.closest<HTMLElement>("[data-modal]");
    if (panel) close(panel.id);
  }
});

document.addEventListener("keydown", (event) => {
  if (!openId) return;
  const panel = document.querySelector<HTMLElement>(
    `[data-modal]#${CSS.escape(openId)} .modal__panel`,
  );
  if (event.key === "Escape") {
    close();
  } else if (event.key === "Tab" && panel) {
    trapFocus(event, panel);
  }
});

window.Modal = { open, close };
