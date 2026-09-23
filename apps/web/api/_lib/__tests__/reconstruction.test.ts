import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import path from "node:path";
import { parseBlanks } from "../../../src/lib/blanks";
import { canonicalAnswer } from "../answer-keys";
import { personalize } from "../../../src/lib/group-identity";

/**
 * Simulates exactly what api/modul/[aksi].ts's handleUnduh() does -- parse
 * the generic template, fill every blank with its canonical answer,
 * personalize the group-identity line(s) -- without needing a live
 * database, session cookie, or HTTP server, so this runs in the same
 * `vitest run` as everything else instead of needing a real browser and a
 * throwaway Postgres. It's a stand-in for the plan's own gate ("a real
 * browser session completes all blanks and downloads, diff against
 * kunci_jawaban is empty"), covering the exact same reconstruction logic
 * that a real click-through would exercise, verified against the real
 * IRIS ASO answer key on disk instead of a database round trip.
 */

const SKETCHES_DIR = fileURLToPath(new URL("../../../src/content/sketches/", import.meta.url));
// Same default IRIS ASO location this app's own sync/build scripts assume
// (sync_sketches.py, orangepi/build_bundle.py) -- this repo has no other
// record of where a sibling checkout lives, since the two are separate
// repositories. Absent in CI, which is exactly what the skip guard below
// is for.
const IRIS_ASO = path.join(homedir(), "Downloads", "IRIS ASO");

function reconstruct(
  berkas: string,
  bahasa: string,
  ext: string,
  modul: number,
  nomorKelompok: number,
): string {
  const template = readFileSync(path.join(SKETCHES_DIR, bahasa, `${berkas}${ext}`), "utf-8");
  const segments = parseBlanks(template);
  const genericText = segments
    .map((s) => {
      if (s.kind === "text") return s.text;
      const kode = `m${modul}.${berkas}.${s.nomor}`;
      const answer = canonicalAnswer(kode, { nomorKelompok });
      if (answer === undefined) throw new Error(`no canonical answer for ${kode}`);
      return answer;
    })
    .join("");
  return personalize(berkas, genericText, nomorKelompok);
}

/**
 * Two differences between a reconstructed download and kunci_jawaban's own
 * copy are real, pre-existing, and by design, not bugs -- so both sides are
 * normalized past them before comparing. Everything else, INCLUDING the
 * header's own "Peran: HUNTER (Kelompok N)" / "Role: HUNTER (Group N)"
 * line, must still match exactly -- that line is exactly the second place
 * (besides the #define lines) group 1's identity was found hardcoded, so
 * this comparison must not accidentally skip past it along with the one
 * line that legitimately differs:
 *  - The one-sentence instructional line. kunci_jawaban's docblock says
 *    "KUNCI JAWABAN. Seluruh bagian rumpang sudah terisi..."; the student
 *    template's says "Isi setiap bagian rumpang...". A download
 *    reconstructs from the student template, correctly, so it should say
 *    the latter -- removed from both sides rather than skipped wholesale.
 *  - Trailing "// (n) hint" / "# (n) hint" comments. parseBlanks() reads
 *    the hint into the blank's own metadata for the editor's tooltip and
 *    does not re-emit it into reconstructed text -- kunci_jawaban keeps it
 *    as a grading reference. Stripped from kunci_jawaban's side only,
 *    since the reconstruction never had it to strip.
 */
function normalizeForComparison(text: string, { stripHints }: { stripHints: boolean }): string {
  let out = text.replace(/\r\n/g, "\n");
  out = out.replace(
    /\n \* (?:KUNCI JAWABAN\. Seluruh|Isi setiap) bagian rumpang[\s\S]*?\*\//,
    " */",
  );
  out = out.replace(/\n \* (?:ANSWER KEY\. Every|Fill in every) blank[\s\S]*?\*\//, " */");
  if (stripHints) {
    out = out.replace(/[ \t]*(?:\/\/|#)\s*\(\d+\)[^\n]*/g, "");
  }
  return out;
}

const irisAsoAvailable = (() => {
  try {
    readFileSync(path.join(IRIS_ASO, "kunci_jawaban", "id", "modul4", "grup1", "hunter.ino"));
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!irisAsoAvailable)(
  "reconstruction matches the real answer key, once header/hint-comment differences are normalized away",
  () => {
    for (const nomorKelompok of [1, 3, 5]) {
      for (const bahasa of ["id", "en"] as const) {
        for (const role of ["hunter", "beacon"] as const) {
          it(`Module 4 ${role}.ino, group ${nomorKelompok}, ${bahasa}`, () => {
            const got = reconstruct(`modul4_${role}`, bahasa, ".ino", 4, nomorKelompok);
            const want = readFileSync(
              path.join(
                IRIS_ASO,
                "kunci_jawaban",
                bahasa,
                "modul4",
                `grup${nomorKelompok}`,
                `${role}.ino`,
              ),
              "utf-8",
            );
            expect(normalizeForComparison(got, { stripHints: false })).toBe(
              normalizeForComparison(want, { stripHints: true }),
            );
          });
        }
      }
    }
  },
);
