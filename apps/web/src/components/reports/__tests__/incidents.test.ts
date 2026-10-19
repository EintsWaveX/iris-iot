import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IncidentList } from "../Incidents";
import { R } from "../strings";
import { kejadianAsisten, type Kejadian } from "../../../lib/laporan";
import type { Direktori } from "../../../lib/people";

const dir: Direktori = { byNim: new Map(), nama: (n) => n ?? "" };

function baris(id: number, jenis: string, detail: Record<string, unknown> = {}): Kejadian {
  return { id, sesiId: 1, jenis, detail, aktorNim: "1101200009", pada: "2026-10-19T05:30:00Z" };
}

/** The aria-labels of every button the list draws. */
function tombol(rows: Kejadian[]): string[] {
  const html = renderToStaticMarkup(
    createElement(IncidentList, { rows, t: R.id, lang: "id", dir, onChanged: () => {} }),
  );
  return [...html.matchAll(/<button[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]);
}

describe("incident actions", () => {
  it("only an Asisten note can be edited or deleted", () => {
    expect(kejadianAsisten({ jenis: "catatan" })).toBe(true);
    for (const jenis of ["mulai", "akhiri", "batal", "durasi", "tangan", "pasangan"]) {
      expect(kejadianAsisten({ jenis })).toBe(false);
    }
  });

  it("shows Edit and Delete on notes and nothing on system lines", () => {
    const rows = [
      baris(1, "mulai", { otomatis: true }),
      baris(2, "catatan", { teks: "Kabel USB kelompok 3 longgar" }),
      baris(3, "akhiri"),
    ];
    expect(tombol(rows)).toEqual([R.id.edit, R.id.del]);
    expect(tombol([rows[0], rows[2]])).toEqual([]);
  });
});
