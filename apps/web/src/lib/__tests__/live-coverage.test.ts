import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every view stays live (Phase 12): a file that reads API data must also
 * hear when that data changes, through a topic (usePoll with topics,
 * useSiaran, useSegar, dengar), the session room (useAliran) or a deadline
 * (useBatas). A timer that fetches is only allowed as the safety net in
 * lib/siaran.ts, and a usePoll's own interval is the 60 s net, not the way
 * it stays current. Exceptions are listed below with their reason.
 */

const SRC = fileURLToPath(new URL("../../", import.meta.url));

// ---------- Allow Lists ----------
// ---------- Allow Lists ----------
// ---------- Allow Lists ----------

/** Files that read once on purpose */
const SEKALI: Record<string, string> = {
  "components/SignInPage.tsx": "sign-in checks, the page reloads after signing in",
  "components/shell/IdentityWatch.tsx": "asks who is signed in on focus and after a refusal",
  "components/KodeSesiDialog.tsx": "the session code check, typed by the person",
  "components/console/StartCheck.tsx": "the readiness check runs when Start is pressed",
  "components/console/Console.tsx": "asks once how a session ended, when the live data loses it",
  "components/shell/AsistenCommands.tsx": "reads just before the write a command makes",
  "components/console/EndFlow.tsx": "the wrap up reads once per step it opens",
  "components/console/prep/StudentDialogs.tsx": "dialogs that only write",
  "components/console/ringkasSesi.ts": "builds a summary file on demand",
  "components/dashboard/FeedbackForm.tsx": "the form only writes",
  "components/schedule/ImportView.tsx": "reads the file the person drops in",
  "components/schedule/SlotEditor.tsx": "a dialog that only writes",
  "components/server/Settings.tsx": "a form that only writes",
  "components/server/data.ts": "the commands a button sends",
  "components/server/ops.tsx": "the commands a button sends",
  "components/server/konsol/data.ts": "Konsol Pi has its own relay room",
  "lib/telemetry-live.ts": "the backlog read behind the session room",
  "lib/siaran.ts": "the live updates themselves",
  "lib/aliran-ruang.ts": "the session room itself (its ticket)",
  "lib/app.ts": "getJson itself; useSessionNow polls with topics",
  "lib/auth.ts": "sign in and out",
  "lib/seelabs-helper.ts": "runs in the SeeLabs tab",
  "lib/pdf.ts": "fetches fonts for a PDF",
  "lib/tp-pdf.ts": "fetches the font and the IRIS mark for a TP paper",
  "components/grading/SoalTab.tsx":
    "the LMS attachment check runs when asked; the bank is usePaket, live on topic tp",
  "components/grading/TpTab.tsx": "downloads a group's files when asked; its data is GradingPage's",
  "lib/xlsx.ts": "builds a file on demand",
  "lib/laporan.ts": "builds a file on demand",
  "scripts/lapor-galat.ts": "reports an error",
  "scripts/modul-akses.ts": "module access for the static module pages, read on load",
};

/** Timers that may fetch */
const TIMER_BOLEH: Record<string, string> = {
  "lib/siaran.ts": "the 60 s safety net and the 30 s net while the socket is down",
  "lib/hooks.ts": "usePoll's own interval, held to 60 s by the test below",
  "components/shell/AppNav.tsx": "an Asisten's presence stamp, once a minute while in view",
  "scripts/polling.ts": "startPolling itself",
  "lib/aliran-ruang.ts": "useCadangan, the poll that stands in only while a room is down",
};

/** usePoll intervals under 60 s */
const CEPAT_BOLEH: Record<string, string> = {};

// ---------- Source Scan ----------
// ---------- Source Scan ----------
// ---------- Source Scan ----------

