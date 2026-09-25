// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { buildSeelabsSnippet, buildSeelabsBookmarklet } from "../seelabs-helper";

const SAMPLE = [
  { nim: "101022400113", nama: "Giovani Yulianto", skor: { TP: 85, TA: 90, D1: 80 } },
  { nim: "101022400181", nama: "Nada Aisha Suryanto", skor: { L1: 75, L2: 88 } },
];

function tableRow(nomor: number, nimBaris: string, nama: string): string {
  const cells = Array.from({ length: 8 }, () => `<td><input type="number" value="0"></td>`).join(
    "",
  );
  return `<tr><td>${nomor}</td><td>${nimBaris}<br>${nama}</td>${cells}</tr>`;
}

function renderTable(rows: string[]) {
  document.body.innerHTML = `<table><tbody>${rows.join("")}</tbody></table><button>Simpan Penilaian</button>`;
}

describe("buildSeelabsSnippet", () => {
  it("embeds every student's data keyed by NIM", () => {
    const src = buildSeelabsSnippet("Sesi 25/09", SAMPLE);
    expect(src).toContain("101022400113");
    expect(src).toContain("101022400181");
    expect(src).toContain('"TP":85');
  });

  it("is syntactically valid JavaScript", () => {
    const src = buildSeelabsSnippet("Sesi 25/09", SAMPLE);
    // Parsing our own generated source with `new Function`, never an
    // attacker-controlled string -- SAMPLE above is a hardcoded test
    // fixture, not user input.
    expect(() => new Function(src)).not.toThrow();
  });

  it("fills every row and clicks Save when every row's NIM matches the embedded data", () => {
    renderTable([
      tableRow(1, "101022400113", "Giovani Yulianto"),
      tableRow(2, "101022400181", "Nada Aisha Suryanto"),
    ]);
    const button = document.querySelector("button") as HTMLButtonElement;
    const clickSpy = vi.spyOn(button, "click");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const src = buildSeelabsSnippet("Sesi 25/09", SAMPLE);
    // Evaluating our own generated source against a mock DOM is exactly the
    // code path this test verifies -- not user input, no injection concern.
    eval(src);

    const rows = document.querySelectorAll("table tbody tr");
    const firstRowInputs = rows[0].querySelectorAll("input");
    expect(firstRowInputs[0].value).toBe("85"); // TP
    expect(firstRowInputs[1].value).toBe("90"); // TA
    expect(firstRowInputs[2].value).toBe("80"); // D1
    expect(firstRowInputs[3].value).toBe("0"); // D2 -- not in this student's skor, left alone

    const secondRowInputs = rows[1].querySelectorAll("input");
    expect(secondRowInputs[6].value).toBe("75"); // L1
    expect(secondRowInputs[7].value).toBe("88"); // L2

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("fills matched rows but does NOT click Save when any row's NIM is unrecognised, and logs the skip", () => {
    renderTable([
      tableRow(1, "101022400113", "Giovani Yulianto"),
      tableRow(2, "999999999999", "Unknown Student"),
    ]);
    const button = document.querySelector("button") as HTMLButtonElement;
    const clickSpy = vi.spyOn(button, "click");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const src = buildSeelabsSnippet("Sesi 25/09", SAMPLE);
    eval(src);

    const rows = document.querySelectorAll("table tbody tr");
    // The matched row still gets filled -- only the SAVE is withheld.
    expect(rows[0].querySelectorAll("input")[0].value).toBe("85");
    // The unmatched row must be untouched.
    expect(rows[1].querySelectorAll("input")[0].value).toBe("0");

    expect(clickSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    const loggedText = errorSpy.mock.calls.flat().join(" ");
    expect(loggedText).toContain("999999999999");
  });

  it("does not click Save when the table has no rows at all", () => {
    renderTable([]);
    const button = document.querySelector("button") as HTMLButtonElement;
    const clickSpy = vi.spyOn(button, "click");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const src = buildSeelabsSnippet("Sesi 25/09", SAMPLE);
    eval(src);

    expect(clickSpy).not.toHaveBeenCalled();
  });
});

describe("buildSeelabsBookmarklet", () => {
  it("is a javascript: URL wrapping the same snippet", () => {
    const url = buildSeelabsBookmarklet("Sesi 25/09", SAMPLE);
    expect(url.startsWith("javascript:")).toBe(true);
    expect(decodeURIComponent(url.slice("javascript:".length))).toContain("101022400113");
  });
});
