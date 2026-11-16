// @vitest-environment jsdom
/**
 * The Host's final scene: the podium and everyone's score first, then Next shows each player's TA score
 * (points over questions x 1000, as a percentage, rounded up, held to 0 to 100); Back returns to the scores.
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

const pemain = (i: number, skor: number) => ({
  nim: `110322${String(i).padStart(4, "0")}`,
  nama: `Player ${i}`,
  kelompok: null,
  skor,
  peringkat: i,
  naik: 0,
  streak: 0,
  online: true,
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
  papan: [4800, 3001, 3000, 2500, 900, 50, 0].map((s, i) => pemain(i + 1, s)),
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
    // 4800/5000 = 96, 3001 -> 61, 3000 -> 60, 2500 -> 50, 900 -> 18, 50 -> 1, 0 -> 0
    expect(nilai).toEqual(["96", "61", "60", "50", "18", "1", "0"]);
    expect(button("Play Again")).toBeTruthy();
    await act(async () => button("Back to Scores").click());
    expect(box!.querySelector(".kz__ta-daftar")).toBeNull();
    expect(button("Show TA Scores")).toBeTruthy();
  });
});
