/**
 * iris_seat.h (EXAM-ENGINE 9.3): every compile job carries it, the agent
 * writes it beside the sketch, and every template starts with
 * `#include "iris_seat.h"`. The candidate's code never holds a password or a
 * token, and a changed hotspot needs only a recompile. Pure.
 */
import { BLE_RX, BLE_SERVICE, BLE_TX, GATEWAY_BROKER_HOST, GATEWAY_WS_HOST } from "./lc-gateway.js";

export const HEADER_NAMES = [
  "IRIS_WIFI_SSID",
  "IRIS_WIFI_PASS",
  "IRIS_SEAT",
  "IRIS_BOARD",
  "IRIS_TOKEN",
  "IRIS_WS_HOST",
  "IRIS_WS_PORT",
  "IRIS_WS_PATH",
  "IRIS_HTTP_URL",
  "IRIS_MQTT_URI",
  "IRIS_MQTT_USER",
  "IRIS_MQTT_PASS",
  "IRIS_TOPIC",
  "IRIS_BLE_NAME",
  "IRIS_SERVICE_UUID",
  "IRIS_TX_UUID",
  "IRIS_RX_UUID",
] as const;

export interface HeaderInput {
  /** The board's hotspot; null for a BLE seat, which takes none */
  ssid: string | null;
  pass: string | null;
  seatId: number;
  board: 1 | 2;
  /** The seat's signed gateway token */
  token: string;
  /** The seat's Mosquitto account; null when the seat is not on MQTT */
  mqtt: { user: string; pass: string } | null;
}

/** A C string literal: quotes, backslashes and `?` (so no trigraph) escaped; anything below a space refused. */
function literal(v: string): string {
  if (/[\u0000-\u001f\u007f]/.test(v))
    throw new RangeError("header value holds a control character");
  return `"${v.replace(/[\\"?]/g, (c) => `\\${c}`)}"`;
}

export function buildHeader(i: HeaderInput): string {
  if (i.board !== 1 && i.board !== 2) throw new RangeError("board must be 1 or 2");
  const seat = `s${i.seatId}`;
  const rows: [(typeof HEADER_NAMES)[number], string][] = [
    ["IRIS_WIFI_SSID", literal(i.ssid ?? "")],
    ["IRIS_WIFI_PASS", literal(i.pass ?? "")],
    ["IRIS_SEAT", literal(seat)],
    ["IRIS_BOARD", String(i.board)],
    ["IRIS_TOKEN", literal(i.token)],
    ["IRIS_WS_HOST", literal(GATEWAY_WS_HOST)],
    ["IRIS_WS_PORT", "80"],
    ["IRIS_WS_PATH", literal(`/rec/w/${i.token}/${i.board}`)],
    ["IRIS_HTTP_URL", literal(`http://${GATEWAY_WS_HOST}:80/rec/h/${i.token}/${i.board}`)],
    ["IRIS_MQTT_URI", literal(`ws://${GATEWAY_BROKER_HOST}:80/rec/s/${i.token}`)],
    ["IRIS_MQTT_USER", literal(i.mqtt?.user ?? "")],
    ["IRIS_MQTT_PASS", literal(i.mqtt?.pass ?? "")],
    ["IRIS_TOPIC", literal(`rec/${seat}/`)],
    ["IRIS_BLE_NAME", literal(`IRIS-${seat}-${i.board}`)],
    ["IRIS_SERVICE_UUID", literal(BLE_SERVICE)],
    ["IRIS_TX_UUID", literal(BLE_TX)],
    ["IRIS_RX_UUID", literal(BLE_RX)],
  ];
  return "#pragma once\n" + rows.map(([n, v]) => `#define ${n} ${v}`).join("\n") + "\n";
}
