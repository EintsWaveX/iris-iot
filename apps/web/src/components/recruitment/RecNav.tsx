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
  DoorOpenIcon,
  ListChecksIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  StarIcon,
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
import { openSignIn } from "../../lib/signin";
import { useRecEdition } from "../../lib/recruitment/client";
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
  const edisi = useRecEdition(me !== undefined);
  const viewer = edisi.data?.viewer;
  const rights = edisi.data?.rights ?? null;
  const panitia = asisten && viewer === "panitia";
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
  }, [panitia, asisten, rights?.candidates, prefix, t]);

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
      await postJson("/api/auth/logout");
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

  const signIn = () => openSignIn(`${prefix}${path.replace(/^\/(en|zh)/, "")}`);

  const account = (close?: () => void) =>
    me && (
      <div className="acct">
        <div className="acct__who">
          <Avatar me={me} lg />
          <span className="acct__names">
            <b>{me.nama}</b>
            <span className="acct__meta">
              {t.who(me.role)} · <span className="mono">{me.nim}</span>
            </span>
          </span>
        </div>
        <a className="acct__row" href={href(lang, "/")} onClick={close}>
          <span>{t.praktikum}</span>
        </a>
        <a className="acct__row" href={href(lang, "/account")} onClick={close}>
          <span>{t.myAccount}</span>
        </a>
        <button
          type="button"
          className="acct__row acct__row--danger"
          onClick={() => void signOut()}
        >
          <span>{t.signOut}</span>
          <SignOutIcon size={20} aria-hidden="true" />
        </button>
      </div>
    );

  return (
    <>
      <header
        className="appnav rec-nav"
        data-scrolled={scrolled ? "yes" : "no"}
        data-tamu={me === null ? "yes" : undefined}
      >
        <a className="appnav__brand" href={`${prefix}/recruitment`} aria-label={t.brand}>
          <img src="/brand/iris-logo-mark.png" alt="" width="198" height="90" />
        </a>

        <nav className="appnav__links" aria-label={t.main}>
          {links.map((l) => (
            <a
              key={l.key}
              className="appnav__link"
              href={l.href}
              aria-current={aktifLink(l)}
              onClick={(e) => go(e, l)}
            >
              <span>{l.label}</span>
            </a>
          ))}
        </nav>

        {me === null && (
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

          {me && (
            <RadixPopover.Root>
              <RadixPopover.Trigger asChild>
                <button type="button" className="appnav__me" aria-label={t.account}>
                  <Avatar me={me} />
                  <span className="appnav__badge">{t.who(me.role)}</span>
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
        {me === null ? (
          <button
            type="button"
            className="btn btn--primary appnav__signin appnav__signin--mobile"
            onClick={signIn}
          >
            <span className="btn__label">{t.signIn}</span>
            <DoorOpenIcon size={18} weight="bold" aria-hidden="true" />
          </button>
        ) : (
          me && (
            <button
              type="button"
              className="appnav__me appnav__me--mobile"
              onClick={() => setSheet(true)}
              aria-label={t.account}
            >
              <Avatar me={me} />
            </button>
          )
        )}
      </header>

      <AlertRail lang={lang}>
        <OfflineNotice lang={lang} />
      </AlertRail>

      <nav className="appbar" aria-label={t.main}>
        {links.slice(0, 5).map((l) => (
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
      </nav>

      <Dialog open={dispSheet} onOpenChange={setDispSheet} title={t.display} sheet lang={lang}>
        <DisplayPanel lang={lang} onLang={switchLang} />
      </Dialog>
      <Dialog open={sheet} onOpenChange={setSheet} title={t.account} sheet lang={lang}>
        {account(() => setSheet(false))}
      </Dialog>
    </>
  );
}
