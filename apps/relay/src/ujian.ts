/**
 * The exam's rooms (Open Recruitment, EXAM-ENGINE 6): one Durable Object per
 * exam room, `rec-<id>`, next to Konsol, siaran and aliran.
 *
 *   GET  /ujian/rec-<id>?tiket=...   a page's WebSocket (a seat or the Panitia)
 *   POST /ujian/rec-<id>/kirim       the IRIS API, signed: {"m": [...]}
 *   POST /ujian/rec-<id>/tutup       the IRIS API, signed: closes every socket
 *
 * Fan-out only: the API holds the truth and the relay stores nothing but the
 * nonces of tickets already used. Each message reaches only the sockets
 * allowed to see it (bolehTerimaUjian, src/lib/recruitment/room-relay.ts). A
 * seat sends its progress up (display only, stamped with the seat from its
 * ticket); the Panitia send nothing. The room itself tells the Panitia who is
 * connected (`hadir`, one second after the last change).
 *
 * Sockets hibernate and "ping" is answered without waking the room. Pages
 * ping every 25 s; an alarm every 30 s closes a socket silent for 75 s.
 */
import {
  UJIAN_RUANG_RE,
  UJIAN_TIKET_DETIK,
  bolehTerimaUjian,
  cekTiketUjian,
  saringKirimanUjian,
  saringNaikUjian,
  type PesanUjian,
  type TiketUjian,
} from "../../web/src/lib/recruitment/room-relay.ts";

export interface EnvUjian {
  UJIAN: DurableObjectNamespace;
  KONSOL_RELAY_SECRET: string;
  HITUNG?: string;
  /** `--var UJI_SUNYI_MS:4000` in the test only: how long a socket may be silent */
  UJI_SUNYI_MS?: string;
}

/** The API's batch for an exam room */
const KIRIM_MAKS = 64 * 1024;
/** A socket silent this long is closed (pages ping every 25 s) */
const SUNYI_MS = 75_000;
const SAPU_MS = 30_000;
const HADIR_TUNDA_MS = 1000;
/** A seat's progress frames are kept at most this often */
const NAIK_JEDA_MS = 1500;
/** The close code after Finish: the page stays closed */
const TUTUP_AKHIR = 4000;
/** The close code for a silent socket: the page reconnects */
const TUTUP_SUNYI = 4001;

function teks(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)),
  );
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function samaPersis(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function kamarUjian(env: EnvUjian, ruang: string): DurableObjectStub {
  // Everyone in an exam room is in Indonesia, like the Konsol rooms.
  return env.UJIAN.get(env.UJIAN.idFromName(ruang), { locationHint: "apac" });
}

/**
 * Into a room: the API's batch, already checked. Gives how many sockets
 * heard it (the combined /kirim passes it back to the API).
 */
export async function kirimKeUjian(
  env: EnvUjian,
  ruang: string,
  m: PesanUjian[],
): Promise<number> {
  const res = await kamarUjian(env, ruang).fetch("https://ujian/kirim", {
    method: "POST",
    body: JSON.stringify(m),
  });
  return Number(await res.text()) || 0;
}

/** /ujian/<ruang> (a page's socket), /kirim and /tutup (the API) */
export async function ujian(
  req: Request,
  env: EnvUjian,
  ruang: string | undefined,
  sub: string | undefined,
): Promise<Response> {
  if (!ruang || !UJIAN_RUANG_RE.test(ruang))
    return teks(404, "tidak ditemukan");
  if (!env.KONSOL_RELAY_SECRET || env.KONSOL_RELAY_SECRET.length < 32)
    return teks(503, "relay belum diatur");
  const kamar = kamarUjian(env, ruang);

  if ((sub === "kirim" || sub === "tutup") && req.method === "POST") {
    const body = await req.text();
    if (body.length > KIRIM_MAKS) return teks(413, "terlalu besar");
    const ts = Number(req.headers.get("x-ujian-ts"));
    const tanda = req.headers.get("x-ujian-tanda") ?? "";
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60)
      return teks(403, "kedaluwarsa");
    const sah = samaPersis(
      tanda,
      await hmacHex(
        env.KONSOL_RELAY_SECRET,
        `ujian|${sub}|${ruang}|${body}|${ts}`,
      ),
    );
    if (!sah) return teks(403, "tanda salah");
    if (sub === "tutup")
      return kamar.fetch("https://ujian/tutup", { method: "POST" });
    let m: PesanUjian[] | null = null;
    try {
      m = saringKirimanUjian(JSON.parse(body));
    } catch {
      /* not JSON */
    }
    if (!m) return teks(400, "format");
    return kamar.fetch("https://ujian/kirim", {
      method: "POST",
      body: JSON.stringify(m),
    });
  }

  if (sub || req.headers.get("Upgrade") !== "websocket")
    return teks(404, "tidak ditemukan");
  const cek = await cekTiketUjian(
    new URL(req.url).searchParams.get("tiket") ?? "",
    env.KONSOL_RELAY_SECRET,
    ruang,
  );
  if (!cek.ok) return teks(403, `tiket ${cek.kode}`);
  const h = new Headers(req.headers);
  h.set("x-tiket", JSON.stringify(cek.tiket));
  return kamar.fetch(new Request("https://ujian/sambung", { headers: h }));
}

/** What a socket carries through hibernation */
interface Lampiran {
  peran: TiketUjian["peran"];
  s: number | null;
  u: string;
  /** The last time the socket said anything itself (ms) */
  terakhir: number;
  /** The last progress frame it sent (ms) */
  naik: number;
}

/**
 * One exam room. Sockets hibernate, so a quiet room costs nothing. Nothing is
 * stored but the nonces of tickets already used, until they expire, and when
 * the next `hadir` is due.
 */
