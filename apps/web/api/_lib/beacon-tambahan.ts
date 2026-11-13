/**
 * The extra groups a Module 4 Beacon build carries (2026-11-13), worked out on the server only: the
 * layout setting, the running session's group count and the PC's board keys. Nothing here comes from
 * the request, so nobody can ask for another group's key.
 */
import { currentSesi } from "../../src/lib/sesi.js";
import { syncWordFor } from "../../src/lib/group-identity.js";
import { kelompokTambahan, slotBentrok } from "../../src/lib/beacon-bersama.js";
import { bacaBeaconHunt } from "../../src/lib/beacon-hunt.js";
import { kunciPapanSemua } from "./perburuan-api.js";
import type { TambahanBeacon } from "./beacon-bersama.js";

export type HasilTambahan =
  | { ok: true; tambahan: TambahanBeacon[] }
  | { ok: false; kode: "beacon_kunci_belum_ada" | "beacon_slot_bentrok" };

/**
 * No extras without a running Module 4 session (practice, or nothing open), and none when the layout
 * gives the group its own Beacon. Refuses when a served group has no key yet (one wrong key on the
 * shared connection would drop every group on that Beacon) or two served groups share a TDMA slot.
 */
export async function tambahanBeacon(grup: number): Promise<HasilTambahan> {
  const running = await currentSesi();
  if (!running || running.modul !== 4) return { ok: true, tambahan: [] };
  const lain = kelompokTambahan(grup, running.jumlahKelompok, await bacaBeaconHunt());
  if (lain.length === 0) return { ok: true, tambahan: [] };
  if (slotBentrok([grup, ...lain])) return { ok: false, kode: "beacon_slot_bentrok" };
  const kunci = await kunciPapanSemua(running.id);
  const tambahan: TambahanBeacon[] = [];
  for (const g of lain) {
    const k = kunci[String(g)];
    let sync: string;
    try {
      sync = syncWordFor(4, g);
    } catch {
      return { ok: false, kode: "beacon_kunci_belum_ada" };
    }
    if (!k) return { ok: false, kode: "beacon_kunci_belum_ada" };
    tambahan.push({ grup: g, sync, kunci: k });
  }
  return { ok: true, tambahan };
}
