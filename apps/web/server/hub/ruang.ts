/**
 * The session and exam rooms, in this process (real-time upgrade, Phase 2b). They did this on the Cloudflare
 * relay (apps/relay: the `Aliran` and `Ujian` Durable Objects); here a room is a set of sockets and a message
 * is a function call, with the same rules:
 *
 *   /aliran/sesi-<id> and /aliran/pc   a running session's streams, or the Server pages' room (src/lib/aliran.ts)
 *   /ujian/rec-<id>                    one Open Recruitment exam room (src/lib/recruitment/room-relay.ts)
 *
 * A page enters with a ticket the API signed for one room and one role (`?tiket=`); a ticket works once and
 * is checked here with the same secret (KONSOL_RELAY_SECRET). Each message reaches only the sockets allowed
 * to see it (`bolehTerima` / `bolehTerimaUjian`, shared with the relay, so the rule cannot drift). Pages send
 * up only what the same shared functions accept (`saringNaik` / `saringNaikUjian`), stamped with the group or
 * seat from the ticket, never from the page. The API holds the truth: nothing here is stored.
 *
 * Sockets that go silent for a whole round are closed (4001, so the page reconnects), a socket that cannot
 * keep up is closed (1013), and a socket that talks too much is closed (1008). After Finish the API closes an
 * exam room with 4000 and its pages stay closed.
 *
 * With several workers (Phase 3) a room's sockets are spread over all of them. `sebar` hands what happens here
 * to the supervisor (a message into the room, a close, who joined or left, a ticket used) and the `terima*`
 * functions take what the other workers did, so a message reaches the whole room and the presence counts
 * everybody. Without `sebar` a room is whatever is in this process, as before.
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import {
  ALIRAN_RUANG_RE,
  bolehTerima,
  cekTiketAliran,
  NAIK_MAKS,
  saringKiriman,
  saringNaik,
  type PesanAliran,
  type TiketAliran,
} from "../../src/lib/aliran.js";
import {
  UJIAN_NAIK_MAKS,
  UJIAN_RUANG_RE,
  bolehTerimaUjian,
  cekTiketUjian,
  saringKirimanUjian,
  saringNaikUjian,
  type PesanUjian,
  type TiketUjian,
} from "../../src/lib/recruitment/room-relay.js";
import type { InfoHadir } from "../klaster/protokol.js";
import { ANTRE_MAKS_BYTE } from "./siaran.js";
import { tolakUpgrade } from "../upgrade.js";

/** The close code after Finish: the page stays closed */
export const TUTUP_AKHIR = 4000;
/** The close code for a silent socket: the page reconnects */
export const TUTUP_SUNYI = 4001;
const SUNYI_MS = 75_000;
const NAIK_JEDA_UJIAN_MS = 1500;
const HADIR_TUNDA_MS = 1000;
const PESAN_MAKS_PER_JENDELA = 300;
const JENDELA_MS = 10_000;

export interface OpsiHubRuang {
  /** The shared secret tickets are signed with; null while not set up (every entry is then refused). */
  rahasia: () => string | null;
  /** Sockets at once, all rooms together (default 5000). */
  soketMaks?: number;
  /** Protocol ping every this many ms (default 25 s). */
  jedaPingMs?: number;
  /** A socket silent this long is closed (default 75 s). */
  sunyiMs?: number;
  hadirTundaMs?: number;
  /** Browsers always send Origin; a request without one is a tool. Default: allowed. */
  izinTanpaOrigin?: boolean;
  now?: () => number;
  /** Several workers: what this worker tells the supervisor so the others hear it. */
  sebar?: SebarRuang;
}

export interface SebarRuang {
  /** Into the room's sockets on the other workers (already checked here). */
  kirim(ruang: string, m: unknown[]): void;
  tutup(ruang: string): void;
  /** A socket here joined (info) or left (null). */
  hadir(ruang: string, id: number, info: InfoHadir | null): void;
  /** True the first time a ticket is shown to any worker. */
  pakaiNonce(nonce: string, expDetik: number): Promise<boolean>;
}

interface AttAliran {
  jenis: "aliran";
  peran: TiketAliran["peran"];
  g: number | null;
  u: string;
  /** The group this page is looking at (Live, the inspector) */
  lihat: number | null;
  /** Others looking at this socket's own group, and how many of them are Asisten, as last told ("n,a") */
  penonton: string;
}

