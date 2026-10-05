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
import { dengar } from "../../lib/siaran";

/** Off until the viewer is known to be an Asisten (a guest sees the gate). */
export function useCurrent(enabled = true) {
  return usePoll(
    () =>
      getJson<{ ok: boolean; sesi: SesiRunning | null; roster: RosterGroup[] }>(
        "/api/session/current",
      ),
    20_000,
    enabled,
    ["sesi", "roster", "jadwal"],
  );
}

export function useLaporan(enabled: boolean) {
  return usePoll(() => getJson<Laporan>("/api/session/laporan"), 6_000, enabled, [
    "sesi",
    "nilai",
    "roster",
  ]);
}

export function useAssignment(sesiId: number | null) {
  const poll = usePoll(
    () =>
      getJson<{ ok: boolean } & Penugasan>(`/api/session/assignment?sesiId=${sesiId}`).then((d) =>
        d.ok ? d : null,
      ),
    15_000,
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

export function useServers(enabled: boolean, fast: boolean) {
  return usePoll<ServerState>(
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
    fast ? 4_000 : 12_000,
    enabled,
    ["server"],
  );
}

/* ------------------------------------------------------------ live scores */

export interface NilaiLive {
  data: NilaiData | null;
  states: Record<string, SaveState>;
  /** Keys ("nim.komponen") another assistant just changed, for a flash. */
  flash: Record<string, boolean>;
  save: (
    nim: string,
    komponen: string,
    raw: string,
  ) => Promise<"ok" | "range" | "owner" | "fail" | "same">;
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
      setData({ komponen: d.komponen, kelompok: d.kelompok, pemilik: d.pemilik ?? {} });
      setUpdatedAt(Date.now());
      setErrors(0);
    } catch {
      setErrors((e) => e + 1);
    }
  }, [sesiId]);

  useEffect(() => {
    setData(null);
    serverTs.current = null;
    void load();
  }, [load]);

  // Deltas every 5 s while visible.
  useEffect(() => {
    if (sesiId === null) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      if (!serverTs.current) return;
      try {
        const d = await getJson<{
          ok: boolean;
          berubah: Berubah[];
          pemilik: Record<string, string>;
          server: string;
        }>(`/api/session/nilai?sesiId=${sesiId}&sejak=${encodeURIComponent(serverTs.current)}`);
        if (!d.ok) return;
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
                if (!changed) return a;
                const vals = prev.komponen.map((c) => skor[c]).filter((v) => v != null) as number[];
                return {
                  ...a,
                  skor,
                  total: vals.reduce((x, y) => x + y, 0),
                  lengkap: vals.length === prev.komponen.length,
                };
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
    const start = () => {
      if (timer === null) timer = setInterval(() => void tick(), 5_000);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    // Another Asisten's score lands at once rather than on the next tick.
    const lepas = dengar(["nilai"], () => void tick());
    return () => {
      stop();
      lepas();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [sesiId, meNim]);

  function applyLocal(nim: string, komponen: string, skor: number | undefined) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            kelompok: prev.kelompok.map((k) => ({
              ...k,
              anggota: k.anggota.map((a) => {
                if (a.nim !== nim) return a;
                const s = { ...a.skor };
                if (skor === undefined) delete s[komponen];
                else s[komponen] = skor;
                const vals = prev.komponen.map((c) => s[c]).filter((v) => v != null) as number[];
                return {
                  ...a,
                  skor: s,
                  total: vals.reduce((x, y) => x + y, 0),
                  lengkap: vals.length === prev.komponen.length,
                };
              }),
            })),
          }
        : prev,
    );
  }

  const save: NilaiLive["save"] = async (nim, komponen, raw) => {
    const key = `${nim}.${komponen}`;
    const prevVal = data?.kelompok.flatMap((k) => k.anggota).find((a) => a.nim === nim)?.skor[
      komponen
    ];
    if (raw === "") return "same";
    const skor = Number(raw);
    if (!Number.isInteger(skor) || skor < 0 || skor > 100) {
      setStates((s) => ({ ...s, [key]: "error" }));
      return "range";
    }
    if (prevVal === skor) return "same";
    applyLocal(nim, komponen, skor);
    setStates((s) => ({ ...s, [key]: "saving" }));
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/nilai", {
        sesiId,
        nim,
        komponen,
        skor,
      });
      if (!r.ok) {
        applyLocal(nim, komponen, prevVal);
        setStates((s) => ({ ...s, [key]: "error" }));
        return r.kode === "bukan_pemilik" ? "owner" : "fail";
      }
      setStates((s) => ({ ...s, [key]: "saved" }));
      setTimeout(() => setStates((s) => (s[key] === "saved" ? { ...s, [key]: "idle" } : s)), 1800);
      return "ok";
    } catch {
      applyLocal(nim, komponen, prevVal);
      setStates((s) => ({ ...s, [key]: "error" }));
      return "fail";
    }
  };

  return { data, states, flash, save, reload: () => void load(), updatedAt, errors };
}
