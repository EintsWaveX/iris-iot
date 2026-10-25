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
 * Sections follow who is looking. A Panitia member gets the panel's parts
 * (Ringkasan, Kalender, Kandidat with the right to see candidates, Panitia);
 * another Asisten gets the calendar; a candidate, a Praktikan and a visitor
 * get the recruitment page with its calendar.
 */
import { useEffect, useMemo, useState, type ComponentType } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import {
  CalendarBlankIcon,
  ClipboardTextIcon,
  DatabaseIcon,
  DoorOpenIcon,
  DotsThreeIcon,
  ListChecksIcon,
  ScissorsIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  StarIcon,
  TableIcon,
  TimerIcon,
  UsersThreeIcon,
  type IconProps,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import DisplayPanel, { BUKA_TAMPILAN } from "../shell/DisplayPanel";
import NavClock from "../shell/NavClock";
import AlertRail from "../shell/AlertRail";
import OfflineNotice from "../shell/OfflineNotice";
import Avatar from "../shell/Avatar";
import { href, meChanged, postJson, useMe } from "../../lib/app";
import { pathForLang, type Lang } from "../../lib/kelas";
import { readLangPref, saveLangPref } from "../../lib/hooks";
import { bukaAkun, recPost, useRecAkun, useRecEdition } from "../../lib/recruitment/client";
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

type Ikon = ComponentType<IconProps>;

interface Bagian {
  key: string;
  label: string;
  icon: Ikon;
  href: string;
  /** Opens a panel part in place when the panel is already on screen */
  tab?: PanelTab;
  /** Where the fold puts it: "wide" below 1100, "narrow" below 820 (set from its place in the list) */
  fold?: "wide" | "narrow";
}

/**
 * The fold (06, agreed with 08c): from 1100 px every tab shows. Below that the
 * top bar keeps 5 (4 under 820) and the rest go into Lainnya; the phone's
 * bottom bar keeps all of them up to 5 and from 6 on shows 4 plus Lainnya.
 * All of it is CSS on data attributes (no width read in script, so the first
 * paint is right). When the active tab is folded, Lainnya wears its name.
 * Later prompts only append to `links`.
 */
const KEEP_WIDE = 5;
const KEEP_NARROW = 4;

function Lainnya({
  rest,
  label,
  active,
  side,
  variant,
  more,
  act,
  onGo,
  aktif,
}: {
  rest: Bagian[];
  label: string;
  active: Bagian | undefined;
  side: "top" | "bottom";
  variant: "top" | "bar";
  /** Top bar: when the button shows ("wide": below 1100, "narrow": below 820) */
  more?: "wide" | "narrow";
  /** When the active tab is inside, and so the label is its name */
  act?: "wide" | "narrow" | "bar";
  onGo: (e: React.MouseEvent, l: Bagian) => void;
  aktif: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          className={variant === "bar" ? "appbar__item rec-more" : "appnav__link rec-more"}
          data-more={more}
          data-act={act}
          aria-haspopup="menu"
        >
          {variant === "bar" ? (
            <>
              <span className="appbar__icon">
                <DotsThreeIcon size={21} weight="bold" aria-hidden="true" />
              </span>
              <span className="appbar__label">
                <span className="rec-more__def">{label}</span>
                <span className="rec-more__act">{active?.label}</span>
              </span>
            </>
          ) : (
            <span>
              <span className="rec-more__def">{label}</span>
              <span className="rec-more__act">{active?.label}</span>
            </span>
          )}
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          className="appnav__menu rec-more__menu sweep-edge"
          side={side}
          align="end"
          sideOffset={10}
          collisionPadding={12}
        >
          <div className="acct">
            {rest.map((l) => (
              <a
                key={l.key}
                className="acct__row"
                href={l.href}
                aria-current={l.key === aktif ? "page" : undefined}
                data-fold={l.fold}
                onClick={(e) => {
                  onGo(e, l);
                  setOpen(false);
                }}
              >
                <span>{l.label}</span>
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
  const me = useMe();
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
  const ak = AK[lang];
  const edisi = useRecEdition(me !== undefined);
  const viewer = edisi.data?.viewer;
  const rights = edisi.data?.rights ?? null;
  const panitia = asisten && viewer === "panitia";
  // Tes Tulis: the rooms this person may watch (a plotted pengawas is not always on the committee).
  const ruang = useRecRooms(asisten);
  const adaRuang = !!ruang.data && (ruang.data.rooms.length > 0 || ruang.data.canSetup);
  const current = barePath(path);
  const onPanel = current.startsWith("/recruitment/panel");
  const bagian = useBagian();
  const aktif = onPanel ? (bagian ?? (panitia ? "ringkasan" : "kalender")) : "rekrutmen";

  const links = useMemo<Bagian[]>(() => {
    if (panitia) {
      const tab = (k: PanelTab, label: string, icon: Ikon): Bagian => ({
        key: k,
        label,
        icon,
        tab: k,
        href: alamatBagian(prefix, k),
      });
      return [
        tab("ringkasan", t.ringkasan, ClipboardTextIcon),
        tab("kalender", t.kalender, CalendarBlankIcon),
        ...(rights?.candidates ? [tab("kandidat", t.kandidat, ListChecksIcon)] : []),
        ...(rights?.cuttingPropose ? [tab("cutting", t.cutting, ScissorsIcon)] : []),
        ...(rights?.plotting ? [tab("plotting", t.plotting, TableIcon)] : []),
        ...(adaRuang ? [tab("tes", t.tes, TimerIcon)] : []),
        ...(rights?.bank ? [tab("bank", t.bank, DatabaseIcon)] : []),
        tab("panitia", t.panitia, UsersThreeIcon),
      ];
    }
    if (asisten) {
      return [
        {
          key: "kalender",
          label: t.kalender,
          icon: CalendarBlankIcon,
          tab: "kalender",
          href: alamatBagian(prefix, "kalender"),
        },
        ...(adaRuang
          ? [
              {
                key: "tes",
                label: t.tes,
                icon: TimerIcon,
                tab: "tes" as const,
                href: alamatBagian(prefix, "tes"),
              },
            ]
          : []),
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
    prefix,
    t,
  ]);

  const n = links.length;
  const lipat = useMemo<Bagian[]>(
    () =>
      links.map((l, i) => ({
        ...l,
        fold: i >= KEEP_WIDE ? "wide" : i === KEEP_NARROW ? "narrow" : undefined,
      })),
    [links],
  );
  const iAktif = lipat.findIndex((l) => l.key === aktif);
  const moreTop = n > KEEP_WIDE ? "wide" : n > KEEP_NARROW ? "narrow" : undefined;
  const actTop = iAktif >= KEEP_WIDE ? "wide" : iAktif === KEEP_NARROW ? "narrow" : undefined;
  // The phone's bar: everything up to 5, from 6 on four and Lainnya.
  const barKeep = n > KEEP_WIDE ? KEEP_NARROW : n;
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
      location.assign(href(lang, "/recruitment"));
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
          {lipat.map((l) => (
            <a
              key={l.key}
              className="appnav__link"
              href={l.href}
              data-fold={l.fold}
              aria-current={aktifLink(l)}
              onClick={(e) => go(e, l)}
            >
              <span>{l.label}</span>
            </a>
          ))}
          {moreTop && (
            <Lainnya
              rest={lipat.slice(KEEP_NARROW)}
              label={t.more}
              active={actTop ? lipat[iAktif] : undefined}
              side="bottom"
              variant="top"
              more={moreTop}
              act={actTop}
              onGo={go}
              aktif={aktif}
            />
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

        <NavClock lang={lang} inSession={false} className="navclock--mobile" />
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

      <AlertRail lang={lang}>
        <OfflineNotice lang={lang} />
      </AlertRail>

      <nav className="appbar" aria-label={t.main}>
        {links.slice(0, barKeep).map((l) => (
          <a
            key={l.key}
            className="appbar__item"
            href={l.href}
            aria-current={aktifLink(l)}
            onClick={(e) => go(e, l)}
          >
            <span className="appbar__icon">
              <l.icon size={21} aria-hidden="true" />
            </span>
            <span className="appbar__label">{l.label}</span>
          </a>
        ))}
        {n > barKeep && (
          <Lainnya
            rest={lipat.slice(barKeep)}
            label={t.more}
            active={iAktif >= barKeep ? lipat[iAktif] : undefined}
            side="top"
            variant="bar"
            act={iAktif >= barKeep ? "bar" : undefined}
            onGo={go}
            aktif={aktif}
          />
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
