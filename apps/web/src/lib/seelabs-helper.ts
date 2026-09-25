/**
 * Stage 12 — generates a small, self-contained JS snippet an assistant runs
 * on Seelabs' own "Input Nilai Praktikum" page (athena.ptrkr.moe) to fill in
 * that session's scores without retyping them by hand. This file only ever
 * BUILDS the source text; it never runs on our own site and never fetches
 * anything from Seelabs -- the assistant pastes or bookmarklets it into
 * Seelabs' own already-authenticated tab, using Seelabs' own session.
 * Nothing here reads from or writes to Seelabs directly.
 *
 * Why fields are targeted by table position, not by name/id: the real form
 * (checked live against athena.ptrkr.moe/asisten/input/nilai/praktikum this
 * stage) renders every score cell as a bare `<input type="number">` with NO
 * name or id attribute at all -- it's a JS-framework-bound table, not a
 * plain HTML form. Positional (row, column) targeting plus dispatching real
 * `input`/`change` events is the only addressable approach, and happens to
 * be robust to whatever framework is on the other end.
 *
 * Why NIM is verified per row instead of trusting row order: our own
 * roster order and Seelabs' own roster order for the same group are not
 * guaranteed to agree. Filling row 3 with student 3's data because "it's
 * the third row" would silently grade the wrong student if the two systems
 * ever disagree. Matching by the NIM printed in each row is the only safe
 * approach.
 *
 * Save behavior (scope confirmed with the user this stage, inverted from
 * this stage's first draft): the snippet clicks Seelabs' own "Simpan
 * Penilaian" button itself, but ONLY when every row in the table was
 * successfully matched against the embedded score data -- zero skipped
 * rows. If even one row is unmatched (an unrecognised or missing NIM, or a
 * column-count mismatch), it does NOT click Save: it logs a clear console
 * error naming every skipped row and stops, so a partial or misaligned
 * write of official grades can never happen silently. This is why the
 * fill pass always runs to completion over every row before any decision
 * to save is made, rather than saving incrementally as it goes.
 */
import { NILAI_KOMPONEN } from "./nilai-komponen.js";

export interface SeelabsSkor {
  nim: string;
  nama: string;
  skor: Partial<Record<(typeof NILAI_KOMPONEN)[number], number>>;
}

/** Builds the runnable snippet body (an IIFE). Clicks Seelabs' Save button
 *  only when every row matched -- see `seelabs-helper.test.ts`, which runs
 *  this exact output against a mock DOM for both the all-matched and the
 *  has-a-mismatch case and asserts Save is clicked in exactly the first. */
export function buildSeelabsSnippet(sesiLabel: string, skorList: SeelabsSkor[]): string {
  const data: Record<string, Partial<Record<string, number>>> = {};
  for (const s of skorList) data[s.nim] = s.skor;

  return `(function () {
  // IRIS -- helper Seelabs untuk ${JSON.stringify(sesiLabel)}. Mengisi
  // setiap baris, lalu menekan Simpan Penilaian HANYA bila semua baris
  // cocok dengan data sesi ini -- bila ada satu saja yang dilewati, tombol
  // Simpan tidak ditekan, dan daftar baris yang dilewati dicetak di bawah.
  var KOMPONEN = ${JSON.stringify(NILAI_KOMPONEN)};
  var DATA = ${JSON.stringify(data)};
  var NIM_POLA = /\\d{6,15}/;

  var baris = document.querySelectorAll("table tbody tr");
  var terisi = 0;
  var dilewatiDetail = [];

  baris.forEach(function (tr) {
    // Matched per CELL, not against the whole row's concatenated text --
    // the "No" column's own digit sits directly against the NIM cell's
    // digits with no separator once textContent joins every cell together
    // (e.g. row "1" + NIM "101022400113" reads as "1101022400113"), which
    // silently matched the wrong, longer digit run. Each cell's own text is
    // checked in isolation instead, so the single-digit "No" cell can never
    // bleed into the NIM cell's match.
    var sel = tr.querySelectorAll("td, th");
    var nim = null;
    for (var c = 0; c < sel.length; c++) {
      var cocok = (sel[c].textContent || "").match(NIM_POLA);
      if (cocok) {
        nim = cocok[0];
        break;
      }
    }
    var skor = nim ? DATA[nim] : null;
    var ringkasBaris = (tr.textContent || "").trim().slice(0, 60);

    if (!nim || !skor) {
      dilewatiDetail.push("NIM tidak ditemukan di data sesi ini -- " + ringkasBaris);
      return;
    }

    var input = tr.querySelectorAll("input");
    if (input.length < KOMPONEN.length) {
      dilewatiDetail.push("jumlah kolom tidak sesuai untuk NIM " + nim);
      return;
    }

    for (var i = 0; i < KOMPONEN.length; i++) {
      var nilaiKomponen = skor[KOMPONEN[i]];
      if (nilaiKomponen == null) continue;
      var field = input[i];
      field.value = String(nilaiKomponen);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    terisi++;
    console.log("[IRIS] Terisi:", nim);
  });

  if (dilewatiDetail.length > 0 || terisi === 0) {
    console.error(
      "[IRIS] TIDAK disimpan -- " + dilewatiDetail.length + " baris dilewati (atau tidak ada baris terisi). " +
      "Periksa dan perbaiki dulu sebelum menjalankan ulang:"
    );
    dilewatiDetail.forEach(function (d) { console.error("  - " + d); });
    return;
  }

  var tombolSimpan = null;
  document.querySelectorAll("button").forEach(function (b) {
    if (!tombolSimpan && /simpan/i.test(b.textContent || "")) tombolSimpan = b;
  });
  if (!tombolSimpan) {
    console.error("[IRIS] Semua " + terisi + " baris terisi, tapi tombol Simpan Penilaian tidak ditemukan -- tekan sendiri.");
    return;
  }
  tombolSimpan.click();
  console.log("[IRIS] Semua " + terisi + " baris cocok dan terisi. Simpan Penilaian ditekan.");
})();`;
}

/** A `javascript:` bookmarklet wrapping the same snippet -- the primary
 *  delivery form. The console-paste snippet above is the fallback for when
 *  Seelabs' CSP blocks a `javascript:` href from running. */
export function buildSeelabsBookmarklet(sesiLabel: string, skorList: SeelabsSkor[]): string {
  return "javascript:" + encodeURIComponent(buildSeelabsSnippet(sesiLabel, skorList));
}
