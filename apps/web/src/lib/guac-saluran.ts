/**
 * Konsol's screen under KDE on Wayland (2026-10-15): the PC Server has no X
 * server for x11vnc, so its bridge starts a KRDP of the console's own and
 * reads it through guacd. guacd's Guacamole protocol rides the relay's
 * binary frames the way noVNC's RFB does. The bridge does guacd's handshake
 * on the PC Server, so the RDP login never reaches the browser and this
 * tunnel opens straight into a running connection.
 */
import type * as Guac from "guacamole-common-js";

export type GuacLib = typeof Guac;

/** One instruction: each element as LENGTH.VALUE, lengths in characters as guacd counts them. */
export function guacPesan(elements: readonly unknown[]): string {
  return (
    elements
      .map((e) => {
        const s = String(e);
        return `${[...s].length}.${s}`;
      })
      .join(",") + ";"
  );
}

export interface SaluranGuac {
  tunnel: Guac.Tunnel;
  /** Bytes from the relay; an instruction may be split across frames. */
  terima: (d: ArrayBuffer) => void;
  /** Nothing more goes out: called before the client's own disconnect, so
   *  its "disconnect" never reaches the connection that replaced it. */
  tutup: () => void;
}

type TunnelHidup = Guac.Tunnel & { setState: (s: number) => void };

export function buatSaluranGuac(G: GuacLib, kirim: (d: Uint8Array) => void): SaluranGuac {
  const tunnel = new (G.Tunnel as unknown as new () => TunnelHidup)();
  const parser = new G.Parser();
  const dekoder = new TextDecoder("utf-8");
  const enkoder = new TextEncoder();
  let tutup = false;

  parser.oninstruction = (opcode, args) => tunnel.oninstruction?.(opcode, args);
  tunnel.connect = () => tunnel.setState(G.Tunnel.State.OPEN);
  tunnel.disconnect = () => {
    tutup = true;
    tunnel.setState(G.Tunnel.State.CLOSED);
  };
  tunnel.sendMessage = (...elements: unknown[]) => {
    if (!tutup) kirim(enkoder.encode(guacPesan(elements)));
  };

  return {
    tunnel,
    terima(d) {
      if (tutup) return;
      try {
        parser.receive(dekoder.decode(d, { stream: true }));
      } catch {
        // Not the Guacamole protocol (a stale frame): this connection is over
        tutup = true;
        tunnel.setState(G.Tunnel.State.CLOSED);
      }
    },
    tutup() {
      tutup = true;
    },
  };
}
