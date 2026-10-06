/**
 * Kirim ke SeeLabs (Phase 9 Stage 3g, mockup c-seelabs). Five tabs:
 *
 * - Salin: this session's groups with their KLP, account and status, and
 *   the chosen group's copy sheet. Only with a session.
 * - Bookmarklet: the draggable "IRIS · Isi SeeLabs" pill and what it does.
 * - Cara Mengisi / Tidak Cocok: a labelled sketch of the SeeLabs form being
 *   filled, and of the mismatch refusal. A schematic, not a screenshot.
 * - Titipan: groups that go through MY account as a lender.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CheckCircleIcon,
  CursorClickIcon,
  HandCoinsIcon,
  InfoIcon,
  ProhibitIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import BackButton from "../../ui/BackButton";
import Fade from "../../ui/Fade";
import { localeOf, tanggalPanjang, titikDua } from "../../../lib/app";
import { hariLabel, kelompokLabel, modulLabel } from "../../../lib/labels";
import { useDirektori } from "../../../lib/people";
import type { Lang } from "../../../lib/kelas";
import { SEELABS_KOLOM, buatPayload } from "../../../lib/seelabs";
import { kirimSeelabs, salinTeks, useSeelabs, useTitipan, type KelompokSeelabs } from "./data";
import { SL, pesanSl, type SeelabsStrings } from "./strings";
import { SavedButton, SeelabsBody, StatusPill, tandaiSimpan } from "./SeelabsSheet";
import BookmarkletPill from "./BookmarkletPill";
import "../../ui/Tabs.css";
import "./seelabs.css";

export type SeelabsTab = "salin" | "pasang" | "cara" | "tidak" | "titipan";

export default function SeelabsView({
  lang,
  sesiId,
  meNim,
  tab: tab0,
  nomor,
  onBack,
  backLabel,
}: {
  lang: Lang;
  sesiId: number | null;
  meNim: string;
  tab?: SeelabsTab;
  /** The group to show first on Salin. */
  nomor?: number | null;
  onBack: () => void;
  backLabel?: string;
}) {
  const t = SL[lang];
  const tabs: SeelabsTab[] = sesiId
    ? ["salin", "pasang", "cara", "tidak", "titipan"]
    : ["pasang", "cara", "tidak", "titipan"];
  const [tab, setTab] = useState<SeelabsTab>(tab0 && tabs.includes(tab0) ? tab0 : tabs[0]);
  const sl = useSeelabs(sesiId);
  const dir = useDirektori();
  const kode = (nim: string | null) =>
    nim ? (dir.byNim.get(nim)?.kode?.toUpperCase() ?? nim) : "?";
  const data = sl.data;
  const [pick, setPick] = useState<number | null>(nomor ?? null);
  // Opens on the asked group, else my first group (scorer or lender).
  const g =
    data?.kelompok.find((x) => x.nomor === pick) ??
    data?.kelompok.find((x) => x.penilai === meNim || x.akun === meNim) ??
    data?.kelompok[0] ??
    null;

  const eyebrow = !data
    ? t.eyebrowNone
    : data.sesi.jenis === "susulan" || !data.sesi.slot
      ? t.eyebrowMakeup(tanggalPanjang(data.sesi.tanggal, lang))
      : t.eyebrowSlot(tanggalPanjang(data.sesi.tanggal, lang), data.sesi.slot);

  let body;
  if (tab === "salin") {
    body = !data ? (
      <section className="panel">
        {sl.kode ? (
          <p className="hint" role="status">
            {pesanSl(t, sl.kode)}
          </p>
        ) : (
          <span className="skeleton" style={{ height: 320 }} />
        )}
      </section>
    ) : (
      <div className="seeside">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">{t.groups}</h2>
          </div>
          <div className="seepicks">
            {data.kelompok.map((k) => (
              <button
                key={k.nomor}
                type="button"
                className={`seepick${g?.nomor === k.nomor ? " is-on" : ""}`}
                aria-pressed={g?.nomor === k.nomor}
                onClick={() => setPick(k.nomor)}
              >
                <span
                  className="pill pill--group"
                  style={{ "--pill-hue": `var(--group-${k.nomor})` } as CSSProperties}
                >
                  {kelompokLabel(k.nomor, lang)}
                </span>
                <span className="seepick__text">
                  <b>{k.klp.length ? t.klpChip(k.klp.join(", ")) : t.klpNone}</b>
                  <span className="hint truncate">
                    {k.pinjam && k.akun
                      ? t.via(kode(k.akun))
                      : k.penilai
                        ? kode(k.penilai)
                        : t.noOwner}
                  </span>
                </span>
                <StatusPill t={t} status={k.status} />
              </button>
            ))}
          </div>
        </section>
        {g && (
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">
                {g.klp.length
                  ? t.groupKlp(kelompokLabel(g.nomor, lang), g.klp.join(", "))
                  : kelompokLabel(g.nomor, lang)}
              </h2>
              <StatusPill t={t} status={g.status} />
            </div>
            <SeelabsBody
              t={t}
              lang={lang}
              data={data}
              g={g}
              nama={dir.nama}
              kode={kode}
              onCopied={sl.refresh}
              main={
                g.penilai === meNim || g.akun === meNim || !g.penilai ? (
                  <SavedButton t={t} lang={lang} sesiId={data.sesi.id} g={g} onDone={sl.refresh} />
                ) : undefined
              }
            />
            {g.disimpanPada && (
              <span className="hint">
                {t.savedAt(
                  titikDua(
                    new Date(g.disimpanPada).toLocaleTimeString(localeOf(lang), {
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                  ),
                )}
              </span>
            )}
          </section>
        )}
      </div>
    );
  } else if (tab === "pasang") {
    body = <Install t={t} />;
  } else if (tab === "cara" || tab === "tidak") {
    body = (
      <section className="panel panel--solo">
        <FormIllo key={tab} t={t} bad={tab === "tidak"} g={g} modul={data?.sesi.modul ?? 3} />
      </section>
    );
  } else {
    body = <Held t={t} lang={lang} kode={kode} nama={dir.nama} />;
  }

  return (
    <div className="seeview">
      <BackButton lang={lang} label={backLabel ?? t.back} onClick={onBack} />
      <div className="page-header__heading">
        <span className="page-header__eyebrow">{eyebrow}</span>
        <h1 className="page-header__title">{t.title}</h1>
      </div>
      <div className="tabs-scroll">
        <nav className="tabs" role="tablist" aria-label={t.title}>
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              className="tabs__tab"
              onClick={() => setTab(id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const i = tabs.indexOf(tab);
                const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
                setTab(n);
                const list = e.currentTarget.parentElement;
                requestAnimationFrame(() =>
                  (list?.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus(),
                );
              }}
            >
              {t.tabs[id]}
            </button>
          ))}
        </nav>
      </div>
      <Fade k={tab}>{body}</Fade>
    </div>
  );
}

