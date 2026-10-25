/**
 * Just enough MQTT 3.1.1 for the gateway's monitor connection (EXAM-ENGINE
 * 9.6): CONNECT with a user and password, SUBSCRIBE at QoS 0, PUBLISH at QoS
 * 0, PINGREQ, and a reader for what the broker sends back. Pure bytes.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function str(s: string): Uint8Array {
  const b = enc.encode(s);
  return Uint8Array.of(b.length >> 8, b.length & 0xff, ...b);
}

function remaining(n: number): number[] {
  const out: number[] = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}

function packet(first: number, body: Uint8Array): Uint8Array {
  const head = remaining(body.length);
  const out = new Uint8Array(1 + head.length + body.length);
  out[0] = first;
  out.set(head, 1);
  out.set(body, 1 + head.length);
  return out;
}

const cat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

export function encodeConnect(o: {
  clientId: string;
  user: string;
  pass: string;
  keepAlive: number;
}): Uint8Array {
  const head = Uint8Array.of(
    0,
    4,
    0x4d,
    0x51,
    0x54,
    0x54,
    4,
    0xc2,
    o.keepAlive >> 8,
    o.keepAlive & 0xff,
  );
  return packet(0x10, cat(head, str(o.clientId), str(o.user), str(o.pass)));
}

export function encodeSubscribe(id: number, filter: string): Uint8Array {
  return packet(0x82, cat(Uint8Array.of(id >> 8, id & 0xff), str(filter), Uint8Array.of(0)));
}

export function encodePublish(topic: string, payload: Uint8Array): Uint8Array {
  return packet(0x30, cat(str(topic), payload));
}

export const encodePingreq = (): Uint8Array => Uint8Array.of(0xc0, 0);

export type MqttPacket =
  | { type: "connack"; code: number }
  | { type: "suback"; id: number; codes: number[] }
  | { type: "pingresp" }
  | { type: "publish"; topic: string; payload: Uint8Array; qos: number; id?: number }
  | { type: "toobig" };

/** Turns the broker's byte stream into packets; a packet over `max` is dropped, not buffered. */
export class MqttReader {
  private buf = new Uint8Array(0);
  private skip = 0;
  constructor(private max = 8192) {}

  feed(chunk: Uint8Array): MqttPacket[] {
    const out: MqttPacket[] = [];
    this.buf = cat(this.buf, chunk);
    for (;;) {
      if (this.skip > 0) {
        const n = Math.min(this.skip, this.buf.length);
        this.buf = this.buf.slice(n);
        this.skip -= n;
        if (this.skip > 0) return out;
      }
      if (this.buf.length < 2) return out;
      let len = 0;
      let mult = 1;
      let i = 1;
      for (;;) {
        if (i >= this.buf.length) return out;
        const b = this.buf[i++];
        len += (b & 0x7f) * mult;
        if (!(b & 0x80)) break;
        mult *= 128;
        if (mult > 128 ** 3) return ((this.buf = new Uint8Array(0)), out);
      }
      if (len > this.max) {
        out.push({ type: "toobig" });
        const have = this.buf.length - i;
        this.buf = this.buf.slice(Math.min(i + len, this.buf.length));
        this.skip = Math.max(0, len - have);
        continue;
      }
      if (this.buf.length < i + len) return out;
      const first = this.buf[0];
      const body = this.buf.slice(i, i + len);
      this.buf = this.buf.slice(i + len);
      const got = parse(first, body);
      if (got) out.push(got);
    }
  }
}

/** The packets a client hears; anything else (the broker sends nothing else to a QoS 0 client) is ignored. */
function parse(first: number, body: Uint8Array): MqttPacket | null {
  const type = first >> 4;
  if (type === 2) return { type: "connack", code: body[1] ?? 255 };
  if (type === 9)
    return { type: "suback", id: (body[0] << 8) | body[1], codes: [...body.slice(2)] };
  if (type === 13) return { type: "pingresp" };
  if (type === 3) {
    const qos = (first >> 1) & 3;
    const tlen = (body[0] << 8) | body[1];
    const topic = dec.decode(body.slice(2, 2 + tlen));
    let at = 2 + tlen;
    let id: number | undefined;
    if (qos > 0) {
      id = (body[at] << 8) | body[at + 1];
      at += 2;
    }
    return {
      type: "publish",
      topic,
      payload: body.slice(at),
      qos,
      ...(id === undefined ? {} : { id }),
    };
  }
  return null;
}
