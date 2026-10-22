/**
 * The console's data layer: one poll per source, shared by every view.
 *
 * - /api/session/current   running session + master roster   20 s
 * - /api/session/laporan   groups, stuck list, hands, owners   6 s
 * - /api/session/assignment  assistants + the slot's schedule 15 s
 * - /api/server (+ detail when there is exactly one Pi)        12 s, 4 s while the drawer is open
 * - /api/session/nilai     scores, live: a full load, then ?sejak= deltas every 5 s
 *
 * Scores are saved optimistically per field; a refusal (bukan_pemilik, a
 * bad value) rolls the field back and says why.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePoll } from "../../lib/hooks";
import { getJson, postJson } from "../../lib/app";
import type {
  Laporan,
  NilaiData,
  Penugasan,
  RosterGroup,
  ServerDetail,
  ServerRow,
  SesiRunning,
} from "./types";
import type { SaveState } from "../ui/Controls";
import { dengar, useBatas, useSiaran } from "../../lib/siaran";
import { useAliran, useCadangan } from "../../lib/aliran-ruang";
import { denganDenyut, useDenyutLangsung } from "../server/data";
import { akhirSesiPada } from "../../lib/jadwal";
import { l1Tampil, skorSah } from "../../lib/nilai-rubrik";

/** Off until the viewer is known to be an Asisten (a guest sees the gate). */
export function useCurrent(enabled = true) {
  const poll = usePoll(
    () =>
      getJson<{ ok: boolean; sesi: SesiRunning | null; roster: RosterGroup[] }>(
        "/api/session/current",
      ),
    60_000,
    enabled,
    ["sesi", "roster", "jadwal"],
  );
  const s = poll.data?.sesi;
  useBatas(s ? akhirSesiPada(s) : null, ["sesi", "jadwal", "laporan"]);
  return poll;
}

export function useLaporan(enabled: boolean, sesiId: number | null = null) {
  const poll = usePoll(() => getJson<Laporan>("/api/session/laporan"), 60_000, enabled, [
    "sesi",
    "nilai",
    "roster",
    "tangkapan",
  ]);
  // The telemetry counts follow the readings in the session room, asked
  // again at most every 15 s while they flow (each ask reads the session's
  // whole telemetry log), and every 15 s while the room is down.
  const terakhir = useRef(0);
  const tunda = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef(poll.refresh);
  refreshRef.current = poll.refresh;
  const status = useAliran(
    { ruang: "sesi", sesiId, aktif: enabled && sesiId !== null },
    ["tel", "jawaban"],
    (m) => {
      // A checked blank lands in its group's row; asking again would read the
      // session's whole telemetry log for one cell.
      if (m.j === "jawaban") return poll.ubah((x) => denganJawaban(x, m.d));
      if (tunda.current) return;
      const sisa = Math.max(0, terakhir.current + TEL_JARAK - Date.now());
      tunda.current = setTimeout(() => {
        tunda.current = null;
        terakhir.current = Date.now();
        refreshRef.current();
      }, sisa);
    },
  );
  useEffect(
    () => () => {
      if (tunda.current) clearTimeout(tunda.current);
    },
    [],
  );
  useCadangan(poll.refresh, TEL_JARAK, enabled && sesiId !== null && status !== "live");
  useSiaran(["jawaban"], poll.refresh, enabled && status !== "live");
  return poll;
}

/** A run report with one checked blank applied to its group's row */
function denganJawaban(x: Laporan, d: unknown): Laporan {
  const j = d as {
    kelompokId?: number;
    soal?: string;
    benar?: boolean;
    percobaan?: number;
    pada?: string;
  } | null;
  if (!j?.kelompokId || !j.soal) return x;
  return {
    ...x,
    kelompok: x.kelompok.map((g) => {
      if (g.id !== j.kelompokId) return g;
      const rinci = [...(g.blankRinci ?? [])];
      const i = rinci.findIndex((r) => r.soalKode === j.soal);
      const baru = {
        soalKode: j.soal!,
        benar: !!j.benar,
        percobaan: j.percobaan ?? (i >= 0 ? rinci[i].percobaan + 1 : 1),
        diubahPada: j.pada ?? new Date().toISOString(),
      };
      if (i >= 0) rinci[i] = baru;
      else rinci.push(baru);
      return { ...g, blankRinci: rinci, benar: rinci.filter((r) => r.benar).length };
    }),
  };
}

