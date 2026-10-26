/**
 * The gateway's tokens and addresses (EXAM-ENGINE 9.6). A board carries a
 * long-lived signed token in its URL (`{ v, p: "lc", r, s, exp }`, the room
 * and seat, signed with REC_GATEWAY_SECRET); a page gets a 60 second ticket.
 * The Worker checks both without a lookup. Pure: WebCrypto only.
 */
import { bacaTanda, tandaiJson } from "../tanda.js";

export const GATEWAY_WS_HOST = "ws.irisiotlab.com";
export const GATEWAY_BROKER_HOST = "broker.irisiotlab.com";
export const WEB_TICKET_SEC = 60;

export interface LcClaim {
  v: 1;
  p: "lc";
  r: number;
  s: number;
  exp: number;
}

export interface LcWeb {
  v: 1;
  p: "lcweb";
  role: "seat" | "grader";
  r: number;
  s?: number;
  nim?: string;
  exp: number;
  jti: string;
}

export function signLcClaim(
  c: { r: number; s: number; exp: number },
  secret: string,
): Promise<string> {
  const claim: LcClaim = { v: 1, p: "lc", ...c };
  return tandaiJson(claim, secret);
}

export async function readLcClaim(
  token: string,
  secret: string,
  now: number,
): Promise<LcClaim | null> {
  const r = await bacaTanda(token, secret);
  if (!r.ok || !r.isi || typeof r.isi !== "object") return null;
  const c = r.isi as Partial<LcClaim>;
  if (c.v !== 1 || c.p !== "lc") return null;
  if (!Number.isInteger(c.r) || !Number.isInteger(c.s) || typeof c.exp !== "number") return null;
  if (c.exp < now) return null;
  return c as LcClaim;
}

export function signLcWeb(
  t: { role: "seat" | "grader"; r: number; s?: number; nim?: string; jti: string },
  secret: string,
  now: number,
): Promise<string> {
  const ticket: LcWeb = { v: 1, p: "lcweb", ...t, exp: now + WEB_TICKET_SEC };
  return tandaiJson(ticket, secret);
}

export async function readLcWeb(token: string, secret: string, now: number): Promise<LcWeb | null> {
  const r = await bacaTanda(token, secret);
  if (!r.ok || !r.isi || typeof r.isi !== "object") return null;
  const t = r.isi as Partial<LcWeb>;
  if (t.v !== 1 || t.p !== "lcweb" || (t.role !== "seat" && t.role !== "grader")) return null;
  if (!Number.isInteger(t.r) || typeof t.jti !== "string" || typeof t.exp !== "number") return null;
  if (t.role === "seat" && !Number.isInteger(t.s)) return null;
  if (t.exp < now) return null;
  return t as LcWeb;
}

export interface Endpoints {
  ws: string;
  http: string;
  mqtt: { host: string; topicUp: string; topicDown: string };
  ble: { name: string; service: string; tx: string; rx: string };
}

/** The Nordic UART service the BLE template exposes: notify on TX, write on RX. */
export const BLE_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const BLE_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
export const BLE_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

/** Where a board of this seat connects (EXAM-ENGINE 9.6). */
export function endpointsFor(token: string, seatId: number, board: 1 | 2): Endpoints {
  return {
    ws: `ws://${GATEWAY_WS_HOST}:80/rec/w/${token}/${board}`,
    http: `http://${GATEWAY_WS_HOST}:80/rec/h/${token}/${board}`,
    mqtt: {
      host: `ws://${GATEWAY_BROKER_HOST}:80/rec/s/${token}`,
      topicUp: `rec/s${seatId}/up/`,
      topicDown: `rec/s${seatId}/down/`,
    },
    ble: { name: `IRIS-s${seatId}-${board}`, service: BLE_SERVICE, tx: BLE_TX, rx: BLE_RX },
  };
}

/** The brief shows an address with the token left out. */
export const elideToken = (url: string, token: string): string => url.split(token).join("…");
