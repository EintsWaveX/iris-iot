/**
 * The assistant's global command layer (Phase 8), mounted by AppNav on every
 * page for a signed-in assistant:
 *
 * - Ctrl+K / Cmd+K opens the palette: go anywhere, jump to a group, open or
 *   lock a module (applied at once, with Undo), switch the hotspot, open the
 *   announcement composer, the server drawer, or the end-of-session recap.
 * - "?" opens the shortcut sheet.
 * - G then K / J / S / L / M / A navigates (Konsol, Jadwal, Server, Laporan,
 *   Modul, Akun), the Linear/GitHub chord.
 *
 * Commands that act inside the console are sent as an `iris:console` event
 * when the console is on screen, or carried to it in the URL hash
 * (#cmd=announce) from any other page.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { shortcutsOn } from "../../lib/prefs";
import { KELOMPOK_DEFAULT } from "../../lib/jadwal";
import CommandPalette, { useCommandPaletteHotkey, type PaletteCommand } from "../ui/CommandPalette";
import ShortcutSheet, { isTypingTarget, useQuestionMarkHotkey } from "../ui/ShortcutSheet";
import {
  KELOMPOK_NAMA,
  MODUL_NAMA,
  dict,
  getJson,
  href,
  postJson,
  useMe,
  type SesiNow,
} from "../../lib/app";
import type { Lang } from "../../lib/kelas";

export const CONSOLE_EVENT = "iris:console";
export type ConsoleCommand =
  | { type: "group"; n: number }
  | { type: "announce" }
  | { type: "drawer" }
  | { type: "end" }
  | { type: "view"; view: "prep" | "board" | "table" };

const T = dict({
  id: {
    title: "Palet Perintah",
    placeholder: "Ketik perintah atau tujuan…",
    empty: "Tidak ada yang cocok.",
    go: "Pergi ke",
    session: "Sesi Berjalan",
    modules: "Akses Modul",
    server: "Server",
    home: "Beranda",
    console: "Konsol",
    prep: "Persiapan",
    tot: "Mode TOT",
    schedule: "Jadwal",
    servers: "Server",
    reports: "Laporan",
    grading: "Penilaian",
    lms: "LMS",
    team: "Tim",
    mods: "Modul",
    account: "Halaman Akun",
    seelabsGuide: "Panduan Nilai ke SeeLabs",
    group: (n: number) => `Buka Kelompok ${n} · ${KELOMPOK_NAMA[n]}`,
    announce: "Kirim Pengumuman",
    drawer: "Buka Laci Server",
    end: "Akhiri Sesi",
    open: (n: number) => `Buka Modul ${n} · ${MODUL_NAMA[n]}`,
    lock: (n: number) => `Tutup Modul ${n} · ${MODUL_NAMA[n]}`,
    apOn: "Nyalakan Hotspot",
    apOff: "Matikan Hotspot",
    opened: (n: number) => `Modul ${n} dibuka untuk praktikan.`,
    locked: (n: number) => `Modul ${n} ditutup.`,
    undo: "Urungkan",
    fail: "Tidak dapat menghubungi server.",
    apSent: "Perintah dikirim. Berlaku pada denyut berikutnya dari Orange Pi.",
    apNone: "Tidak ada satu Orange Pi tunggal untuk dikirimi perintah. Buka halaman Server.",
    shortcuts: "Pintasan Keyboard",
    groups: {
      anywhere: "Di Mana Saja",
      session: "Saat Sesi",
      table: "Tabel Nilai",
    },
    rows: {
      palette: "Palet perintah",
      help: "Buka daftar ini",
      home: "Ke Beranda",
      console: "Ke Konsol",
      prep: "Ke Persiapan",
      tot: "Ke Mode TOT",
      schedule: "Ke Jadwal",
      servers: "Ke Server",
      reports: "Ke Laporan",
      grading: "Ke Penilaian",
      lms: "Ke LMS",
      team: "Ke Tim",
      modules: "Ke Modul",
      account: "Ke Halaman Akun",
      esc: "Tutup lapisan teratas",
      groups: "Pilih kelompok (0 untuk Kelompok 10)",
      extend: "Perpanjang sesi",
      enter: "Kolom berikutnya, lalu praktikan berikutnya",
      shiftEnter: "Mundur satu kolom",
      panes: "Pada pegangan panel: ciutkan panel kiri atau kanan",
    },
  },
  en: {
    title: "Command Palette",
    placeholder: "Type a command or a place…",
    empty: "Nothing matches.",
    go: "Go to",
    session: "Running Session",
    modules: "Module Access",
    server: "Server",
    home: "Home",
    console: "Console",
    prep: "Preparation",
    tot: "TOT Mode",
    schedule: "Schedule",
    servers: "Server",
    reports: "Reports",
    grading: "Grading",
    lms: "LMS",
    team: "Team",
    mods: "Modules",
    account: "Account Page",
    seelabsGuide: "Scores to SeeLabs Guide",
    group: (n: number) => `Open Group ${n} · ${KELOMPOK_NAMA[n]}`,
    announce: "Send an Announcement",
    drawer: "Open the Server Drawer",
    end: "End the Session",
    open: (n: number) => `Unlock Module ${n} · ${MODUL_NAMA[n]}`,
    lock: (n: number) => `Lock Module ${n} · ${MODUL_NAMA[n]}`,
    apOn: "Turn the Hotspot On",
    apOff: "Turn the Hotspot Off",
    opened: (n: number) => `Module ${n} unlocked for students.`,
    locked: (n: number) => `Module ${n} locked.`,
    undo: "Undo",
    fail: "Could not reach the server.",
    apSent: "Command sent. It applies on the Orange Pi's next heartbeat.",
    apNone: "There is no single Orange Pi to send this to. Open the Server page.",
    shortcuts: "Keyboard Shortcuts",
    groups: {
      anywhere: "Anywhere",
      session: "In a Session",
      table: "Score Table",
    },
    rows: {
      palette: "Command palette",
      help: "Open this list",
      home: "Go to Home",
      console: "Go to Console",
      prep: "Go to Preparation",
      tot: "Go to TOT Mode",
      schedule: "Go to Schedule",
      servers: "Go to Server",
      reports: "Go to Reports",
      grading: "Go to Grading",
      lms: "Go to the LMS",
      team: "Go to Team",
      modules: "Go to Modules",
      account: "Go to the Account Page",
      esc: "Close the top layer",
      groups: "Pick a group (0 for Group 10)",
      extend: "Extend the session",
      enter: "Next field, then the next student",
      shiftEnter: "Back one field",
      panes: "On a pane handle: collapse the left or right pane",
    },
  },
  zh: {
    title: "命令面板",
    placeholder: "输入命令或地方…",
    empty: "没有匹配的。",
    go: "前往",
    session: "正在上课",
    modules: "模块权限",
    server: "服务器",
    home: "首页",
    console: "控制台",
    prep: "课前准备",
    tot: "TOT 模式",
    schedule: "课表",
    servers: "服务器",
    reports: "报告",
    grading: "评分",
    lms: "LMS",
    team: "团队",
    mods: "模块",
    account: "账号页面",
    seelabsGuide: "分数提交到 SeeLabs 指南",
    group: (n: number) => `打开第 ${n} 组 · ${KELOMPOK_NAMA[n]}`,
    announce: "发公告",
    drawer: "打开服务器抽屉",
    end: "结束上课",
    open: (n: number) => `开放模块 ${n} · ${MODUL_NAMA[n]}`,
    lock: (n: number) => `锁定模块 ${n} · ${MODUL_NAMA[n]}`,
    apOn: "打开热点",
    apOff: "关闭热点",
    opened: (n: number) => `模块 ${n} 已对学生开放。`,
    locked: (n: number) => `模块 ${n} 已锁定。`,
    undo: "撤销",
    fail: "连不上服务器。",
    apSent: "命令已发送。会在 Orange Pi 下一次心跳时生效。",
    apNone: "没有唯一的一台 Orange Pi 可以发送。请打开服务器页面。",
    shortcuts: "键盘快捷键",
    groups: {
      anywhere: "任何地方",
      session: "上课时",
      table: "分数表",
    },
    rows: {
      palette: "命令面板",
      help: "打开这个列表",
      home: "去首页",
      console: "去控制台",
      prep: "去课前准备",
      tot: "去 TOT 模式",
      schedule: "去课表",
      servers: "去服务器",
      reports: "去报告",
      grading: "去评分",
      lms: "去 LMS",
      team: "去团队",
      modules: "去模块",
      account: "去账号页面",
      esc: "关闭最上层",
      groups: "选一个组（第 10 组按 0）",
      extend: "延长这节课",
      enter: "下一个格子，然后是下一位学生",
      shiftEnter: "回到上一个格子",
      panes: "在面板拖柄上：收起左边或右边的面板",
    },
  },
});

const CHORD: Record<string, string> = {
  k: "/session",
  n: "/grading",
  e: "/lms",
  p: "/preparation",
  o: "/tot",
  j: "/schedule",
  s: "/servers",
  l: "/reports",
  t: "/team",
  m: "/modules",
  a: "/account",
  b: "/",
};

function onConsolePage(): boolean {
  return /^(\/en)?\/session\/?$/.test(location.pathname);
}

export function sendConsole(cmd: ConsoleCommand, lang: Lang): void {
  if (onConsolePage()) {
    window.dispatchEvent(new CustomEvent<ConsoleCommand>(CONSOLE_EVENT, { detail: cmd }));
    return;
  }
  const hash =
    cmd.type === "group" ? `#k${cmd.n}` : cmd.type === "view" ? `#${cmd.view}` : `#cmd=${cmd.type}`;
  location.assign(href(lang, "/session") + hash);
}

// Flips run one after another, each from the uncached list (?meta=1; the
// public one is edge-cached), so two quick flips can't undo each other.
// Views reload only once the queue is empty, so a switch already flipped
// on screen doesn't jump back while a later flip is still on its way.
let antrean: Promise<void> = Promise.resolve();
let tertunda = 0;

async function ubahAkses(ubah: (before: number[]) => number[]): Promise<number[]> {
  const cur = await getJson<{ ok: boolean; terbuka: number[] }>("/api/session/akses?meta=1");
  if (!cur.ok) throw new Error();
  const before = cur.terbuka ?? [];
  const r = await postJson<{ ok: boolean; terbuka?: number[] }>("/api/session/akses", {
    terbuka: ubah(before),
  });
  if (!r.ok) throw new Error();
  return before;
}

export function setModulAkses(n: number, open: boolean, lang: Lang): Promise<void> {
  const t = T[lang];
  const run = async () => {
    try {
      await ubahAkses((before) =>
        open ? [...new Set([...before, n])].sort((a, b) => a - b) : before.filter((m) => m !== n),
      );
      window.Toast?.show(open ? t.opened(n) : t.locked(n), "ok", {
        action: {
          label: t.undo,
          // Undo puts back only this module, not the whole list as it was.
          onClick: () => void setModulAkses(n, !open, lang),
        },
      });
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      if (--tertunda === 0) window.dispatchEvent(new Event("iris:akses-berubah"));
    }
  };
  tertunda++;
  antrean = antrean.then(run);
  return antrean;
}

export async function setHotspot(on: boolean, lang: Lang): Promise<void> {
  const t = T[lang];
  try {
    const d = await getJson<{ ok: boolean; server: { id: number }[] }>("/api/server");
    if (!d.ok || d.server.length !== 1) {
      window.Toast?.show(t.apNone, "warn");
      return;
    }
    const r = await postJson<{ ok: boolean }>("/api/action", {
      tipe: "kirim",
      serverId: d.server[0].id,
      aksi: on ? "ap.nyala" : "ap.mati",
      argumen: {},
    });
    window.Toast?.show(r.ok ? t.apSent : t.fail, r.ok ? "ok" : "danger");
  } catch {
    window.Toast?.show(t.fail, "danger");
  }
}

export default function AsistenCommands({
  lang,
  paletteOpen,
  setPaletteOpen,
  shortcutsOpen,
  setShortcutsOpen,
  running,
}: {
  lang: Lang;
  paletteOpen: boolean;
  setPaletteOpen: (fn: boolean | ((o: boolean) => boolean)) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (o: boolean) => void;
  running: SesiNow | null;
}) {
  const t = T[lang];
  // Opening and locking modules needs the Jadwal right (2026-10-06: the
  // palette offered it to everyone and the API refused it).
  const bolehAkses = useMe()?.hak?.jadwal === true;
  useCommandPaletteHotkey(setPaletteOpen as (fn: (o: boolean) => boolean) => void);
  const openSheet = useCallback(() => setShortcutsOpen(true), [setShortcutsOpen]);
  useQuestionMarkHotkey(openSheet);

  // G then a letter.
  const gAt = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || !shortcutsOn()) return;
      const k = e.key.toLowerCase();
      if (k === "g") {
        gAt.current = Date.now();
        return;
      }
      if (Date.now() - gAt.current < 1200 && CHORD[k]) {
        gAt.current = 0;
        e.preventDefault();
        location.assign(href(lang, CHORD[k]));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lang]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const go = (path: string) => () => location.assign(href(lang, path));
    const list: PaletteCommand[] = [
      {
        id: "home",
        group: t.go,
        label: t.home,
        hint: "G B",
        run: go("/"),
      },
      {
        id: "console",
        group: t.go,
        label: t.console,
        hint: "G K",
        keywords: ["sesi", "session", "konsol"],
        run: go("/session"),
      },
      {
        id: "prep",
        group: t.go,
        label: t.prep,
        hint: "G P",
        keywords: ["persiapan", "preparation", "roster", "akses", "skema", "pin"],
        run: go("/preparation"),
      },
      {
        id: "tot",
        group: t.go,
        label: t.tot,
        hint: "G O",
        keywords: ["tot", "latihan", "training", "dummy"],
        run: go("/tot"),
      },
      {
        id: "schedule",
        group: t.go,
        label: t.schedule,
        hint: "G J",
        keywords: ["jadwal", "schedule"],
        run: go("/schedule"),
      },
      {
        id: "servers",
        group: t.go,
        label: t.servers,
        hint: "G S",
        keywords: ["orange pi", "pi"],
        run: go("/servers"),
      },
      {
        id: "grading",
        group: t.go,
        label: t.grading,
        hint: "G N",
        keywords: ["penilaian", "nilai", "grading", "tp", "tugas pendahuluan"],
        run: go("/grading"),
      },
      {
        id: "lms",
        group: t.go,
        label: t.lms,
        hint: "G E",
        keywords: ["lms", "moodle", "pengumuman", "kalender", "kelas", "sambungan"],
        run: go("/lms"),
      },
      {
        id: "reports",
        group: t.go,
        label: t.reports,
        hint: "G L",
        keywords: ["laporan", "reports"],
        run: go("/reports"),
      },
      {
        id: "team",
        group: t.go,
        label: t.team,
        hint: "G T",
        keywords: ["tim", "team", "asisten", "jabatan"],
        run: go("/team"),
      },
      {
        id: "modules",
        group: t.go,
        label: t.mods,
        hint: "G M",
        run: go("/modules"),
      },
      {
        id: "account",
        group: t.go,
        label: t.account,
        hint: "G A",
        keywords: ["password", "sandi"],
        run: go("/account"),
      },
      {
        id: "seelabs-guide",
        group: t.go,
        label: t.seelabsGuide,
        keywords: ["seelabs", "nilai", "scores", "panduan", "guide", "tutorial", "bookmarklet"],
        run: go("/session#seelabs=panduan"),
      },
    ];
    if (running) {
      for (let n = 1; n <= (running.jumlahKelompok ?? KELOMPOK_DEFAULT); n++) {
        list.push({
          id: `group-${n}`,
          group: t.session,
          label: t.group(n),
          hint: String(n % 10),
          keywords: [`k${n}`, `g${n}`, "kelompok", "group"],
          run: () => sendConsole({ type: "group", n }, lang),
        });
      }
      list.push(
        {
          id: "announce",
          group: t.session,
          label: t.announce,
          keywords: ["pengumuman", "broadcast"],
          run: () => sendConsole({ type: "announce" }, lang),
        },
        {
          id: "drawer",
          group: t.session,
          label: t.drawer,
          run: () => sendConsole({ type: "drawer" }, lang),
        },
        {
          id: "end",
          group: t.session,
          label: t.end,
          keywords: ["akhiri", "end", "selesai"],
          run: () => sendConsole({ type: "end" }, lang),
        },
      );
    }
    for (let n = 1; n <= 4 && bolehAkses; n++) {
      list.push(
        {
          id: `open-${n}`,
          group: t.modules,
          label: t.open(n),
          keywords: [`m${n}`, "akses", "access"],
          run: () => void setModulAkses(n, true, lang),
        },
        {
          id: `lock-${n}`,
          group: t.modules,
          label: t.lock(n),
          keywords: [`m${n}`, "akses", "access"],
          run: () => void setModulAkses(n, false, lang),
        },
      );
    }
    list.push(
      {
        id: "ap-on",
        group: t.server,
        label: t.apOn,
        keywords: ["hotspot", "iris-iot"],
        run: () => void setHotspot(true, lang),
      },
      {
        id: "ap-off",
        group: t.server,
        label: t.apOff,
        keywords: ["hotspot"],
        run: () => void setHotspot(false, lang),
      },
    );
    return list;
  }, [lang, running, t, bolehAkses]);

  return (
    <>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={(o) => setPaletteOpen(o)}
        commands={commands}
        placeholder={t.placeholder}
        empty={t.empty}
        title={t.title}
      />
      <ShortcutSheet
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        title={t.shortcuts}
        lang={lang}
        groups={[
          {
            title: t.groups.anywhere,
            rows: [
              { keys: ["Ctrl", "K"], label: t.rows.palette },
              { keys: ["G", "B"], label: t.rows.home },
              { keys: ["G", "K"], label: t.rows.console },
              { keys: ["G", "P"], label: t.rows.prep },
              { keys: ["G", "O"], label: t.rows.tot },
              { keys: ["G", "N"], label: t.rows.grading },
              { keys: ["G", "E"], label: t.rows.lms },
              { keys: ["G", "J"], label: t.rows.schedule },
              { keys: ["G", "S"], label: t.rows.servers },
              { keys: ["G", "L"], label: t.rows.reports },
              { keys: ["G", "T"], label: t.rows.team },
              { keys: ["G", "M"], label: t.rows.modules },
              { keys: ["G", "A"], label: t.rows.account },
              { keys: ["Esc"], label: t.rows.esc },
              { keys: ["?"], label: t.rows.help },
            ],
          },
          {
            title: t.groups.session,
            rows: [
              { keys: ["1", "…", "9"], label: t.rows.groups },
              { keys: ["E"], label: t.rows.extend },
              { keys: ["[", "]"], label: t.rows.panes },
            ],
          },
          {
            title: t.groups.table,
            rows: [
              { keys: ["Enter"], label: t.rows.enter },
              { keys: ["Shift", "Enter"], label: t.rows.shiftEnter },
            ],
          },
        ]}
      />
    </>
  );
}