/* ------------------------------------------------------------- install */

function Install({ t }: { t: SeelabsStrings }) {
  return (
    <div className="seegrid">
      <section className="panel panel--key">
        <h2 className="panel__title">{t.installTitle}</h2>
        <p className="panel__sub">{t.installSub}</p>
        <BookmarkletPill t={t} />
        <ol className="seesteps">
          {t.installSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
      <section className="panel">
        <h2 className="panel__title">{t.doesTitle}</h2>
        <ul className="seedoes">
          {t.does.map((s) => (
            <li key={s}>
              <CheckCircleIcon size={20} className="seedoes__ok" aria-hidden="true" />
              <span>{s}</span>
            </li>
          ))}
          {t.doesNot.map((s) => (
            <li key={s}>
              <ProhibitIcon size={20} className="seedoes__no" aria-hidden="true" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
        <span className="hint">{t.listMode}</span>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------- form sketch */

const CONTOH = [
  { nim: "1101223001", skor: [86, 90, 84, 88, 82, 85, 80, 87] },
  { nim: "1101223014", skor: [78, 85, 80, 82, 79, 83, 76, 81] },
  { nim: "1101223027", skor: [91, 88, 86, 90, 85, 89, 84, 90] },
  { nim: "1101223040", skor: [74, 80, 77, 79, 75, 78, 72, 76] },
];

function FormIllo({
  t,
  bad,
  g,
  modul,
}: {
  t: SeelabsStrings;
  bad: boolean;
  g: KelompokSeelabs | null;
  modul: number;
}) {
  // The real group's numbers when it has them, else a made-up example.
  const rows = useMemo(() => {
    const nyata = g?.baris.filter((b) => Object.keys(b.skor).length > 0) ?? [];
    if (nyata.length === 0) return CONTOH;
    return nyata.map((b) => ({ nim: b.nim, skor: SEELABS_KOLOM.map((k) => b.skor[k] ?? 0) }));
  }, [g]);
  const klp = g?.klp[0] ?? "31";
  const lain = String(Math.max(1, Number(klp) - 1));
  const cells = rows.length * SEELABS_KOLOM.length;
  const total = cells + 2;
  const still =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [n, setN] = useState(still ? total : 0);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (bad || still) return;
    setN(0);
    const id = window.setInterval(
      () =>
        setN((x) => {
          if (x >= total) window.clearInterval(id);
          return Math.min(total, x + 1);
        }),
      90,
    );
    return () => window.clearInterval(id);
  }, [bad, still, total, round]);

  const filled = (i: number) => !bad && n > 2 + i;
  return (
    <div className="illo">
      <div className="illo__cap">
        <InfoIcon size={16} aria-hidden="true" />
        {t.illoCap}
      </div>
      <div className="illo__form" aria-hidden="true">
        <div className="illo__head">
          <span>
            {t.illoGroup} {bad ? lain : klp}
          </span>
          <span className="illo__sel" data-on={!bad && n > 2 ? "yes" : "no"}>
            Modul {!bad && n > 2 ? modul : "?"}
          </span>
        </div>
        <div className="seetable__wrap">
          <table className="illo__t">
            <thead>
              <tr>
                <th>NIM</th>
                {SEELABS_KOLOM.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={r.nim}>
                  <td className="mono">{r.nim}</td>
                  {r.skor.map((v, ci) => {
                    const on = filled(ri * SEELABS_KOLOM.length + ci);
                    return (
                      <td key={ci}>
                        <span className="illo__in" data-on={on ? "yes" : "no"}>
                          {on ? v : 0}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="illo__save">Simpan Penilaian</div>
      </div>
      <div className={`bmpanel${bad ? " bmpanel--bad" : ""}`} role="status">
        <b>
          <CursorClickIcon size={16} aria-hidden="true" />
          IRIS · Isi SeeLabs
        </b>
        {bad ? (
          <>
            <span>{t.illoBad(lain, klp)}</span>
            <span className="hint">{t.illoBadFix(klp)}</span>
          </>
        ) : (
          <>
            <span>
              {n >= total ? t.illoFilled(rows.length, rows.length, modul) : t.illoFilling}
            </span>
            <span className="hint">{t.illoCheck}</span>
          </>
        )}
      </div>
      {!bad && !still && n >= total && (
        <button
          type="button"
          className="btn btn--ghost illo__again"
          onClick={() => setRound((r) => r + 1)}
        >
          {t.illoReplay}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ held */

function Held({
  t,
  lang,
  kode,
  nama,
}: {
  t: SeelabsStrings;
  lang: Lang;
  kode: (nim: string | null) => string;
  nama: (nim: string | null) => string;
}) {
  const held = useTitipan();
  const list = held.data?.titipan ?? [];
  return (
    <section className="panel panel--solo">
      <div className="panel__head">
        <h2 className="panel__title">{t.heldTitle}</h2>
        {list.length > 0 && <span className="pill pill--warn">{list.length}</span>}
      </div>
      <p className="panel__sub">{list.length ? t.heldSub : t.heldNone}</p>
      {held.data === null && <span className="skeleton" style={{ height: 72 }} />}
      {list.map((x) => {
        const g = x.kelompok;
        const klp = g.klp.join(", ") || "?";
        return (
          <div key={`${x.id}-${g.nomor}`} className="stack">
            <div className="inboxrow">
              <span
                className="pill pill--group"
                style={{ "--pill-hue": `var(--group-${g.nomor})` } as CSSProperties}
              >
                {kelompokLabel(g.nomor, lang)}
              </span>
              <span className="stack inboxrow__text">
                <b>{t.heldFrom(nama(g.penilai), klp, modulLabel(x.modul, lang))}</b>
                <span className="hint">
                  {tanggalPanjang(x.tanggal, lang)} · {x.mulai.slice(0, 5)}
                </span>
              </span>
              <span className="row">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={async () => {
                    const ok = await salinTeks(
                      buatPayload({
                        kelas: x.kelas,
                        klp: g.klp,
                        modul: x.modul,
                        kelompok: g.nomor,
                        bahasa: lang,
                        baris: g.baris,
                      }),
                    );
                    if (!ok) return window.Toast?.show(t.copyFail, "danger");
                    window.Toast?.show(t.copiedBm, "ok");
                    const r = await kirimSeelabs({
                      aksi: "salin",
                      sesiId: x.id,
                      kelompok: g.nomor,
                    });
                    if (!r.ok) window.Toast?.show(pesanSl(t, r.kode), "warn");
                  }}
                >
                  <CursorClickIcon size={16} aria-hidden="true" />
                  {t.copyBm}
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={async () => {
                    if (await tandaiSimpan(t, x.id, g.nomor, true)) {
                      window.Toast?.show(t.heldMarked(kode(g.penilai)), "ok");
                      held.refresh();
                    }
                  }}
                >
                  <CheckCircleIcon size={16} aria-hidden="true" />
                  {t.heldMark}
                </button>
              </span>
            </div>
            {x.slot && (
              <div className="banner banner--warn">
                <WarningIcon size={20} aria-hidden="true" />
                <span>
                  {t.heldJaga(
                    hariLabel(new Date(`${x.tanggal}T00:00:00`).getDay(), lang),
                    x.slot,
                    klp,
                  )}
                </span>
              </div>
            )}
            <div className="banner">
              <HandCoinsIcon size={20} aria-hidden="true" />
              <span>{t.heldPay(kode(g.penilai))}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
