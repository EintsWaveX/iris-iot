/**
 * The quiz game's WebSocket, `/kuis/ws` on the games host.
 *
 * One RuangKuis (src/lib/kuis/engine.ts) per running Module 4 session. A
 * socket belongs to someone signed in on this host (the same `iris_session`
 * cookie the rest of the site uses): an Asisten hosts (the first one in; any
 * other is a spectator who can take over), a Praktikan of this session plays.
 * Everything a client may do is a small JSON message, checked here against
 * the role, and every state change is pushed to each socket as that socket's
 * own view, so a phone never holds the right answer while a question is open.
 *
 * State lives in memory. A debounced snapshot goes to the database through
 * `ctx.simpan` and comes back through `ctx.muat` after a restart, so a
 * Website Upgrade in the middle of a game pauses it instead of ending it.
 */
import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { SOAL_MODUL4 } from "../src/content/kuis/modul4.js";
import type { SessionPayload } from "../src/lib/auth.js";
import { RuangKuis, type Simpanan } from "../src/lib/kuis/engine.js";
import {
  bahasaKonten,
  isLang,
  langForKelas,
  type BahasaKonten,
  type Kelas,
} from "../src/lib/kelas.js";
import { hostKuis } from "./kuis-host.js";

export const JALUR_WS = "/kuis/ws";
/** The biggest message a client may send. */
export const MAKS_PESAN = 2048;
/** More messages than this in one second and the socket is closed. */
const MAKS_PESAN_DETIK = 30;
const MAKS_ANTRIAN_BYTE = 1_000_000;

export interface SesiKuis {
  id: number;
  modul: number;
  kelas: Kelas | null;
}

export interface KonteksKuis {
  /** The running session, or null. */
  sesiAktif(): Promise<SesiKuis | null>;
  /** The session cookie's value to who it is, or null. */
  bacaCookie(nilai: string | undefined): SessionPayload | null;
  muat(sesiId: number): Promise<Simpanan | null>;
  simpan(sesiId: number, nilai: Simpanan & { hasil?: unknown }): Promise<void>;
}

export interface OpsiKuis {
  now?: () => number;
  acak?: () => number;
  /** Accept a socket with no Origin header (tests, scripts). A browser always sends one. */
  izinTanpaOrigin?: boolean;
  jedaTickMs?: number;
  jedaKirimMs?: number;
  jedaSimpanMs?: number;
  jedaSesiMs?: number;
  jedaPingMs?: number;
}

interface Sambungan {
  ws: WebSocket;
  nim: string;
  nama: string;
  asisten: boolean;
  kelompok: number | null;
  bahasa: BahasaKonten;
  terakhir: string;
  hidup: boolean;
  jendela: number;
  hitung: number;
}

interface Ruang {
  sesiId: number;
  kelas: Kelas | null;
  engine: RuangKuis;
  sambungan: Set<Sambungan>;
  hostNim: string | null;
  hostNama: string;
  timerKirim: NodeJS.Timeout | null;
  timerSimpan: NodeJS.Timeout | null;
}

export interface PasangKuis {
  ruang: Map<number, Ruang>;
  tutup(): Promise<void>;
}

function bacaCookieHeader(h: string | undefined, nama: string): string | undefined {
  if (!h) return undefined;
  for (const bagian of h.split(";")) {
    const i = bagian.indexOf("=");
    if (i > 0 && bagian.slice(0, i).trim() === nama) return bagian.slice(i + 1).trim();
  }
  return undefined;
}

