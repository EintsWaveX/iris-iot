import { describe, expect, it } from "vitest";
import { umpanDi } from "../praktikum-riwayat";

/**
 * Praktikummu rows (Phase 21, f13): one action per row, and Beri Umpan Balik
 * only on the newest practicum, while it still waits for feedback.
 */

const row = (sesiId: number, tanggal: string, status = "selesai", sudahUmpanBalik = false) => ({
  sesiId,
  tanggal,
  status,
  sudahUmpanBalik,
});

describe("umpanDi", () => {
  it("names the newest finished practicum without feedback", () => {
    expect(umpanDi([row(1, "2026-10-04"), row(2, "2026-10-11"), row(3, "2026-10-18")])).toBe(3);
  });

  it("names none when the newest already has feedback", () => {
    expect(umpanDi([row(1, "2026-10-04"), row(2, "2026-10-18", "selesai", true)])).toBeNull();
  });

  it("names none while the newest is still running, even if an older one lacks feedback", () => {
    expect(umpanDi([row(1, "2026-10-11"), row(2, "2026-10-18", "berjalan")])).toBeNull();
  });

  it("names none for an empty list", () => {
    expect(umpanDi([])).toBeNull();
  });

  it("finds the newest in an unsorted list", () => {
    expect(umpanDi([row(5, "2026-10-18"), row(4, "2026-10-04"), row(6, "2026-10-11")])).toBe(5);
  });
});
