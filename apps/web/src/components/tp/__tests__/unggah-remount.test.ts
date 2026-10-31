// @vitest-environment jsdom
/**
 * The module page flips its mode (browse, now, done) when a Praktikan's
 * session starts or ends. The picked TP pages must survive that.
 */
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Fade from "../../ui/Fade";
import UnggahTp from "../UnggahTp";
import { kunciPanel } from "../../../lib/kunci-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sebelumnya = (step: string, mode: string) => `${step}-${mode}`;

async function jalankan(kunci: (step: string, mode: string) => string) {
  const kotak = document.createElement("div");
  document.body.append(kotak);
  const root = createRoot(kotak);
  const gambar = (mode: string) =>
    root.render(
      h(
        Fade,
        { k: kunci("tp", mode), children: null },
        h(UnggahTp, { lang: "id", modul: 3, adaBerkas: false, onSelesai: () => {} }),
      ),
    );
  await act(async () => gambar("browse"));
  // A Praktikan picks a photo.
  const input = kotak.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
  const berkas = new File([new Uint8Array(64)], "tp-1.jpg", { type: "image/jpeg" });
  Object.defineProperty(input, "files", { value: [berkas], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const dipilih = () => kotak.querySelectorAll(".tpup__item").length;
  const awal = dipilih();
  // Their session starts, then ends.
  await act(async () => gambar("now"));
  const saatMulai = dipilih();
  await act(async () => gambar("done"));
  const saatSelesai = dipilih();
  await act(async () => root.unmount());
  kotak.remove();
  return { awal, saatMulai, saatSelesai };
}

describe("TP upload across mode flips", () => {
  afterEach(() => vi.restoreAllMocks());
  // createObjectURL does not exist in jsdom
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => {};
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  it("old key: the picked page is lost when the mode flips (the bug)", async () => {
    const r = await jalankan(sebelumnya);
    expect(r.awal).toBe(1);
    expect(r.saatMulai).toBe(0);
  });

  it("new key: the picked page stays through both flips", async () => {
    const r = await jalankan(kunciPanel);
    expect(r).toEqual({ awal: 1, saatMulai: 1, saatSelesai: 1 });
  });

  it("closing the window keeps pages already picked, and hides an empty uploader", async () => {
    const kotak = document.createElement("div");
    document.body.append(kotak);
    const root = createRoot(kotak);
    const gambar = (tutup: boolean) =>
      root.render(
        h(
          Fade,
          { k: "tp", children: null },
          h(UnggahTp, { lang: "id", modul: 3, adaBerkas: false, tutup, onSelesai: () => {} }),
        ),
      );
    // Closed with nothing picked: nothing to show.
    await act(async () => gambar(true));
    expect(kotak.querySelector(".tpup")).toBeNull();
    // Open: pick a page.
    await act(async () => gambar(false));
    const input = kotak.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
    const berkas = new File([new Uint8Array(64)], "tp-1.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [berkas], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(kotak.querySelectorAll(".tpup__item").length).toBe(1);
    // The deadline passes: the page stays.
    await act(async () => gambar(true));
    expect(kotak.querySelectorAll(".tpup__item").length).toBe(1);
    await act(async () => root.unmount());
    kotak.remove();
  });

  it("other steps still rebuild on a mode flip", () => {
    expect(kunciPanel("brief", "browse")).not.toBe(kunciPanel("brief", "now"));
    expect(kunciPanel("tp", "browse")).toBe(kunciPanel("tp", "done"));
  });
});
