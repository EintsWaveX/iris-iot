/**
 * Recruitment rights on the server. The pure table lives in
 * src/lib/recruitment/rights.ts (PRD section 4); this loads the person and
 * their seat on the live edition's committee and applies it. The pages only
 * hide what these checks already refuse.
 */
import { eq } from "drizzle-orm";
import { hakPenuh } from "../../src/lib/hak.js";
import {
  bacaHakConfig,
  bolehDuduk,
  hakRekrutmen,
  pelakuDari,
  type HakConfig,
} from "../../src/lib/recruitment/rights.js";
import type { RecRights } from "../../src/lib/recruitment/types.js";
import { pengaturan } from "../../src/lib/schema.js";
import type { ApiResponse } from "./http.js";
import { muatOrang, type OrangHak } from "./hak.js";
import { muatKursi, type Db, type Kursi } from "./recruitment-data.js";

/** The `pengaturan` row that holds the rights config (Hak Akses); no row means the PRD table. */
export const KUNCI_HAK = "rec_hak";

/** The saved rights config, or the default. One value for the live site and for practice. */
export async function muatHakConfig(db: Db): Promise<HakConfig> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_HAK))
    .limit(1);
  return bacaHakConfig(r?.nilai);
}

export interface PelakuServer {
  orang: OrangHak;
  kursi: Kursi | null;
  hak: RecRights;
  /** Holds everything: the Pencipta, the Admin tier, or anyone while "all Asisten" is on */
  penuh: boolean;
  /** The config this person's rights were worked out from */
  config: HakConfig;
}

/**
 * An Asisten with their seat and rights, or null when they are inactive or
 * alumni (a stale cookie of someone since deactivated gets nothing).
 */
export async function muatPelaku(
  db: Db,
  edisiId: number,
  nim: string,
): Promise<PelakuServer | null> {
  const orang = await muatOrang(nim);
  if (!orang || !bolehDuduk(orang.status)) return null;
  const kursi = await muatKursi(db, edisiId, nim);
  const config = await muatHakConfig(db);
  return {
    orang,
    kursi,
    hak: hakRekrutmen(pelakuDari(orang, kursi), config),
    penuh: hakPenuh(orang) || config.semua,
    config,
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