interface AttUjian {
  jenis: "ujian";
  peran: TiketUjian["peran"];
  s: number | null;
  u: string;
  /** The last progress frame it sent (ms) */
  naik: number;
}

interface Soket {
  /** Its number on this worker (the supervisor's roster names a socket by worker and this). */
  id: number;
  ws: WebSocket;
  ruang: string;
  att: AttAliran | AttUjian;
  terakhir: number;
  pesan: number;
  jendela: number;
}

export interface HubRuang {
  /** Hand over an upgrade at /aliran/<room> or /ujian/<room>. */
  naik(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void>;
  /** Into a room, as the API sends it (checked here); returns how many sockets heard it. */
  kirim(ruang: string, m: unknown[]): number;
  /** Closes every socket of an exam room with 4000 (after Finish); returns how many. */
  tutup(ruang: string): number;
  jumlah(): number;
  statistik(): { soket: number; ruang: number; dibuang: number };
  /** Closes everything with 1001 and stops the timers. */
  tutupSemua(): void;
  /** A message another worker's socket sent into a room, for the sockets here. */
  terimaKirim(ruang: string, m: unknown[]): void;
  terimaTutup(ruang: string): number;
  /** A socket on worker `w` joined or left a room. */
  terimaHadir(w: number, ruang: string, id: number, info: InfoHadir | null): void;
  /** Worker `w` is gone with all its sockets. */
  terimaPergi(w: number): void;
  /** The roster as it stood when this worker started (no one is told). */
  sinkronHadir(baris: ReadonlyArray<[number, string, number, InfoHadir]>): void;
}

export function buatHubRuang(opsi: OpsiHubRuang): HubRuang {
  const now = opsi.now ?? Date.now;
  const soketMaks = opsi.soketMaks ?? 5000;
  const sunyiMs = opsi.sunyiMs ?? SUNYI_MS;
  const hadirTunda = opsi.hadirTundaMs ?? HADIR_TUNDA_MS;
  const wssAliran = new WebSocketServer({
    noServer: true,
    maxPayload: NAIK_MAKS,
    perMessageDeflate: false,
  });
  const wssUjian = new WebSocketServer({
    noServer: true,
    maxPayload: UJIAN_NAIK_MAKS,
    perMessageDeflate: false,
  });
  const kamar = new Map<string, Set<Soket>>();
  const semua = new Map<WebSocket, Soket>();
  /** Tickets already used, until they are long expired (single use). */
  const nonce = new Map<string, number>();
  const hadirTimer = new Map<string, ReturnType<typeof setTimeout>>();
  /** The sockets in each room on the other workers: room, then `worker|socket`. */
  const jauh = new Map<string, Map<string, InfoHadir>>();
  let dibuang = 0;
  let nomorSoket = 0;

  const infoDari = (att: AttAliran | AttUjian): InfoHadir =>
    att.jenis === "aliran"
      ? { k: "a", peran: att.peran, g: att.g, lihat: att.lihat }
      : { k: "u", peran: att.peran, s: att.s, u: att.u };
  /** Is anybody in this room, on any worker? */
  const adaIsi = (ruang: string) => kamar.has(ruang) || (jauh.get(ruang)?.size ?? 0) > 0;

  const lepas = (s: Soket) => {
    if (!semua.delete(s.ws)) return;
    const k = kamar.get(s.ruang);
    if (!k) return;
    k.delete(s);
    if (!k.size) kamar.delete(s.ruang);
    opsi.sebar?.hadir(s.ruang, s.id, null);
    if (s.att.jenis === "aliran") kabariPenonton(s.ruang);
    else jadwalkanHadir(s.ruang);
  };

  const tutupSoket = (s: Soket, kode: number, alasan: string) => {
    dibuang++;
    try {
      s.ws.close(kode, alasan);
    } catch {
      s.ws.terminate();
    }
    lepas(s);
  };

  const kirimKe = (s: Soket, teks: string): boolean => {
    if (s.ws.readyState !== WebSocket.OPEN) return false;
    if (s.ws.bufferedAmount > ANTRE_MAKS_BYTE) {
      tutupSoket(s, 1013, "too slow");
      return false;
    }
    try {
      s.ws.send(teks);
      return true;
    } catch {
      s.ws.terminate();
      lepas(s);
      return false;
    }
  };

  // ---- session rooms ----

  function sebarAliran(ruang: string, m: PesanAliran[], dari: Soket | null): number {
    let n = 0;
    for (const s of [...(kamar.get(ruang) ?? [])]) {
      if (s === dari || s.att.jenis !== "aliran") continue;
      const boleh = m.filter((x) => bolehTerima(s.att as AttAliran, x));
      if (boleh.length && kirimKe(s, JSON.stringify({ m: boleh }))) n++;
    }
    return n;
  }

  /** Tells each group's sockets how many others look at their group, so a laptop sends its board lines
   *  only while someone watches. */
  function kabariPenonton(ruang: string) {
    const isi = [...(kamar.get(ruang) ?? [])].filter((s) => s.att.jenis === "aliran");
    // Who else is in the room: the other sockets here and on the other workers.
    const semuaDiRuang: Array<{ s: Soket | null; lihat: number | null; peran: string }> = [
      ...isi.map((s) => ({
        s,
        lihat: (s.att as AttAliran).lihat,
        peran: (s.att as AttAliran).peran,
      })),
      ...[...(jauh.get(ruang)?.values() ?? [])].flatMap((i) =>
        i.k === "a" ? [{ s: null, lihat: i.lihat, peran: i.peran }] : [],
      ),
    ];
    isi.forEach((s) => {
      const att = s.att as AttAliran;
      if (att.g === null) return;
      const lain = semuaDiRuang.filter((o) => o.s !== s && o.lihat === att.g);
      const n = lain.length;
      const a = lain.filter((o) => o.peran === "asisten").length;
      if (`${n},${a}` === att.penonton) return;
      att.penonton = `${n},${a}`;
      kirimKe(s, JSON.stringify({ penonton: n, asisten: a }));
    });
  }

  // ---- exam rooms ----

  function sebarUjian(ruang: string, m: PesanUjian[], dari: Soket | null): number {
    let n = 0;
    for (const s of [...(kamar.get(ruang) ?? [])]) {
      if (s === dari || s.att.jenis !== "ujian") continue;
      const boleh = m.filter((x) => bolehTerimaUjian(s.att as AttUjian, x));
      if (boleh.length && kirimKe(s, JSON.stringify({ m: boleh }))) n++;
    }
    return n;
  }

  /** Who is connected: seat ids and the Panitia's NIMs, open sockets only */
  function siapaHadir(ruang: string): { kursi: number[]; panitia: string[] } {
    const kursi = new Set<number>();
    const panitia = new Set<string>();
    for (const s of kamar.get(ruang) ?? []) {
      if (s.ws.readyState !== WebSocket.OPEN || s.att.jenis !== "ujian") continue;
      if (s.att.peran === "kursi" && s.att.s !== null) kursi.add(s.att.s);
      else if (s.att.peran === "panitia") panitia.add(s.att.u);
    }
    for (const i of jauh.get(ruang)?.values() ?? []) {
      if (i.k !== "u") continue;
      if (i.peran === "kursi" && i.s !== null) kursi.add(i.s);
      else if (i.peran === "panitia") panitia.add(i.u);
    }
    return { kursi: [...kursi].sort((a, b) => a - b), panitia: [...panitia].sort() };
  }

  const pesanHadir = (ruang: string): PesanUjian => ({
    j: "hadir",
    s: null,
    d: siapaHadir(ruang),
  });

  /** Someone joined or left: `hadir` goes out a moment after the last change. */
  function jadwalkanHadir(ruang: string) {
    if (!UJIAN_RUANG_RE.test(ruang) || hadirTimer.has(ruang)) return;
    const t = setTimeout(() => {
      hadirTimer.delete(ruang);
      if (kamar.has(ruang)) sebarUjian(ruang, [pesanHadir(ruang)], null);
    }, hadirTunda);
    t.unref();
    hadirTimer.set(ruang, t);
  }

  // ---- timers ----

  const ping = setInterval(() => {
    const kini = now();
    for (const s of [...semua.values()]) {
      if (kini - s.terakhir > sunyiMs) {
        tutupSoket(s, TUTUP_SUNYI, "sunyi");
        continue;
      }
      try {
        s.ws.ping();
      } catch {
        s.ws.terminate();
        lepas(s);
      }
    }
  }, opsi.jedaPingMs ?? 25_000);
  ping.unref();

  const sapuNonce = setInterval(() => {
    const kini = now() / 1000;
    for (const [k, exp] of nonce) if (exp < kini - 60) nonce.delete(k);
  }, 60_000);
  sapuNonce.unref();

  // ---- entry ----

  /** True the first time a ticket is shown (on any worker, when there are several). */
  async function pakaiNonce(n: string, exp: number): Promise<boolean> {
    if (opsi.sebar) return opsi.sebar.pakaiNonce(n, exp);
    if (nonce.has(n)) return false;
    nonce.set(n, exp);
    return true;
  }

  /** Closes every socket here of an exam room with 4000 (after Finish). */
  function tutupLokal(ruang: string): number {
    let n = 0;
    for (const s of [...(kamar.get(ruang) ?? [])]) {
      tutupSoket(s, TUTUP_AKHIR, "selesai");
      n++;
    }
    return n;
  }

  function pasang(
    wss: WebSocketServer,
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    ruang: string,
    att: AttAliran | AttUjian,
  ) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const s: Soket = {
        id: ++nomorSoket,
        ws,
        ruang,
        att,
        terakhir: now(),
        pesan: 0,
        jendela: now(),
      };
      semua.set(ws, s);
      let k = kamar.get(ruang);
      if (!k) kamar.set(ruang, (k = new Set()));
      k.add(s);
      ws.on("pong", () => (s.terakhir = now()));
      ws.on("message", (data, biner) => {
        const t = now();
        s.terakhir = t;
        if (t - s.jendela > JENDELA_MS) {
          s.jendela = t;
          s.pesan = 0;
        }
        if (++s.pesan > PESAN_MAKS_PER_JENDELA) return tutupSoket(s, 1008, "too many messages");
        if (biner) return;
        const teks = data.toString();
        if (teks === "ping") {
          try {
            ws.send("pong");
          } catch {
            lepas(s);
          }
          return;
        }
        if (s.att.jenis === "aliran") {
          if (teks.startsWith('{"j":"lihat"')) {
            let g: unknown = null;
            try {
              g = (JSON.parse(teks) as { g?: unknown }).g ?? null;
            } catch {
              return;
            }
            s.att.lihat =
              Number.isInteger(g) && (g as number) >= 1 && (g as number) <= 99
                ? (g as number)
                : null;
            opsi.sebar?.hadir(ruang, s.id, infoDari(s.att));
            kabariPenonton(ruang);
            return;
          }
          const m = saringNaik(teks, s.att);
          if (m) {
            sebarAliran(ruang, [m], s);
            if (jauh.get(ruang)?.size) opsi.sebar?.kirim(ruang, [m]);
          }
        } else {
          const m = saringNaikUjian(teks, s.att);
          if (m && t - s.att.naik >= NAIK_JEDA_UJIAN_MS) {
            s.att.naik = t;
            sebarUjian(ruang, [m], s);
            if (jauh.get(ruang)?.size) opsi.sebar?.kirim(ruang, [m]);
          }
        }
      });
      ws.on("close", () => lepas(s));
      ws.on("error", () => {
        ws.terminate();
        lepas(s);
      });
      opsi.sebar?.hadir(ruang, s.id, infoDari(att));
      if (att.jenis === "aliran") kabariPenonton(ruang);
      else {
        jadwalkanHadir(ruang);
        // The Panitia who just joined need not wait for the debounce.
        if (att.peran === "panitia") kirimKe(s, JSON.stringify({ m: [pesanHadir(ruang)] }));
      }
    });
  }

  return {
    async naik(req, socket, head) {
      const origin = req.headers.origin;
      if (origin) {
        let host = "";
        try {
          host = new URL(origin).host;
        } catch {
          /* falls through to the refusal */
        }
        if (host !== req.headers.host) return tolakUpgrade(socket, 403, "Forbidden");
      } else if (opsi.izinTanpaOrigin === false) {
        return tolakUpgrade(socket, 403, "Forbidden");
      }
      const rahasia = opsi.rahasia();
      if (!rahasia || rahasia.length < 32) return tolakUpgrade(socket, 503, "Service Unavailable");
      const url = new URL(req.url ?? "/", "http://iris.local");
      const [, jenis, ruang] = url.pathname.split("/");
      const tiket = url.searchParams.get("tiket") ?? "";
      if (semua.size >= soketMaks) return tolakUpgrade(socket, 503, "Service Unavailable");

      if (jenis === "aliran" && ruang && ALIRAN_RUANG_RE.test(ruang)) {
        const cek = await cekTiketAliran(tiket, rahasia, ruang);
        if (!cek.ok || socket.destroyed) return tolakUpgrade(socket, 403, "Forbidden");
        const t = cek.tiket;
        if (!(await pakaiNonce(t.n, t.exp)) || socket.destroyed)
          return tolakUpgrade(socket, 403, "Forbidden");
        return pasang(wssAliran, req, socket, head, ruang, {
          jenis: "aliran",
          peran: t.peran,
          g: t.g,
          u: t.u,
          lihat: null,
          penonton: "",
        });
      }
      if (jenis === "ujian" && ruang && UJIAN_RUANG_RE.test(ruang)) {
        const cek = await cekTiketUjian(tiket, rahasia, ruang);
        if (!cek.ok || socket.destroyed) return tolakUpgrade(socket, 403, "Forbidden");
        const t = cek.tiket;
        if (!(await pakaiNonce(t.n, t.exp)) || socket.destroyed)
          return tolakUpgrade(socket, 403, "Forbidden");
        return pasang(wssUjian, req, socket, head, ruang, {
          jenis: "ujian",
          peran: t.peran,
          s: t.s,
          u: t.u,
          naik: 0,
        });
      }
      return tolakUpgrade(socket, 404, "Not Found");
    },

    kirim(ruang, m) {
      let ok: PesanUjian[] | PesanAliran[] | null = null;
      if (UJIAN_RUANG_RE.test(ruang)) ok = saringKirimanUjian({ m });
      else if (ALIRAN_RUANG_RE.test(ruang)) ok = saringKiriman({ m });
      if (!ok) return 0;
      // The other workers' sockets hear it too, but a room nobody is in anywhere costs no message.
      if (jauh.get(ruang)?.size) opsi.sebar?.kirim(ruang, ok);
      if (!kamar.has(ruang)) return 0;
      return UJIAN_RUANG_RE.test(ruang)
        ? sebarUjian(ruang, ok as PesanUjian[], null)
        : sebarAliran(ruang, ok as PesanAliran[], null);
    },

    tutup(ruang) {
      if (adaIsi(ruang)) opsi.sebar?.tutup(ruang);
      return tutupLokal(ruang);
    },

    terimaKirim(ruang, m) {
      if (!kamar.has(ruang)) return;
      if (UJIAN_RUANG_RE.test(ruang)) sebarUjian(ruang, m as PesanUjian[], null);
      else if (ALIRAN_RUANG_RE.test(ruang)) sebarAliran(ruang, m as PesanAliran[], null);
    },

    terimaTutup: (ruang) => tutupLokal(ruang),

    terimaHadir(w, ruang, id, info) {
      let r = jauh.get(ruang);
      if (info === null) {
        r?.delete(`${w}|${id}`);
        if (r && !r.size) jauh.delete(ruang);
      } else {
        if (!r) jauh.set(ruang, (r = new Map()));
        r.set(`${w}|${id}`, info);
      }
      if (ALIRAN_RUANG_RE.test(ruang)) kabariPenonton(ruang);
      else jadwalkanHadir(ruang);
    },

    terimaPergi(w) {
      const awal = `${w}|`;
      for (const [ruang, r] of [...jauh]) {
        let ada = false;
        for (const k of [...r.keys()]) {
          if (k.startsWith(awal)) {
            r.delete(k);
            ada = true;
          }
        }
        if (!r.size) jauh.delete(ruang);
        if (ada) {
          if (ALIRAN_RUANG_RE.test(ruang)) kabariPenonton(ruang);
          else jadwalkanHadir(ruang);
        }
      }
    },

    sinkronHadir(baris) {
      jauh.clear();
      for (const [w, ruang, id, info] of baris) {
        let r = jauh.get(ruang);
        if (!r) jauh.set(ruang, (r = new Map()));
        r.set(`${w}|${id}`, info);
      }
    },

    jumlah: () => semua.size,
    statistik: () => ({ soket: semua.size, ruang: kamar.size, dibuang }),

    tutupSemua() {
      clearInterval(ping);
      clearInterval(sapuNonce);
      for (const t of hadirTimer.values()) clearTimeout(t);
      hadirTimer.clear();
      for (const s of [...semua.values()]) {
        try {
          s.ws.close(1001, "server restarting");
        } catch {
          s.ws.terminate();
        }
      }
      semua.clear();
      kamar.clear();
      wssAliran.close();
      wssUjian.close();
    },
  };
}
