// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { HREF_BOOKMARKLET, SUMBER_BOOKMARKLET } from "../seelabs-helper";
import { buatPayload } from "../seelabs";

/** The SeeLabs score form as read on 2026-10-03: a header "Praktikum |
 *  Kelompok N", a Livewire snapshot with `kel`, the Modul select and one
 *  row per member with `wire:model="tp.N"` inputs. */
function formSeelabs(opsi: { praktikum?: string; kel?: number; nim: string[] }) {
  const praktikum = opsi.praktikum ?? "Pemrograman Perangkat IoT TE";
  const kel = opsi.kel ?? 47;
  const kolom = ["tp", "ta", "d1", "d2", "d3", "d4", "l1", "l2"];
  const baris = opsi.nim
    .map(
      (n, i) =>
        `<tr><td>${i + 1}</td><td><span class="badge">${n}</span><span>NAMA ${i}</span></td>${kolom
          .map((k) => `<td><input type="number" value="0" wire:model="${k}.${i}"></td>`)
          .join("")}</tr>`,
    )
    .join("");
  document.body.innerHTML = `
    <div wire:snapshot='${JSON.stringify({ data: { pid: "237", kel } })}'>
      <h4>Input Nilai Praktikum</h4><p>${praktikum} | Kelompok ${kel}</p>
      <select wire:model="modul"><option value="">--</option>${[1, 2, 3, 4]
        .map((m) => `<option value="${m}">Modul ${m}</option>`)
        .join("")}</select>
      <form><table><tbody>${baris}</tbody></table>
      <button type="submit">Simpan Penilaian</button></form>
    </div>`;
  // jsdom has no layout, so innerText falls back to textContent.
  Object.defineProperty(document.body, "innerText", {
    configurable: true,
    get: () => document.body.textContent,
  });
}

function payload(over: Partial<Parameters<typeof buatPayload>[0]> = {}) {
  return buatPayload({
    kelas: "reguler",
    klp: ["47"],
    modul: 3,
    kelompok: 1,
    bahasa: "id",
    baris: [
      { nim: "101022400015", nama: "A", skor: { TP: 85, TA: 90, D1: 80 } },
      { nim: "101022400276", nama: "B", skor: { L1: 75, L2: 88.5 } },
    ],
    ...over,
  });
}

function clipboard(read: () => Promise<string>, write?: (s: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText: vi.fn(read), writeText: vi.fn(write ?? (() => Promise.resolve())) },
  });
}

const jalan = async () => {
  // Running our own generated source is exactly what is under test.
  new Function(SUMBER_BOOKMARKLET)();
  await new Promise((r) => setTimeout(r, 0));
};
const nilaiDi = (model: string) =>
  (document.querySelector(`input[wire\\:model="${model}"]`) as HTMLInputElement).value;
