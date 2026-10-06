// The checker accepts a published version's other spellings (Kode Jurnal
// "juga"). The rig e2e checked it with a student after the session; since
// 2026-10-06 history is read only, so it lives here.
import { describe, expect, it } from "vitest";
import { cekCelah, kodeBawaan } from "../_lib/kode-aktif";

describe("Kode Jurnal other spellings", () => {
  it("accepts a spelling listed in juga, and only then", () => {
    const k = kodeBawaan(2);
    const slug = "modul2_websocket_server";
    const c = k.berkas.get(slug)!.urut[0];
    expect(cekCelah(k, slug, 1, "int(8765)", 1, "id")).toMatchObject({ benar: false });
    c.juga = [...(c.juga ?? []), "int(8765)"];
    expect(cekCelah(k, slug, 1, "int(8765)", 1, "id")).toMatchObject({ benar: true });
  });
});