function tolak(socket: Duplex, kode: number, teks: string): void {
  if (socket.writable) {
    socket.write(`HTTP/1.1 ${kode} ${teks}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }
  socket.destroy();
}

/** Does the Origin header name the same host the socket was opened on? */
export function asalSama(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function pasangKuis(server: http.Server, ctx: KonteksKuis, opsi: OpsiKuis = {}): PasangKuis {
  const now = opsi.now ?? Date.now;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAKS_PESAN });
  const ruang = new Map<number, Ruang>();

  // A burst of phones joining makes one query, not one per phone.
  let sesiCache: { pada: number; nilai: Promise<SesiKuis | null> } | null = null;
  const sesiKini = (): Promise<SesiKuis | null> => {
    const t = now();
    if (!sesiCache || t - sesiCache.pada > 2000) {
      sesiCache = { pada: t, nilai: ctx.sesiAktif().catch(() => null) };
    }
    return sesiCache.nilai;
  };

  // ---------- sending ----------

  const kirim = (s: Sambungan, pesan: unknown): void => {
    if (s.ws.readyState !== WebSocket.OPEN) return;
    if (s.ws.bufferedAmount > MAKS_ANTRIAN_BYTE) {
      s.ws.terminate();
      return;
    }
    s.ws.send(JSON.stringify(pesan));
  };

  const adalahHost = (r: Ruang, s: Sambungan): boolean => s.asisten && r.hostNim === s.nim;

  const kirimAku = (r: Ruang, s: Sambungan): void => {
    kirim(s, {
      t: "aku",
      nim: s.nim,
      nama: s.nama,
      peran: !s.asisten ? "pemain" : adalahHost(r, s) ? "host" : "penonton",
      hostNama: r.hostNama,
    });
  };

  const kirimLihat = (r: Ruang, s: Sambungan, paksa = false): void => {
    const d = r.engine.lihat(s.nim, s.asisten ? "host" : "pemain", s.bahasa);
    // The clock moves every call; only a real change is worth a frame.
    const kunci = JSON.stringify({ ...d, waktu: 0 });
    if (!paksa && kunci === s.terakhir) return;
    s.terakhir = kunci;
    kirim(s, { t: "lihat", d });
  };

  const kirimSemua = (r: Ruang): void => {
    r.timerKirim = null;
    for (const s of r.sambungan) kirimLihat(r, s);
  };

  const simpanRuang = async (r: Ruang): Promise<void> => {
    r.timerSimpan = null;
    try {
      const s = r.engine.simpan();
      await ctx.simpan(
        r.sesiId,
        r.engine.faseSaatIni === "podium" ? { ...s, hasil: r.engine.hasilAkhir() } : s,
      );
    } catch (err) {
      console.warn("[kuis] the snapshot was not saved:", err instanceof Error ? err.message : err);
    }
  };

  /** Something changed: push every view soon, and save soon. */
  const kotor = (r: Ruang): void => {
    if (!r.timerKirim) r.timerKirim = setTimeout(() => kirimSemua(r), opsi.jedaKirimMs ?? 80);
    if (!r.timerSimpan)
      r.timerSimpan = setTimeout(() => void simpanRuang(r), opsi.jedaSimpanMs ?? 1500);
  };

  // ---------- rooms ----------

  const ambilRuang = async (sesi: SesiKuis): Promise<Ruang> => {
    const ada = ruang.get(sesi.id);
    if (ada) return ada;
    const dasar = { soal: SOAL_MODUL4, now, acak: opsi.acak };
    let engine: RuangKuis | null = null;
    try {
      const s = await ctx.muat(sesi.id);
      if (s) engine = RuangKuis.pulihkan(s, dasar);
    } catch (err) {
      console.warn(
        "[kuis] the saved room could not be read:",
        err instanceof Error ? err.message : err,
      );
    }
    // Someone else may have made it while the snapshot was loading.
    const sudah = ruang.get(sesi.id);
    if (sudah) return sudah;
    const r: Ruang = {
      sesiId: sesi.id,
      kelas: sesi.kelas,
      engine: engine ?? new RuangKuis({ ...dasar, sesiId: sesi.id }),
      sambungan: new Set(),
      hostNim: null,
      hostNama: "",
      timerKirim: null,
      timerSimpan: null,
    };
    ruang.set(sesi.id, r);
    return r;
  };

  const tutupRuang = (r: Ruang, kode: number, alasan: string): void => {
    if (r.timerKirim) clearTimeout(r.timerKirim);
    if (r.timerSimpan) clearTimeout(r.timerSimpan);
    r.timerKirim = r.timerSimpan = null;
    ruang.delete(r.sesiId);
    for (const s of r.sambungan) s.ws.close(kode, alasan);
    r.sambungan.clear();
  };

  // ---------- messages ----------

  const AKSI_HOST = new Set([
    "atur",
    "mulai",
    "lanjut",
    "jeda",
    "teruskan",
    "akhiri",
    "main-lagi",
    "tendang",
  ]);

  const tangani = (r: Ruang, s: Sambungan, mentah: string): void => {
    const detik = Math.floor(now() / 1000);
    if (detik !== s.jendela) {
      s.jendela = detik;
      s.hitung = 0;
    }
    if (++s.hitung > MAKS_PESAN_DETIK) {
      s.ws.close(1008, "too many messages");
      return;
    }
    let m: Record<string, unknown>;
    try {
      const v: unknown = JSON.parse(mentah);
      if (typeof v !== "object" || v === null || Array.isArray(v)) return;
      m = v as Record<string, unknown>;
    } catch {
      return;
    }
    const t = m.t;
    if (typeof t !== "string") return;

    if (t === "ping") return kirim(s, { t: "jam", waktu: now() });
    if (t === "bahasa") {
      if (isLang(m.b)) {
        s.bahasa = bahasaKonten(m.b);
        kirimLihat(r, s, true);
      }
      return;
    }

    if (!s.asisten) {
      if (t === "jawab") {
        const h = r.engine.jawab(s.nim, m.pilih);
        if (h.ok) kotor(r);
        else kirim(s, { t: "galat", kode: h.galat });
      }
      return;
    }

    if (t === "ambil-alih") {
      r.hostNim = s.nim;
      r.hostNama = s.nama;
      for (const x of r.sambungan) if (x.asisten) kirimAku(r, x);
      return kotor(r);
    }
    if (!AKSI_HOST.has(t)) return;
    if (!adalahHost(r, s)) return kirim(s, { t: "galat", kode: "bukan-host" });

    let h;
    switch (t) {
      case "atur": {
        const { sumber, jumlah, detik, acak } = m as Record<string, unknown>;
        h = r.engine.atur({
          ...(sumber !== undefined && { sumber: sumber as never }),
          ...(jumlah !== undefined && { jumlah: jumlah as number }),
          ...(detik !== undefined && { detik: detik as number }),
          ...(acak !== undefined && { acak: acak as boolean }),
        });
        break;
      }
      case "mulai":
        h = r.engine.mulai();
        break;
      case "lanjut":
        h = r.engine.lanjut();
        break;
      case "jeda":
        h = r.engine.jeda();
        break;
      case "teruskan":
        h = r.engine.teruskan();
        break;
      case "akhiri":
        h = r.engine.akhiri();
        break;
      case "main-lagi":
        h = r.engine.mainLagi();
        break;
      default: {
        // tendang
        const nim = typeof m.nim === "string" ? m.nim : "";
        h = r.engine.tendang(nim);
        if (h.ok) {
          for (const x of r.sambungan) {
            if (!x.asisten && x.nim === nim) x.ws.close(4003, "removed");
          }
        }
      }
    }
    if (h.ok) kotor(r);
    else kirim(s, { t: "galat", kode: h.galat });
  };

  // ---------- connections ----------

  const sambungkan = (r: Ruang, s: Sambungan): void => {
    r.sambungan.add(s);
    if (s.asisten) {
      const hostMasihAda =
        r.hostNim !== null && [...r.sambungan].some((x) => x.asisten && x.nim === r.hostNim);
      if (!hostMasihAda) {
        r.hostNim = s.nim;
        r.hostNama = s.nama;
      }
    } else {
      const h = r.engine.gabung({ nim: s.nim, nama: s.nama, kelompok: s.kelompok });
      if (!h.ok) {
        kirim(s, { t: "galat", kode: h.galat });
        s.ws.close(1008, h.galat);
        r.sambungan.delete(s);
        return;
      }
    }
    kirim(s, { t: "jam", waktu: now() });
    for (const x of r.sambungan) if (x.asisten) kirimAku(r, x);
    kirimAku(r, s);
    kirimLihat(r, s, true);
    kotor(r);

    s.ws.on("message", (data: RawData, biner: boolean) => {
      if (biner) return;
      const teks = Array.isArray(data) ? Buffer.concat(data).toString("utf8") : data.toString();
      if (teks.length > MAKS_PESAN) return;
      tangani(r, s, teks);
    });
    s.ws.on("pong", () => {
      s.hidup = true;
    });
    s.ws.on("close", () => {
      r.sambungan.delete(s);
      if (!s.asisten && ![...r.sambungan].some((x) => !x.asisten && x.nim === s.nim)) {
        r.engine.putus(s.nim);
      }
      // A host who left hands the lead to the next Asisten still here.
      if (
        s.asisten &&
        r.hostNim === s.nim &&
        ![...r.sambungan].some((x) => x.asisten && x.nim === s.nim)
      ) {
        const lain = [...r.sambungan].find((x) => x.asisten);
        if (lain) {
          r.hostNim = lain.nim;
          r.hostNama = lain.nama;
          for (const x of r.sambungan) if (x.asisten) kirimAku(r, x);
        }
      }
      kotor(r);
    });
    s.ws.on("error", () => s.ws.terminate());
  };

  const naik = async (req: http.IncomingMessage, socket: Duplex, head: Buffer): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://iris.local");
    if (url.pathname !== JALUR_WS) return tolak(socket, 404, "Not Found");
    const host = req.headers.host;
    if (!hostKuis(host)) return tolak(socket, 404, "Not Found");
    const origin = req.headers.origin;
    if (origin ? !asalSama(origin, host) : !opsi.izinTanpaOrigin)
      return tolak(socket, 403, "Forbidden");

    const sesiOrang = ctx.bacaCookie(bacaCookieHeader(req.headers.cookie, "iris_session"));
    if (!sesiOrang) return tolak(socket, 401, "Unauthorized");
    const sesi = await sesiKini();
    if (!sesi || sesi.modul !== 4) return tolak(socket, 403, "Forbidden");
    const asisten = sesiOrang.role === "asisten";
    if (!asisten && (sesiOrang.lihat || sesiOrang.sesiId !== sesi.id))
      return tolak(socket, 403, "Forbidden");

    const r = await ambilRuang(sesi);
    const b = url.searchParams.get("b");
    const bahasa = bahasaKonten(isLang(b) ? b : langForKelas(sesi.kelas));
    wss.handleUpgrade(req, socket, head, (ws) => {
      sambungkan(r, {
        ws,
        nim: sesiOrang.nim,
        nama: sesiOrang.nama,
        asisten,
        kelompok: asisten ? null : (sesiOrang.kelompokNomor ?? null),
        bahasa,
        terakhir: "",
        hidup: true,
        jendela: 0,
        hitung: 0,
      });
    });
  };

  server.on("upgrade", (req, socket, head) => {
    naik(req, socket, head).catch((err) => {
      console.error("[kuis] upgrade failed:", err);
      tolak(socket, 500, "Internal Server Error");
    });
  });

  // ---------- timers ----------

  const tick = setInterval(() => {
    for (const r of ruang.values()) if (r.engine.tick()) kotor(r);
  }, opsi.jedaTickMs ?? 250);

  // A room belongs to the session that is running; when it ends, so does the game.
  const periksaSesi = setInterval(() => {
    sesiCache = null;
    void sesiKini().then((sesi) => {
      for (const r of [...ruang.values()]) {
        if (!sesi || sesi.modul !== 4 || sesi.id !== r.sesiId) tutupRuang(r, 4001, "session ended");
      }
    });
  }, opsi.jedaSesiMs ?? 15_000);

  const ping = setInterval(() => {
    for (const r of ruang.values()) {
      for (const s of r.sambungan) {
        if (!s.hidup) {
          s.ws.terminate();
          continue;
        }
        s.hidup = false;
        s.ws.ping();
      }
    }
  }, opsi.jedaPingMs ?? 25_000);

  for (const t of [tick, periksaSesi, ping]) t.unref();

  return {
    ruang,
    async tutup() {
      clearInterval(tick);
      clearInterval(periksaSesi);
      clearInterval(ping);
      // One last save, so a restart keeps the game.
      await Promise.all([...ruang.values()].map((r) => simpanRuang(r)));
      for (const r of [...ruang.values()]) tutupRuang(r, 1001, "server restarting");
      wss.close();
    },
  };
}
