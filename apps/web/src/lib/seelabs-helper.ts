/**
 * The "IRIS · Isi SeeLabs" bookmarklet (Phase 9 Stage 3g, mockup
 * c-seelabs). Installed once by dragging it to the bookmarks bar; it holds
 * no scores itself. Clicked in the Asisten's own signed-in SeeLabs tab:
 *
 * - On a score form (Input Nilai Praktikum) it reads the `IRIS-SEELABS/1`
 *   payload the Asisten copied in IRIS (the clipboard, or a paste box when
 *   the browser blocks clipboard reads). It checks the class and the KLP
 *   against the open form and fills nothing on a mismatch. Otherwise it
 *   picks the Modul, matches rows by NIM, fills each score with input
 *   events (the form's fields are Livewire `wire:model="tp.N"` bindings,
 *   with no `.live`, so nothing is sent until Simpan), outlines the filled
 *   cells and lists any NIM it could not match.
 * - On the Input Nilai group list it copies the KLP and NIM pairs as
 *   `IRIS-KLP/1`, for Preparation › Cocokkan KLP.
 *
 * It never presses Simpan Penilaian, never touches passwords or cookies,
 * stores nothing and sends nothing anywhere. SeeLabs' only CSP is
 * upgrade-insecure-requests, so a javascript: bookmark runs there.
 *
 * The script itself is plain JavaScript in seelabs-bookmarklet.js, read as
 * text, so no build step can add helpers to it (esbuild's keepNames, for
 * one, would call an outer `__name` that SeeLabs doesn't have).
 */
import sumber from "./seelabs-bookmarklet.js?raw";

/** The source with block comments, line comments and indentation taken out. */
function ringkas(js: string): string {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"))
    .join("\n");
}

/** The bookmark's own source, runnable as is (used by the tests). */
export const SUMBER_BOOKMARKLET = ringkas(sumber);

/** The href for the draggable "IRIS · Isi SeeLabs" pill. */
export const HREF_BOOKMARKLET = "javascript:" + encodeURIComponent(SUMBER_BOOKMARKLET);

/** The bookmark's size, shown next to the pill. */
export const UKURAN_BOOKMARKLET_KB = Math.ceil(SUMBER_BOOKMARKLET.length / 1024);