/** Every .ts and .tsx under a folder, tests left out */
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "__tests__") files(path, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

/** Comments blanked out, so a word in a comment never counts */
function tanpaKomentar(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** The text inside each call of `nama(...)`, parentheses balanced */
function argumen(src: string, nama: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\b${nama}\\s*(?:<[^()]*?>)?\\(`, "g");
  for (const m of src.matchAll(re)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    out.push(src.slice(start, i - 1));
  }
  return out;
}

/** The top level arguments of one call's text */
function pisahArgumen(isi: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of isi) {
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** A number literal or a `const X = n` in the same file, else null */
function angka(arg: string, src: string): number | null {
  const lit = arg.replace(/_/g, "");
  if (/^\d+$/.test(lit)) return Number(lit);
  const m = new RegExp(`const\\s+${arg}\\s*=\\s*([\\d_]+)`).exec(src);
  return m ? Number(m[1].replace(/_/g, "")) : null;
}

interface Berkas {
  rel: string;
  src: string;
}

const BERKAS: Berkas[] = ["components", "lib", "scripts"].flatMap((d) =>
  files(join(SRC, d)).map((p) => ({
    rel: relative(SRC, p).replace(/\\/g, "/"),
    src: tanpaKomentar(readFileSync(p, "utf8")),
  })),
);

/** Reads API data: getJson, or a fetch without a method */
function membaca(src: string): boolean {
  if (/\bgetJson\s*[<(]/.test(src)) return true;
  return argumen(src, "fetch").some((a) => !/\bmethod\s*:/.test(a));
}

const LIVE_RE = /\b(useSiaran|useSegar|dengar|useAliran|useBatas|useSessionNow)\s*[<(]/;

/** Hears changes: a live hook, or a usePoll with topics */
function hidup(src: string): boolean {
  if (LIVE_RE.test(src)) return true;
  return argumen(src, "usePoll").some((a) => pisahArgumen(a).length >= 4);
}

// ---------- Rules ----------
// ---------- Rules ----------
// ---------- Rules ----------

describe("every view is live", () => {
  it("every file that reads API data hears its changes", () => {
    const mati = BERKAS.filter((b) => !(b.rel in SEKALI) && membaca(b.src) && !hidup(b.src)).map(
      (b) => b.rel,
    );
    expect(mati, "subscribe these to their topics, or list them in SEKALI with a reason").toEqual(
      [],
    );
  });

  it("every usePoll names its topics", () => {
    const tanpa = BERKAS.flatMap((b) =>
      argumen(b.src, "usePoll")
        .filter((a) => pisahArgumen(a).length < 4)
        .map(() => b.rel),
    ).filter((r) => r !== "lib/hooks.ts");
    expect(tanpa, "give these usePoll calls their topics").toEqual([]);
  });

  it("no usePoll leans on a fast interval", () => {
    const cepat = BERKAS.flatMap((b) =>
      argumen(b.src, "usePoll").flatMap((a) => {
        const ms = angka(pisahArgumen(a)[1] ?? "", b.src);
        return ms !== null && ms < 60_000 && !(b.rel in CEPAT_BOLEH) ? [`${b.rel} (${ms} ms)`] : [];
      }),
    );
    expect(cepat, "topics keep these current; the interval is the 60 s safety net").toEqual([]);
  });

  it("no timer fetches outside the safety net", () => {
    // A timer that reads; one whose fetches all write (an upload) is fine
    const BACA_RE =
      /\b(getJson|fetch[A-Z]\w*|load\w*|muat\w*|pull|tick|run|refresh\w*)\s*\(|\b(load|pull|tick)\b/;
    const membaca = (a: string) =>
      BACA_RE.test(a) || argumen(a, "fetch").some((f) => !/\bmethod\s*:/.test(f));
    const timer = BERKAS.flatMap((b) => {
      if (b.rel in TIMER_BOLEH) return [];
      // startPolling always fetches; setInterval when its body reads
      if (argumen(b.src, "startPolling").length) return [b.rel];
      return argumen(b.src, "setInterval").some(membaca) ? [b.rel] : [];
    });
    expect(timer, "move these timers onto topics or the session room").toEqual([]);
  });

  it("the allow lists name files that still exist", () => {
    const ada = new Set(BERKAS.map((b) => b.rel));
    const basi = [
      ...Object.keys(SEKALI),
      ...Object.keys(TIMER_BOLEH),
      ...Object.keys(CEPAT_BOLEH),
    ].filter((r) => !ada.has(r));
    expect(basi).toEqual([]);
  });
});
