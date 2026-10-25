/**
 * A Web Bluetooth central for a BLE seat (prompt 12, EXAM-ENGINE 9.6): scan for
 * `IRIS-s<seat>-<board>`, connect, listen on the template's TX characteristic
 * (notify) and write to RX. Every event is copied into the room's log over the
 * page's gateway socket, since the gateway never sees a BLE board. Chromium
 * only; elsewhere `supported` is false and the panel says so.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { BLE_RX, BLE_SERVICE, BLE_TX } from "../../../lib/recruitment/lc-gateway";
import { bleText, blePrefix } from "../../../lib/recruitment/lc-ui";
import { holdPicker, releasePicker } from "../exam/lockdown/useLockdown";
import type { GwBle } from "./useLcGateway";

interface GattChar extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<GattChar>;
  writeValueWithoutResponse?(v: BufferSource): Promise<void>;
  writeValue?(v: BufferSource): Promise<void>;
}
interface BleDevice extends EventTarget {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryService(u: string): Promise<{ getCharacteristic(u: string): Promise<GattChar> }>;
    }>;
    disconnect(): void;
  };
}
interface BleApi {
  requestDevice(o: {
    filters: { namePrefix: string }[];
    optionalServices: string[];
  }): Promise<BleDevice>;
}

export const bleSupported = (): boolean =>
  typeof navigator !== "undefined" && "bluetooth" in navigator;

export type BleStatus = "idle" | "connecting" | "on" | "lost" | "error";
export interface BleEvent {
  id: number;
  t: number;
  dir: "up" | "down";
  text: string;
}

const KEEP = 200;

export function useBle(seatId: number, board: 1 | 2, log: (m: GwBle) => void) {
  const [status, setStatus] = useState<BleStatus>("idle");
  const [name, setName] = useState<string | null>(null);
  const [events, setEvents] = useState<BleEvent[]>([]);
  const dev = useRef<BleDevice | null>(null);
  const rx = useRef<GattChar | null>(null);
  const seq = useRef(0);
  const logRef = useRef(log);
  logRef.current = log;

  const push = useCallback(
    (dir: "up" | "down", bytes: Uint8Array) => {
      const { text, b64 } = bleText(bytes);
      setEvents((l) => [...l, { id: ++seq.current, t: Date.now(), dir, text }].slice(-KEEP));
      logRef.current({
        t: "ble",
        b: board,
        dir,
        k: dir === "up" ? `notify ${BLE_TX.slice(0, 8)}` : `write ${BLE_RX.slice(0, 8)}`,
        d: b64,
        b64: true,
      });
    },
    [board],
  );

  const disconnect = useCallback(() => {
    try {
      dev.current?.gatt?.disconnect();
    } catch {
      /* gone */
    }
    dev.current = null;
    rx.current = null;
    setStatus("idle");
  }, []);

  const connect = useCallback(async () => {
    const api = (navigator as unknown as { bluetooth?: BleApi }).bluetooth;
    if (!api) return;
    let d: BleDevice;
    holdPicker();
    try {
      d = await api.requestDevice({
        filters: [{ namePrefix: blePrefix(seatId) }],
        optionalServices: [BLE_SERVICE],
      });
    } catch {
      return; // the chooser was dismissed
    } finally {
      releasePicker();
    }
    setStatus("connecting");
    try {
      const server = await d.gatt!.connect();
      const svc = await server.getPrimaryService(BLE_SERVICE);
      const tx = await svc.getCharacteristic(BLE_TX);
      rx.current = await svc.getCharacteristic(BLE_RX);
      await tx.startNotifications();
      tx.addEventListener("characteristicvaluechanged", () => {
        const v = tx.value;
        if (v) push("up", new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      });
      d.addEventListener("gattserverdisconnected", () => {
        if (dev.current === d) {
          dev.current = null;
          rx.current = null;
          setStatus("lost");
        }
      });
      dev.current = d;
      setName(d.name ?? null);
      setStatus("on");
    } catch {
      setStatus("error");
    }
  }, [push, seatId]);

  const write = useCallback(
    async (text: string): Promise<boolean> => {
      const c = rx.current;
      if (!c) return false;
      const bytes = new TextEncoder().encode(text);
      try {
        if (c.writeValueWithoutResponse) await c.writeValueWithoutResponse(bytes);
        else await c.writeValue?.(bytes);
      } catch {
        return false;
      }
      push("down", bytes);
      return true;
    },
    [push],
  );

  useEffect(() => disconnect, [disconnect]);

  return { status, name, events, connect, disconnect, write, supported: bleSupported() };
}