const panelTeks = () => document.getElementById("iris-isi-seelabs")?.textContent ?? "";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("the IRIS · Isi SeeLabs bookmarklet", () => {
  it("is a javascript: URL that parses", () => {
    expect(HREF_BOOKMARKLET.startsWith("javascript:")).toBe(true);
    expect(() => new Function(decodeURIComponent(HREF_BOOKMARKLET.slice(11)))).not.toThrow();
    // Small enough for any bookmarks bar.
    expect(HREF_BOOKMARKLET.length).toBeLessThan(20_000);
  });

  it("fills rows by NIM whatever SeeLabs' row order, picks the Modul, and never saves", async () => {
    // SeeLabs lists 101022400276 first, the payload lists it second.
    formSeelabs({ nim: ["101022400276", "101022400015"] });
    const simpan = vi.fn((e: Event) => e.preventDefault());
    document.querySelector("form")!.addEventListener("submit", simpan);
    const klik = vi.spyOn(HTMLButtonElement.prototype, "click");
    const masukan: string[] = [];
    document.addEventListener("input", (e) =>
      masukan.push((e.target as HTMLElement).getAttribute("wire:model") ?? ""),
    );
    clipboard(() => Promise.resolve(payload()));

    await jalan();

    expect((document.querySelector("select") as HTMLSelectElement).value).toBe("3");
    expect(nilaiDi("tp.1")).toBe("85");
    expect(nilaiDi("ta.1")).toBe("90");
    expect(nilaiDi("d1.1")).toBe("80");
    expect(nilaiDi("d2.1")).toBe("0"); // no score in IRIS: left alone
    expect(nilaiDi("l1.0")).toBe("75");
    expect(nilaiDi("l2.0")).toBe("88.5");
    expect(nilaiDi("tp.0")).toBe("0");
    // Livewire hears every fill through its input event.
    expect(masukan).toContain("modul");
    expect(masukan).toContain("tp.1");
    expect(simpan).not.toHaveBeenCalled();
    expect(klik).not.toHaveBeenCalled();
    expect(panelTeks()).toContain("2 dari 2 baris cocok lewat NIM. Modul 3 dipilih.");
    expect(panelTeks()).toContain("tekan Simpan Penilaian sendiri");
  });

  it("fills nothing when the form is another KLP", async () => {
    formSeelabs({ kel: 30, nim: ["101022400015"] });
    clipboard(() => Promise.resolve(payload({ klp: ["31"] })));
    await jalan();
    expect(nilaiDi("tp.0")).toBe("0");
    expect((document.querySelector("select") as HTMLSelectElement).value).toBe("");
    expect(panelTeks()).toContain("Form ini KLP 30, isiannya untuk KLP 31. Tidak ada yang diisi.");
  });

  it("fills nothing when the form is the other class", async () => {
    formSeelabs({ praktikum: "Pemrograma Perangkat IoT TE INT", nim: ["101022400015"] });
    clipboard(() => Promise.resolve(payload()));
    await jalan();
    expect(nilaiDi("tp.0")).toBe("0");
    expect(panelTeks()).toContain("Form ini Internasional, isiannya untuk Reguler.");
  });

  it("lists a NIM it cannot match and the payload rows missing from the form", async () => {
    formSeelabs({ nim: ["101022400015", "999999999999"] });
    clipboard(() => Promise.resolve(payload()));
    await jalan();
    expect(nilaiDi("tp.0")).toBe("85");
    expect(panelTeks()).toContain("1 dari 2 baris");
    expect(panelTeks()).toContain("Tidak ada di isian: 999999999999");
    expect(panelTeks()).toContain("Tidak ada di form ini: 101022400276");
  });

  it("speaks the payload's language", async () => {
    formSeelabs({ nim: ["101022400015", "101022400276"] });
    clipboard(() => Promise.resolve(payload({ bahasa: "en" })));
    await jalan();
    expect(panelTeks()).toContain("2 of 2 rows matched by NIM. Modul 3 picked.");
  });

  it("falls back to a paste box when the clipboard is blocked", async () => {
    formSeelabs({ nim: ["101022400015"] });
    clipboard(() => Promise.reject(new Error("denied")));
    await jalan();
    const ta = document.querySelector("#iris-isi-seelabs textarea") as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    ta.value = "something else";
    (document.querySelectorAll("#iris-isi-seelabs button")[0] as HTMLButtonElement).click();
    expect(panelTeks()).toContain("Ini bukan isian dari IRIS.");
    ta.value = payload();
    (document.querySelectorAll("#iris-isi-seelabs button")[0] as HTMLButtonElement).click();
    expect(nilaiDi("tp.0")).toBe("85");
  });

  it("copies the KLP and NIM pairs on the group list", async () => {
    document.body.innerHTML = `
      <select wire:model.live="s_praktikum"><option value="237" selected>Pemrograman Perangkat IoT TE</option></select>
      <table><tbody>
        <tr><td rowspan="2"><span>KLP</span> <span>47</span></td><td><span>101022400015</span> FERRY</td><td><button>Input Nilai</button></td></tr>
        <tr><td><span>101022400090</span> TSABIB</td></tr>
        <tr><td rowspan="1"><span>KLP</span> <span>48</span></td><td><span>101022400248</span> MELSA</td></tr>
      </tbody></table>`;
    let tersalin = "";
    clipboard(
      () => Promise.resolve(""),
      (s) => {
        tersalin = s;
        return Promise.resolve();
      },
    );
    await jalan();
    expect(tersalin.startsWith("IRIS-KLP/1 ")).toBe(true);
    expect(JSON.parse(tersalin.slice(11))).toEqual({
      kelas: "reguler",
      kelompok: [
        { klp: "47", nim: ["101022400015", "101022400090"] },
        { klp: "48", nim: ["101022400248"] },
      ],
    });
  });
});
