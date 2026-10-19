/**
 * The running session's sign-in code (2026-10-05), as a chip: on the
 * Asisten's session bars, and large on the projector so the room can read
 * it. Praktikan type it with their NIM (SignInPage).
 */
import { KeyIcon } from "@phosphor-icons/react";
import { dict } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import Tooltip from "../ui/Tooltip";
import "./SessionMiniBar.css";

const T = dict({
  id: { k: "Kode Masuk", tip: "Praktikan mengetik kode ini bersama NIM saat masuk." },
  en: { k: "Sign-in Code", tip: "Praktikan type this code with their NIM to sign in." },
  zh: { k: "签到码", tip: "学生登录时和 NIM 一起输入这个签到码。" },
});

export default function KodeMasuk({
  kode,
  lang,
  besar = false,
  blok = false,
}: {
  kode: string;
  lang: Lang;
  /** Projector size. */
  besar?: boolean;
  /** A block of its own, each character in a box like the ones Praktikan
   *  type it into (the Console's session bar, 2026-10-20). */
  blok?: boolean;
}) {
  const t = T[lang];
  if (blok)
    return (
      <Tooltip label={t.tip} side="bottom">
        <span className="kodemasuk" data-blok="yes" tabIndex={0}>
          <span className="kodemasuk__k label-caps">{t.k}</span>
          <b className="kodemasuk__v" aria-label={kode}>
            {[...kode].map((c, i) => (
              <span className="kodemasuk__d" aria-hidden="true" key={i}>
                {c}
              </span>
            ))}
          </b>
        </span>
      </Tooltip>
    );
  return (
    <Tooltip label={t.tip} side="bottom">
      <span className="kodemasuk" data-besar={besar ? "yes" : undefined} tabIndex={0}>
        <KeyIcon size={besar ? 22 : 16} aria-hidden="true" />
        <span className="kodemasuk__k">{t.k}</span>
        <b className="kodemasuk__v num">{kode}</b>
      </span>
    </Tooltip>
  );
}
