/**
 * Where the quiz game lives: games.irisiotlab.com, a second tunnel hostname
 * to this same server (deploy/DEPLOY.md, "The games host").
 *
 * On that host `/` is the game page (/kuis), the API and the built assets
 * answer as usual (so the same sign-in works there, with its own host-only
 * cookie), and every other page goes back to `/`. On any other host the
 * /kuis page forwards to the games host, so a signed-in session never plays
 * on the wrong cookie. `games.localhost` is the same thing on a laptop.
 */
import { HOST_KUIS } from "../src/lib/kuis.js";

export { HOST_KUIS };

function namaHost(host: string | undefined): string {
  return (host ?? "").toLowerCase().split(":")[0];
}

/** Is this Host header the games host? `IRIS_HOST_KUIS` names an extra one (tests, a second domain). */
export function hostKuis(host: string | undefined): boolean {
  const h = namaHost(host);
  if (h === HOST_KUIS || h === "games.localhost") return true;
  const lain = process.env.IRIS_HOST_KUIS?.toLowerCase();
  return !!lain && h === lain;
}

/** The games host's address as seen from `host` (a laptop gets games.localhost). */
export function alamatKuis(host: string | undefined): string {
  const h = namaHost(host);
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost")) {
    const port = (host ?? "").split(":")[1];
    return `http://games.localhost${port ? `:${port}` : ""}/`;
  }
  return `https://${HOST_KUIS}/`;
}

/** Pages the games host keeps: sign-in, and the two notes its consent line links to. */
const PAGE_MASUK = /^\/(?:(?:en|zh)\/)?(?:login|privacy|terms)\/?$/;

export type AturanKuis =
  { jenis: "tulis"; path: string } | { jenis: "alih"; lokasi: string } | null;

/** What to do with a request for the games host's rules, or null to carry on as usual. */
export function aturKuis(host: string | undefined, path: string, search = ""): AturanKuis {
  const kuis = path === "/kuis" || path === "/kuis/";
  if (hostKuis(host)) {
    if (path === "/" || kuis) return { jenis: "tulis", path: "/kuis" };
    if (path === "/api" || path.startsWith("/api/")) return null;
    if (path.startsWith("/_astro/") || path.startsWith("/f/")) return null;
    if (path === "/kuis/ws") return null;
    // The sign-in page is the site's own, so a person signs in once on this host too.
    if (PAGE_MASUK.test(path)) return null;
    // A file (script, font, image, manifest) is served; a page is not.
    const akhir = path.slice(path.lastIndexOf("/") + 1);
    if (akhir.includes(".")) return null;
    return { jenis: "alih", lokasi: `/${search}` };
  }
  if (kuis) return { jenis: "alih", lokasi: alamatKuis(host) };
  return null;
}
