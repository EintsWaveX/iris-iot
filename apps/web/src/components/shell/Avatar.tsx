/**
 * The round initials in the account chip (mockup rolebadge): the Asisten's
 * code, or a Praktikan's two initials on their group colour; the Pencipta
 * gets an amber ring. Styled by AppNav.css, which both navbars load.
 *
 * Its own module (2026-10-23) so the recruitment navbar can use it without
 * importing the AppNav island: that import made AppNav shared code, and the
 * build's merged chunk then asked for a stylesheet it never wrote, which
 * left Home blank in production.
 */
import type { CSSProperties } from "react";
import type { useMe } from "../../lib/app";

function initials(nama: string): string {
  const w = nama.trim().split(/\s+/).filter(Boolean);
  return (
    (w[0]?.[0] ?? "") + (w.length > 1 ? (w[w.length - 1]?.[0] ?? "") : (w[0]?.[1] ?? ""))
  ).toUpperCase();
}

export default function Avatar({
  me,
  lg = false,
}: {
  me: NonNullable<ReturnType<typeof useMe>>;
  lg?: boolean;
}) {
  const praktikan = me.role === "praktikan";
  return (
    <span
      className={lg ? "appnav__avatar appnav__avatar--lg" : "appnav__avatar"}
      data-role={me.role}
      data-pencipta={me.badges?.includes("pencipta") ? "yes" : undefined}
      style={
        praktikan && me.kelompok
          ? ({ "--g": `var(--group-${((me.kelompok - 1) % 10) + 1})` } as CSSProperties)
          : undefined
      }
      aria-hidden="true"
    >
      {praktikan ? initials(me.nama) : (me.kode || me.nama).slice(0, 3).toUpperCase()}
    </span>
  );
}
