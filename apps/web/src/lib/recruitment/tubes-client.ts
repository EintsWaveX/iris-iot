/**
 * Tubes on the page (R5): the CaAs's and the Panitia's reads, which refetch at
 * once on the `rectubes` topic (and the ones their data also shows), and the
 * upload of one submission file: ticket, PUT to the relay, save.
 */
import { usePoll } from "../hooks";
import { sha256Hex } from "../tp-r2";
import { isFail, recGet, recPost } from "./client";
import { checkFile, type TubesPart } from "./tubes";
import type { TubesBoard, TubesFileLink, TubesMine, TubesTicket } from "./tubes-api";

async function leaf<T extends { ok: true }>(p: ReturnType<typeof recGet<T>>): Promise<T | null> {
  const r = await p;
  if (!isFail(r)) return r;
  if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
  return null;
}

/** A CaAs's Tubes: their team, the invites, the evenings, the topic and the submission. */
export function useTubes(enabled = true) {
  return usePoll(
    () => leaf(recGet<TubesMine>("tubes")),
    300_000,
    enabled,
    ["rectubes", "recedition", "reccalendar", "reccutting", "recplotting"],
    500,
  );
}

/** The Panitia's board of the stage. */
export function useTubesBoard(enabled = true) {
  return usePoll(
    () => leaf(recGet<TubesBoard>("tubes-board")),
    300_000,
    enabled,
    ["rectubes", "reccalendar", "reccandidates", "recplotting", "recedition"],
    500,
  );
}

/** A read link for one submitted part (the team, or Panitia); the page opens it. */
export const bacaFileTubes = (team: number, part: string) =>
  recGet<TubesFileLink>("tubes-file", { team: String(team), part });

export type KirimGagal =
  | "ekstensi"
  | "terlalu_besar"
  | "kosong"
  | "bagian_salah"
  | "jaringan"
  | "ditolak"
  | "tutup"
  | "belum_buka"
  | "belum_diatur"
  | "berkas_hilang"
  | "berkas_beda"
  | "lain";

function put(
  url: string,
  bytes: Uint8Array,
  mime: string,
  onPersen: (p: number) => void,
): Promise<number> {
  return new Promise((selesai) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", mime);
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onPersen(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    x.onload = () => selesai(x.status);
    x.onerror = () => selesai(0);
    x.send(new Blob([bytes as BlobPart], { type: mime }));
  });
}

/** One file for one part: checked here, ticketed, PUT to the relay, then saved. */
export async function kirimFileTubes(
  part: TubesPart,
  file: File,
  onPersen: (p: number) => void,
): Promise<{ ok: true } | { ok: false; kode: KirimGagal }> {
  const bad = checkFile(part, file.name, file.size);
  if (bad) return { ok: false, kode: bad };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  const tk = await recPost<TubesTicket>("tubes-file-ticket", {
    part: part.key,
    name: file.name,
    size: bytes.length,
    sha256,
  });
  if (isFail(tk)) {
    if (tk.kode === "offline") return { ok: false, kode: "jaringan" };
    const k = String(tk.kode);
    return {
      ok: false,
      kode:
        (
          [
            "ekstensi",
            "terlalu_besar",
            "kosong",
            "bagian_salah",
            "tutup",
            "belum_buka",
            "belum_diatur",
          ] as const
        ).find((x) => x === k) ?? "lain",
    };
  }
  // The same bytes are already attached to this part: nothing to send or save.
  if (tk.sama) return { ok: true };
  if (tk.url) {
    let status = 0;
    for (let coba = 0; coba < 3; coba++) {
      if (coba) await new Promise((r) => setTimeout(r, 1000 * 2 ** coba));
      onPersen(0);
      status = await put(tk.url, bytes, file.type || "application/octet-stream", onPersen);
      if (status >= 200 && status < 300) break;
      if (status >= 400 && status < 500) break;
    }
    if (status === 413) return { ok: false, kode: "terlalu_besar" };
    if (status === 0) return { ok: false, kode: "jaringan" };
    if (status < 200 || status >= 300) return { ok: false, kode: "ditolak" };
  }
  onPersen(100);
  const sv = await recPost<{ ok: true }>("tubes-file-save", {
    part: part.key,
    ticket: tk.ticket,
    name: file.name,
  });
  if (isFail(sv)) {
    if (sv.kode === "offline") return { ok: false, kode: "jaringan" };
    const k = String(sv.kode);
    return {
      ok: false,
      kode:
        (["tutup", "berkas_hilang", "berkas_beda", "belum_diatur"] as const).find((x) => x === k) ??
        "lain",
    };
  }
  return { ok: true };
}
