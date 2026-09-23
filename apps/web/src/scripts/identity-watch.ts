/**
 * Watches for this tab's signed-in identity changing underneath it.
 *
 * The session cookie is shared by every tab in the browser, so signing
 * into a different account in another tab silently swaps who THIS tab is
 * authenticated as too, on its very next request, with no visible
 * warning. This poll notices (the NIM this tab loaded with no longer
 * matches what the cookie now resolves to) and moves the tab off a page
 * that is still showing the previous account's data, rather than letting
 * someone keep acting (starting sessions, sending server commands) as the
 * wrong person.
 *
 * Two different outcomes, because they are two different situations: a
 * cookie that now belongs to someone else sends the tab to /dashboard,
 * which routes that account by its own role, and says so; a cookie that
 * is simply gone (signed out elsewhere, or expired) sends it to the login
 * modal. Both used to say "replaced by another sign-in" and open the login
 * modal, which /?login=1 then skipped straight past for a live session.
 *
 * Shared by dashboard.astro, session.astro and servers.astro, which used
 * to carry three copies of this. Stops itself on navigation, via
 * startPolling().
 */
import { navigate } from "astro:transitions/client";
import { startPolling } from "./polling";

export function watchIdentity(nim: string): () => void {
  return startPolling(async () => {
    let check: { ok?: boolean; nim?: string; nama?: string };
    try {
      check = await fetch("/api/auth/me").then((r) => r.json());
    } catch {
      // A failed check is not evidence of a swap -- try again next tick.
      return;
    }
    if (check.ok && check.nim === nim) return;

    if (check.ok) {
      window.Toast?.show(
        `Akun lain (${check.nama ?? check.nim}) masuk di tab lain pada peramban ini, jadi tab ini ikut berpindah ke akun tersebut.`,
        "info",
      );
      navigate("/dashboard");
    } else {
      window.Toast?.show("Sesi berakhir. Silakan masuk kembali.", "info");
      navigate("/?login=1");
    }
  }, 20_000);
}
