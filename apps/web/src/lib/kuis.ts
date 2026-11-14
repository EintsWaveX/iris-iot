/**
 * Where the Module 4 quiz game lives, for the Konsol and the module page
 * (the game itself is components/kuis, the socket is server/kuis.ts).
 */
export const HOST_KUIS = "games.irisiotlab.com";

/** The game's address. Only a Module 4 session has a game, so callers gate on `modul === 4`. */
export function tautanKuis(): string {
  return `https://${HOST_KUIS}/`;
}

/**
 * Opens the game in a new tab already signed in: asks for a one-minute ticket
 * (api/auth/kuis-tiket) and carries it in the link's fragment, which a server
 * never sees. If anything fails the plain link still works, the person just
 * signs in there.
 */
export async function bukaKuis(): Promise<void> {
  // Opened first, in the click, so a pop-up blocker lets it through.
  const tab = window.open("about:blank", "_blank");
  let alamat = tautanKuis();
  try {
    const r = await fetch("/api/auth/kuis-tiket", { method: "POST", credentials: "same-origin" });
    const d = (await r.json()) as { ok?: boolean; tiket?: string };
    if (d.ok && d.tiket) alamat += `#t=${encodeURIComponent(d.tiket)}`;
  } catch {
    /* the plain link below */
  }
  if (tab) tab.location.href = alamat;
  else window.location.assign(alamat);
}

/** The ticket in this page's address fragment, if one came with the link. */
export function tiketDariAlamat(hash: string): string | null {
  const m = /(?:^#|&)t=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