/** The run report's telemetry counts are asked again at most this often */
const TEL_JARAK = 15_000;

export function useAssignment(sesiId: number | null) {
  const poll = usePoll(
    () =>
      getJson<{ ok: boolean } & Penugasan>(`/api/session/assignment?sesiId=${sesiId}`).then((d) =>
        d.ok ? d : null,
      ),
    60_000,
    sesiId !== null,
    ["jadwal", "tim", "sesi"],
    0,
    sesiId,
  );
  return poll;
}

export interface ServerState {
  list: ServerRow[];
  detail: ServerDetail | null;
}

/** `langsung`: also take each beat as it lands (Ada Masalah? or the Pi
 *  drawer open); otherwise the 60 s refetch keeps the Pi's state, inside its
 *  75 s silence limit, so a quiet Konsol costs the relay nothing per beat */
export function useServers(enabled: boolean, langsung = false) {
  const poll = usePoll<ServerState>(
    async () => {
      const d = await getJson<{ ok: boolean; server: ServerRow[] }>("/api/server");
      const list = d.ok ? d.server : [];
      let detail: ServerDetail | null = null;
      if (list.length === 1) {
        const x = await getJson<{ ok: boolean } & ServerDetail>(`/api/server/${list[0].id}`);
        if (x.ok) detail = x;
      }
      return { list, detail };
    },
    60_000,
    enabled,
    ["server"],
  );
  // The beats land as they come (Ada Masalah?, the Pi drawer), Phase 12.
  useDenyutLangsung(
    enabled && langsung,
    (d) =>
      poll.ubah((x) => ({
        list: x.list.map((r) => denganDenyut(r, d)),
        detail:
          x.detail && x.detail.server.id === d.serverId
            ? { ...x.detail, denyutTerakhir: d.denyut, server: denganDenyut(x.detail.server, d) }
            : x.detail,
      })),
    poll.refresh,
  );
  return poll;
}

/* ------------------------------------------------------------ live scores */

export type SaveResult = "ok" | "range" | "owner" | "fail" | "same";

export interface NilaiLive {
  data: NilaiData | null;
  states: Record<string, SaveState>;
  /** Keys ("nim.komponen") another assistant just changed, for a flash. */
  flash: Record<string, boolean>;
  save: (nim: string, komponen: string, raw: string) => Promise<SaveResult>;
  /** The same field for several Praktikan at once (Sama Rata). */
  saveMany: (nims: string[], komponen: string, raw: string) => Promise<SaveResult>;
  /** Tidak Hadir: every field 0 (on), or the zeros removed (off). */
  setAbsen: (nim: string, on: boolean) => Promise<"ok" | "owner" | "fail">;
  /** Kirim Nilai for a complete group; `kurang` is the empty fields left,
   *  `seelabs` whether the robot took the SeeLabs save (Phase 14). */
  kirim: (kelompokId: number) => Promise<{
    r: "ok" | "owner" | "incomplete" | "akun" | "fail";
    kurang?: number;
    /** For "akun": why the group's SeeLabs account can't take the send. */
    alasan?: string;
    seelabs?: { antre: boolean; alasan?: string } | null;
  }>;
  /** The session these scores belong to. */
  sesiId: number | null;
  reload: () => void;
  updatedAt: number | null;
  errors: number;
}

type Berubah = {
  nim: string;
  komponen: string;
  skor: number;
  diubahOleh: string | null;
  diubahPada: string;
};

type Anggota = NilaiData["kelompok"][number]["anggota"][number];

/** The L1 a member shows: a stored one, else 0 when Tidak Hadir, else the group's. */
export function l1Anggota(a: Pick<Anggota, "skor" | "absen">, l1Kelompok: number): number {
  return l1Tampil(a.skor.L1, a.absen, l1Kelompok);
}

/** Does the member's L1 show the system's value (none typed, or the one
 *  Kirim Nilai stored)? A Tidak Hadir member's 0 is not. */
