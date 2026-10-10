/**
 * An Asisten's code chip ("NUE", the viewer's own in the accent), with an
 * online dot when `terakhirAktif` is given (lib/kehadiran.ts): green while
 * their app is open, faint when not. Hover says when they were last active.
 */
import { dict, sejak, useTick } from "../../lib/app";
import { ONLINE_MS, sedangOnline } from "../../lib/kehadiran";
import { useLewat } from "../../lib/jam";
import type { Lang } from "../../lib/kelas";

const T = dict({
  id: { on: "Online", off: "Offline", last: (s: string) => `Terakhir aktif ${s}` },
  en: { on: "Online", off: "Offline", last: (s: string) => `Last active ${s}` },
  zh: { on: "在线", off: "离线", last: (s: string) => `最后活跃：${s}` },
});

export default function AsistenKode({
  kode,
  me,
  terakhirAktif,
  lang,
}: {
  kode: string | null;
  me?: boolean;
  /** Omit for no dot; null means never seen. */
  terakhirAktif?: string | null;
  lang: Lang;
}) {
  const now = useTick(30_000);
  const t = T[lang];
  const ada = terakhirAktif !== undefined;
  // Goes offline at the very moment, not on the next tick.
  const habis = useLewat(terakhirAktif ? Date.parse(terakhirAktif) + ONLINE_MS : null);
  const on = ada && !habis && sedangOnline(terakhirAktif, now);
  const judul = !ada
    ? undefined
    : on
      ? t.on
      : terakhirAktif
        ? t.last(sejak(terakhirAktif, lang, now))
        : t.off;
  return (
    <span
      className={`acode${me ? " acode--me" : ""}`}
      data-online={ada ? (on ? "yes" : "no") : undefined}
      title={judul}
    >
      {kode ?? "?"}
      {ada && <span className="visually-hidden">{`, ${on ? t.on : t.off}`}</span>}
    </span>
  );
}
