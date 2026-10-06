import { describe, expect, it } from "vitest";
import type { Me } from "../app";
import { sebagaiTampil } from "../proyektor";

const asisten: Me = {
  ok: true,
  role: "asisten",
  nim: "1101200009",
  nama: "Tes Satu",
  kode: "TST",
  tier: "admin",
  hak: { jadwal: true } as Me["hak"],
};

describe("sebagaiTampil", () => {
  it("keeps the signed-in person outside Projector mode", () => {
    expect(sebagaiTampil(asisten, null)).toBe(asisten);
    expect(sebagaiTampil(null, 2)).toBeNull();
    expect(sebagaiTampil(undefined, 2)).toBeUndefined();
  });

  it("draws the Asisten as a Praktikan of the projected group, with no Asisten fields", () => {
    const t = sebagaiTampil(asisten, 3);
    expect(t).toEqual({
      ok: true,
      role: "praktikan",
      nim: "1101200009",
      nama: "Tes Satu",
      kelompok: 3,
    });
    expect(t?.hak).toBeUndefined();
    expect(t?.kode).toBeUndefined();
  });
});
