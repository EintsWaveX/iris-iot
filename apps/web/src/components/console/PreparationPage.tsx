/**
 * /preparation (2026-10-12): Persiapan as its own page, one nav link away
 * from anywhere. The same PrepView the Konsol used inline: before a session
 * it prepares the next roster, during one it also shows who holds which
 * group. `?pilih=4-3` (a slot) or `?pilih=d12` (a draft) opens that roster,
 * and the address hash names the open tab (#akses, #skema, ...).
 */
import { ShieldWarningIcon, SignInIcon } from "@phosphor-icons/react";
import { StateView } from "../ui/Display";
import { href, useMe } from "../../lib/app";
import { openSignIn } from "../../lib/signin";
import type { Lang } from "../../lib/kelas";
import { S } from "./strings";
import { useAssignment, useCurrent } from "./data";
import PrepView, { PREP_TABS, type PrepTab } from "./PrepView";
import "./console.css";

function tabDariHash(): PrepTab {
  const h = location.hash.replace(/^#/, "");
  return (PREP_TABS as readonly string[]).includes(h) ? (h as PrepTab) : "roster";
}

export default function PreparationPage({ lang }: { lang: Lang }) {
  const t = S[lang];
  const me = useMe();
  const isAsisten = me?.role === "asisten";
  const current = useCurrent(isAsisten);
  const sesi = isAsisten ? (current.data?.sesi ?? null) : null;
  const assign = useAssignment(sesi?.id ?? null);

  if (me === undefined || (isAsisten && current.data === null && current.errors < 2)) {
    return (
      <div className="console-loading" aria-busy="true">
        <span className="skeleton" style={{ height: 96 }} />
        <span className="skeleton" style={{ height: 420 }} />
        <span className="visually-hidden">{t.loading}</span>
      </div>
    );
  }

  if (!isAsisten) {
    return (
      <StateView
        icon={<ShieldWarningIcon size={28} />}
        title={t.forbidden}
        body={t.forbiddenBody}
        tone="warn"
        actions={
          me === null ? (
            <button type="button" className="btn btn--primary" onClick={() => openSignIn()}>
              <SignInIcon size={18} aria-hidden="true" /> {t.signIn}
            </button>
          ) : undefined
        }
      />
    );
  }

  const pilih = new URLSearchParams(location.search).get("pilih");
  return (
    <div className="console">
      <PrepView
        t={t}
        lang={lang}
        sesi={sesi}
        roster={current.data?.roster ?? []}
        assign={assign.data ?? null}
        meNim={me!.nim}
        meKode={(me!.kode ?? "").toUpperCase()}
        onChanged={current.refresh}
        onBack={() => location.assign(href(lang, "/session"))}
        pilih={pilih}
        tab0={tabDariHash()}
      />
    </div>
  );
}

/** The address of Persiapan, opened on a roster and a tab */
export function prepHref(lang: Lang, pilih?: string | null, tab?: PrepTab): string {
  const q = pilih ? `?pilih=${encodeURIComponent(pilih)}` : "";
  return `${href(lang, "/preparation")}${q}${tab && tab !== "roster" ? `#${tab}` : ""}`;
}
