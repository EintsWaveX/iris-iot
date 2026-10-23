/**
 * Recruitment rights on the server. The pure table lives in
 * src/lib/recruitment/rights.ts (PRD section 4); this loads the person and
 * their seat on the live edition's committee and applies it. The pages only
 * hide what these checks already refuse.
 */
import { hakPenuh } from "../../src/lib/hak.js";
import { hakRekrutmen, pelakuDari } from "../../src/lib/recruitment/rights.js";
import type { RecRights } from "../../src/lib/recruitment/types.js";
import type { ApiResponse } from "./http.js";
import { muatOrang, type OrangHak } from "./hak.js";
import { muatKursi, type Db, type Kursi } from "./recruitment-data.js";

export interface PelakuServer {
  orang: OrangHak;
  kursi: Kursi | null;
  hak: RecRights;
  /** hakPenuh: the Pencipta or the Admin tier */
  penuh: boolean;
}

/**
 * An Asisten with their seat and rights, or null when they are not an active
 * Asisten (a stale cookie of someone since deactivated gets nothing).
 */
export async function muatPelaku(
  db: Db,
  edisiId: number,
  nim: string,
): Promise<PelakuServer | null> {
  const orang = await muatOrang(nim);
  if (!orang || orang.status !== "aktif") return null;
  const kursi = await muatKursi(db, edisiId, nim);
  return {
    orang,
    kursi,
    hak: hakRekrutmen(pelakuDari(orang, kursi)),
    penuh: hakPenuh(orang),
  };
}

/** Sends 403 and returns false unless the person holds the right. */
export function wajibHak(res: ApiResponse, p: PelakuServer | null, key: keyof RecRights): boolean {
  if (p && p.hak[key]) return true;
  res.status(403).json({ ok: false, kode: "tanpa_hak", hak: key });
  return false;
}

/** On the committee, or holding every right: the Panitia. */
export const anggotaPanitia = (p: PelakuServer | null): boolean => !!p && (p.penuh || !!p.kursi);
