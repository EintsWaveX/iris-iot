/**
 * The LMS menu's history lines (lms-log.ts): classes counted once, and a
 * failure told by each class's last try.
 */
import { describe, expect, it } from "vitest";
import { gabungLog, type BarisAudit } from "../lms-log";

const KELAS = ["ADD", "REG-01", "REG-01-INT", "REG-02"];
const kode = new Map([["101022300172", "NUE"]]);

/** One audit row, `menit` minutes after 20:30 WIB. */
const baris = (
  menit: number,
  detail: Record<string, unknown>,
  aksi = "lms_materi",
): BarisAudit => ({
  pada: new Date(Date.UTC(2026, 9, 14, 13, 30 + menit)),
  nim: "101022300172",
  aksi,
  detail: JSON.stringify(detail),
});

/** Newest first, as the audit query returns them. */
const terbaru = (r: BarisAudit[]) => [...r].sort((a, b) => b.pada.getTime() - a.pada.getTime());

describe("the LMS history", () => {
  it("counts each class once over several passes (seen live: 33 for 11)", () => {
    const rows: BarisAudit[] = [];
    for (let pass = 0; pass < 3; pass++)
      KELAS.forEach((k, i) =>
        rows.push(
          baris(pass * 2 + i * 0.1, {
            langkah: "pasang",
            modul: 1,
            kursus: k,
            gagal: "lms_bagian_ditolak",
          }),
        ),
      );
    const [l] = gabungLog(terbaru(rows), kode, 10);
    expect(l).toMatchObject({ oleh: "NUE", aksi: "lms_materi", modul: 1, kelas: 4, gagal: 4 });
  });

  it("takes a class's last try: a retry that worked is no longer a failure", () => {
    const rows = [
      ...KELAS.map((k, i) =>
        baris(i * 0.1, { langkah: "pasang", modul: 1, kursus: k, gagal: "lms_bagian_ditolak" }),
      ),
      ...KELAS.slice(0, 3).map((k, i) =>
        baris(3 + i * 0.1, { langkah: "pasang", modul: 1, kursus: k }),
      ),
    ];
    const [l] = gabungLog(terbaru(rows), kode, 10);
    expect(l.kelas).toBe(4);
    expect(l.gagal).toBe(1);
  });

  it("counts rows that name no class, and splits on a gap or another action", () => {
    const rows = [
      baris(0, { langkah: "tulis", judul: "TP Modul 1 sudah dibuka" }, "lms_umum"),
      baris(1, { langkah: "tulis", judul: "TP Modul 1 sudah dibuka", gagal: "x" }, "lms_umum"),
      baris(40, { langkah: "pasang", modul: 1, kursus: "ADD" }),
    ];
    const l = gabungLog(terbaru(rows), kode, 10);
    expect(l.map((x) => [x.aksi, x.kelas, x.gagal])).toEqual([
      ["lms_materi", 1, 0],
      ["lms_umum", 2, 1],
    ]);
  });
});
