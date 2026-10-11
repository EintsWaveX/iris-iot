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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import {
  BookOpenTextIcon,
  CalendarBlankIcon,
  ChartBarIcon,
  HardDrivesIcon,
  HouseIcon,
  DoorOpenIcon,
  MagnifyingGlassIcon,
  ProjectorScreenIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  UsersFourIcon,
  UsersThreeIcon,
  type IconProps,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import KeyHint from "../ui/KeyHint";
import { Kbd } from "../ui/Controls";
import DisplayPanel, { BUKA_TAMPILAN } from "./DisplayPanel";
import NavClock from "./NavClock";
import {
  dict,
  getJson,
  href,
  meChanged,
  postJson,
  useMe,
  useSessionNow,
  type Me,
} from "../../lib/app";
import { langForKelas, langOfPath, pathForLang, type Lang } from "../../lib/kelas";
import { readLangPref, saveLangPref, usePoll } from "../../lib/hooks";
import { kelompokLabel } from "../../lib/labels";
import SessionMiniBar from "./SessionMiniBar";
import { keluarProyektor, sebagaiTampil, useProyektor } from "../../lib/proyektor";
import AsistenMiniBar from "./AsistenMiniBar";
import OfflineNotice from "./OfflineNotice";
import IdentityWatch from "./IdentityWatch";
import TotNotice from "./TotNotice";
import LiveNotice, { LiveStatus } from "./LiveNotice";
import LabAlert from "./LabAlert";
import AlertRail from "./AlertRail";
import AsistenCommands from "./AsistenCommands";
import "./AppNav.css";
import { openSignIn } from "../../lib/signin";

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
    signOutSure: "Ya, Keluar",
    signOutHint:
      "Sesimu masih berjalan. Jawabanmu tetap tersimpan, dan kamu bisa masuk lagi dengan kode sesi.",
    account: "Akun",
    myAccount: "Halaman Akun",
    display: "Tampilan",
    shortcuts: "Pintasan Keyboard",
    palette: "Cari perintah",
    praktikan: "Praktikan",
    asisten: "Asisten",
    proyektorKeluar: "Keluar Proyektor",
    group: (n: number) => kelompokLabel(n, "id"),
    notSignedIn: "Belum masuk",
    signInHint: "Masuk untuk membuka dasbor dan menyimpan jawaban.",
    konsolBaru: "Ada permintaan Konsol Pi yang menunggu jawabanmu di halaman Server.",
    konsolDot: "Ada permintaan Konsol Pi yang menunggu",
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
    signOutSure: "Yes, Sign Out",
    signOutHint:
      "Your session is still running. Your answers stay saved, and you can sign in again with the session code.",
    account: "Account",
    myAccount: "Account Page",
    display: "Display",
    shortcuts: "Keyboard Shortcuts",
    palette: "Search commands",
    praktikan: "Student",
    asisten: "Assistant",
    proyektorKeluar: "Leave Projector",
    group: (n: number) => kelompokLabel(n, "en"),
    notSignedIn: "Not signed in",
    signInHint: "Sign in to open your dashboard and save your answers.",
    konsolBaru: "A Pi Console request is waiting for you on the Server page.",
    konsolDot: "A Pi Console request is waiting",
  },
  zh: {
    main: "主菜单",
    home: "首页",
    dashboard: "仪表盘",
    modules: "模块",
    console: "控制台",
    schedule: "课表",
    server: "服务器",
    reports: "报告",
    team: "团队",
    signIn: "登录",
    signOut: "退出登录",
    signOutSure: "确定退出",
    signOutHint: "你的实验课还在进行。答案会保留，你可以用课堂代码重新登录。",
    account: "账号",
    myAccount: "账号页面",
    display: "显示",
    shortcuts: "键盘快捷键",
    palette: "搜索命令",
    praktikan: "学生",
    asisten: "助教",
    proyektorKeluar: "退出投影",
    group: (n: number) => kelompokLabel(n, "zh"),
    notSignedIn: "未登录",
    signInHint: "登录后可以打开你的仪表盘并保存答案。",
    konsolBaru: "有一个 Pi 控制台申请在服务器页面等你回复。",
    konsolDot: "有 Pi 控制台申请等你回复",
  },
});

