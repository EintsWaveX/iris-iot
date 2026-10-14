/**
 * The Server page, /servers, /en/servers and /zh/servers (Phase 9 Stage 5,
 * rebuilt from the signed-off mockup's v-list, v-over, v-ready and
 * v-settings). List and detail stay one island switched on ?id= (the site
 * is static; database rows have no build-time routes):
 *
 * - ServerList: status tiles, one card per Pi, the 3-step register dialog
 * - ServerDetail: head (status, Compact/Full, location strip) and the tabs
 *   Overview, Ready Check and Settings
 *
 * Every Asisten can open it. Controlling the Pi needs the Server right, the
 * Full view, settings, clearing logs and registering need the full right
 * (lib/hak.ts); the API checks the same rights again.
 */
import { istimewaKonsol } from "../../lib/konsol";
import { useEffect, useState } from "react";
import { ListChecksIcon, ShieldWarningIcon } from "@phosphor-icons/react";
import { StateView } from "../ui/Display";
import { href, useMe } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import ServerDetail from "./ServerDetail";
import ServerList from "./ServerList";
import type { Bisa } from "./data";
import { S } from "./strings";
import "./server.css";
import { openSignIn } from "../../lib/signin";

export default function ServerCenter({ lang }: { lang: Lang }) {
  const t = S[lang];
  const me = useMe();
  const [id, setId] = useState<number | null>(null);
  // ?dari=persiapan: opened from a readiness check (Home or Preparation,
  // 2026-10-06), so the page says what to do and offers the way back.
  const [dari, setDari] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const q = new URLSearchParams(location.search);
      const p = q.get("id");
      setId(p ? Number(p) : null);
      setDari(q.get("dari"));
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  function open(next: number | null) {
    const d = dari ? `dari=${dari}` : "";
    history.pushState(
      null,
      "",
      next
        ? `?id=${next}${d ? `&${d}` : ""}${dari ? "#siap" : ""}`
        : `${location.pathname}${d ? `?${d}` : ""}`,
    );
    setId(next);
    window.scrollTo({ top: 0 });
  }

  if (me === undefined) {
    return (
      <div className="stack stack--lg" aria-busy="true">
        <span className="skeleton" style={{ height: 90 }} />
        <span className="skeleton" style={{ height: 260 }} />
      </div>
    );
  }
  if (me?.role !== "asisten") {
    return (
      <StateView
        icon={<ShieldWarningIcon size={28} />}
        title={t.forbidden}
        body={t.forbiddenBody}
        tone="warn"
        actions={
          me === null ? (
            <button type="button" className="btn btn--primary" onClick={() => openSignIn()}>
              {t.signIn}
            </button>
          ) : undefined
        }
      />
    );
  }

  const badges = me.badges ?? [];
  const istimewa = istimewaKonsol({ badges, tier: me.tier });
  const bisa: Bisa = {
    server: me.hak?.server === true,
    full: me.hak?.full === true,
    konsol: true,
    istimewa,
    pencipta: badges.includes("pencipta"),
    putus: istimewa,
    badges,
    admin: me.tier === "admin",
    nim: me.nim,
  };

  const balik =
    dari === "persiapan" ? (
      <div className="banner banner--accent srv-from" role="status">
        <ListChecksIcon size={20} aria-hidden="true" />
        <span className="grow">{id ? t.fromPrep : t.fromPrepList}</span>
        <a className="btn btn--inverse" href={href(lang, "/preparation#server")}>
          {t.backPrep}
        </a>
      </div>
    ) : null;

  return (
    <>
      {balik}
      {id ? (
        <ServerDetail
          key={id}
          lang={lang}
          id={id}
          bisa={bisa}
          onBack={() => open(null)}
          dari={dari}
        />
      ) : (
        <ServerList lang={lang} bisa={bisa} onOpen={open} />
      )}
    </>
  );
}
