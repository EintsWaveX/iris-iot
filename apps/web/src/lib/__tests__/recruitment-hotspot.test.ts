import { describe, expect, it } from "vitest";
import {
  CAP_BAWAAN,
  canMoveBoard,
  neededHotspots,
  planHotspots,
  seatHotspotId,
  toView,
  validHotspot,
  wifiBoards,
  type SeatLoan,
} from "../recruitment/hotspot";
import type { RoomHotspot } from "../recruitment/room-types";

/**
 * Phone hotspots in the room (EXAM-ENGINE 9.6a): which boards need Wi-Fi,
 * where each one goes, how many pengawas phones the room still needs, and
 * what the console may show of a hotspot (never the password).
 */

const loan = (
  seatId: number,
  chips: ("esp32" | "esp32s3")[],
  protocol: SeatLoan["protocol"] = null,
): SeatLoan => ({
  seatId,
  boards: chips.map((chip, i) => ({ n: (i + 1) as 1 | 2, chip })),
  protocol,
});
const pHp = (id: string, owner: string, cap = CAP_BAWAAN): RoomHotspot => ({
  id,
  owner,
  ssid: `HP-${owner}`,
  pass: "sealed",
  cap,
});
const kHp = (seat: number, by: "cand" | "master" = "cand"): RoomHotspot => ({
  id: seatHotspotId(seat),
  owner: { seat },
  ssid: `HP-kursi-${seat}`,
  pass: "sealed",
  cap: 0,
  by,
});
const at = (plan: ReturnType<typeof planHotspots>, seatId: number, n: number) =>
  plan.assignments.find((a) => a.seatId === seatId && a.n === n)?.hotspot;

describe("boards that need Wi-Fi", () => {
  it("counts every lent board until the protocols are dealt", () => {
    expect(wifiBoards(loan(1, ["esp32", "esp32s3"]))).toBe(2);
  });
  it("drops the boards of a seat dealt BLE", () => {
    expect(wifiBoards(loan(1, ["esp32", "esp32s3"], "ble"))).toBe(0);
    expect(wifiBoards(loan(1, ["esp32"], "mqtt"))).toBe(1);
    expect(wifiBoards(loan(1, ["esp32"], "httpws"))).toBe(1);
  });
});

describe("how many pengawas phones", () => {
  it("is one per 8 Wi-Fi boards, rounded up", () => {
    expect(neededHotspots(0)).toBe(0);
    expect(neededHotspots(1)).toBe(1);
    expect(neededHotspots(8)).toBe(1);
    expect(neededHotspots(9)).toBe(2);
    expect(neededHotspots(35)).toBe(5);
    expect(neededHotspots(70)).toBe(9);
  });
});

describe("placing the boards", () => {
  it("keeps a seat's two boards on one phone while it fits", () => {
    const plan = planHotspots(
      [pHp("a", "NUE"), pHp("b", "GMW")],
      [loan(1, ["esp32", "esp32"]), loan(2, ["esp32", "esp32"])],
    );
    expect(at(plan, 1, 1)).toBe(at(plan, 1, 2));
    expect(at(plan, 2, 1)).toBe(at(plan, 2, 2));
  });

  it("puts a board on the phone with the most free places, ties to the first", () => {
    const plan = planHotspots(
      [pHp("a", "NUE", 2), pHp("b", "GMW", 4), pHp("c", "OCU", 4)],
      [loan(1, ["esp32"]), loan(2, ["esp32"]), loan(3, ["esp32"])],
    );
    expect(at(plan, 1, 1)).toBe("b");
    expect(at(plan, 2, 1)).toBe("c");
    expect(at(plan, 3, 1)).toBe("b");
  });

  it("splits a seat's boards only when no phone has room for both", () => {
    const plan = planHotspots(
      [pHp("a", "NUE", 1), pHp("b", "GMW", 1)],
      [loan(1, ["esp32", "esp32s3"])],
    );
    expect(at(plan, 1, 1)).toBe("a");
    expect(at(plan, 1, 2)).toBe("b");
  });

  it("leaves a board without a phone when every phone is full", () => {
    const plan = planHotspots([pHp("a", "NUE", 1)], [loan(1, ["esp32"]), loan(2, ["esp32"])]);
    expect(plan.unplaced).toBe(1);
    expect(at(plan, 2, 1)).toBeNull();
  });

  it("gives a BLE seat no phone at all", () => {
    const plan = planHotspots([pHp("a", "NUE")], [loan(1, ["esp32"], "ble")]);
    expect(plan.assignments).toEqual([]);
    expect(plan.wifi).toBe(0);
  });

  it("is the same on every call, whatever order the seats come in", () => {
    const hs = [pHp("a", "NUE", 3), pHp("b", "GMW", 3)];
    const seats = [loan(3, ["esp32"]), loan(1, ["esp32", "esp32"]), loan(2, ["esp32s3"])];
    const one = planHotspots(hs, seats);
    const two = planHotspots(hs, [...seats].reverse());
    expect(two.assignments).toEqual(one.assignments);
  });
});

