/**
 * Each module's pin table as the Asisten set it (the pin settings dialog),
 * kept in `pengaturan` as pin_modul_<N> with its rows and its boards.
 *
 * GET  /api/presentasi/pin        anyone (the handbook shows the same pins):
 *                                   { ok, pin: { "1": rows | null, ... },
 *                                     papan: { "1": board ids, ... },
 *                                     bawaan: { "1": rows, ... } }
 * POST /api/presentasi/pin-simpan the Jadwal right: { modul, baris, papan }
 *                                   saves (every pin must suit its board,
 *                                   src/lib/papan.ts), { modul, baris: null }
 *                                   goes back to the bundled table and
 *                                   boards. The served code follows
 *                                   (src/lib/pin-kode.ts via kode-aktif.ts).
 *
 * A group's own wiring (2026-10-12): a Praktikan who drags a jumper in a
 * Pin dan Skema card rewires it for their group in the running session
 * only. The module's table above never changes; the group's rows sit in
 * `pengaturan` as pin_grup_s<session>_k<group>_m<module> and are cleared
 * once another session runs.
 *
 * GET  /api/presentasi/pin-grup?modul=N   a Praktikan in the running
 *                                          session (their group), or an
 *                                          Asisten with &kelompok=<nomor>:
 *                                          { ok, baris | null }
 * POST /api/presentasi/pin-grup           that Praktikan: { modul, baris }
 *                                          (every pin must suit the board),
 *                                          { modul, baris: null } goes back
 *                                          to the module's pins.
 */
import { and, eq, like, notLike } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { kelompok, pengaturan } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import {
  cekBarisPin,
  gabungPin,
  KUNCI_PIN,
  papanModul,
  type BarisPin,
} from "../../src/lib/pin-kode.js";
import { bacaPapanSemua, bacaPinSemua, lupakanKode, PIN_BAWAAN } from "./kode-aktif.js";

const MODUL = [1, 2, 3, 4];

export async function handlePinGet(_req: ApiRequest, res: ApiResponse) {
  const [pin, papan] = await Promise.all([bacaPinSemua(), bacaPapanSemua()]);
  res.status(200).json({
    ok: true,
    pin: Object.fromEntries(MODUL.map((m) => [m, pin[m] ?? null])),
    papan: Object.fromEntries(MODUL.map((m) => [m, papan[m] ?? papanModul(m)])),
    bawaan: PIN_BAWAAN,
  });
}

export async function handlePinSimpan(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const modul = Number(body.modul);
  const bawaan = PIN_BAWAAN[modul];
  if (!bawaan) return res.status(200).json({ ok: false, kode: "format_salah" });
  const db = getDb();

  // Back to the bundled table
  if (body.baris === null) {
    await db.delete(pengaturan).where(eq(pengaturan.kunci, KUNCI_PIN(modul)));
    await writeAudit(session.nim, "pin_modul", { modul, baris: null });
    lupakanKode(modul);
    return res.status(200).json({ ok: true });
  }

  const baris = body.baris as BarisPin;
  if (!Array.isArray(baris)) return res.status(200).json({ ok: false, kode: "format_salah" });
  const papan = papanModul(modul, body.papan);
  const bersih = gabungPin(
    bawaan,
    baris.map((r) => (Array.isArray(r) ? r.map((c) => (typeof c === "string" ? c.trim() : c)) : r)),
  );
  const salah = cekBarisPin(modul, bawaan, bersih, papan);
  if (salah.length) return res.status(200).json({ ok: false, kode: "pin_salah", salah });

  // Only the pin cells are kept; the names stay the bundled ones
  const nilai = { baris: bersih, papan };
  await db
    .insert(pengaturan)
    .values({ kunci: KUNCI_PIN(modul), nilai, diubahOleh: session.nim })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai, diubahOleh: session.nim, diubahPada: new Date() },
    });
  await writeAudit(session.nim, "pin_modul", { modul, ...nilai });
  lupakanKode(modul);
  return res.status(200).json({ ok: true });
}

const KUNCI_PIN_GRUP = (sesiId: number, kelompokId: number, modul: number) =>
  `pin_grup_s${sesiId}_k${kelompokId}_m${modul}`;