export function l1DariSistem(a: Pick<Anggota, "skor" | "absen" | "l1Sistem">): boolean {
  return !a.absen && (a.skor.L1 == null || a.l1Sistem === true);
}

/** A student's total and completeness from their fields (L1 as shown). */
function hitung(a: Anggota, komponen: string[], skor: Anggota["skor"], l1: number): Anggota {
  const tampil: Anggota["skor"] = { ...skor, L1: l1Anggota({ skor, absen: a.absen }, l1) };
  const vals = komponen.map((c) => tampil[c]).filter((v) => v != null) as number[];
  return {
    ...a,
    skor,
    total: vals.reduce((x, y) => x + y, 0),
    lengkap: vals.length === komponen.length,
  };
}

export function useNilaiLive(
  sesiId: number | null,
  meNim: string | undefined,
  onRemote?: (rows: Berubah[]) => void,
): NilaiLive {
  const [data, setData] = useState<NilaiData | null>(null);
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [errors, setErrors] = useState(0);
  const serverTs = useRef<string | null>(null);
  const remoteRef = useRef(onRemote);
  remoteRef.current = onRemote;
  const dataRef = useRef<NilaiData | null>(null);
  dataRef.current = data;

  const load = useCallback(async () => {
    if (sesiId === null) return;
    try {
      const d = await getJson<{ ok: boolean; server: string } & NilaiData>(
        `/api/session/nilai?sesiId=${sesiId}`,
      );
      if (!d.ok) return;
      serverTs.current = d.server;
      setData({
        komponen: d.komponen,
        kelompok: d.kelompok,
        pemilik: d.pemilik ?? {},
        terkirim: d.terkirim ?? {},
        tpDari: d.tpDari ?? [],
        bolehAlih: d.bolehAlih ?? false,
      });
      setUpdatedAt(Date.now());
      setErrors(0);
    } catch {
      setErrors((e) => e + 1);
    }
  }, [sesiId]);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setData(null);
    serverTs.current = null;
    void load();
  }, [load]);

  // Deltas whenever a score changes anywhere (and on the 60 s safety net).
  useEffect(() => {
    if (sesiId === null) return;
    const tick = async () => {
      if (!serverTs.current) return;
      try {
        const d = await getJson<{
          ok: boolean;
          berubah: Berubah[];
          pemilik: Record<string, string>;
          absen?: string[];
          terkirim?: NilaiData["terkirim"];
          l1?: Record<string, number>;
          server: string;
        }>(`/api/session/nilai?sesiId=${sesiId}&sejak=${encodeURIComponent(serverTs.current)}`);
        if (!d.ok) return;
        // Someone marked or unmarked Tidak Hadir: unmarking deletes zeros,
        // which a delta cannot carry, so load the whole session again.
        if (d.absen) {
          const now = dataRef.current?.kelompok
            .flatMap((g) => g.anggota)
            .filter((a) => a.absen)
            .map((a) => a.nim)
            .sort()
            .join(",");
          if (now !== undefined && now !== [...d.absen].sort().join(",")) {
            void loadRef.current();
            return;
          }
        }
        serverTs.current = d.server;
        setUpdatedAt(Date.now());
        setErrors(0);
        // Only rows another assistant changed to a new value flash; the
        // boundary row of the previous poll comes back and is ignored.
        const skorNow = (nim: string, k: string) =>
          dataRef.current?.kelompok.flatMap((g) => g.anggota).find((a) => a.nim === nim)?.skor[k];
        const remote = d.berubah.filter(
          (r) => r.diubahOleh !== meNim && skorNow(r.nim, r.komponen) !== r.skor,
        );
        setData((prev) => {
          if (!prev) return prev;
          const byNim = new Map(d.berubah.map((r) => [`${r.nim}.${r.komponen}`, r]));
          return {
            ...prev,
            pemilik: d.pemilik ?? prev.pemilik,
            terkirim: d.terkirim ?? prev.terkirim,
            kelompok: prev.kelompok.map((k) => {
              // Blanks move without a score changing, so the group's
              // automatic L1 comes with every poll.
              const l1 = d.l1?.[String(k.nomor)] ?? 0;
              const l1Beda = d.l1 !== undefined && l1 !== k.l1;
              return {
                ...k,
                l1: d.l1 ? l1 : k.l1,
                anggota: k.anggota.map((a) => {
                  let changed = l1Beda;
                  const skor = { ...a.skor };
                  for (const c of prev.komponen) {
                    const r = byNim.get(`${a.nim}.${c}`);
                    if (r && skor[c] !== r.skor) {
                      skor[c] = r.skor;
                      changed = true;
                    }
                  }
                  const n = changed ? hitung(a, prev.komponen, skor, d.l1 ? l1 : k.l1) : a;
                  // Who wrote L1 last decides whether it is the system's.
                  const r1 = byNim.get(`${a.nim}.L1`);
                  const sistem = r1 ? r1.diubahOleh === "otomatis" : !!a.l1Sistem;
                  return sistem === !!a.l1Sistem ? n : { ...n, l1Sistem: sistem };
                }),
              };
            }),
          };
        });
        if (remote.length) {
          const keys = Object.fromEntries(remote.map((r) => [`${r.nim}.${r.komponen}`, true]));
          setFlash((f) => ({ ...f, ...keys }));
          setTimeout(
            () =>
              setFlash((f) => {
                const n = { ...f };
                for (const k of Object.keys(keys)) delete n[k];
                return n;
              }),
            1600,
          );
          remoteRef.current?.(remote);
        }
      } catch {
        setErrors((e) => e + 1);
      }
    };
    // Another Asisten's score lands at once.
    return dengar(["nilai"], () => void tick());
  }, [sesiId, meNim]);

  /** Changes some students locally; `ubah` gets a copy of each one's fields. */
  function applyLocal(
    nims: string[],
    ubah: (skor: Anggota["skor"], a: Anggota) => void,
    absen?: boolean,
  ) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            kelompok: prev.kelompok.map((k) => ({
              ...k,
              anggota: k.anggota.map((a) => {
                if (!nims.includes(a.nim)) return a;
                const s = { ...a.skor };
                ubah(s, a);
                const h = hitung({ ...a, absen: absen ?? a.absen }, prev.komponen, s, k.l1);
                // An L1 changed here is no longer the system's stored one.
                const n = s.L1 === a.skor.L1 ? h : { ...h, l1Sistem: false };
                return absen === undefined ? n : { ...n, absen };
              }),
            })),
          }
        : prev,
    );
  }

  const nilaiDari = (nim: string, komponen: string) =>
    dataRef.current?.kelompok.flatMap((k) => k.anggota).find((a) => a.nim === nim)?.skor[komponen];

  /** Takes the typed L1 away from these Praktikan (the server deletes it). */
  const hapusL1 = async (target: string[]): Promise<SaveResult> => {
    const keys = target.map((nim) => `${nim}.L1`);
    const mark = (st: SaveState) =>
      setStates((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, st])) }));
    const prev = new Map(target.map((nim) => [nim, nilaiDari(nim, "L1")]));
    applyLocal(target, (s) => {
      delete s.L1;
    });
    mark("saving");
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/nilai", {
        sesiId,
        nims: target,
        komponen: "L1",
        hapus: true,
      });
      if (!r.ok) {
        applyLocal(target, (s, a) => {
          const v = prev.get(a.nim);
          if (v !== undefined) s.L1 = v;
        });
        mark("error");
        return r.kode === "bukan_pemilik" ? "owner" : "fail";
      }
      mark("saved");
      setTimeout(
        () =>
          setStates((s) => {
            const n = { ...s };
            for (const k of keys) if (n[k] === "saved") n[k] = "idle";
            return n;
          }),
        1800,
      );
      return "ok";
    } catch {
      applyLocal(target, (s, a) => {
        const v = prev.get(a.nim);
        if (v !== undefined) s.L1 = v;
      });
      mark("error");
      return "fail";
    }
  };

  const saveMany: NilaiLive["saveMany"] = async (nims, komponen, raw) => {
    // Clearing L1 takes the typed value away; the automatic one shows again.
    if (raw === "" && komponen === "L1") {
      const target = nims.filter((nim) => nilaiDari(nim, komponen) !== undefined);
      if (target.length === 0) return "same";
      return hapusL1(target);
    }
    if (raw === "") return "same";
    const skor = Number(raw);
    const keys = nims.map((nim) => `${nim}.${komponen}`);
    const mark = (st: SaveState) =>
      setStates((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, st])) }));
    if (!skorSah(komponen, skor)) {
      mark("error");
      return "range";
    }
    const prev = new Map(nims.map((nim) => [nim, nilaiDari(nim, komponen)]));
    const target = nims.filter((nim) => prev.get(nim) !== skor);
    if (target.length === 0) return "same";
    const undo = () =>
      applyLocal(target, (s, a) => {
        const v = prev.get(a.nim);
        if (v === undefined) delete s[komponen];
        else s[komponen] = v;
      });
    applyLocal(target, (s) => {
      s[komponen] = skor;
    });
    mark("saving");
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>(
        "/api/session/nilai",
        target.length === 1
          ? { sesiId, nim: target[0], komponen, skor }
          : { sesiId, nims: target, komponen, skor },
      );
      if (!r.ok) {
        undo();
        mark("error");
        return r.kode === "bukan_pemilik" ? "owner" : "fail";
      }
      mark("saved");
      setTimeout(
        () =>
          setStates((s) => {
            const n = { ...s };
            for (const k of keys) if (n[k] === "saved") n[k] = "idle";
            return n;
          }),
        1800,
      );
      return "ok";
    } catch {
      undo();
      mark("error");
      return "fail";
    }
  };

  const save: NilaiLive["save"] = (nim, komponen, raw) => saveMany([nim], komponen, raw);

  const setAbsen: NilaiLive["setAbsen"] = async (nim, on) => {
    const sebelum = dataRef.current?.kelompok.flatMap((k) => k.anggota).find((a) => a.nim === nim);
    const komponen = dataRef.current?.komponen ?? [];
    applyLocal(
      [nim],
      (s) => {
        for (const c of komponen) {
          // TP stays through Tidak Hadir, as on the server.
          if (c === "TP") {
            if (on && s[c] === undefined) s[c] = 0;
          } else if (on) s[c] = 0;
          else if (s[c] === 0) delete s[c];
        }
      },
      on,
    );
    const undo = () =>
      sebelum &&
      applyLocal(
        [nim],
        (s) => {
          for (const c of komponen) delete s[c];
          Object.assign(s, sebelum.skor);
        },
        sebelum.absen,
      );
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/nilai", {
        sesiId,
        nim,
        absen: on,
      });
      if (!r.ok) {
        undo();
        return r.kode === "bukan_pemilik" ? "owner" : "fail";
      }
      return "ok";
    } catch {
      undo();
      return "fail";
    }
  };

  const kirim: NilaiLive["kirim"] = async (kelompokId) => {
    try {
      const r = await postJson<{
        ok: boolean;
        kode?: string;
        kurang?: number;
        alasan?: string;
        seelabs?: { antre: boolean; alasan?: string } | null;
      }>("/api/session/nilai", { sesiId, kelompokId, kirim: true });
      if (r.ok) {
        const nomor = dataRef.current?.kelompok.find((k) => k.id === kelompokId)?.nomor;
        if (nomor !== undefined)
          setData((prev) =>
            prev && !prev.terkirim[nomor]
              ? {
                  ...prev,
                  terkirim: {
                    ...prev.terkirim,
                    [nomor]: { pada: new Date().toISOString(), oleh: meNim ?? "" },
                  },
                }
              : prev,
          );
        return { r: "ok", seelabs: r.seelabs ?? null };
      }
      if (r.kode === "belum_lengkap") return { r: "incomplete", kurang: r.kurang };
      if (r.kode === "akun_seelabs") return { r: "akun", alasan: r.alasan };
      return { r: r.kode === "bukan_pemilik" ? "owner" : "fail" };
    } catch {
      return { r: "fail" };
    }
  };

  return {
    data,
    states,
    flash,
    save,
    saveMany,
    setAbsen,
    kirim,
    sesiId,
    reload: () => void load(),
    updatedAt,
    errors,
  };
}
