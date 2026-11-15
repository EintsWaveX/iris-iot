/**
 * What the supervisor keeps for the workers (real-time upgrade, Phase 3). It holds no sockets and answers no
 * requests; it is the one place where four things are decided, so several workers behave like one server:
 *
 *  - the ORDER of live-update messages: a worker that publishes topics sends them here, they get the next
 *    number, and every worker (the sender too) applies them in that order, with the same epoch. A page that
 *    reconnects to a different worker, or after a deploy, still asks "since 4711" and is told only what it missed;
 *  - the ROSTER of the rooms: who is connected where, on every worker, so presence ("Panitia online", "2 are
 *    looking at your group") counts everybody, not just the sockets on one worker;
 *  - TICKETS used once: a ticket works on one worker, once, not once per worker;
 *  - the LEADER: one worker at a time runs the jobs that must exist once (the lab clock, the quiz game, the QR
 *    sheet watch). The newest generation of ready workers leads, so a deploy moves the duties to new code at
 *    the first new worker, handing over (old leader stops and saves, then the new one starts) instead of two at once.
 *
 * It is plain logic over `TitikPekerja` handles (a function that sends one message), so tests drive it with
 * fakes; `server/supervisor.ts` wires the real workers in.
 */
import { randomBytes } from "node:crypto";
import type { BarisHadir, Cincin, DariPekerja, DariUtama } from "./protokol.js";

export interface TitikPekerja {
  id: number;
  /** Which roll-out of the code this worker is (a deploy raises it). */
  gen: number;
  kirim(m: DariUtama): void;
}

export interface OpsiUtama {
  now?: () => number;
  epoch?: string;
  /** Messages remembered for pages that reconnect (default 256). */
  cincinMaks?: number;
  /** How long the old leader gets to put its duties down before the hand-over goes ahead (default 20 s). */
  lepasMs?: number;
  /** How long a question to all workers waits for the slow ones (default 1 s). */
  jawabMs?: number;
}

interface Catatan {
  t: TitikPekerja;
  /** Has been told the state, so it hears everything from here on. */
  selaras: boolean;
  siap: boolean;
  port: number | null;
  /** Being replaced: not a candidate for leader, takes no new duties. */
  pensiun: boolean;
}

interface Tanya {
  asal: number;
  /** The asker's own number for the question. */
  rAsal: number;
  tunggu: Set<number>;
  data: unknown[];
  timer: ReturnType<typeof setTimeout>;
}

export interface Utama {
  daftar(t: TitikPekerja): void;
  terima(id: number, m: DariPekerja): void;
  /** The worker's process is gone. */
  pergi(id: number): void;
  /** The worker is about to be replaced; resolves once it no longer leads. */
  pensiunkan(id: number): Promise<void>;
  pemimpin(): number | null;
  status(): {
    n: number;
    epoch: string;
    pemimpin: number | null;
    pekerja: Array<{ id: number; gen: number; siap: boolean; pensiun: boolean }>;
    hadir: number;
  };
  /** For shutdown: cancels the timers. */
  hentikan(): void;
}

