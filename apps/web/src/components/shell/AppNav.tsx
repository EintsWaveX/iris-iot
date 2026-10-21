/**
 * The app shell's top bar and mobile bottom bar (Phase 8), one island for
 * every page, replacing Nav.astro + AkunSheet.tsx.
 *
 * - Links follow the role: signed out (Beranda, Modul), praktikan (Beranda,
 *   Dasbor, Modul; Live lives in the module page since Phase 9) and asisten.
 *   Phase 15 (2026-10-14, the tidy nav): the Asisten's daily places as
 *   words (Beranda, Konsol, Persiapan, Penilaian, Jadwal; the LMS left on
 *   2026-10-21), then
 *   one Lab menu whose rows say what each page is for (Server, Laporan,
 *   Tim, Modul). Under 1280 Persiapan and Jadwal join the menu under Sesi.
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
  useLayoutEffect,
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
  CaretDownIcon,
  ChartBarIcon,
  ClipboardTextIcon,
  DoorOpenIcon,
  ExamIcon,
  HardDrivesIcon,
  HouseIcon,
  IdentificationBadgeIcon,
  type IconProps,
  MagnifyingGlassIcon,
  ProjectorScreenIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  UsersFourIcon,
  UsersThreeIcon,
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
import { readLangPref, saveLangPref, useMinWidth, usePoll } from "../../lib/hooks";
import { kelompokLabel } from "../../lib/labels";
import SessionMiniBar from "./SessionMiniBar";
import { keluarProyektor, sebagaiTampil, useProyektor } from "../../lib/proyektor";
import AsistenMiniBar from "./AsistenMiniBar";
import OfflineNotice from "./OfflineNotice";
import IdentityWatch from "./IdentityWatch";
import TotNotice, { useTotAktif } from "./TotNotice";
import LiveNotice, { LiveStatus } from "./LiveNotice";
import LabAlert from "./LabAlert";
import HadirNotice from "./HadirNotice";
import AlertRail from "./AlertRail";
import { LP, LihatPeranBar, LihatPeranDialog } from "./LihatPeran";
import { selesaiLihatPeran } from "../../lib/lihat-peran";
import AsistenCommands from "./AsistenCommands";
import "./AppNav.css";
import { openSignIn } from "../../lib/signin";

type Icon = ComponentType<IconProps>;

interface Link {
  path: string;
  label: string;
  /** For the phone tab bar only: desktop links are words. */
  icon: Icon;
  /** Under 1280 it moves into the Lab menu under Sesi. */
  wide?: boolean;
  /** What the page is for (a Lab menu row). */
  desc?: string;
}

const T = dict({
  id: {
    main: "Utama",
    home: "Beranda",
    dashboard: "Dasbor",
    modules: "Modul",
    console: "Konsol",
    grading: "Penilaian",
    tpDot: (n: number) => `${n} TP menunggu dinilai`,
    prep: "Persiapan",
    tot: "TOT",
    totOn: "Mode TOT aktif. Buka halamannya.",
    totOff: "Mode TOT mati. Buka halamannya.",
    totRow: "Mode TOT",
    more: "Lainnya",
    lab: "Lab",
    sesi: "Sesi",
    serverDesc: "PC Server dan perangkat di lab",
    reportsDesc: "Rekap sesi, kehadiran, dan bayaran",
    teamDesc: "Asisten, divisi, dan penugasan",
    profil: "Profil Lab",
    profilDesc: "Divisi, foto bersama, dan acara di Beranda",
    modulesDesc: "Handbook, slide, dan kode jurnal",
    schedule: "Jadwal",
    server: "Server",
    reports: "Laporan",
    team: "Tim",
    signIn: "Masuk",
    praktikum: "Praktikum",
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
    konsolBaru: "Ada permintaan Konsol PC Server yang menunggu jawabanmu di halaman Server.",
    konsolDot: "Ada permintaan Konsol PC Server yang menunggu",
  },
  en: {
    main: "Main",
    home: "Home",
    dashboard: "Dashboard",
    modules: "Modules",
    console: "Console",
    grading: "Grading",
    tpDot: (n: number) => `${n} TP waiting to be graded`,
    prep: "Preparation",
    tot: "TOT",
    totOn: "TOT Mode is on. Open its page.",
    totOff: "TOT Mode is off. Open its page.",
    totRow: "TOT Mode",
    more: "More",
    lab: "Lab",
    sesi: "Sessions",
    serverDesc: "The PC Server and lab devices",
    reportsDesc: "Session recaps, attendance and pay",
    teamDesc: "Asisten, divisions and assignments",
    profil: "Lab Profile",
    profilDesc: "Divisions, team photos and events on Home",
    modulesDesc: "Handbook, slides and journal code",
    schedule: "Schedule",
    server: "Server",
    reports: "Reports",
    team: "Team",
    signIn: "Sign In",
    praktikum: "Practicum",
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
    konsolBaru: "A PC Server Console request is waiting for you on the Server page.",
    konsolDot: "A PC Server Console request is waiting",
  },
  zh: {
    main: "主菜单",
    home: "首页",
    dashboard: "仪表盘",
    modules: "模块",
    console: "控制台",
    grading: "评分",
    tpDot: (n: number) => `${n} 份预习作业等待评分`,
    prep: "课前准备",
    tot: "TOT",
    totOn: "TOT 模式已开启，打开它的页面。",
    totOff: "TOT 模式已关闭，打开它的页面。",
    totRow: "TOT 模式",
    more: "更多",
    lab: "实验室",
    sesi: "课",
    serverDesc: "PC 服务器和实验室设备",
    reportsDesc: "课后汇总、出勤和报酬",
    teamDesc: "助教、部门和排班",
    profil: "实验室简介",
    profilDesc: "首页上的部门、合影和活动",
    modulesDesc: "手册、幻灯片和实验报告代码",
    schedule: "课表",
    server: "服务器",
    reports: "报告",
    team: "团队",
    signIn: "登录",
    praktikum: "实验",
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
    konsolBaru: "有一个 PC 服务器控制台申请在服务器页面等你回复。",
    konsolDot: "有 PC 服务器控制台申请等你回复",
  },
});