/** The Asisten's "G then a letter" shortcuts (AsistenCommands), shown on
 *  the links when the reader turns key hints on. */
const NAV_KEY: Record<string, string> = {
  "/": "G B",
  "/session": "G K",
  "/schedule": "G J",
  "/servers": "G S",
  "/reports": "G L",
  "/team": "G T",
  "/modules": "G M",
};

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

/** The round initials in the account chip (mockup rolebadge): the Asisten's
 *  code, or a Praktikan's two initials on their group colour; the Pencipta
 *  gets an amber ring. */
function initials(nama: string): string {
  const w = nama.trim().split(/\s+/).filter(Boolean);
  return (
    (w[0]?.[0] ?? "") + (w.length > 1 ? (w[w.length - 1]?.[0] ?? "") : (w[0]?.[1] ?? ""))
  ).toUpperCase();
}

function Avatar({ me, lg = false }: { me: NonNullable<ReturnType<typeof useMe>>; lg?: boolean }) {
  const praktikan = me.role === "praktikan";
  return (
    <span
      className={lg ? "appnav__avatar appnav__avatar--lg" : "appnav__avatar"}
      data-role={me.role}
      data-pencipta={me.badges?.includes("pencipta") ? "yes" : undefined}
      style={
        praktikan && me.kelompok
          ? ({ "--g": `var(--group-${((me.kelompok - 1) % 10) + 1})` } as CSSProperties)
          : undefined
      }
      aria-hidden="true"
    >
      {praktikan ? initials(me.nama) : (me.kode || me.nama).slice(0, 3).toUpperCase()}
    </span>
  );
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
    if (!langFromUrl) return;
    const l = langOfPath(location.pathname);
    setLang(l);
    // The 404 page is one file for every language: its skip link follows
    // the URL too (no inline script, the CSP would block it).
    const skip = document.querySelector<HTMLElement>(".skip-link[data-from-url]");
    const text = l !== "id" ? skip?.getAttribute(`data-skip-${l}`) : null;
    if (skip && text) skip.textContent = text;
  }, [langFromUrl]);
  // Older links (?login=1, once the sign-in dialog) go to the /login page.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("login") !== "1") return;
    q.delete("login");
    const next = q.get("next");
    q.delete("next");
    const rest = q.toString();
    openSignIn(next ?? location.pathname + (rest ? `?${rest}` : ""));
  }, []);
  const t = T[lang];
  const me = useMe();
  const now = useSessionNow(me !== undefined && me !== null);
  // An Asisten's presence (the Team page's online dot) is stamped by this
  // call, at most every 45 s; with the safety net at 5 minutes it gets its
  // own minute here, only while the tab is in view.
  const asistenHadir = me?.role === "asisten";
  const nowRef = useRef(now);
  nowRef.current = now;
  useEffect(() => {
    if (!asistenHadir) return;
    const id = setInterval(() => {
      if (!document.hidden) nowRef.current.refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, [asistenHadir]);
  // Konsol Pi: a dot on Server while something waits for this Asisten (a
  // request to answer, a console opened without approval, someone asking to
  // join theirs), and a toast when a new one comes in.
  const dev = me?.role === "asisten";
  const konsol = usePoll(
    () =>
      getJson<{ ok: boolean; menunggu?: number }>("/api/server/konsol").then(
        (d) => d.menunggu ?? 0,
      ),
    60_000,
    dev,
    ["server"],
  );
  const menunggu = konsol.data ?? 0;
  const sebelum = useRef(0);
  useEffect(() => {
    if (menunggu > sebelum.current) window.Toast?.show(t.konsolBaru, "warn");
    sebelum.current = menunggu;
  }, [menunggu, t.konsolBaru]);
  const current = barePath(path);
  // The sign in page is the form itself; a second Masuk button there is noise.
  const onSignIn = current === "/login";
  // Projector mode: the Asisten is drawn as a Praktikan of the group they
  // hold, so nothing Asisten-only reaches the projector (ruled 2026-10-04).
  const pro = useProyektor(me);
  const tampil = useMemo(() => sebagaiTampil(me, pro), [me, pro]);
  const links = useMemo(() => linksFor(tampil, t), [tampil?.role, me, t]);
  // The phone bar holds five: an Asisten reaches Home from the logo and
  // Modules from Home, so both stay in the top bar only (mockup rule).
  const barLinks = useMemo(
    () =>
      (tampil?.role === "asisten"
        ? links.filter((l) => l.path !== "/" && l.path !== "/modules")
        : links
      ).slice(0, 5),
    [links, tampil?.role],
  );
  const [sheet, setSheet] = useState(false);
  const [dispSheet, setDispSheet] = useState(false);
  const [dispPop, setDispPop] = useState(false);
  // Any page can open Tampilan (the Akun page links here instead of a copy).
  useEffect(() => {
    const open = () =>
      window.matchMedia("(max-width: 759px)").matches ? setDispSheet(true) : setDispPop(true);
    window.addEventListener(BUKA_TAMPILAN, open);
    return () => window.removeEventListener(BUKA_TAMPILAN, open);
  }, []);
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

  // The session's clock lives in a bar under the nav: the Praktikan's mini
  // bar, the Asisten's own "Sesimu berjalan" bar, or the Console's session
  // bar; the nav clock steps aside for it (mockup G6).
  const onConsole = isActive("/session", current);
  const asistenBar = tampil?.role === "asisten" && !!now.data?.mengajar && !onConsole;
  const sesiBar =
    tampil?.role === "praktikan"
      ? !!now.data
      : tampil?.role === "asisten"
        ? !!now.data?.mengajar || (onConsole && !!now.data)
        : false;

  const badge =
    tampil?.role === "asisten" ? t.asisten : tampil?.role === "praktikan" ? t.praktikan : null;

  function leaveProjector() {
    keluarProyektor();
    location.assign(href(lang, "/session"));
  }

  return (
    <>
      <header className="appnav" data-scrolled={scrolled ? "yes" : "no"}>
        <a className="appnav__brand" href={href(lang, "/")} aria-label="IRIS">
          <img src="/brand/iris-logo-mark.png" alt="" width="198" height="90" />
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
                {tampil?.role === "asisten" && NAV_KEY[l.path] && (
                  <KeyHint k={NAV_KEY[l.path]} corner />
                )}
                <l.icon size={17} aria-hidden="true" />
                <span>{l.label}</span>
                {l.path === "/session" && now.data && (
                  <span className="appnav__live-dot" aria-hidden="true" />
                )}
                {l.path === "/servers" && menunggu > 0 && (
                  <span
                    className="appnav__live-dot appnav__live-dot--warn"
                    aria-label={t.konsolDot}
                  />
                )}
              </a>
            );
          })}
        </nav>

        <div className="appnav__side">
          {tampil?.role === "asisten" && (
            <span className="appnav__palette">
              <KeyHint k="Ctrl K" corner />
              <IconButton
                icon={MagnifyingGlassIcon}
                label={t.palette}
                tip={`${t.palette} (Ctrl K)`}
                tipSide="bottom"
                onClick={() => setPaletteOpen(true)}
              />
            </span>
          )}
          {!pro && <LiveStatus lang={lang} />}
          <NavClock lang={lang} inSession={sesiBar} />
          <RadixPopover.Root open={dispPop} onOpenChange={setDispPop}>
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

          {me === null && !onSignIn && (
            <button
              type="button"
              className="btn btn--primary appnav__signin"
              onClick={() => openSignIn()}
            >
              <DoorOpenIcon size={20} aria-hidden="true" />
              <span className="btn__label">{t.signIn}</span>
            </button>
          )}

          {me && pro && (
            <button type="button" className="btn btn--sm appnav__leave" onClick={leaveProjector}>
              <ProjectorScreenIcon size={18} aria-hidden="true" />
              <span className="btn__label">{t.proyektorKeluar}</span>
            </button>
          )}

          {me && !pro && (
            <RadixPopover.Root>
              <RadixPopover.Trigger asChild>
                <button type="button" className="appnav__me" aria-label={t.account}>
                  <Avatar me={me} />
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
                    busy={Boolean(now.data)}
                    onShortcuts={() => setShortcutsOpen(true)}
                    onSignOut={() => void signOut()}
                  />
                </RadixPopover.Content>
              </RadixPopover.Portal>
            </RadixPopover.Root>
          )}
        </div>

        <NavClock lang={lang} inSession={sesiBar} className="navclock--mobile" />
        <IconButton
          icon={SlidersHorizontalIcon}
          label={t.display}
          className="appnav__disp-mobile"
          onClick={() => setDispSheet(true)}
        />
        {me === null ? (
          onSignIn ? null : (
            <button
              type="button"
              className="btn btn--primary appnav__signin appnav__signin--mobile"
              onClick={() => openSignIn()}
            >
              <DoorOpenIcon size={20} aria-hidden="true" />
              <span className="btn__label">{t.signIn}</span>
            </button>
          )
        ) : me && pro ? (
          <IconButton
            icon={ProjectorScreenIcon}
            label={t.proyektorKeluar}
            className="appnav__me--mobile"
            onClick={leaveProjector}
          />
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

      {tampil?.role === "praktikan" && <SessionMiniBar lang={lang} now={now} proyektor={!!pro} />}
      {asistenBar && now.data && <AsistenMiniBar lang={lang} s={now.data} />}
      <AlertRail lang={lang}>
        <OfflineNotice lang={lang} />
        {me?.role === "asisten" && !pro && (
          <LabAlert lang={lang} me={me} sesiBerjalan={!!now.data} />
        )}
        {!pro && <LiveNotice lang={lang} />}
        {me?.role === "asisten" && !pro && <TotNotice lang={lang} />}
      </AlertRail>
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
                {l.path === "/servers" && menunggu > 0 && (
                  <span
                    className="appnav__live-dot appnav__live-dot--warn"
                    aria-label={t.konsolDot}
                  />
                )}
              </span>
              <span className="appbar__label">{l.label}</span>
            </a>
          );
        })}
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
            busy={Boolean(now.data)}
            onShortcuts={() => {
              setSheet(false);
              setShortcutsOpen(true);
            }}
            onSignOut={() => void signOut()}
          />
        )}
      </Dialog>

      {/* No palette or G-shortcuts on the projector: a stray key would open an
          Asisten page in front of the class. */}
      {me?.role === "asisten" && !pro && (
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
  busy,
  onShortcuts,
  onSignOut,
}: {
  t: (typeof T)["id"];
  me: Me;
  lang: Lang;
  busy: boolean;
  onShortcuts: () => void;
  onSignOut: () => void;
}) {
  // While a session runs, the first tap only asks; the second signs out.
  const [sure, setSure] = useState(false);
  return (
    <div className="acct">
      <div className="acct__who">
        <Avatar me={me} lg />
        <span className="acct__names">
          <b>{me.nama}</b>
          <span className="acct__meta">
            {me.role === "asisten" ? t.asisten : t.praktikan} ·{" "}
            <span className="mono">{me.nim}</span>
            {me.role === "praktikan" && me.kelompok ? ` · ${t.group(me.kelompok)}` : ""}
          </span>
        </span>
      </div>

      <a className="acct__row" href={href(lang, "/account")}>
        <span>{t.myAccount}</span>
      </a>

      {me.role === "asisten" && (
        <button type="button" className="acct__row" onClick={onShortcuts}>
          <span>{t.shortcuts}</span>
          <Kbd>?</Kbd>
        </button>
      )}

      {sure && <p className="acct__warn">{t.signOutHint}</p>}
      <button
        type="button"
        className="acct__row acct__row--danger"
        data-sure={sure ? "yes" : "no"}
        onClick={() => (busy && !sure ? setSure(true) : onSignOut())}
      >
        <span>{sure ? t.signOutSure : t.signOut}</span>
        <SignOutIcon size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