export class Ujian {
  constructor(
    private ctx: DurableObjectState,
    private env: EnvUjian,
  ) {
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (path === "/kirim") {
      const m = JSON.parse(await req.text()) as PesanUjian[];
      return teks(200, String(this.sebar(m, null)));
    }
    if (path === "/tutup") {
      for (const ws of this.ctx.getWebSockets())
        this.tutupSoket(ws, TUTUP_AKHIR, "selesai");
      return teks(200, "ok");
    }
    let t: TiketUjian;
    try {
      t = JSON.parse(req.headers.get("x-tiket") ?? "") as TiketUjian;
    } catch {
      return teks(400, "tiket");
    }
    // A ticket's nonce works once, kept until the ticket is long expired.
    const kunci = `n:${t.n}`;
    if (await this.ctx.storage.get(kunci))
      return teks(403, "tiket sudah dipakai");
    await this.ctx.storage.put(kunci, t.exp);

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    const att: Lampiran = {
      peran: t.peran,
      s: t.s,
      u: t.u,
      terakhir: Date.now(),
      naik: 0,
    };
    pair[1].serializeAttachment(att);
    await this.jadwalkanHadir();
    // The Panitia who just joined need not wait for the debounce.
    if (t.peran === "panitia") this.kirimHadir(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (typeof data !== "string") return;
    const att = ws.deserializeAttachment() as Lampiran | null;
    if (!att) return;
    const kini = Date.now();
    att.terakhir = kini;
    const m = saringNaikUjian(data, att);
    if (m && kini - att.naik >= NAIK_JEDA_MS) {
      att.naik = kini;
      this.sebar([m], ws);
    }
    ws.serializeAttachment(att);
  }

  async webSocketClose(ws: WebSocket, code: number) {
    this.tutupSoket(ws, code === 1005 ? 1000 : code, "tutup");
    await this.jadwalkanHadir();
  }

  async webSocketError(ws: WebSocket) {
    this.tutupSoket(ws, 1011, "galat");
    await this.jadwalkanHadir();
  }

  private tutupSoket(ws: WebSocket, code: number, why: string) {
    try {
      ws.close(code, why);
    } catch {
      /* already closed */
    }
  }

  /** Each socket gets the messages it may see, in one frame. */
  private sebar(m: PesanUjian[], dari: WebSocket | null): number {
    let n = 0;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === dari) continue;
      const att = ws.deserializeAttachment() as Lampiran | null;
      if (!att) continue;
      const boleh = m.filter((x) => bolehTerimaUjian(att, x));
      if (!boleh.length) continue;
      try {
        ws.send(JSON.stringify({ m: boleh }));
        n++;
      } catch {
        /* closing */
      }
    }
    return n;
  }

  /** Who is connected: seat ids and the Panitia's NIMs, open sockets only */
  private siapaHadir(): { kursi: number[]; panitia: string[] } {
    const kursi = new Set<number>();
    const panitia = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment() as Lampiran | null;
      if (!att) continue;
      if (att.peran === "kursi" && att.s !== null) kursi.add(att.s);
      else if (att.peran === "panitia") panitia.add(att.u);
    }
    return {
      kursi: [...kursi].sort((a, b) => a - b),
      panitia: [...panitia].sort(),
    };
  }

  /** The `hadir` frame, to the Panitia (or to one socket) */
  private kirimHadir(ke: WebSocket | null) {
    const m: PesanUjian = { j: "hadir", s: null, d: this.siapaHadir() };
    if (ke) {
      try {
        ke.send(JSON.stringify({ m: [m] }));
      } catch {
        /* closing */
      }
      return;
    }
    this.sebar([m], null);
  }

  /** Someone joined or left: `hadir` goes out one second after the last change. */
  private async jadwalkanHadir() {
    const due = Date.now() + HADIR_TUNDA_MS;
    await this.ctx.storage.put("h", due);
    await this.setAlarmPaling(due);
  }

  private async setAlarmPaling(t: number) {
    const sekarang = await this.ctx.storage.getAlarm();
    if (sekarang === null || t < sekarang) await this.ctx.storage.setAlarm(t);
  }

  /** Sends a due `hadir`, closes silent sockets, forgets spent nonces. */
  async alarm() {
    const kini = Date.now();
    let berikut: number | null = null;
    const h = await this.ctx.storage.get<number>("h");
    if (h !== undefined) {
      if (h <= kini) {
        await this.ctx.storage.delete("h");
        this.kirimHadir(null);
      } else berikut = h;
    }
    const sunyi = Number(this.env.UJI_SUNYI_MS) || SUNYI_MS;
    const sapuMs = sunyi === SUNYI_MS ? SAPU_MS : 1000;
    let buka = 0;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Lampiran | null;
      const auto =
        this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      const dengar = Math.max(att?.terakhir ?? 0, auto);
      if (kini - dengar > sunyi) this.tutupSoket(ws, TUTUP_SUNYI, "sunyi");
      else buka++;
    }
    const semua = await this.ctx.storage.list<number>({ prefix: "n:" });
    const nowSec = kini / 1000;
    const basi = [...semua]
      .filter(([, exp]) => exp < nowSec - 60)
      .map(([k]) => k);
    if (basi.length) await this.ctx.storage.delete(basi);
    if (buka || semua.size > basi.length) {
      const sapu = kini + (buka ? sapuMs : 2 * UJIAN_TIKET_DETIK * 1000);
      berikut = berikut === null ? sapu : Math.min(berikut, sapu);
    }
    if (berikut !== null) await this.ctx.storage.setAlarm(berikut);
  }
}
