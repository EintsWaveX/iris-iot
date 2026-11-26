// @vitest-environment jsdom
/**
 * The Host's final scene: the podium and everyone's score first, then Next shows each player's TA score
 * (right answers first, speed a small bonus, 0 to 100, worked out by the engine); Back returns to the scores.
 */
import { createElement as h, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LihatHost } from "../../../lib/kuis/engine";
import { K } from "../kuisStrings";
import HostLayar from "../Host";

vi.mock("../fx", () => ({ bunyi: () => {}, rayakan: async () => {} }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let box: HTMLElement | null = null;

const pemain = (i: number, skor: number, ta: number) => ({
  nim: `110322${String(i).padStart(4, "0")}`,
  nama: `Player ${i}`,
  kelompok: null,
  skor,
  peringkat: i,
  naik: 0,
  streak: 0,
  online: true,
  ta,
});

const view = {
  peran: "host",
  fase: "podium",
  waktu: 0,
  akhir: null,
  dijeda: false,
  sisa: null,
  nomor: 5,
  total: 5,
  detik: 20,
  jumlahPemain: 7,
  jumlahOnline: 7,
  terjawab: 0,
  pengaturan: { jumlah: 5, detik: 20, tipe: [] },
  soal: null,
  buka: null,
  pemain: [],
  // points and TA are separate: TA is right answers first, speed a small bonus
  papan: [
    [4800, 100],
    [3001, 73],
    [3000, 64],
    [2500, 50],
    [900, 18],
    [50, 1],
    [0, 0],
  ].map(([s, ta], i) => pemain(i + 1, s, ta)),
  kelompok: [],
} as unknown as LihatHost;

const kirim = vi.fn();

async function mount() {
  window.matchMedia = ((q: string) => ({
    matches: q.includes("reduce"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  await act(async () =>
    root!.render(
      h(HostLayar, {
        v: view,
        k: { kirim, sekarang: () => 0 } as never,
        aku: { nim: "1", nama: "Host", peran: "host", hostNama: "Host" },
        t: K.en,
        m: "reduce",
      }),
    ),
  );
}

const button = (label: string) =>
  [...box!.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement;

afterEach(async () => {
  await act(async () => root?.unmount());
  box?.remove();
  root = box = null;
  kirim.mockClear();
});

describe("Host final scene", () => {
  it("lists everyone's score on the podium screen and offers Next", async () => {
    await mount();
    expect(box!.textContent).toContain("Player 7");
    expect(box!.textContent).toContain("Player 4");
    expect(button("Show TA Scores")).toBeTruthy();
    expect(button("Play Again")).toBeUndefined();
  });

  it("Next shows each player's TA score, Back returns to the scores", async () => {
    await mount();
    await act(async () => button("Show TA Scores").click());
    const rows = [...box!.querySelectorAll(".kz__ta-daftar li")];
    expect(rows).toHaveLength(7);
    const nilai = rows.map((r) => r.querySelector(".kz__ta-nilai")!.textContent);
    // each row shows its own TA score, not one worked out from its points
    expect(nilai).toEqual(["100", "73", "64", "50", "18", "1", "0"]);
    expect(button("Play Again")).toBeTruthy();
    await act(async () => button("Back to Scores").click());
    expect(box!.querySelector(".kz__ta-daftar")).toBeNull();
    expect(button("Show TA Scores")).toBeTruthy();
  });
});