export function buatUtama(opsi: OpsiUtama = {}): Utama {
  const now = opsi.now ?? Date.now;
  const epoch = opsi.epoch ?? randomBytes(4).toString("hex");
  const cincinMaks = opsi.cincinMaks ?? 256;
  const lepasMs = opsi.lepasMs ?? 20_000;
  const jawabMs = opsi.jawabMs ?? 1000;

  let nomor = 0;
  const cincin: Cincin[] = [];
  const pekerja = new Map<number, Catatan>();
  const hadir = new Map<string, BarisHadir>();
  const pernah = new Map<string, number>();
  const nilaiBersama = new Map<string, { nilai: unknown; sampai: number }>();
  const tanyaan = new Map<number, Tanya>();
  let tanyaNo = 0;
  let pemimpinId: number | null = null;
  let melepas: { id: number; timer: ReturnType<typeof setTimeout> } | null = null;
  let menunggu: Array<{ id: number; selesai: () => void }> = [];

  const kunciHadir = (w: number, ruang: string, id: number) => `${w}|${ruang}|${id}`;

  /** To every worker that has been told the state, except `kecuali`. */
  function sebar(m: DariUtama, kecuali?: number) {
    for (const c of pekerja.values()) {
      if (c.selaras && c.t.id !== kecuali) c.t.kirim(m);
    }
  }

  function umumkanPemimpin() {
    const c = pemimpinId === null ? null : pekerja.get(pemimpinId);
    sebar({ i: "pemimpin", id: c ? c.t.id : null, port: c ? c.port : null });
  }

  /** The ready, not retiring worker that should lead: the newest generation, then the lowest number. */
  function calonPemimpin(): Catatan | null {
    let terbaik: Catatan | null = null;
    for (const c of pekerja.values()) {
      if (!c.siap || c.pensiun) continue;
      if (
        !terbaik ||
        c.t.gen > terbaik.t.gen ||
        (c.t.gen === terbaik.t.gen && c.t.id < terbaik.t.id)
      )
        terbaik = c;
    }
    return terbaik;
  }

  function lepasMenunggu() {
    const sisa: typeof menunggu = [];
    for (const w of menunggu) {
      if (pemimpinId === w.id || melepas?.id === w.id) sisa.push(w);
      else w.selesai();
    }
    menunggu = sisa;
  }

  function selesaiLepas() {
    if (!melepas) return;
    clearTimeout(melepas.timer);
    melepas = null;
    pemimpinId = null;
    umumkanPemimpin();
    rapikan();
  }

  function rapikan() {
    if (melepas) return;
    if (pemimpinId !== null && !pekerja.has(pemimpinId)) pemimpinId = null;
    const calon = calonPemimpin();
    if (pemimpinId !== null) {
      const lama = pekerja.get(pemimpinId);
      if (!lama) return;
      // Nobody better to hand over to (a lone worker being replaced keeps leading until it stops), and a
      // worker of the same generation does not take over: leadership moves only to newer code.
      const layak = lama.siap && !lama.pensiun;
      if (!calon || calon.t.id === pemimpinId || (layak && calon.t.gen <= lama.t.gen))
        return lepasMenunggu();
      const id = pemimpinId;
      const timer = setTimeout(selesaiLepas, lepasMs);
      timer.unref?.();
      melepas = { id, timer };
      lama.t.kirim({ i: "lepas" });
      return;
    }
    if (calon) {
      pemimpinId = calon.t.id;
      calon.t.kirim({ i: "pimpin" });
      umumkanPemimpin();
    }
    lepasMenunggu();
  }

  function pangkas(kini: number) {
    for (const [k, exp] of pernah) if (exp < kini) pernah.delete(k);
  }

  function selesaiTanya(q: number) {
    const t = tanyaan.get(q);
    if (!t) return;
    clearTimeout(t.timer);
    tanyaan.delete(q);
    const c = pekerja.get(t.asal);
    c?.t.kirim({ i: "hasil", r: t.rAsal, data: t.data });
  }

  function terima(id: number, m: DariPekerja) {
    const c = pekerja.get(id);
    if (!c) return;
    switch (m.i) {
      case "halo": {
        const baris: BarisHadir[] = [];
        for (const b of hadir.values()) if (b[0] !== id) baris.push(b);
        const p = pemimpinId === null ? null : pekerja.get(pemimpinId);
        c.selaras = true;
        c.t.kirim({
          i: "sinkron",
          id,
          gen: c.t.gen,
          n: nomor,
          e: epoch,
          cincin: cincin.map((x) => ({ n: x.n, t: [...x.t] })),
          hadir: baris,
          kv: [...nilaiBersama]
            .filter(([, v]) => v.sampai > now())
            .map(([k, v]) => [k, v.nilai, v.sampai]),
          pemimpin: p && p.port !== null ? { id: p.t.id, port: p.port } : null,
        });
        return;
      }
      case "siap":
        c.siap = true;
        c.port = Number.isInteger(m.port) ? m.port : null;
        rapikan();
        return;
      case "siar": {
        const t = Array.isArray(m.t) ? m.t.filter((x): x is string => typeof x === "string") : [];
        if (!t.length) return;
        nomor++;
        cincin.push({ n: nomor, t });
        if (cincin.length > cincinMaks) cincin.shift();
        sebar({ i: "siar", n: nomor, e: epoch, t });
        return;
      }
      case "kirim":
        sebar({ i: "kirim", ruang: m.ruang, m: m.m }, id);
        return;
      case "tutup":
        sebar({ i: "tutup", ruang: m.ruang }, id);
        return;
      case "hadir": {
        const k = kunciHadir(id, m.ruang, m.id);
        if (m.info === null) hadir.delete(k);
        else hadir.set(k, [id, m.ruang, m.id, m.info]);
        sebar({ i: "hadir", w: id, ruang: m.ruang, id: m.id, info: m.info }, id);
        return;
      }
      case "batal":
        sebar({ i: "batal" }, id);
        return;
      case "sekali": {
        const kini = now();
        pangkas(kini);
        const ok = !pernah.has(m.kunci);
        if (ok) pernah.set(m.kunci, kini + Math.max(1000, Math.min(m.ttl, 3_600_000)));
        c.t.kirim({ i: "balas", r: m.r, ok });
        return;
      }
      case "taruh": {
        const kini = now();
        for (const [k, v] of nilaiBersama) if (v.sampai < kini) nilaiBersama.delete(k);
        if (m.sampai > kini && nilaiBersama.size < 5000) {
          nilaiBersama.set(m.kunci, { nilai: m.nilai, sampai: m.sampai });
          sebar({ i: "taruh", kunci: m.kunci, nilai: m.nilai, sampai: m.sampai }, id);
        }
        return;
      }
      case "pantau": {
        const p = pemimpinId === null ? null : pekerja.get(pemimpinId);
        if (p && p.t.id !== id) p.t.kirim({ i: "pantau", kunci: m.kunci, isi: m.isi });
        return;
      }
      case "lepas-ok":
        if (melepas?.id === id) selesaiLepas();
        return;
      case "tanya": {
        const q = ++tanyaNo;
        const tunggu = new Set<number>();
        for (const x of pekerja.values()) if (x.selaras) tunggu.add(x.t.id);
        const timer = setTimeout(() => selesaiTanya(q), jawabMs);
        timer.unref?.();
        tanyaan.set(q, { asal: id, rAsal: m.r, tunggu, data: [], timer });
        for (const x of pekerja.values())
          if (tunggu.has(x.t.id)) x.t.kirim({ i: "tanya", r: q, apa: m.apa });
        if (!tunggu.size) selesaiTanya(q);
        return;
      }
      case "jawab": {
        const t = tanyaan.get(m.r);
        if (!t || !t.tunggu.delete(id)) return;
        t.data.push(m.data);
        if (!t.tunggu.size) selesaiTanya(m.r);
        return;
      }
    }
  }

  return {
    daftar(t) {
      pekerja.set(t.id, { t, selaras: false, siap: false, port: null, pensiun: false });
    },
    terima,
    pergi(id) {
      if (!pekerja.delete(id)) return;
      for (const k of [...hadir.keys()]) if (hadir.get(k)![0] === id) hadir.delete(k);
      sebar({ i: "pergi", w: id });
      for (const [q, t] of [...tanyaan]) {
        t.tunggu.delete(id);
        if (t.asal === id) {
          clearTimeout(t.timer);
          tanyaan.delete(q);
        } else if (!t.tunggu.size) selesaiTanya(q);
      }
      if (melepas?.id === id) {
        selesaiLepas();
      } else {
        if (pemimpinId === id) {
          pemimpinId = null;
          umumkanPemimpin();
        }
        rapikan();
      }
      lepasMenunggu();
    },
    pensiunkan(id) {
      const c = pekerja.get(id);
      if (!c) return Promise.resolve();
      c.pensiun = true;
      return new Promise<void>((selesai) => {
        menunggu.push({ id, selesai });
        rapikan();
        lepasMenunggu();
      });
    },
    pemimpin: () => pemimpinId,
    status: () => ({
      n: nomor,
      epoch,
      pemimpin: pemimpinId,
      pekerja: [...pekerja.values()].map((c) => ({
        id: c.t.id,
        gen: c.t.gen,
        siap: c.siap,
        pensiun: c.pensiun,
      })),
      hadir: hadir.size,
    }),
    hentikan() {
      if (melepas) clearTimeout(melepas.timer);
      melepas = null;
      for (const t of tanyaan.values()) clearTimeout(t.timer);
      tanyaan.clear();
    },
  };
}
