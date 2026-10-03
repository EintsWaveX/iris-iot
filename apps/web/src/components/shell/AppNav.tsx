/**
 * The app shell's top bar and mobile bottom bar (Phase 8), one island for
 * every page, replacing Nav.astro + AkunSheet.tsx.
 *
 * - Links follow the role: signed out (Beranda, Modul), praktikan (Beranda,
 *   Dasbor, Modul; Live lives in the module page since Phase 9) and asisten (Beranda, Konsol, Jadwal, Server,
 *   Laporan, Modul).
 * - Phase 9: the Tampilan button (theme, background detail, language,
 *   the Mandarin heading weight, the nav clock) is on every page, signed
 *   out too; a popover at 640px and up, a bottom sheet below. A language
 *   choice lands on the same page in the new language (pathForLang) and is
 *   saved per person. The nav clock sits beside it.
 * - The account menu (a popover at 640px and up, a bottom sheet below)
 *   holds the person's badge, the account page, shortcuts and Keluar.
 * - A praktikan also gets the session mini-bar under the nav, and an
 *   assistant gets the Ctrl+K palette and the "?" shortcut sheet.
 *
 * Language default: a personal choice wins; without one, a signed-in person
 * follows the running session's class (International is English). The
 * redirect happens here because this is the one island on every page.
 */
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import {
  BookOpenTextIcon,
  CalendarBlankIcon,
  ChartBarIcon,
  HardDrivesIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  SignOutIcon,
  SignInIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  UserIcon,
  UsersFourIcon,
  UsersThreeIcon,
  type IconProps,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import { Kbd } from "../ui/Controls";
import DisplayPanel from "./DisplayPanel";
import NavClock from "./NavClock";
import { dict, href, meChanged, postJson, useMe, useSessionNow, type Me } from "../../lib/app";
import { langForKelas, langOfPath, pathForLang, type Lang } from "../../lib/kelas";
import { readLangPref, saveLangPref } from "../../lib/hooks";
import { kelompokLabel } from "../../lib/labels";
import SessionMiniBar from "./SessionMiniBar";
import OfflineNotice from "./OfflineNotice";
import IdentityWatch from "./IdentityWatch";
import AsistenCommands from "./AsistenCommands";
import "./AppNav.css";

type Icon = ComponentType<IconProps>;

interface Link {
  path: string;
  label: string;
  icon: Icon;
}

const T = dict({
  id: {
    main: "Utama",
    home: "Beranda",
    dashboard: "Dasbor",
    modules: "Modul",
    console: "Konsol",
    schedule: "Jadwal",
    server: "Server",
    reports: "Laporan",
    team: "Tim",
    signIn: "Masuk",
    signOut: "Keluar",
    account: "Akun",
    myAccount: "Halaman Akun",
    display: "Tampilan",
    shortcuts: "Pintasan Keyboard",
    palette: "Cari perintah",
    praktikan: "Praktikan",
    asisten: "Asisten",
    group: (n: number) => kelompokLabel(n, "id"),
    notSignedIn: "Belum masuk",
    signInHint: "Masuk untuk membuka dasbor dan menyimpan jawaban.",
  },
  en: {
    main: "Main",
    home: "Home",
    dashboard: "Dashboard",
    modules: "Modules",
    console: "Console",
    schedule: "Schedule",
    server: "Server",
    reports: "Reports",
    team: "Team",
    signIn: "Sign In",
    signOut: "Sign Out",
    account: "Account",
    myAccount: "Account Page",
    display: "Display",
    shortcuts: "Keyboard Shortcuts",
    palette: "Search commands",
    praktikan: "Student",
    asisten: "Assistant",
    group: (n: number) => kelompokLabel(n, "en"),
    notSignedIn: "Not signed in",
    signInHint: "Sign in to open your dashboard and save your answers.",
  },
});

function linksFor(me: Me | null | undefined, t: (typeof T)["id"]): Link[] {
  if (me?.role === "asisten") {
    return [
      { path: "/", label: t.home, icon: HouseIcon },
      { path: "/session", label: t.console, icon: UsersThreeIcon },
      { path: "/schedule", label: t.schedule, icon: CalendarBlankIcon },
      { path: "/servers", label: t.server, icon: HardDrivesIcon },
      { path: "/reports", label: t.reports, icon: ChartBarIcon },
      { path: "/team", label: t.team, icon: UsersFourIcon },
      { path: "/modules", label: t.modules, icon: BookOpenTextIcon },
    ];
  }
  if (me?.role === "praktikan") {
    return [
      { path: "/", label: t.home, icon: HouseIcon },
      { path: "/dashboard", label: t.dashboard, icon: SquaresFourIcon },
      { path: "/modules", label: t.modules, icon: BookOpenTextIcon },
    ];
  }
  return [
    { path: "/", label: t.home, icon: HouseIcon },
    { path: "/modules", label: t.modules, icon: BookOpenTextIcon },
  ];
}

/** "/en/modules/2/live" and "/zh/modules/2/live" -> "/modules/2/live" */
function barePath(p: string): string {
  if (/^\/(en|zh)\/?$/.test(p)) return "/";
  const s = /^\/(en|zh)\//.test(p) ? p.slice(3) : p;
  return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
}

function isActive(link: string, current: string): boolean {
  if (link === "/") return current === "/";
  if (link === "/modules") return current.startsWith("/modules");
  return current === link || current.startsWith(link + "/");
}

export default function AppNav({
  lang: built,
  path,
  langFromUrl = false,
}: {
  lang: Lang;
  path: string;
  langFromUrl?: boolean;
}) {
  // On the 404 page (one built file for every missing path) the language
  // comes from the address after hydration.
  const [lang, setLang] = useState<Lang>(built);
  useEffect(() => {
    if (langFromUrl) setLang(langOfPath(location.pathname));
  }, [langFromUrl]);
  const t = T[lang];
  const me = useMe();
  const now = useSessionNow(30_000, me !== undefined && me !== null);
  const current = barePath(path);
  const links = useMemo(() => linksFor(me, t), [me, t]);
  // The phone bar holds five: an Asisten reaches Home from the logo and
  // Modules from Home, so both stay in the top bar only (mockup rule).
  const barLinks = useMemo(
    () =>
      (me?.role === "asisten"
        ? links.filter((l) => l.path !== "/" && l.path !== "/modules")
        : links
      ).slice(0, 5),
    [links, me],
  );
  const [sheet, setSheet] = useState(false);
  const [dispSheet, setDispSheet] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Scroll hairline (was nav-scroll.ts for Nav.astro).
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // A ClientRouter navigation in flight (the login dialog's hand-off) already
  // targets the right language; redirecting this page would override it.
  const leaving = useRef(false);
  useEffect(() => {
    const on = () => (leaving.current = true);
    document.addEventListener("astro:before-preparation", on);
    return () => document.removeEventListener("astro:before-preparation", on);
  }, []);

  // Language default and saved choice.
  useEffect(() => {
    if (me === undefined || leaving.current) return;
    const pref = readLangPref();
    const want: Lang | null = pref ?? (me && now.data ? langForKelas(now.data.kelas) : null);
    if (want && want !== lang) {
      location.replace(pathForLang(location.pathname + location.search + location.hash, want));
    }
  }, [me, now.data, lang]);

  function switchLang(to: Lang) {
    if (to === lang) return;
    saveLangPref(to);
    location.assign(pathForLang(location.pathname + location.search + location.hash, to));
  }

  async function signOut() {
    try {
      await postJson("/api/auth/logout");
    } finally {
      meChanged();
      location.assign(href(lang, "/"));
    }
  }

  function linkHref(l: Link): string {
    return href(lang, l.path);
  }

  const badge =
    me?.role === "asisten"
      ? `${t.asisten} · ${me.kode || me.nama.split(" ")[0]}`
      : me?.role === "praktikan"
        ? `${t.praktikan}${me.kelompok ? ` · ${t.group(me.kelompok)}` : ""}`
        : null;

  return (
    <>
      <header className="appnav" data-scrolled={scrolled ? "yes" : "no"}>
        <a className="appnav__brand" href={href(lang, "/")} aria-label="IRIS">
          <img src="/brand/iris-logo-mark.png" alt="" width="397" height="180" />
        </a>

        <nav className="appnav__links" aria-label={t.main}>
          {links.map((l) => {
            const active = isActive(l.path, current);
            return (
              <a
                key={l.path}
                className="appnav__link"
                href={linkHref(l)}
                aria-current={active ? "page" : undefined}
              >
                <l.icon size={17} aria-hidden="true" />
                <span>{l.label}</span>
                {l.path === "/session" && now.data && (
                  <span className="appnav__live-dot" aria-hidden="true" />
                )}
              </a>
            );
          })}
        </nav>

        <div className="appnav__side">
          {me?.role === "asisten" && (
            <span className="appnav__palette">
              <IconButton
                icon={MagnifyingGlassIcon}
                label={t.palette}
                tip={`${t.palette} (Ctrl K)`}
                tipSide="bottom"
                onClick={() => setPaletteOpen(true)}
              />
            </span>
          )}
          <NavClock lang={lang} inSession={!!now.data} />
          <RadixPopover.Root>
            <RadixPopover.Trigger asChild>
              <IconButton icon={SlidersHorizontalIcon} label={t.display} tipSide="bottom" />
            </RadixPopover.Trigger>
            <RadixPopover.Portal>
              <RadixPopover.Content
                className="popover__panel appnav__disp"
                tabIndex={-1}
                onOpenAutoFocus={(e) => {
                  // Focus the panel, not its first radio: a ring on "Gelap"
                  // read as if Gelap were picked.
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

          {me === null && (
            <button
              type="button"
              className="btn btn--primary appnav__signin"
              onClick={() => window.LoginDialog?.open()}
            >
              <span className="btn__label">{t.signIn}</span>
            </button>
          )}

          {me && (
            <RadixPopover.Root>
              <RadixPopover.Trigger asChild>
                <button type="button" className="appnav__me" aria-label={t.account}>
                  <span className="appnav__avatar" data-role={me.role} aria-hidden="true">
                    {me.role === "asisten"
                      ? (me.kode || me.nama).slice(0, 3).toUpperCase()
                      : me.nama.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="appnav__badge">{badge}</span>
                </button>
              </RadixPopover.Trigger>
              <RadixPopover.Portal>
                <RadixPopover.Content
                  className="appnav__menu sweep-edge"
                  align="end"
                  sideOffset={10}
                  collisionPadding={12}
                >
                  <AccountMenu
                    t={t}
                    me={me}
                    lang={lang}
                    onShortcuts={() => setShortcutsOpen(true)}
                    onSignOut={() => void signOut()}
                  />
                </RadixPopover.Content>
              </RadixPopover.Portal>
            </RadixPopover.Root>
          )}
        </div>

        <NavClock lang={lang} inSession={!!now.data} className="navclock--mobile" />
        <IconButton
          icon={SlidersHorizontalIcon}
          label={t.display}
          className="appnav__disp-mobile"
          onClick={() => setDispSheet(true)}
        />
        <button
          type="button"
          className="appnav__me appnav__me--mobile"
          onClick={() => (me === null ? window.LoginDialog?.open() : setSheet(true))}
          aria-label={me === null ? t.signIn : t.account}
        >
          {me ? (
            <span className="appnav__avatar" data-role={me.role} aria-hidden="true">
              {me.role === "asisten"
                ? (me.kode || me.nama).slice(0, 3).toUpperCase()
                : me.nama.slice(0, 1).toUpperCase()}
            </span>
          ) : (
            <UserIcon size={20} aria-hidden="true" />
          )}
        </button>
      </header>

      {me?.role === "praktikan" && <SessionMiniBar lang={lang} now={now} />}
      <OfflineNotice lang={lang} />
      <IdentityWatch lang={lang} me={me} now={now.data} />

      <nav className="appbar" aria-label={t.main}>
        {barLinks.map((l) => {
          const active = isActive(l.path, current);
          return (
            <a
              key={l.path}
              className="appbar__item"
              href={linkHref(l)}
              aria-current={active ? "page" : undefined}
            >
              <span className="appbar__icon">
                <l.icon size={21} aria-hidden="true" />
                {l.path === "/session" && now.data && (
                  <span className="appnav__live-dot" aria-hidden="true" />
                )}
              </span>
              <span className="appbar__label">{l.label}</span>
            </a>
          );
        })}
        {me === null && (
          <button type="button" className="appbar__item" onClick={() => window.LoginDialog?.open()}>
            <span className="appbar__icon">
              <SignInIcon size={21} aria-hidden="true" />
            </span>
            <span className="appbar__label">{t.signIn}</span>
          </button>
        )}
      </nav>

      <Dialog open={dispSheet} onOpenChange={setDispSheet} title={t.display} sheet lang={lang}>
        <DisplayPanel lang={lang} onLang={switchLang} />
      </Dialog>

      <Dialog open={sheet} onOpenChange={setSheet} title={t.account} sheet lang={lang}>
        {me && (
          <AccountMenu
            t={t}
            me={me}
            lang={lang}
            onShortcuts={() => {
              setSheet(false);
              setShortcutsOpen(true);
            }}
            onSignOut={() => void signOut()}
          />
        )}
      </Dialog>

      {me?.role === "asisten" && (
        <AsistenCommands
          lang={lang}
          paletteOpen={paletteOpen}
          setPaletteOpen={setPaletteOpen}
          shortcutsOpen={shortcutsOpen}
          setShortcutsOpen={setShortcutsOpen}
          running={now.data}
        />
      )}
    </>
  );
}

function AccountMenu({
  t,
  me,
  lang,
  onShortcuts,
  onSignOut,
}: {
  t: (typeof T)["id"];
  me: Me;
  lang: Lang;
  onShortcuts: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="acct">
      <div className="acct__who">
        <span className="appnav__avatar appnav__avatar--lg" data-role={me.role} aria-hidden="true">
          {me.role === "asisten"
            ? (me.kode || me.nama).slice(0, 3).toUpperCase()
            : me.nama.slice(0, 1).toUpperCase()}
        </span>
        <span className="acct__names">
          <b>{me.nama}</b>
          <span className="acct__meta">
            {me.role === "asisten" ? t.asisten : t.praktikan} ·{" "}
            <span className="mono">{me.nim}</span>
            {me.role === "praktikan" && me.kelompok ? ` · ${t.group(me.kelompok)}` : ""}
          </span>
        </span>
      </div>

      {me.role === "asisten" && (
        <a className="acct__row" href={href(lang, "/account")}>
          <span>{t.myAccount}</span>
        </a>
      )}

      {me.role === "asisten" && (
        <button type="button" className="acct__row" onClick={onShortcuts}>
          <span>{t.shortcuts}</span>
          <Kbd>?</Kbd>
        </button>
      )}

      <button type="button" className="btn btn--danger btn--block" onClick={onSignOut}>
        <SignOutIcon size={20} aria-hidden="true" />
        {t.signOut}
      </button>
    </div>
  );
}