/** The Asisten's "G then a letter" shortcuts (AsistenCommands), shown on
 *  the links when the reader turns key hints on. */
const NAV_KEY: Record<string, string> = {
  "/": "G B",
  "/session": "G K",
  "/grading": "G N",
  "/preparation": "G P",
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
      { path: "/preparation", label: t.prep, icon: ClipboardTextIcon, wide: true },
      { path: "/grading", label: t.grading, icon: ExamIcon },
      { path: "/schedule", label: t.schedule, icon: CalendarBlankIcon, wide: true },
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

/** The Asisten's Lab menu: the pages used now and then, each row saying
 *  what it is for. */
/** The Lab Profile editor joins it for the "profil" right (Phase 23). */
function labFor(t: (typeof T)["id"], profil: boolean): Link[] {
  return [
    { path: "/servers", label: t.server, icon: HardDrivesIcon, desc: t.serverDesc },
    { path: "/reports", label: t.reports, icon: ChartBarIcon, desc: t.reportsDesc },
    { path: "/team", label: t.team, icon: UsersFourIcon, desc: t.teamDesc },
    { path: "/modules", label: t.modules, icon: BookOpenTextIcon, desc: t.modulesDesc },
    ...(profil
      ? [
          {
            path: "/lab-profile",
            label: t.profil,
            icon: IdentificationBadgeIcon,
            desc: t.profilDesc,
          },
        ]
      : []),
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
  // Kelola TP (/tp) is Penilaian's own page.
  if (link === "/grading" && (current === "/tp" || current.startsWith("/tp/"))) return true;
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
  // Phase 13: TP files in my groups waiting to be graded, on Penilaian.
  const tpPoll = usePoll(
    () =>
      getJson<{ ok: boolean; perluNilai?: number }>("/api/tp/hitung").then(
        (d) => d.perluNilai ?? 0,
      ),
    300_000,
    dev,
    ["tp"],
  );
  const tpPerlu = tpPoll.data ?? 0;
  const sebelum = useRef(0);
  useEffect(() => {
    if (menunggu > sebelum.current) window.Toast?.show(t.konsolBaru, "warn");
    sebelum.current = menunggu;
  }, [menunggu, t.konsolBaru]);
  const current = barePath(path);
  // Mode TOT sits apart from the page links (2026-10-12): its own chip at
  // the bar's right with a lamp that is lit while TOT is on.
  const totOn = useTotAktif(me?.role === "asisten");
  // The sign in page is the form itself; a second Masuk button there is noise.
  const onSignIn = current === "/login";
  // Projector mode: the Asisten is drawn as a Praktikan of the group they
  // hold, so nothing Asisten-only reaches the projector (ruled 2026-10-04).
  const pro = useProyektor(me);
  const tampil = useMemo(() => sebagaiTampil(me, pro), [me, pro]);
  const links = useMemo(() => linksFor(tampil, t), [tampil?.role, me, t]);
  const asistenNav = tampil?.role === "asisten";
  const bolehProfil = tampil?.role === "asisten" && tampil.hak?.profil === true;
  const lab = useMemo(
    () => (asistenNav ? labFor(t, bolehProfil) : []),
    [asistenNav, t, bolehProfil],
  );
  // Persiapan and Jadwal stand in the bar from 1280; under it they join
  // the Lab menu under Sesi.
  const lebar = useMinWidth(1280);
  const utama = useMemo(() => links.filter((l) => lebar || !l.wide), [links, lebar]);
  // The phone bar holds five: an Asisten reaches Home from the logo, so it
  // holds Konsol, Persiapan, Penilaian and Jadwal.
  const barLinks = useMemo(
    () => (asistenNav ? links.filter((l) => l.path !== "/") : links).slice(0, 5),
    [links, asistenNav],
  );
  const [sheet, setSheet] = useState(false);
  const [lihatPeran, setLihatPeran] = useState(false);
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

  // The links that fit (2026-10-12): if the words still run under the
  // clock on a narrow screen, the last ones fold into the menu (Lab for an
  // Asisten, Lainnya otherwise). Each link's width is measured while it shows.
  const linksEl = useRef<HTMLElement | null>(null);
  const lebarLink = useRef<number[]>([]);
  const [muat, setMuat] = useState(99);
  const [lainBuka, setLainBuka] = useState(false);
  useLayoutEffect(() => {
    const el = linksEl.current;
    if (!el) return;
    const ukur = () => {
      const a = [...el.querySelectorAll<HTMLElement>("[data-navlink]")];
      a.forEach((x, i) => {
        if (x.offsetWidth) lebarLink.current[i] = x.offsetWidth;
      });
      const ada = el.clientWidth;
      const w = a.map((_, i) => (lebarLink.current[i] ?? 110) + 2);
      const semua = w.reduce((x, y) => x + y, 0);
      if (semua <= ada) return setMuat(a.length);
      const lain = 120;
      let k = 0;
      let jumlah = 0;
      while (k < a.length && jumlah + w[k] + lain <= ada) jumlah += w[k++];
      setMuat(Math.max(1, k));
    };
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, [utama.length, lang]);
  const [scrolled, setScrolled] = useState(false);
  // The menu's Sesi part: the daily links that don't stand in the bar.
  const sesiLab = useMemo(
    () => [...links.filter((l) => !utama.includes(l)), ...utama.slice(muat)],
    [links, utama, muat],
  );
  const labRow = (l: Link, asisten: boolean, dot?: string) => (
    <a
      key={l.path}
      className="acct__row labmenu__o"
      href={linkHref(l)}
      aria-current={isActive(l.path, current) ? "page" : undefined}
      onClick={() => setLainBuka(false)}
    >
      <span className="labmenu__t">
        <b>{l.label}</b>
        {l.desc && <span className="hint">{l.desc}</span>}
      </span>
      {dot && (
        <span className="appnav__live-dot appnav__live-dot--warn labmenu__dot" aria-label={dot} />
      )}
      {asisten && NAV_KEY[l.path] && <Kbd>{NAV_KEY[l.path]}</Kbd>}
    </a>
  );

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
    selesaiLihatPeran(false);
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
      <header
        className="appnav"
        data-scrolled={scrolled ? "yes" : "no"}
        data-tamu={me === null ? "yes" : undefined}
      >
        <a className="appnav__brand" href={href(lang, "/")} aria-label="IRIS">
          <img src="/brand/iris-logo-mark.png" alt="" width="198" height="90" />
        </a>

        <nav className="appnav__links" aria-label={t.main} ref={linksEl}>
          {utama.map((l, i) => {
            const active = isActive(l.path, current);
            return (
              <a
                key={l.path}
                className="appnav__link"
                href={linkHref(l)}
                aria-current={active ? "page" : undefined}
                data-navlink=""
                hidden={i >= muat || undefined}
              >
                {tampil?.role === "asisten" && NAV_KEY[l.path] && (
                  <KeyHint k={NAV_KEY[l.path]} corner />
                )}
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
                {l.path === "/grading" && tpPerlu > 0 && (
                  <span className="appnav__n" aria-label={t.tpDot(tpPerlu)}>
                    {tpPerlu}
                  </span>
                )}
              </a>
            );
          })}
          {(asistenNav || muat < utama.length) && (
            <RadixPopover.Root open={lainBuka} onOpenChange={setLainBuka}>
              <RadixPopover.Trigger asChild>
                <button
                  type="button"
                  className="appnav__link appnav__more"
                  aria-current={
                    [...sesiLab, ...lab].some((l) => isActive(l.path, current)) ? "page" : undefined
                  }
                >
                  <span>{asistenNav ? t.lab : t.more}</span>
                  <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
                  {menunggu > 0 && (
                    <span
                      className="appnav__live-dot appnav__live-dot--warn"
                      aria-label={t.konsolDot}
                    />
                  )}
                </button>
              </RadixPopover.Trigger>
              <RadixPopover.Portal>
                <RadixPopover.Content
                  className="appnav__menu appnav__menu--lab sweep-edge"
                  align="start"
                  sideOffset={10}
                  collisionPadding={12}
                >
                  <div className="acct labmenu">
                    {sesiLab.length > 0 && asistenNav && (
                      <span className="labmenu__h">{t.sesi}</span>
                    )}
                    {sesiLab.map((l) => labRow(l, asistenNav))}
                    {lab.length > 0 && <span className="labmenu__h">{t.lab}</span>}
                    {lab.map((l) =>
                      labRow(
                        l,
                        true,
                        l.path === "/servers" && menunggu > 0 ? t.konsolDot : undefined,
                      ),
                    )}
                  </div>
                </RadixPopover.Content>
              </RadixPopover.Portal>
            </RadixPopover.Root>
          )}
        </nav>

        {/* Phase 21: a visitor's way in, centred in the bar: Praktikum and a door. */}
        {me === null && !onSignIn && (
          <div className="appnav__center">
            <button
              type="button"
              className="btn btn--primary appnav__signin"
              onClick={() => openSignIn()}
            >
              <span className="btn__label">{t.praktikum}</span>
              <DoorOpenIcon size={18} weight="bold" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="appnav__side">
          {tampil?.role === "asisten" && (
            <a
              className="appnav__tot"
              href={href(lang, "/tot")}
              data-on={totOn ? "yes" : "no"}
              aria-current={current === "/tot" ? "page" : undefined}
              title={totOn ? t.totOn : t.totOff}
            >
              <KeyHint k="G O" corner />
              <span className="appnav__tot-lamp" aria-hidden="true" />
              <span>{t.tot}</span>
              <span className="visually-hidden">{totOn ? t.totOn : t.totOff}</span>
            </a>
          )}
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

          {me && pro && (
            <button type="button" className="btn btn--sm appnav__leave" onClick={leaveProjector}>
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
                    totOn={totOn}
                    busy={Boolean(now.data)}
                    onShortcuts={() => setShortcutsOpen(true)}
                    onLihatPeran={() => setLihatPeran(true)}
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
              <span className="btn__label">{t.praktikum}</span>
              <DoorOpenIcon size={18} weight="bold" aria-hidden="true" />
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

      {me?.lihatPeran && <LihatPeranBar lang={lang} me={me} />}
      {tampil?.role === "praktikan" && <SessionMiniBar lang={lang} now={now} proyektor={!!pro} />}
      {asistenBar && now.data && <AsistenMiniBar lang={lang} s={now.data} />}
      <AlertRail lang={lang}>
        <OfflineNotice lang={lang} />
        {me?.role === "asisten" && !pro && <HadirNotice lang={lang} me={me} />}
        {me?.role === "asisten" && !pro && (
          <LabAlert lang={lang} me={me} sesiBerjalan={!!now.data} />
        )}
        {!pro && <LiveNotice lang={lang} />}
        {me?.role === "asisten" && !pro && current !== "/tot" && (
          <TotNotice lang={lang} on={!!totOn} />
        )}
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
                {l.path === "/grading" && tpPerlu > 0 && (
                  <span className="appnav__live-dot" aria-label={t.tpDot(tpPerlu)} />
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
            totOn={totOn}
            busy={Boolean(now.data)}
            onShortcuts={() => {
              setSheet(false);
              setShortcutsOpen(true);
            }}
            onLihatPeran={() => {
              setSheet(false);
              setLihatPeran(true);
            }}
            onSignOut={() => void signOut()}
          />
        )}
      </Dialog>
      {me?.hak?.tim === true && (
        <LihatPeranDialog lang={lang} open={lihatPeran} onOpenChange={setLihatPeran} />
      )}

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
  totOn,
  busy,
  onShortcuts,
  onLihatPeran,
  onSignOut,
}: {
  t: (typeof T)["id"];
  me: Me;
  lang: Lang;
  totOn: boolean | null;
  busy: boolean;
  onShortcuts: () => void;
  onLihatPeran: () => void;
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
        <a className="acct__row" href={href(lang, "/tot")}>
          <span>{t.totRow}</span>
          <span className="appnav__tot-lamp" data-on={totOn ? "yes" : "no"} aria-hidden="true" />
        </a>
      )}

      {me.role === "asisten" && (
        <button type="button" className="acct__row" onClick={onShortcuts}>
          <span>{t.shortcuts}</span>
          <Kbd>?</Kbd>
        </button>
      )}

      {/* Admins preview a role; while one runs, the bar under the nav goes back. */}
      {me.role === "asisten" && me.hak?.tim === true && !me.lihatPeran && (
        <button type="button" className="acct__row" onClick={onLihatPeran}>
          <span>{LP[lang].baris}</span>
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
