/**
 * A visibility-aware poll loop: calls `fn` immediately and then on every
 * `intervalMs`, but only while the tab is actually visible — a hidden tab
 * stops polling entirely rather than continuing to hit the network (and,
 * for anything touching the database, keeping Neon's compute awake) for a
 * page nobody is looking at. Resumes, with an immediate call, the moment
 * the tab becomes visible again.
 *
 * This is the fix for "nothing on any page ever changes" (the rebuild
 * plan's Cause 1): a page that wants to feel alive calls this once instead
 * of fetching on mount and never again.
 *
 * Returns a stop() function that tears down both the timer and the
 * visibilitychange listener — call it before a page discards the DOM nodes
 * `fn` updates, the same lifecycle discipline the bindPage() functions
 * across this codebase already follow for their own event listeners.
 *
 * It also stops by itself on the next astro:before-swap. <ClientRouter/>
 * keeps a page's module script alive after navigating away, and no page
 * ever called stop() on the way out, so /session's roster poll, the
 * dashboard's broadcast poll and every page's identity check went on
 * running on every later page, against DOM that no longer existed (and,
 * for the identity check, forcing a false "signed in elsewhere" re-login
 * after a normal Keluar). Pages re-start their polls on their own
 * astro:page-load, so stopping here loses nothing.
 */
export function startPolling(fn: () => void | Promise<void>, intervalMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick() {
    void fn();
  }

  function start() {
    if (timer !== null) return;
    tick();
    timer = setInterval(tick, intervalMs);
  }

  function stop() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  function onVisibilityChange() {
    if (document.hidden) stop();
    else start();
  }

  function teardown() {
    stop();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("astro:before-swap", teardown);
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("astro:before-swap", teardown);
  if (!document.hidden) start();

  return teardown;
}
