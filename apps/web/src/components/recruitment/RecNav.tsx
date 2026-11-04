/**
 * The recruitment navbar (prompt 03, ruled 2026-10-23): while Open
 * Recruitment runs its pages use this bar and none of the practicum's, so
 * recruitment is recruitment only and the practicum stays the practicum (its
 * own bar has no recruitment entry; the Home banner is the way in). The way
 * back is "Buka IRIS Praktikum" in the account menu, and for everyone, signed
 * out too, Kembali ke Praktikum at the top of every recruitment page
 * (KepalaHalaman in shared.tsx).
 *
 * It borrows the practicum bar's look (AppNav.css classes), the Tampilan
 * panel and the account chip's avatar, but none of its polling: no Konsol,
 * session or TP calls, no session mini bar.
 *
 * Sections follow who is looking. A Panitia member gets five entries:
 * Ringkasan, Kalender, Kandidat, and two menus that group the rest, Tahapan
 * (Cutting, Plotting, Tes Tulis, Wawancara, Tubes, Mengajar, Penerimaan) and
 * Kelola (Bank Soal, Panitia). Another Asisten gets the calendar and Tahapan;
 * a candidate, a Praktikan and a visitor get the recruitment page with its
 * calendar. Signing out lands on the real Home.
 */
import { useEffect, useMemo, useState, type ComponentType } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import {
  CalendarBlankIcon,
  CaretDownIcon,
  ClipboardTextIcon,
  DoorOpenIcon,
  FileTextIcon,
  FlagBannerIcon,
  GearSixIcon,
  CpuIcon,
  GraduationCapIcon,
  ListChecksIcon,
  MapPinIcon,
  ScissorsIcon,
  SealCheckIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  StarIcon,
  TimerIcon,
  UsersThreeIcon,
  type IconProps,
  ChatsCircleIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import DisplayPanel, { BUKA_TAMPILAN } from "../shell/DisplayPanel";
import NavClock from "../shell/NavClock";
import AlertRail from "../shell/AlertRail";
import OfflineNotice from "../shell/OfflineNotice";
import Avatar from "../shell/Avatar";
import { href, meChanged, postJson } from "../../lib/app";
import { useLatihanMode, useRecOrang } from "../../lib/recruitment/latihan-client";
import { LatihanBar, LatihanBaris } from "./Latihan";
import { pathForLang, type Lang } from "../../lib/kelas";
import { readLangPref, saveLangPref } from "../../lib/hooks";
import {
  bukaAkun,
  recPost,
  useRecAkun,
  useRecCandidates,
  useRecEdition,
} from "../../lib/recruitment/client";
import { useRecRooms } from "../../lib/recruitment/room-client";
import AkunDialog from "./candidate/AkunDialog";
import { AK } from "./candidate/akunStrings";
import {
  alamatBagian,
  bukaBagian,
  useBagian,
  type PanelTab,
} from "../../lib/recruitment/panel-tab";
import { REC } from "./recruitmentStrings";
import "../shell/AppNav.css";
import "./recruitment.css";
import "./recruitment-shell.css";

type Ikon = ComponentType<IconProps>;

interface Bagian {
  key: string;
  label: string;
  icon: Ikon;
  href: string;
  /** A count badge beside the name (Kandidat: how many registered) */
  n?: number;
  /** Opens a panel part in place when the panel is already on screen */
  tab?: PanelTab;
}

/**
 * Related parts share one menu so the bar stays short: Tahapan holds the
 * selection stages, Kelola holds what the committee sets up. A group with a
 * single part is shown as that part, never as a one-item menu.
 */
interface Grup {
  key: string;
  label: string;
  icon: Ikon;
  children: Bagian[];
}

type Butir = Bagian | Grup;

const isGrup = (b: Butir): b is Grup => "children" in b;

function GrupMenu({
  grup,
  aktif,
  side,
  variant,
  onGo,
}: {
  grup: Grup;
  aktif: string;
  side: "top" | "bottom";
  variant: "top" | "bar";
  onGo: (e: React.MouseEvent, l: Bagian) => void;
}) {
  const [open, setOpen] = useState(false);
  const dalam = grup.children.find((c) => c.key === aktif);
  const n = grup.children.reduce((a, c) => a + (c.n ?? 0), 0);
  const badge = n ? <span className="rec-nav__n">{n}</span> : null;
  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          className={variant === "bar" ? "appbar__item rec-grup" : "appnav__link rec-grup"}
          data-k={dalam?.key}
          aria-current={dalam ? "page" : undefined}
          aria-haspopup="menu"
        >
          {variant === "bar" ? (
            <>
              <span className="appbar__icon">
                <grup.icon size={21} aria-hidden="true" />
                {badge}
              </span>
              <span className="appbar__label">{grup.label}</span>
            </>
          ) : (
            <>
              <span className="rec-grup__lbl">
                <span className="rec-grup__grp">{grup.label}</span>
                {dalam && (
                  <>
                    <span className="rec-grup__sep">: </span>
                    <b className="rec-grup__cur">{dalam.label}</b>
                  </>
                )}
              </span>
              {badge}
              <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
            </>
          )}
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          className="appnav__menu rec-grup__menu sweep-edge"
          side={side}
          align={variant === "bar" ? "center" : "start"}
          sideOffset={10}
          collisionPadding={12}
        >
          <div className="acct">
            {grup.children.map((l) => (
              <a
                key={l.key}
                className="acct__row"
                href={l.href}
                aria-current={l.key === aktif ? "page" : undefined}
                onClick={(e) => {
                  onGo(e, l);
                  setOpen(false);
                }}
              >
                <span className="rec-grup__row">
                  <l.icon size={20} aria-hidden="true" />
                  <span>{l.label}</span>
                  {l.n ? <span className="rec-nav__n">{l.n}</span> : null}
                </span>
              </a>
            ))}
          </div>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

function barePath(p: string): string {
  const s = /^\/(en|zh)(\/|$)/.test(p) ? p.slice(3) || "/" : p;
  return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
}

export default function RecNav({ lang, path }: { lang: Lang; path: string }) {
  const t = REC[lang].nav;
  const me = useRecOrang();
  const prefix = lang === "id" ? "" : `/${lang}`;
  const asisten = me?.role === "asisten";
  // A candidate is their oprec account; the practicum's Praktikan sign-in does not count here (2026-10-24).
  const akun = useRecAkun(me !== undefined && !asisten);
  const oprec = asisten ? null : (akun.data?.account ?? null);
  const orang = asisten
    ? me
    : oprec
      ? ({ role: "praktikan", nim: oprec.nim, nama: oprec.nama } as NonNullable<typeof me>)
      : null;
  const tamu = me !== undefined && !asisten && akun.updatedAt !== null && !oprec;
  // An Asisten acting As CaAs keeps the Mode Latihan entry so they can leave it.
  const latihanCaas = useLatihanMode() === "caas";
  const ak = AK[lang];
  const edisi = useRecEdition(me !== undefined);
  const viewer = edisi.data?.viewer;
  const rights = edisi.data?.rights ?? null;
  const panitia = asisten && viewer === "panitia";
  // Tes Tulis: the rooms this person may watch (a plotted pengawas is not always on the committee).
  const ruang = useRecRooms(asisten);
  const adaRuang = !!ruang.data && (ruang.data.rooms.length > 0 || ruang.data.canSetup);
  const cand = useRecCandidates(panitia && rights?.candidates === true);
  const nKandidat = cand.data?.candidates.length;
  const current = barePath(path);
  const onPanel = current.startsWith("/recruitment/panel");
  const bagian = useBagian();
  const aktif = onPanel ? (bagian ?? (panitia ? "ringkasan" : "kalender")) : "rekrutmen";

  const items = useMemo<Butir[]>(() => {
    const tab = (k: PanelTab, label: string, icon: Ikon, n?: number): Bagian => ({
      key: k,
      label,
      icon,
      n,
      tab: k,
      href: alamatBagian(prefix, k),
    });
    const grup = (key: string, label: string, icon: Ikon, children: Bagian[]): Butir[] =>
      children.length > 1 ? [{ key, label, icon, children }] : children;
    if (panitia) {
      return [
        tab("ringkasan", t.ringkasan, ClipboardTextIcon),
        tab("kalender", t.kalender, CalendarBlankIcon),
        ...(rights?.candidates ? [tab("kandidat", t.kandidat, ListChecksIcon, nKandidat)] : []),
        ...grup("tahapan", t.tahapan, FlagBannerIcon, [
          ...(rights?.cuttingPropose ? [tab("cutting", t.cutting, ScissorsIcon)] : []),
          ...(rights?.plotting
            ? [tab("plotting", t.plotting, MapPinIcon, edisi.data?.plotRequests || undefined)]
            : []),
          ...(adaRuang ? [tab("tes", t.tes, TimerIcon)] : []),
          tab("wawancara", t.wawancara, ChatsCircleIcon),
          tab("tubes", t.tubes, CpuIcon),
          tab("mengajar", t.mengajar, GraduationCapIcon),
          tab("penerimaan", t.penerimaan, SealCheckIcon),
        ]),
        ...grup("kelola", t.kelola, GearSixIcon, [
          ...(rights?.bank ? [tab("bank", t.bank, FileTextIcon)] : []),
          tab("panitia", t.panitia, UsersThreeIcon),
        ]),
      ];
    }
    if (asisten) {
      return [
        tab("kalender", t.kalender, CalendarBlankIcon),
        ...grup("tahapan", t.tahapan, FlagBannerIcon, [
          ...(adaRuang ? [tab("tes", t.tes, TimerIcon)] : []),
          tab("wawancara", t.wawancara, ChatsCircleIcon),
          tab("tubes", t.tubes, CpuIcon),
          tab("mengajar", t.mengajar, GraduationCapIcon),
        ]),
      ];
    }
    return [
      { key: "rekrutmen", label: t.rekrutmen, icon: StarIcon, href: `${prefix}/recruitment` },
      {
        key: "kalender",
        label: t.kalender,
        icon: CalendarBlankIcon,
        href: `${prefix}/recruitment#kalender`,
      },
    ];
  }, [
    panitia,
    asisten,
    adaRuang,
    rights?.candidates,
    rights?.cuttingPropose,
    rights?.plotting,
    rights?.bank,
    nKandidat,
    edisi.data?.plotRequests,
    prefix,
    t,
  ]);

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // The saved language wins, as on every other page.
  useEffect(() => {
    if (me === undefined) return;
    const pref = readLangPref();
    if (pref && pref !== lang)
      location.replace(pathForLang(location.pathname + location.search + location.hash, pref));
  }, [me, lang]);
  const switchLang = (to: Lang) => {
    if (to === lang) return;
    saveLangPref(to);
    location.assign(pathForLang(location.pathname + location.search + location.hash, to));
  };

  const [dispPop, setDispPop] = useState(false);
  const [dispSheet, setDispSheet] = useState(false);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    const open = () =>
      window.matchMedia("(max-width: 759px)").matches ? setDispSheet(true) : setDispPop(true);
    window.addEventListener(BUKA_TAMPILAN, open);
    return () => window.removeEventListener(BUKA_TAMPILAN, open);
  }, []);

  async function signOut() {
    try {
      // The oprec account signs out on its own; the practicum sign-in stays as it is.
      if (asisten) await postJson("/api/auth/logout");
      else await recPost("account-signout");
    } finally {
      meChanged();
      // Signed out of oprec mode: back to the real Home, not the recruitment page.
      location.assign(href(lang, "/"));
    }
  }

  const go = (e: React.MouseEvent, l: Bagian) => {
    // Already on the panel: change the part in place.
    if (l.tab && onPanel && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      bukaBagian(l.tab);
    }
  };
  const aktifLink = (l: Bagian) => (l.key === aktif ? "page" : undefined);

  const signIn = () => bukaAkun("masuk");

  const account = (close?: () => void) =>
    orang && (
      <div className="acct">
        <div className="acct__who">
          <Avatar me={orang} lg />
          <span className="acct__names">
            <b>{orang.nama}</b>
            <span className="acct__meta">
              {asisten ? t.who(orang.role) : ak.menu.akun} ·{" "}
              <span className="mono">{orang.nim}</span>
            </span>
          </span>
        </div>
        <a className="acct__row" href={href(lang, "/")} onClick={close}>
          <span>{t.praktikum}</span>
        </a>
        {asisten && (
          <a className="acct__row" href={href(lang, "/account")} onClick={close}>
            <span>{t.myAccount}</span>
          </a>
        )}
        {(asisten || latihanCaas) && <LatihanBaris lang={lang} onDone={close} />}
        <button
          type="button"
          className="acct__row acct__row--danger"
          onClick={() => void signOut()}
        >
          <span>{asisten ? t.signOut : ak.menu.keluar}</span>
          <SignOutIcon size={20} aria-hidden="true" />
        </button>
      </div>
    );

  return (
    <>
      <header
        className="appnav rec-nav"
        data-scrolled={scrolled ? "yes" : "no"}
        data-tamu={tamu ? "yes" : undefined}
      >
        <a className="appnav__brand" href={`${prefix}/recruitment`} aria-label={t.brand}>
          <img src="/brand/iris-logo-mark.png" alt="" width="198" height="90" />
        </a>

        <nav className="appnav__links" aria-label={t.main}>
          {items.map((it) =>
            isGrup(it) ? (
              <GrupMenu
                key={it.key}
                grup={it}
                aktif={aktif}
                side="bottom"
                variant="top"
                onGo={go}
              />
            ) : (
              <a
                key={it.key}
                className="appnav__link"
                href={it.href}
                data-k={it.key}
                aria-current={aktifLink(it)}
                onClick={(e) => go(e, it)}
              >
                <span>{it.label}</span>
                {it.n ? <span className="rec-nav__n">{it.n}</span> : null}
              </a>
            ),
          )}
        </nav>

        {tamu && (
          <div className="appnav__center">
            <button type="button" className="btn btn--primary appnav__signin" onClick={signIn}>
              <span className="btn__label">{t.signIn}</span>
              <DoorOpenIcon size={18} weight="bold" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="appnav__side">
          <NavClock lang={lang} inSession={false} />
          <RadixPopover.Root open={dispPop} onOpenChange={setDispPop}>
            <RadixPopover.Trigger asChild>
              <IconButton icon={SlidersHorizontalIcon} label={t.display} tipSide="bottom" />
            </RadixPopover.Trigger>
            <RadixPopover.Portal>
              <RadixPopover.Content
                className="popover__panel appnav__disp"
                tabIndex={-1}
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement | null)?.focus();
                }}
                align="end"
                sideOffset={10}
                collisionPadding={12}
              >
                <DisplayPanel lang={lang} onLang={switchLang} />
              </RadixPopover.Content>
            </RadixPopover.Portal>
          </RadixPopover.Root>

          {orang && (
            <RadixPopover.Root>
              <RadixPopover.Trigger asChild>
                <button type="button" className="appnav__me" aria-label={t.account}>
                  <Avatar me={orang} />
                  <span className="appnav__badge">
                    {asisten ? t.who(orang.role) : ak.menu.badge}
                  </span>
                </button>
              </RadixPopover.Trigger>
              <RadixPopover.Portal>
                <RadixPopover.Content
                  className="appnav__menu sweep-edge"
                  align="end"
                  sideOffset={10}
                  collisionPadding={12}
                >
                  {account()}
                </RadixPopover.Content>
              </RadixPopover.Portal>
            </RadixPopover.Root>
          )}
        </div>

        <IconButton
          icon={SlidersHorizontalIcon}
          label={t.display}
          className="appnav__disp-mobile"
          onClick={() => setDispSheet(true)}
        />
        {tamu ? (
          <button
            type="button"
            className="btn btn--primary appnav__signin appnav__signin--mobile"
            onClick={signIn}
          >
            <span className="btn__label">{t.signIn}</span>
            <DoorOpenIcon size={18} weight="bold" aria-hidden="true" />
          </button>
        ) : (
          orang && (
            <button
              type="button"
              className="appnav__me appnav__me--mobile"
              onClick={() => setSheet(true)}
              aria-label={t.account}
            >
              <Avatar me={orang} />
            </button>
          )
        )}
      </header>

      <LatihanBar lang={lang} />

      <AlertRail lang={lang}>
        <OfflineNotice lang={lang} />
      </AlertRail>

      <nav className="appbar" aria-label={t.main}>
        {items.map((it) =>
          isGrup(it) ? (
            <GrupMenu key={it.key} grup={it} aktif={aktif} side="top" variant="bar" onGo={go} />
          ) : (
            <a
              key={it.key}
              className="appbar__item"
              href={it.href}
              aria-current={aktifLink(it)}
              onClick={(e) => go(e, it)}
            >
              <span className="appbar__icon">
                <it.icon size={21} aria-hidden="true" />
                {it.n ? <span className="rec-nav__n">{it.n}</span> : null}
              </span>
              <span className="appbar__label">{it.label}</span>
            </a>
          ),
        )}
      </nav>

      <Dialog open={dispSheet} onOpenChange={setDispSheet} title={t.display} sheet lang={lang}>
        <DisplayPanel lang={lang} onLang={switchLang} />
      </Dialog>
      <Dialog open={sheet} onOpenChange={setSheet} title={t.account} sheet lang={lang}>
        {account(() => setSheet(false))}
      </Dialog>
      <AkunDialog lang={lang} />
    </>
  );
}
