/**
 * Rewrites a sketch's group-identity line(s) -- not a graded blank, so the
 * editor never touches them, but not safe to ship as literal "group 1"
 * either: Modules 1, 3 and 4 each hardcode `GROUP_ID = 1` (or
 * `LORA_SYNC_WORD`, Module 4's radio identity) in every group's source, and
 * every one of that group's file downloads carried group 1's identity
 * regardless of who downloaded it, until this existed.
 *
 * The consequence, concretely: five groups all flashing "group 1" firmware
 * collide with each other -- the same BLE UUID (Module 1), the same MQTT
 * topic (Module 3), and in Module 4, the same LoRa sync word AND the same
 * TDMA transmit slot, so two boards would try to talk over each other on
 * air. This is not a cosmetic label; it is the value that keeps five
 * groups' hardware from interfering with one another.
 *
 * personalize() is deliberately strict: a rewrite whose total match count
 * (summed across every language OPTION -- see Rewrite below) isn't exactly
 * 1 throws rather than silently doing nothing or rewriting the wrong line,
 * because a silent failure here reproduces exactly the bug this file
 * exists to fix.
 */
import identitas from "../content/sketches/identitas.json";
import type { Segment } from "./blanks";

interface RewriteOption {
  /** Must match zero or one times in an id/en-correct file -- see Rewrite's
   *  own doc for why more than one option can exist per Rewrite. */
  pattern: RegExp;
  replacement: (nomorKelompok: number) => string;
}

interface Rewrite {
  /** Each option is one language's exact phrasing of the same concept (for
   *  example "Kelompok N" in id/ vs "Group N" in en/) -- kept as separate
   *  plain-string options instead of one alternation regex specifically so
   *  a match can't straddle languages and produce a mixed-language
   *  replacement. Across every option, exactly one must match exactly
   *  once in a given file. */
  options: RewriteOption[];
}

const IDENTITAS = identitas as Record<
  string,
  Record<string, { groupId: number; syncWord?: string }>
>;

function syncWordFor(modul: number, nomorKelompok: number): string {
  const entry = IDENTITAS[String(modul)]?.[String(nomorKelompok)];
  if (!entry?.syncWord) {
    throw new Error(`no sync word recorded for modul ${modul} group ${nomorKelompok}`);
  }
  return entry.syncWord;
}

/** One option, for a rewrite with no language variation (Modules 1, 3, and
 *  Module 4's #define lines are identical strings in id/ and en/ -- only
 *  surrounding comments differ, and this pattern never touches those). */
function plain(pattern: RegExp, replacement: (n: number) => string): Rewrite {
  return { options: [{ pattern, replacement }] };
}

const REWRITES: Record<string, Rewrite[]> = {
  modul1_ble_central: [plain(/const int GROUP_ID = \d+;/, (n) => `const int GROUP_ID = ${n};`)],
  modul1_ble_peripheral: [plain(/const int GROUP_ID = \d+;/, (n) => `const int GROUP_ID = ${n};`)],
  modul3_mqtt_publish: [plain(/group_id = \d+/, (n) => `group_id = ${n}`)],
  modul3_mqtt_subscribe: [plain(/group_id = \d+/, (n) => `group_id = ${n}`)],
  modul4_hunter: [
    plain(/#define GROUP_ID \d+/, (n) => `#define GROUP_ID ${n}`),
    plain(
      /#define LORA_SYNC_WORD(\s+)0x[0-9A-Fa-f]+/,
      (n) => `#define LORA_SYNC_WORD        ${syncWordFor(4, n)}`,
    ),
    // The header docblock's own "(Kelompok N)" / "(Group N)" label -- a
    // second, independent place group 1's identity was hardcoded, found by
    // staging a real reconstructed download and reading its header rather
    // than trusting the #define rewrites alone. Anchored on "Peran: HUNTER"
    // / "Role: HUNTER" so it can never match the unrelated "Kelompok 1
    // memancar..." TDMA explanation elsewhere in beacon.ino, which stays
    // the same illustrative text in every group's copy on purpose.
    {
      options: [
        {
          pattern: /Peran: HUNTER \(Kelompok \d+\)/,
          replacement: (n) => `Peran: HUNTER (Kelompok ${n})`,
        },
        {
          pattern: /Role: HUNTER \(Group \d+\)/,
          replacement: (n) => `Role: HUNTER (Group ${n})`,
        },
      ],
    },
  ],
  modul4_beacon: [
    plain(/#define GROUP_ID \d+/, (n) => `#define GROUP_ID ${n}`),
    plain(
      /#define LORA_SYNC_WORD(\s+)0x[0-9A-Fa-f]+/,
      (n) => `#define LORA_SYNC_WORD        ${syncWordFor(4, n)}`,
    ),
    {
      options: [
        {
          pattern: /Peran: BEACON \(Kelompok \d+,/,
          replacement: (n) => `Peran: BEACON (Kelompok ${n},`,
        },
        {
          pattern: /Role: BEACON \(Group \d+,/,
          replacement: (n) => `Role: BEACON (Group ${n},`,
        },
      ],
    },
  ],
};

/** True if `berkas` carries a group-identity line personalize() rewrites --
 *  Module 2's files need none, since their per-group value (WS_PATH) is
 *  already a graded blank resolved in answer-keys.ts. */
export function needsPersonalization(berkas: string): boolean {
  return berkas in REWRITES;
}

/** Applies one Rewrite to `text`, requiring the total match count across
 *  every one of its options to be exactly 1. Returns the rewritten text and
 *  how many matches were found (for the segment-aware variant below, which
 *  needs to sum counts across several segments before enforcing the same
 *  rule). */
function applyRewrite(
  rewrite: Rewrite,
  text: string,
  nomorKelompok: number,
): { text: string; count: number } {
  let out = text;
  let count = 0;
  for (const option of rewrite.options) {
    const matches = out.match(new RegExp(option.pattern, "g"));
    if (matches) {
      count += matches.length;
      out = out.replace(option.pattern, option.replacement(nomorKelompok));
    }
  }
  return { text: out, count };
}

export function personalize(berkas: string, text: string, nomorKelompok: number): string {
  const rewrites = REWRITES[berkas];
  if (!rewrites) return text;

  let out = text;
  for (const rewrite of rewrites) {
    const result = applyRewrite(rewrite, out, nomorKelompok);
    if (result.count !== 1) {
      throw new Error(
        `personalize(${berkas}): a rewrite matched ${result.count} times, expected exactly 1`,
      );
    }
    out = result.text;
  }
  return out;
}

/** Same rewrite, but over the editor's already-split Segment[] (from
 *  blanks.ts) rather than a flat string, so the Code step can show a
 *  logged-in group its own identity without re-parsing blanks client-side.
 *  A pattern lives entirely within one "text" segment (identity lines carry
 *  no blank), but which segment isn't assumed -- each rewrite's match count
 *  is summed across every segment and must total exactly 1, the same
 *  strictness personalize() applies to a whole file. */
export function personalizeSegments(
  berkas: string,
  segments: Segment[],
  nomorKelompok: number,
): Segment[] {
  const rewrites = REWRITES[berkas];
  if (!rewrites) return segments;

  let out = segments;
  for (const rewrite of rewrites) {
    let total = 0;
    out = out.map((seg) => {
      if (seg.kind !== "text") return seg;
      const result = applyRewrite(rewrite, seg.text, nomorKelompok);
      total += result.count;
      return { ...seg, text: result.text };
    });
    if (total !== 1) {
      throw new Error(
        `personalizeSegments(${berkas}): a rewrite matched ${total} times across segments, expected exactly 1`,
      );
    }
  }
  return out;
}
