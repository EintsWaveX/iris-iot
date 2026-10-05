/**
 * Reports (Phase 9 Stage 6b), one island for /reports, /en/reports and
 * /zh/reports, Asisten only. The address keeps the view so Back and links
 * work: the home tabs (#sesi … #bayar), one session (?sesi=N, #tab), the
 * written reports (?dokumen) and one report (?dok=N).
 */
import { useCallback, useEffect, useState } from "react";
import { href, useMe } from "../../lib/app";
import { useDirektori } from "../../lib/people";
import type { Lang } from "../../lib/kelas";
import ErrorView from "../ui/ErrorView";
import Builder from "./Builder";
import Docs, { buatDraf } from "./Docs";
import Home, { filterAwal, TAB_HOME, type Filter, type TabHome } from "./Home";
import SessionPage from "./SessionPage";
import { labelSesi, useRiwayat } from "./data";
import { R } from "./strings";
import "./reports.css";

type Rute =
  | { v: "home"; tab: TabHome }
  | { v: "sesi"; id: number }
  | { v: "docs" }
  | { v: "dok"; id: number };

function bacaRute(): Rute {
  const q = new URLSearchParams(location.search);
  const n = (k: string) => {
    const x = Number(q.get(k));
    return Number.isInteger(x) && x > 0 ? x : null;
  };
  if (n("sesi")) return { v: "sesi", id: n("sesi")! };
  if (n("dok")) return { v: "dok", id: n("dok")! };
  if (q.has("dokumen")) return { v: "docs" };
  const h = location.hash.slice(1);
  return { v: "home", tab: (TAB_HOME as readonly string[]).includes(h) ? (h as TabHome) : "sesi" };
}

export default function ReportsApp({ lang }: { lang: Lang }) {
  const t = R[lang];
  const me = useMe();
  const asisten = me?.role === "asisten";
  const dir = useDirektori(asisten);
  // The server render has no address; the view is read once mounted.
  const [rute, setRute] = useState<Rute>({ v: "home", tab: "sesi" });
  const [f, setF] = useState<Filter>(filterAwal);
  const riwayat = useRiwayat(asisten, f.tot);

  useEffect(() => {
    const on = () => setRute(bacaRute());
    on();
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const pergi = useCallback(
    (r: Rute) => {
      const base = href(lang, "/reports");
      const url =
        r.v === "sesi"
          ? `${base}?sesi=${r.id}`
          : r.v === "dok"
            ? `${base}?dok=${r.id}`
            : r.v === "docs"
              ? `${base}?dokumen`
              : `${base}#${r.tab}`;
      history.pushState(null, "", url);
      setRute(r);
      window.scrollTo({ top: 0 });
    },
    [lang],
  );

  if (me === undefined) return <span className="skeleton" style={{ height: 420 }} />;
  if (!asisten)
    return (
      <ErrorView code={me ? 403 : 401} lang={lang} role={me?.role ?? null} why={t.forbidden} />
    );
  const c = { t, lang, dir, me: me.nim };
  const admin = me.hak?.tim === true;
  const tabRumah = rute.v === "home" ? rute.tab : "sesi";

  if (rute.v === "sesi")
    return (
      <SessionPage
        key={rute.id}
        sesiId={rute.id}
        t={t}
        lang={lang}
        dir={dir}
        me={me.nim}
        onBack={() => pergi({ v: "home", tab: "sesi" })}
        onBlockReport={async (teks, s) => {
          const judul = `${labelSesi(s, lang)}`;
          const id = await buatDraf("sesi", {
            judul,
            sesiId: s.id,
            blok: [
              { id: "b1", k: "h", v: t.whatHappened },
              ...(teks.trim() ? [{ id: "b2", k: "p", v: teks }] : [{ id: "b2", k: "p", v: "" }]),
            ],
          });
          if (!id) return void window.Toast?.show(t.err, "danger");
          pergi({ v: "dok", id });
        }}
      />
    );
  if (rute.v === "docs")
    return (
      <Docs
        t={t}
        lang={lang}
        dir={dir}
        me={me.nim}
        onBack={() => pergi({ v: "home", tab: "sesi" })}
        onOpen={(id) => pergi({ v: "dok", id })}
      />
    );
  if (rute.v === "dok")
    return (
      <Builder
        key={rute.id}
        id={rute.id}
        rows={riwayat.rows ?? []}
        t={t}
        lang={lang}
        dir={dir}
        me={me.nim}
        admin={admin}
        onBack={() => pergi({ v: "docs" })}
      />
    );

  if (riwayat.fail && !riwayat.rows)
    return <ErrorView code={500} lang={lang} onRetry={() => void riwayat.load()} />;
  if (!riwayat.rows) return <span className="skeleton" style={{ height: 520 }} />;
  return (
    <Home
      rows={riwayat.rows}
      c={c}
      f={f}
      setF={setF}
      tab={tabRumah}
      setTab={(tab) => {
        history.replaceState(null, "", `${href(lang, "/reports")}#${tab}`);
        setRute({ v: "home", tab });
      }}
      onOpen={(id) => pergi({ v: "sesi", id })}
      onDocs={() => pergi({ v: "docs" })}
      onOpenPay={() => {
        location.href = href(lang, "/team#pembayaran");
      }}
    />
  );
}