describe("a candidate's own phone", () => {
  it("takes that seat's boards first and its cap is the seat's Wi-Fi boards", () => {
    const plan = planHotspots(
      [pHp("a", "NUE"), kHp(1)],
      [loan(1, ["esp32", "esp32s3"]), loan(2, ["esp32"])],
    );
    expect(at(plan, 1, 1)).toBe(seatHotspotId(1));
    expect(at(plan, 1, 2)).toBe(seatHotspotId(1));
    expect(at(plan, 2, 1)).toBe("a");
    expect(plan.groups[seatHotspotId(1)]).toEqual({ cap: 2, used: 2 });
  });

  it("counts against the pengawas phones only what is left over", () => {
    const hs = [pHp("a", "NUE"), kHp(1)];
    const seats = [loan(1, ["esp32", "esp32"]), loan(2, ["esp32"]), loan(3, ["esp32"])];
    const plan = planHotspots(hs, seats);
    expect(plan.wifi).toBe(4);
    expect(plan.onPhones).toBe(2);
    expect(plan.rest).toBe(2);
    expect(plan.need).toBe(1);
    expect(plan.have).toBe(1);
    expect(plan.short).toBe(false);
  });

  it("says Butuh N, ada M when the pengawas phones fall short", () => {
    const seats = Array.from({ length: 20 }, (_, i) => loan(i + 1, ["esp32"]));
    const plan = planHotspots([pHp("a", "NUE")], seats);
    expect(plan.need).toBe(3);
    expect(plan.have).toBe(1);
    expect(plan.short).toBe(true);
  });

  it("has cap 0 when the seat is dealt BLE, and sends nothing there", () => {
    const plan = planHotspots([kHp(1)], [loan(1, ["esp32"], "ble")]);
    expect(plan.groups[seatHotspotId(1)]).toEqual({ cap: 0, used: 0 });
  });

  it("falls back to a pengawas phone for a seat with none", () => {
    const plan = planHotspots([pHp("a", "NUE")], [loan(5, ["esp32"])]);
    expect(at(plan, 5, 1)).toBe("a");
  });
});

describe("the Master moving a board", () => {
  const hs = [pHp("a", "NUE", 2), pHp("b", "GMW", 2)];
  const seats = [loan(1, ["esp32", "esp32"]), loan(2, ["esp32"])];

  it("is honoured over the automatic place", () => {
    const plan = planHotspots(hs, seats, { "1:2": "b" });
    expect(at(plan, 1, 1)).toBe("a");
    expect(at(plan, 1, 2)).toBe("b");
  });

  it("refuses a full phone and a board that needs no Wi-Fi", () => {
    const plan = planHotspots(hs, seats);
    expect(canMoveBoard(plan, hs, seats, 2, 1, "a")).toEqual({ ok: false, kode: "penuh" });
    expect(canMoveBoard(plan, hs, [loan(2, ["esp32"], "ble")], 2, 1, "a")).toEqual({
      ok: false,
      kode: "tanpa_wifi",
    });
    expect(canMoveBoard(plan, hs, seats, 2, 1, "zzz")).toEqual({ ok: false, kode: "tidak_ada" });
  });

  it("allows a phone with a free place, and the board's own phone", () => {
    const plan = planHotspots(
      [pHp("a", "NUE", 2), pHp("b", "GMW", 2)],
      [loan(1, ["esp32"]), loan(2, ["esp32"])],
    );
    expect(canMoveBoard(plan, hs, seats, 1, 1, "b")).toEqual({ ok: true });
    expect(canMoveBoard(plan, hs, seats, 1, 1, at(plan, 1, 1)!)).toEqual({ ok: true });
  });
});

describe("a hotspot as typed", () => {
  it("needs an SSID of 1 to 32 bytes and a WPA2 password of 8 to 63", () => {
    expect(validHotspot("Pixel 7", "kata-sandi")).toEqual([]);
    expect(validHotspot("", "kata-sandi")).toEqual([{ field: "ssid", kode: "ssid_salah" }]);
    expect(validHotspot("x".repeat(33), "kata-sandi")).toEqual([
      { field: "ssid", kode: "ssid_salah" },
    ]);
    expect(validHotspot("Pixel", "pendek")).toEqual([{ field: "pass", kode: "sandi_salah" }]);
    expect(validHotspot("Pixel", "x".repeat(64))).toEqual([{ field: "pass", kode: "sandi_salah" }]);
  });
  it("counts bytes, not characters", () => {
    expect(validHotspot("é".repeat(17), "kata-sandi")).toEqual([
      { field: "ssid", kode: "ssid_salah" },
    ]);
  });
  it("lets a stored password stay when none is sent", () => {
    expect(validHotspot("Pixel", undefined)).toEqual([]);
  });
  it("refuses control characters", () => {
    expect(validHotspot("PC\nxel", "kata-sandi")).toEqual([{ field: "ssid", kode: "ssid_salah" }]);
    expect(validHotspot("Pixel", "kata\nsandi")).toEqual([{ field: "pass", kode: "sandi_salah" }]);
  });
});

describe("what leaves the server", () => {
  it("never carries the password, only that one is set", () => {
    const v = toView(pHp("a", "NUE"));
    expect(v).not.toHaveProperty("pass");
    expect(v.hasPass).toBe(true);
    expect(JSON.stringify(v)).not.toContain("sealed");
  });
  it("says a hotspot without a password has none", () => {
    expect(toView({ ...pHp("a", "NUE"), pass: "" }).hasPass).toBe(false);
  });
});
