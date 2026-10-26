import { describe, expect, it } from "vitest";
import { pickSeat } from "../recruitment/seat-pick";

const real = { id: 1, roomId: 10, rehearsal: false };
const prac = { id: 2, roomId: 20, rehearsal: true };
const stages = (m: Record<number, string>) => (roomId: number) => m[roomId] as never;

describe("pickSeat", () => {
  it("is null without a seat", () => {
    expect(pickSeat([], stages({}))).toBeNull();
  });
  it("takes the only seat", () => {
    expect(pickSeat([prac], stages({ 20: "setup" }))).toBe(prac);
  });
  it("prefers the seat whose room is open", () => {
    expect(pickSeat([real, prac], stages({ 10: "setup", 20: "parts" }))).toBe(prac);
    expect(pickSeat([real, prac], stages({ 10: "prep", 20: "finished" }))).toBe(real);
  });
  it("prefers the real seat when both rooms are open or neither is", () => {
    expect(pickSeat([prac, real], stages({ 10: "parts", 20: "parts" }))).toBe(real);
    expect(pickSeat([prac, real], stages({ 10: "setup", 20: "setup" }))).toBe(real);
  });
  it("a finished real room still beats a setup practice room", () => {
    expect(pickSeat([real, prac], stages({ 10: "finished", 20: "setup" }))).toBe(real);
  });
});
