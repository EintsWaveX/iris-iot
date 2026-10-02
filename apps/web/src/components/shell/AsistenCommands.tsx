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
    schedule: "Jadwal",
    servers: "Server",
    reports: "Laporan",
    team: "Tim",
    mods: "Modul",
    account: "Halaman Akun",
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
      schedule: "Ke Jadwal",
      servers: "Ke Server",
      reports: "Ke Laporan",
      team: "Ke Tim",
      modules: "Ke Modul",
      account: "Ke Halaman Akun",
      esc: "Tutup lapisan teratas",
      groups: "Pilih kelompok (0 untuk Kelompok 10)",
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
    schedule: "Schedule",
    servers: "Server",
    reports: "Reports",
    team: "Team",
    mods: "Modules",
    account: "Account Page",
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
      schedule: "Go to Schedule",
      servers: "Go to Server",
      reports: "Go to Reports",
      team: "Go to Team",
      modules: "Go to Modules",
      account: "Go to the Account Page",
      esc: "Close the top layer",
      groups: "Pick a group (0 for Group 10)",
      enter: "Next field, then the next student",
      shiftEnter: "Back one field",
      panes: "On a pane handle: collapse the left or right pane",
    },
  },
});

const CHORD: Record<string, string> = {
  k: "/session",
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

export async function setModulAkses(n: number, open: boolean, lang: Lang): Promise<void> {
  const t = T[lang];
  const apply = async (list: number[]) =>
    postJson<{ ok: boolean }>("/api/session/akses", { terbuka: list });
  try {
    const cur = await getJson<{ ok: boolean; terbuka: number[] }>("/api/session/akses");
    const before = cur.terbuka ?? [];
    const next = open
      ? [...new Set([...before, n])].sort((a, b) => a - b)
      : before.filter((m) => m !== n);
    const r = await apply(next);
    if (!r.ok) throw new Error();
    window.dispatchEvent(new Event("iris:akses-berubah"));
    window.Toast?.show(open ? t.opened(n) : t.locked(n), "ok", {
      action: {
        label: t.undo,
        onClick: () =>
          void apply(before).then(() => window.dispatchEvent(new Event("iris:akses-berubah"))),
      },
    });
  } catch {
    window.Toast?.show(t.fail, "danger");
  }
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
    for (let n = 1; n <= 4; n++) {
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
  }, [lang, running, t]);

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
