/**
 * Sign-in is its own page, /login (Phase 9 mockup p-login). Every "Masuk"
 * button comes here: it goes to the page with ?next= set to where the
 * person was, or, already on the page, puts the cursor in the NIM field.
 */
import { langOfPath, pathForLang } from "./kelas";

export function isSignInPath(pathname = location.pathname): boolean {
  return /^(\/(en|zh))?\/login\/?$/.test(pathname);
}

export function signInHref(next?: string): string {
  const here = next ?? location.pathname + location.search;
  const base = pathForLang("/login", langOfPath(location.pathname));
  if (isSignInPath(here.split("?")[0]) || /^\/((en|zh)\/?)?$/.test(here)) return base;
  return `${base}?next=${encodeURIComponent(here)}`;
}

export function openSignIn(next?: string): void {
  if (isSignInPath()) {
    const nim = document.getElementById("login-nim") as HTMLInputElement | null;
    nim?.focus();
    nim?.select();
    return;
  }
  // ulang=1: the app asked for a fresh sign-in, so /login shows its form even
  // to someone still signed in (2026-10-07: a Praktikan moved to another
  // group, or on an earlier session's sign-in, bounced straight back).
  const to = signInHref(next);
  location.assign(to + (to.includes("?") ? "&" : "?") + "ulang=1");
}