/** The running session and the group asked about, or null */
async function grupDari(
  req: ApiRequest,
  session: SessionPayload,
): Promise<{ sesiId: number; kelompokId: number; modul: number } | null> {
  const running = await currentSesi();
  const modul = Number(req.query.modul ?? jsonBody(req).modul);
  if (!running || running.modul !== modul) return null;
  if (session.role === "praktikan")
    return session.sesiId === running.id && session.kelompokId
      ? { sesiId: running.id, kelompokId: session.kelompokId, modul }
      : null;
  const nomor = Number(req.query.kelompok);
  if (!Number.isInteger(nomor)) return null;
  const [k] = await getDb()
    .select({ id: kelompok.id })
    .from(kelompok)
    .where(eq(kelompok.nomor, nomor))
    .limit(1);
  return k ? { sesiId: running.id, kelompokId: k.id, modul } : null;
}

export async function handlePinGrupGet(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const g = await grupDari(req, session);
  if (!g) return res.status(200).json({ ok: true, baris: null });
  const [row] = await getDb()
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_PIN_GRUP(g.sesiId, g.kelompokId, g.modul)))
    .limit(1);
  const isi = row?.nilai as { baris?: unknown; terpasang?: unknown } | undefined;
  const baris = Array.isArray(isi?.baris) ? isi.baris : null;
  // Wiring saved before the plugged list counts as every wire plugged in.
  const terpasang = Array.isArray(isi?.terpasang) ? isi.terpasang : null;
  res.status(200).json({ ok: true, baris, terpasang: baris ? terpasang : [] });
}

export async function handlePinGrupPost(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
) {
  const g = await grupDari(req, session);
  if (!g) return res.status(200).json({ ok: false, kode: "sesi_tidak_ada" });
  const bawaan = PIN_BAWAAN[g.modul];
  const db = getDb();
  const kunci = KUNCI_PIN_GRUP(g.sesiId, g.kelompokId, g.modul);
  // Rewiring from an earlier session is gone once another runs.
  await db
    .delete(pengaturan)
    .where(
      and(
        like(pengaturan.kunci, "pin_grup_%"),
        notLike(pengaturan.kunci, `pin_grup_s${g.sesiId}_%`),
      ),
    );
  const body = jsonBody(req);
  // The pin cells plugged into the board so far, "row:column".
  const terpasang = body.terpasang ?? [];
  if (
    !Array.isArray(terpasang) ||
    terpasang.length > 64 ||
    terpasang.some((x) => typeof x !== "string" || !/^\d{1,2}:\d{1,2}$/.test(x))
  )
    return res.status(200).json({ ok: false, kode: "format_salah" });
  // Nothing plugged in: the board is empty and the module's pins stand.
  if (body.baris === null || terpasang.length === 0) {
    await db.delete(pengaturan).where(eq(pengaturan.kunci, kunci));
    return res.status(200).json({ ok: true });
  }
  if (!Array.isArray(body.baris)) return res.status(200).json({ ok: false, kode: "format_salah" });
  const papan = await bacaPapanSemua();
  const baris = gabungPin(bawaan, body.baris as BarisPin);
  const salah = cekBarisPin(g.modul, bawaan, baris, papan[g.modul] ?? papanModul(g.modul));
  if (salah.length) return res.status(200).json({ ok: false, kode: "pin_salah", salah });
  const nilai = { baris, terpasang: [...new Set(terpasang as string[])] };
  await db
    .insert(pengaturan)
    .values({ kunci, nilai, diubahOleh: session.nim })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai, diubahOleh: session.nim, diubahPada: new Date() },
    });
  res.status(200).json({ ok: true });
}

/** A group's own wiring as tables to move the code between: from the
 *  module's pins to the group's, or null when it has none */
export async function pinGrupUntuk(
  sesiId: number,
  kelompokId: number,
  modul: number,
): Promise<{ dari: BarisPin; ke: BarisPin } | null> {
  const bawaan = PIN_BAWAAN[modul];
  if (!bawaan) return null;
  const [row] = await getDb()
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, KUNCI_PIN_GRUP(sesiId, kelompokId, modul)))
    .limit(1);
  const ke = (row?.nilai as { baris?: unknown } | undefined)?.baris;
  if (!Array.isArray(ke)) return null;
  const dari = (await bacaPinSemua())[modul] ?? bawaan;
  return { dari, ke: gabungPin(bawaan, ke as BarisPin) };
}
