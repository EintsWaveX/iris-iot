/** The small MQTT 3.1.1 encoder and reader the gateway uses for its monitor connection. */
import { describe, expect, it } from "vitest";
import {
  MqttReader,
  encodeConnect,
  encodePingreq,
  encodePublish,
  encodeSubscribe,
  type MqttPacket,
} from "../recruitment/mqtt-lite";

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const text = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);

describe("encoders", () => {
  it("CONNECT with a user name and password", () => {
    const p = encodeConnect({ clientId: "iris", user: "u", pass: "p", keepAlive: 30 });
    expect(hex(p)).toBe("101600044d51545404c2001e000469726973000175000170");
  });
  it("SUBSCRIBE to one filter at QoS 0", () => {
    expect(hex(encodeSubscribe(1, "rec/#"))).toBe(
      "82" + "0a" + "0001" + "0005" + hex(text("rec/#")) + "00",
    );
  });
  it("PUBLISH at QoS 0, no retain", () => {
    expect(hex(encodePublish("a/b", text("hi")))).toBe(
      "30" + "07" + "0003" + hex(text("a/b")) + hex(text("hi")),
    );
  });
  it("PINGREQ", () => {
    expect(hex(encodePingreq())).toBe("c000");
  });
  it("a long payload uses a multi byte remaining length", () => {
    const p = encodePublish("t", new Uint8Array(300));
    expect(hex(p.slice(0, 3))).toBe("30af02");
    expect(p.length).toBe(1 + 2 + 303);
  });
});

describe("MqttReader", () => {
  const read = (...chunks: Uint8Array[]): MqttPacket[] => {
    const r = new MqttReader();
    return chunks.flatMap((c) => r.feed(c));
  };
  it("reads CONNACK, SUBACK and PINGRESP", () => {
    expect(read(Uint8Array.of(0x20, 2, 0, 0))).toEqual([{ type: "connack", code: 0 }]);
    expect(read(Uint8Array.of(0x90, 3, 0, 1, 0))).toEqual([{ type: "suback", id: 1, codes: [0] }]);
    expect(read(Uint8Array.of(0xd0, 0))).toEqual([{ type: "pingresp" }]);
  });
  it("reads a PUBLISH's topic and payload", () => {
    const out = read(encodePublish("rec/s12/up/suhu", text("29.5")));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "publish", topic: "rec/s12/up/suhu" });
    expect(str((out[0] as { payload: Uint8Array }).payload)).toBe("29.5");
  });
  it("joins a packet that arrives in pieces and splits two that arrive together", () => {
    const a = encodePublish("a", text("1"));
    const b = encodePublish("b", text("22"));
    const both = Uint8Array.of(...a, ...b);
    const out = read(both.slice(0, 3), both.slice(3, 4), both.slice(4));
    expect(out.map((p) => (p as { topic: string }).topic)).toEqual(["a", "b"]);
  });
  it("reads a PUBLISH at QoS 1 with its packet id apart from the payload", () => {
    const body = Uint8Array.of(0, 1, 0x74, 0, 9, 0x78, 0x79);
    const out = read(Uint8Array.of(0x32, body.length, ...body));
    expect(out[0]).toMatchObject({ type: "publish", topic: "t", qos: 1, id: 9 });
    expect(str((out[0] as { payload: Uint8Array }).payload)).toBe("xy");
  });
  it("drops a packet over the size cap instead of buffering it, and goes on", () => {
    const r = new MqttReader(64);
    const out = r.feed(encodePublish("t", new Uint8Array(200)));
    expect(out).toEqual([{ type: "toobig" }]);
    expect(r.feed(encodePingreq())).toEqual([]);
  });
});
