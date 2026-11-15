/**
 * The bridge between the API and the live-update hubs that live in the server process (server/hub/siaran.ts for
 * topics, server/hub/ruang.ts for the session and exam rooms). The server hands its functions over at start; the
 * API announces through `siarkanLokal` and `kirimRuangLokal` without knowing the hubs exist, so tests and scripts
 * (which have none) simply reach nobody.
 */
export type Penyiar = (topik: readonly string[]) => number;

export interface PenyiarRuang {
  /** Into a room; returns how many sockets heard it. */
  kirim(ruang: string, m: unknown[]): number;
  /** Closes an exam room's sockets (after Finish). */
  tutup(ruang: string): number;
}

let aktif: Penyiar | null = null;
let aktifRuang: PenyiarRuang | null = null;

/** The server calls this once at start (and with null when it stops). */
export function pasangPenyiar(p: Penyiar | null): void {
  aktif = p;
}

export function pasangPenyiarRuang(p: PenyiarRuang | null): void {
  aktifRuang = p;
}

/** True while this process holds the rooms, so a ticket may point at it instead of the relay. */
export function ruangDiServer(): boolean {
  return aktifRuang !== null;
}

/** Announces topics to every page connected to this server; returns how many were reached. Never throws. */
export function siarkanLokal(topik: readonly string[]): number {
  if (!aktif || !topik.length) return 0;
  try {
    return aktif(topik);
  } catch {
    return 0;
  }
}

/** Into a session or exam room held by this server; returns how many sockets heard it. Never throws. */
export function kirimRuangLokal(ruang: string, m: unknown[]): number {
  if (!aktifRuang || !m.length) return 0;
  try {
    return aktifRuang.kirim(ruang, m);
  } catch {
    return 0;
  }
}

/** Closes an exam room's sockets here; returns how many. Never throws. */
export function tutupRuangLokal(ruang: string): number {
  if (!aktifRuang) return 0;
  try {
    return aktifRuang.tutup(ruang);
  } catch {
    return 0;
  }
}

/**
 * Whether the old relay still gets the same messages as well. It does until IRIS_RELAY_LAMA=0, so a page that
 * could not reach the server's hub and fell back to the Worker keeps hearing everything.
 */
export function relayLamaMenyala(): boolean {
  return process.env.IRIS_RELAY_LAMA !== "0";
}

/**
 * The address a page opens for a room. This server when it holds the rooms and the page did not already
 * fail against it (`lama`), the relay otherwise (the old way, and the fallback).
 */
export function alamatRuang(
  req: { headers: Record<string, string | string[] | undefined> },
  jenis: "aliran" | "ujian",
  ruang: string,
  relay: string | null,
  lama: boolean,
): string | null {
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "")
    .split(",")[0]
    .trim();
  const kembali = relay ? `${relay}/${jenis}/${ruang}` : null;
  if ((lama && kembali) || process.env.IRIS_RUANG_HUB === "0" || !ruangDiServer() || !host)
    return kembali;
  const aman =
    String(req.headers["x-forwarded-proto"] ?? "")
      .split(",")[0]
      .trim() === "https" || /(^|\.)irisiotlab\.com$/.test(host.replace(/:\d+$/, ""));
  return `${aman ? "wss" : "ws"}://${host}/${jenis}/${ruang}`;
}
