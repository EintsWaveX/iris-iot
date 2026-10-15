// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import G from "guacamole-common-js";
import { buatSaluranGuac, guacPesan, type GuacLib } from "../guac-saluran";

const Guac = G as unknown as GuacLib;
const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("guacPesan", () => {
  it("writes LENGTH.VALUE elements, lengths in characters", () => {
    expect(guacPesan(["mouse", 10, 20, 1])).toBe("5.mouse,2.10,2.20,1.1;");
    expect(guacPesan(["key", 65307, 1])).toBe("3.key,5.65307,1.1;");
    expect(guacPesan(["name", "日本"])).toBe("4.name,2.日本;");
    expect(guacPesan(["nop"])).toBe("3.nop;");
  });
});

describe("buatSaluranGuac", () => {
  it("opens at once and hands whole instructions on, however the frames split", () => {
    const keluar: string[] = [];
    const s = buatSaluranGuac(Guac, (d) => keluar.push(new TextDecoder().decode(d)));
    const masuk: [string, unknown[]][] = [];
    s.tunnel.oninstruction = (op, args) => masuk.push([op, [...args]]);
    s.tunnel.connect("");
    expect(s.tunnel.state).toBe(Guac.Tunnel.State.OPEN);

    // A multi-byte character cut between two frames
    const satu = new TextEncoder().encode("4.size,1.0,4.1366,3.768;4.name,2.日");
    s.terima(satu.slice(0, satu.length - 1).buffer as ArrayBuffer);
    s.terima(
      new Uint8Array([satu[satu.length - 1]!, ...new TextEncoder().encode("本;")])
        .buffer as ArrayBuffer,
    );
    expect(masuk).toEqual([
      ["size", ["0", "1366", "768"]],
      ["name", ["日本"]],
    ]);

    s.tunnel.sendMessage("sync", 1234);
    expect(keluar).toEqual(["4.sync,4.1234;"]);
  });

  it("sends nothing once closed, so an old client can't end the new connection", () => {
    const keluar: Uint8Array[] = [];
    const s = buatSaluranGuac(Guac, (d) => keluar.push(d));
    s.tunnel.connect("");
    s.tutup();
    s.tunnel.sendMessage("disconnect");
    expect(keluar).toHaveLength(0);
  });

  it("closes on bytes that aren't the Guacamole protocol", () => {
    const s = buatSaluranGuac(Guac, () => {});
    s.tunnel.connect("");
    s.terima(bytes("RFB 003.008\n"));
    expect(s.tunnel.state).toBe(Guac.Tunnel.State.CLOSED);
  });

  it("drives a real Guacamole.Client: it answers sync and counts as connected", () => {
    // jsdom draws nothing: a 2D context whose every method does nothing
    HTMLCanvasElement.prototype.getContext = (() =>
      new Proxy({}, { get: (_t, k) => (k in _t ? _t[k as never] : () => {}) })) as never;
    const keluar: string[] = [];
    const s = buatSaluranGuac(Guac, (d) => keluar.push(new TextDecoder().decode(d)));
    const client = new Guac.Client(s.tunnel);
    client.connect("");
    s.terima(bytes("4.sync,3.100;"));
    expect(keluar).toContain("4.sync,3.100;");
    client.sendKeyEvent(1, 0xffe3);
    expect(keluar).toContain("3.key,5.65507,1.1;");
    s.tutup();
    client.disconnect();
    expect(keluar.filter((k) => k.includes("disconnect"))).toHaveLength(0);
  });
});
