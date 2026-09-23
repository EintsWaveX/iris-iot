/**
 * The one main navigation every page shares. Each page used to carry its
 * own copy, and the copies drifted: /session and /servers listed both
 * Dasbor and Sesi (and Dasbor only bounces an assistant to /session),
 * "/", /dashboard and /groups had no Sesi at all, and every module page
 * had only Beranda and Modul, leaving a signed-in student there no way
 * back to their dashboard but the brand mark.
 *
 * `peran` marks a link that only one role can use. Nav.astro hides those
 * links for every other role once /api/auth/me answers: an assistant never
 * sees Dasbor, a student never sees Sesi or Server, and a signed-out
 * visitor keeps Dasbor as their way in (it lands on the login gate).
 */
export interface NavLink {
  href: string;
  label: string;
  peran?: "asisten" | "praktikan";
}

export function navUtama(lang: "id" | "en" = "id"): NavLink[] {
  return [
    { href: "/", label: "Beranda" },
    { href: "/dashboard", label: "Dasbor", peran: "praktikan" },
    { href: "/session", label: "Sesi", peran: "asisten" },
    lang === "en"
      ? { href: "/en/modules", label: "Modules" }
      : { href: "/modules", label: "Modul" },
    { href: "/servers", label: "Server", peran: "asisten" },
  ];
}
