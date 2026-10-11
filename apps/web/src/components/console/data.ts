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
  );
  const { refresh } = poll;
  useEffect(() => {
    if (sesiId !== null) refresh();
    // Re-run only when the session changes (refresh is stable).
  }, [sesiId]);
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
  /** Kirim Nilai for a complete group; `kurang` is the empty fields left. */
  kirim: (
    kelompokId: number,
  ) => Promise<{ r: "ok" | "owner" | "incomplete" | "fail"; kurang?: number }>;
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

/** A student's total and completeness from their fields. */
function hitung(a: Anggota, komponen: string[], skor: Anggota["skor"]): Anggota {
  const vals = komponen.map((c) => skor[c]).filter((v) => v != null) as number[];
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
            kelompok: prev.kelompok.map((k) => ({
              ...k,
              anggota: k.anggota.map((a) => {
                let changed = false;
                const skor = { ...a.skor };
                for (const c of prev.komponen) {
                  const r = byNim.get(`${a.nim}.${c}`);
                  if (r && skor[c] !== r.skor) {
                    skor[c] = r.skor;
                    changed = true;
                  }
                }
                return changed ? hitung(a, prev.komponen, skor) : a;
              }),
            })),
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
                const n = hitung(a, prev.komponen, s);
                return absen === undefined ? n : { ...n, absen };
              }),
            })),
          }
        : prev,
    );
  }

  const nilaiDari = (nim: string, komponen: string) =>
    dataRef.current?.kelompok.flatMap((k) => k.anggota).find((a) => a.nim === nim)?.skor[komponen];

  const saveMany: NilaiLive["saveMany"] = async (nims, komponen, raw) => {
    if (raw === "") return "same";
    const skor = Number(raw);
    const keys = nims.map((nim) => `${nim}.${komponen}`);
    const mark = (st: SaveState) =>
      setStates((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, st])) }));
    if (!Number.isInteger(skor) || skor < 0 || skor > 100) {
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
          if (on) s[c] = 0;
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
      const r = await postJson<{ ok: boolean; kode?: string; kurang?: number }>(
        "/api/session/nilai",
        { sesiId, kelompokId, kirim: true },
      );
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
        return { r: "ok" };
      }
      if (r.kode === "belum_lengkap") return { r: "incomplete", kurang: r.kurang };
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
    reload: () => void load(),
    updatedAt,
    errors,
  };
}
