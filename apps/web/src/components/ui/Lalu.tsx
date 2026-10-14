/**
 * How long ago, ticking every second: "00:04:12 lalu", "2 hari (03:14:07)
 * lalu", past 30 days "lebih dari 30 hari lalu". `fmt` puts it in a
 * sentence ("Dibaca dari LMS {}"). Nothing for a missing time.
 */
import { sejak, useDetik } from "../../lib/app";
import type { Lang } from "../../lib/kelas";

export default function Lalu({
  iso,
  lang,
  fmt,
}: {
  iso: string | null | undefined;
  lang: Lang;
  fmt?: (s: string) => string;
}) {
  const now = useDetik();
  if (!iso) return null;
  const s = sejak(iso, lang, now);
  return <>{fmt ? fmt(s) : s}</>;
}
