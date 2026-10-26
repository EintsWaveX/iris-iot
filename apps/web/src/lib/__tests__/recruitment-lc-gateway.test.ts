/** The gateway's signed tokens (EXAM-ENGINE 9.6): a board's long-lived one and a page's 60 s ticket. */
import { describe, expect, it } from "vitest";
import {
  elideToken,
  endpointsFor,
  readLcClaim,
  readLcWeb,
  signLcClaim,
  signLcWeb,
} from "../recruitment/lc-gateway";

const SECRET = "x".repeat(40);
const OTHER = "y".repeat(40);
const NOW = 1_800_000_000;

describe("board tokens", () => {
  it("round trips the room and seat", async () => {
    const t = await signLcClaim({ r: 3, s: 12, exp: NOW + 7200 }, SECRET);
    expect(await readLcClaim(t, SECRET, NOW)).toEqual({
      v: 1,
      p: "lc",
      r: 3,
      s: 12,
      exp: NOW + 7200,
    });
  });

  it("is refused after it expires, under another secret, or when changed", async () => {
    const t = await signLcClaim({ r: 3, s: 12, exp: NOW + 10 }, SECRET);
    expect(await readLcClaim(t, SECRET, NOW + 11)).toBeNull();
    expect(await readLcClaim(t, OTHER, NOW)).toBeNull();
    const sig = t.split(".")[1];
    const forged = btoa(JSON.stringify({ v: 1, p: "lc", r: 3, s: 13, exp: NOW + 10 })).replace(
      /=+$/,
      "",
    );
    expect(await readLcClaim(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it("is not a page ticket", async () => {
    const t = await signLcClaim({ r: 3, s: 12, exp: NOW + 10 }, SECRET);
    expect(await readLcWeb(t, SECRET, NOW)).toBeNull();
  });
});

describe("page tickets", () => {
  it("a seat's ticket carries its seat and lasts 60 s", async () => {
    const t = await signLcWeb({ role: "seat", r: 3, s: 12, jti: "n1" }, SECRET, NOW);
    expect(await readLcWeb(t, SECRET, NOW + 59)).toMatchObject({
      role: "seat",
      r: 3,
      s: 12,
      jti: "n1",
    });
    expect(await readLcWeb(t, SECRET, NOW + 61)).toBeNull();
  });

  it("a grader's ticket carries the room but no seat", async () => {
    const t = await signLcWeb({ role: "grader", r: 3, jti: "n2", nim: "101" }, SECRET, NOW);
    const read = await readLcWeb(t, SECRET, NOW);
    expect(read?.role).toBe("grader");
    expect(read?.s).toBeUndefined();
  });

  it("is not a board token", async () => {
    const t = await signLcWeb({ role: "seat", r: 3, s: 12, jti: "n" }, SECRET, NOW);
    expect(await readLcClaim(t, SECRET, NOW)).toBeNull();
  });
});

describe("endpoints", () => {
  it("lists every protocol's address for a board", () => {
    const e = endpointsFor("tok.sig", 12, 1);
    expect(e.ws).toBe("ws://ws.irisiotlab.com:80/rec/w/tok.sig/1");
    expect(e.http).toBe("http://ws.irisiotlab.com:80/rec/h/tok.sig/1");
    expect(e.mqtt).toEqual({
      host: "ws://broker.irisiotlab.com:80/rec/s/tok.sig",
      topicUp: "rec/s12/up/",
      topicDown: "rec/s12/down/",
    });
    expect(e.ble.name).toBe("IRIS-s12-1");
  });

  it("elides the token for the brief", () => {
    expect(elideToken("ws://ws.irisiotlab.com:80/rec/w/tok.sig/1", "tok.sig")).toBe(
      "ws://ws.irisiotlab.com:80/rec/w/…/1",
    );
  });
});
