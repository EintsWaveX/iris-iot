/**
 * People in the interface (Phase 9): an Asisten is written "Full Name
 * (CODE)", never a bare code or NIM. Small code chips (.code-badge) may
 * still show the code alone, next to a name or with the full name in a
 * tooltip. Browser-safe.
 */
import { useEffect, useState } from "react";
import { getJson } from "./app";

export interface AsistenOrang {
  nim: string;
  kode: string | null;
  nama: string;
}

/** "Desta Saputra (DES)". Without a code, the name alone; without a person,
 *  `fallback` (the NIM the caller has, or "?"). */
export function namaAsisten(
  a: { nama: string; kode?: string | null } | null | undefined,
  fallback = "?",
): string {
  if (!a) return fallback;
  const kode = a.kode?.trim().toUpperCase();
  return kode ? `${a.nama} (${kode})` : a.nama;
}

let cache: Promise<AsistenOrang[]> | null = null;

/** Every Asisten, fetched once per page load and shared by all islands. */
export function loadDirektori(): Promise<AsistenOrang[]> {
  cache ??= getJson<{ ok: boolean; asisten?: AsistenOrang[] }>("/api/session/asisten")
    .then((d) => (d.ok ? (d.asisten ?? []) : []))
    .catch(() => {
      cache = null;
      return [];
    });
  return cache;
}

export interface Direktori {
  byNim: Map<string, AsistenOrang>;
  /** "Full Name (CODE)" for a NIM; the NIM itself while loading or unknown. */
  nama: (nim: string | null | undefined) => string;
}

/** The Asisten directory for an Asisten-only island. */
export function useDirektori(enabled = true): Direktori {
  const [byNim, setByNim] = useState<Map<string, AsistenOrang>>(() => new Map());
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadDirektori().then((rows) => {
      if (alive) setByNim(new Map(rows.map((a) => [a.nim, a])));
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return {
    byNim,
    nama: (nim) => (nim ? namaAsisten(byNim.get(nim), nim) : "?"),
  };
}
