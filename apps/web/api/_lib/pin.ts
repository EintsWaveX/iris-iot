/**
 * Each module's pin table as the Asisten set it (Persiapan › Skema), kept in
 * `pengaturan` as pin_modul_<N> with only its rows.
 *
 * GET  /api/presentasi/pin        — anyone (the handbook shows the same pins):
 *                                   { ok, pin: { "1": rows | null, ... },
 *                                     bawaan: { "1": rows, ... } }
 * POST /api/presentasi/pin-simpan — the Jadwal right: { modul, baris } saves,
 *                                   { modul, baris: null } goes back to the
 *                                   bundled table. The served code follows
 *                                   (src/lib/pin-kode.ts via kode-aktif.ts).
 */
import { eq } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { getDb } from "../../src/lib/db.js";
import { pengaturan } from "../../src/lib/schema.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import { cekBarisPin, gabungPin, KUNCI_PIN, type BarisPin } from "../../src/lib/pin-kode.js";
import { bacaPinSemua, lupakanKode, PIN_BAWAAN } from "./kode-aktif.js";

const MODUL = [1, 2, 3, 4];

export async function handlePinGet(_req: ApiRequest, res: ApiResponse) {
  const pin = await bacaPinSemua();
  res.status(200).json({
    ok: true,
    pin: Object.fromEntries(MODUL.map((m) => [m, pin[m] ?? null])),
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
  const salah = cekBarisPin(modul, bawaan, baris);
  if (salah.length) return res.status(200).json({ ok: false, kode: "pin_salah", salah });

  // Only the pin cells are kept; the names stay the bundled ones
  const nilai = {
    baris: gabungPin(
      bawaan,
      baris.map((r) => r.map((c) => c.trim())),
    ),
  };
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
