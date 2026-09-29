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
    title: "Palet perintah",
    placeholder: "Ketik perintah atau tujuan…",
    empty: "Tidak ada yang cocok.",
    go: "Pergi ke",
    session: "Sesi berjalan",
    modules: "Akses modul",
    server: "Server",
    home: "Beranda",
    console: "Konsol",
    schedule: "Jadwal",
    servers: "Server",
    reports: "Laporan",
    mods: "Modul",
    account: "Akun saya",
    group: (n: number) => `Buka Kelompok ${n} · ${KELOMPOK_NAMA[n]}`,
    announce: "Kirim pengumuman",
    drawer: "Buka laci server",
    end: "Akhiri sesi",
    open: (n: number) => `Buka Modul ${n} · ${MODUL_NAMA[n]}`,
    lock: (n: number) => `Tutup Modul ${n} · ${MODUL_NAMA[n]}`,
    apOn: "Nyalakan hotspot (AP)",
    apOff: "Matikan hotspot (AP)",
    opened: (n: number) => `Modul ${n} dibuka untuk praktikan.`,
    locked: (n: number) => `Modul ${n} ditutup.`,
    undo: "Urungkan",
    fail: "Tidak dapat menghubungi server.",
    apSent: "Perintah dikirim. Berlaku pada denyut berikutnya dari Orange Pi.",
    apNone: "Tidak ada satu Orange Pi tunggal untuk dikirimi perintah. Buka halaman Server.",
    shortcuts: "Pintasan keyboard",
    rows: {
      palette: "Palet perintah",
      help: "Lembar pintasan ini",
      g: "Pindah halaman: Konsol, Jadwal, Server, Laporan, Modul, Akun",
      groups: "Pilih kelompok di papan konsol",
      esc: "Tutup inspektur, laci atau dialog",
      enter: "Nilai: kolom berikutnya, lalu praktikan berikutnya",
      shiftEnter: "Nilai: mundur satu kolom",
      panes: "Pada pegangan panel: ciutkan panel kiri atau kanan",
    },
  },
  en: {
    title: "Command palette",
    placeholder: "Type a command or a place…",
    empty: "Nothing matches.",
    go: "Go to",
    session: "Running session",
    modules: "Module access",
    server: "Server",
    home: "Home",
    console: "Console",
    schedule: "Schedule",
    servers: "Server",
    reports: "Reports",
    mods: "Modules",
    account: "My account",
    group: (n: number) => `Open Group ${n} · ${KELOMPOK_NAMA[n]}`,
    announce: "Send an announcement",
    drawer: "Open the server drawer",
    end: "End the session",
    open: (n: number) => `Unlock Module ${n} · ${MODUL_NAMA[n]}`,
    lock: (n: number) => `Lock Module ${n} · ${MODUL_NAMA[n]}`,
    apOn: "Turn the hotspot (AP) on",
    apOff: "Turn the hotspot (AP) off",
    opened: (n: number) => `Module ${n} unlocked for students.`,
    locked: (n: number) => `Module ${n} locked.`,
    undo: "Undo",
    fail: "Could not reach the server.",
    apSent: "Command sent. It applies on the Orange Pi's next heartbeat.",
    apNone: "There is no single Orange Pi to send this to. Open the Server page.",
    shortcuts: "Keyboard shortcuts",
    rows: {
      palette: "Command palette",
      help: "This shortcut sheet",
      g: "Go to: Console, Schedule, Server, Reports, Modules, Account",
      groups: "Pick a group on the console board",
      esc: "Close the inspector, drawer or dialog",
      enter: "Scores: next field, then the next student",
      shiftEnter: "Scores: back one field",
      panes: "On a pane handle: collapse the left or right pane",
    },
  },
});

const CHORD: Record<string, string> = {
  k: "/session",
  j: "/schedule",
  s: "/servers",
  l: "/reports",
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
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
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
      for (let n = 1; n <= 5; n++) {
        list.push({
          id: `group-${n}`,
          group: t.session,
          label: t.group(n),
          hint: String(n),
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
        rows={[
          { keys: "Ctrl K", label: t.rows.palette },
          { keys: "?", label: t.rows.help },
          { keys: "G  K J S L M A", label: t.rows.g },
          { keys: "1 … 5", label: t.rows.groups },
          { keys: "Esc", label: t.rows.esc },
          { keys: "Enter", label: t.rows.enter },
          { keys: "Shift Enter", label: t.rows.shiftEnter },
          { keys: "[  ]", label: t.rows.panes },
        ]}
      />
    </>
  );
}
