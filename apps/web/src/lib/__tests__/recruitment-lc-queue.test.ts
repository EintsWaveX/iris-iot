/** The compile queue as a seat sees it (EXAM-ENGINE 9.4, 11.3 item 4). */
import { describe, expect, it } from "vitest";
import { positionOf, queueChips, typicalMs, type QueueJob } from "../recruitment/lc-queue";

const job = (
  id: number,
  seatId: number | null,
  status: QueueJob["status"],
  at: number,
  board: 1 | 2 = 1,
): QueueJob => ({ id, seatId, board, status, requestedAt: at });

describe("typicalMs", () => {
  it("is null before there are three successful jobs", () => {
    expect(typicalMs([])).toBeNull();
    expect(typicalMs([40_000, 41_000])).toBeNull();
  });
  it("is the median of the last 20 (newest first)", () => {
    expect(typicalMs([10, 30, 20])).toBe(20);
    expect(typicalMs([10, 20, 30, 40])).toBe(25);
    const last20 = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    const old = Array.from({ length: 5 }, () => 999_999);
    expect(typicalMs([...last20, ...old])).toBe(1050);
  });
});

describe("positionOf", () => {
  const q = [
    job(1, 5, "diambil", 1),
    job(2, 6, "antre", 2),
    job(3, 7, "antre", 3),
    job(4, 8, "antre", 3),
  ];
  it("counts the waiting jobs ahead, starting at 1", () => {
    expect(positionOf(q, 2)).toBe(1);
    expect(positionOf(q, 3)).toBe(2);
    expect(positionOf(q, 4)).toBe(3);
  });
  it("is 0 for a job being compiled and null for one that is not queued", () => {
    expect(positionOf(q, 1)).toBe(0);
    expect(positionOf(q, 99)).toBeNull();
  });
});

describe("queueChips", () => {
  const numbers = new Map([
    [5, 1],
    [6, 2],
    [7, 3],
  ]);
  it("lists seat numbers in line order and marks the viewer's own", () => {
    const q = [job(2, 6, "antre", 2), job(1, 5, "diambil", 1), job(3, 7, "antre", 3)];
    expect(queueChips(q, numbers, 6)).toEqual([
      { seat: 1, board: 1, state: "diambil", mine: false },
      { seat: 2, board: 1, state: "antre", mine: true },
      { seat: 3, board: 1, state: "antre", mine: false },
    ]);
  });
  it("leaves out finished jobs and warm-up jobs (no seat)", () => {
    const q = [
      job(1, null, "antre", 1),
      job(2, 5, "selesai", 2),
      job(3, 6, "gagal", 3),
      job(4, 7, "antre", 4),
    ];
    expect(queueChips(q, numbers, 5).map((c) => c.seat)).toEqual([3]);
  });
});
