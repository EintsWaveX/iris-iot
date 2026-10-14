/**
 * TP uploaded in IRIS (2026-10-14): the newer of the LMS submission and the
 * upload here counts, the page's PDF is checked before it is kept, and the
 * server PC's folders read as the lab names things.
 */
import { describe, expect, it } from "vitest";
import { lmsMenang } from "../tp";
import { UNGGAH_MAKS, namaUnggah, pdfUnggah } from "../tp-unggah";
import {
  folderSemester,
  folderSesi,
  jalanCermin,
  namaAman,
  namaBerkasCermin,
} from "../../../src/lib/tp-cermin";

const jam = (iso: string) => new Date(iso);

describe("the newer file wins", () => {
  const iris = { sumber: "iris" as const, dikirimPada: jam("2026-10-15T10:00:00Z"), berkas: [1] };
  const lms = { sumber: "lms" as const, dikirimPada: jam("2026-10-15T10:00:00Z"), berkas: [1] };

  it("takes any LMS file when IRIS holds nothing", () => {
    expect(lmsMenang(undefined, jam("2026-10-14T00:00:00Z"))).toBe(true);
    expect(lmsMenang({ ...lms, berkas: [] }, jam("2026-10-14T00:00:00Z"))).toBe(true);
  });

  it("keeps an upload in IRIS until the LMS has a later one", () => {
    expect(lmsMenang(iris, jam("2026-10-15T09:59:59Z"))).toBe(false);
    expect(lmsMenang(iris, jam("2026-10-15T10:00:00Z"))).toBe(false);
    expect(lmsMenang(iris, jam("2026-10-15T10:00:01Z"))).toBe(true);
  });

  it("follows the LMS's own file whenever it changes", () => {
    expect(lmsMenang(lms, jam("2026-10-15T10:00:00Z"))).toBe(false);
    expect(lmsMenang(lms, jam("2026-10-15T11:00:00Z"))).toBe(true);
  });
});

describe("the page's PDF", () => {
  const b64 = (s: string | Uint8Array) => Buffer.from(s).toString("base64");

  it("takes a PDF under the limit", () => {
    expect(pdfUnggah(b64("%PDF-1.7 halaman"))?.length).toBe(16);
  });

  it("refuses what is not a PDF, empty, or too large", () => {
    expect(pdfUnggah(b64("<html>not a pdf</html>"))).toBeNull();
    expect(pdfUnggah(b64("%PDF"))).toBeNull();
    expect(pdfUnggah(123)).toBeNull();
    const besar = new Uint8Array(UNGGAH_MAKS + 1);
    besar.set(new TextEncoder().encode("%PDF-"));
    expect(pdfUnggah(b64(besar))).toBeNull();
  });

  it("names the file by module and NIM", () => {
    expect(namaUnggah(2, "1032231301")).toBe("TP_Modul_2_1032231301.pdf");
  });
});

describe("the server PC's folders", () => {
  it("names the semester as an academic year", () => {
    expect(folderSemester("2026-ganjil")).toBe("2026-2027 Ganjil");
    expect(folderSemester("2027-genap")).toBe("2026-2027 Genap");
  });

  it("names the day and session with its start", () => {
    expect(folderSesi("2026-10-22", 1)).toBe("Kamis 22 Oktober 2026 Sesi 1 (06.30)");
    expect(folderSesi("2026-11-02", 4)).toBe("Senin 2 November 2026 Sesi 4 (15.30)");
  });

  it("keeps names safe for any file system", () => {
    expect(namaAman('A/B\\C:D*E?"F<G>H|')).toBe("A B C D E F G H");
    expect(namaAman("..hidden. ")).toBe("hidden");
    expect(namaAman("   ")).toBe("_");
  });

  it("names each file by NIM and name, numbered when there are several", () => {
    expect(namaBerkasCermin("1", "Raka", "scan.PDF", 0, 1)).toBe("1 Raka.pdf");
    expect(namaBerkasCermin("1", "Raka", "p.jpg", 1, 2)).toBe("1 Raka (2).jpg");
    expect(namaBerkasCermin("1", "Raka", "noext", 0, 1)).toBe("1 Raka");
  });

  it("puts a file under module, session and group, or Tanpa Kelompok", () => {
    const dasar = { semester: "2026-ganjil", modul: 1, nim: "1032231301", nama: "Raka Pradipta" };
    expect(
      jalanCermin({
        ...dasar,
        asli: "TP_Modul_1_1032231301.pdf",
        i: 0,
        jumlah: 1,
        tempat: { tanggal: "2026-10-22", slot: 1, nomor: 3 },
      }),
    ).toBe(
      "2026-2027 Ganjil/Modul 1/Kamis 22 Oktober 2026 Sesi 1 (06.30)/Kelompok 03/1032231301 Raka Pradipta.pdf",
    );
    expect(jalanCermin({ ...dasar, asli: "a.pdf", i: 0, jumlah: 1, tempat: null })).toBe(
      "2026-2027 Ganjil/Modul 1/Tanpa Kelompok/1032231301 Raka Pradipta.pdf",
    );
  });
});
