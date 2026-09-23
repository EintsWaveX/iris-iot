/**
 * Runs `fn` once for every page the visitor lands on: the first load and
 * every later <ClientRouter/> navigation, never twice for the same page.
 *
 * The idiom this replaces, `fn(); addEventListener("astro:page-load", fn)`,
 * ran `fn` twice on a first load, because astro:page-load fires then too.
 * For an entrance animation that restarted the animation mid-flight; for
 * index.astro's checks it meant two /api/auth/me calls, and could open the
 * login modal or navigate twice. The flag lives on <body>, which the
 * router replaces on every navigation, so the next page starts clean.
 */
export function sekaliPerHalaman(kunci: string, fn: () => void): void {
  const jalankan = () => {
    const body = document.body;
    const flag = `sekali${kunci}`;
    if (body.dataset[flag]) return;
    body.dataset[flag] = "1";
    fn();
  };
  jalankan();
  document.addEventListener("astro:page-load", jalankan);
}
