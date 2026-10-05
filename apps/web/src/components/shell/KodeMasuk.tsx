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
  zh: { k: "登录代码", tip: "学员登录时与 NIM 一起输入这个代码。" },
});

export default function KodeMasuk({
  kode,
  lang,
  besar = false,
  kecil = false,
}: {
  kode: string;
  lang: Lang;
  /** Projector size. */
  besar?: boolean;
  /** Inline in a line of text (the Console's session bar). */
  kecil?: boolean;
}) {
  const t = T[lang];
  return (
    <Tooltip label={t.tip} side="bottom">
      <span
        className="kodemasuk"
        data-besar={besar ? "yes" : undefined}
        data-kecil={kecil ? "yes" : undefined}
        tabIndex={0}
      >
        <KeyIcon size={besar ? 22 : kecil ? 13 : 16} aria-hidden="true" />
        <span className="kodemasuk__k">{t.k}</span>
        <b className="kodemasuk__v num">{kode}</b>
      </span>
    </Tooltip>
  );
}
