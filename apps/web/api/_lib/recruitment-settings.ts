/**
 * Editable oprec settings on the server (src/lib/recruitment/settings.ts holds
 * the registry, defaults and checks). Kept in `pengaturan`; no row means the
 * default. Every change writes an audit line with the before and after.
 *
 * GET  /api/recruitment/settings        every setting for the Panitia: value, default, who and when, and whether the viewer may change it
 * POST /api/recruitment/setting-save    { key, value }   the roles in the registry, or hakPenuh
 * POST /api/recruitment/setting-reset   { key }          back to the default, same roles
 */
import { inArray, eq, sql } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { writeAudit, type SessionPayload } from "../../src/lib/auth.js";
import type { getDb } from "../../src/lib/db.js";
import { pengaturan } from "../../src/lib/schema.js";
import {
  SETTINGS,
  SETTING_KEYS,
  bolehUbah,
  isSettingKey,
  settingRow,
  type SettingKey,
} from "../../src/lib/recruitment/settings.js";
import { anggotaPanitia, muatPelaku } from "./recruitment-rights.js";

type Db = ReturnType<typeof getDb>;

const tolak = (res: ApiResponse, kode: string, status: number, extra = {}) =>
  void res.status(status).json({ ok: false, kode, ...extra });

/** The saved value of one setting, or its default. Used by the other handlers. */
export async function bacaSetting<K extends SettingKey>(
  db: Db,
  key: K,
): Promise<(typeof SETTINGS)[K]["def"]> {
  const [r] = await db
    .select({ nilai: pengaturan.nilai })
    .from(pengaturan)
    .where(eq(pengaturan.kunci, settingRow(key)))
    .limit(1);
  if (!r) return SETTINGS[key].def;
  return (SETTINGS[key].check(r.nilai) ?? SETTINGS[key].def) as (typeof SETTINGS)[K]["def"];
}

export async function handleSettings(
  _req: ApiRequest,
  res: ApiResponse,
  s: SessionPayload,
  db: Db,
  edisiId: number,
) {
  const p = await muatPelaku(db, edisiId, s.nim);
  if (!anggotaPanitia(p)) return tolak(res, "tanpa_hak", 403);
  const rows = await db
    .select({
      kunci: pengaturan.kunci,
      nilai: pengaturan.nilai,
      oleh: pengaturan.diubahOleh,
      pada: pengaturan.diubahPada,
    })
    .from(pengaturan)
    .where(inArray(pengaturan.kunci, SETTING_KEYS.map(settingRow)));
  const byKey = new Map(rows.map((r) => [r.kunci, r]));
  const settings = SETTING_KEYS.map((key) => {
    const row = byKey.get(settingRow(key));
    const saved = row ? SETTINGS[key].check(row.nilai) : null;
    return {
      key,
      label: SETTINGS[key].label,
      value: saved ?? SETTINGS[key].def,
      default: SETTINGS[key].def,
      custom: saved !== null,
      by: saved !== null ? (row?.oleh ?? null) : null,
      at: saved !== null && row ? new Date(row.pada).toISOString() : null,
      roles: SETTINGS[key].roles,
      canEdit: bolehUbah(key, p),
    };
  });
  res.status(200).json({ ok: true, settings });
}

async function ubah(
  req: ApiRequest,
  res: ApiResponse,
  s: SessionPayload,
  db: Db,
  edisiId: number,
  reset: boolean,
) {
  const body = jsonBody(req);
  const key = body.key;
  if (!isSettingKey(key)) return tolak(res, "data_salah", 400, { field: "key" });
  const p = await muatPelaku(db, edisiId, s.nim);
  if (!bolehUbah(key, p)) return tolak(res, "tanpa_hak", 403, { hak: `setting_${key}` });
  const before = await bacaSetting(db, key);
  if (reset) {
    await db.delete(pengaturan).where(eq(pengaturan.kunci, settingRow(key)));
    await writeAudit(s.nim, "rec_setting", { key, reset: true, before });
    return void res.status(200).json({ ok: true, key, value: SETTINGS[key].def, custom: false });
  }
  const value = (SETTINGS[key].check as (v: unknown) => unknown)(body.value);
  if (value === null) return tolak(res, "data_salah", 400, { field: "value" });
  await db
    .insert(pengaturan)
    .values({ kunci: settingRow(key), nilai: value, diubahOleh: s.nim, diubahPada: sql`now()` })
    .onConflictDoUpdate({
      target: pengaturan.kunci,
      set: { nilai: value, diubahOleh: s.nim, diubahPada: sql`now()` },
    });
  await writeAudit(s.nim, "rec_setting", { key, before, after: value });
  res.status(200).json({ ok: true, key, value, custom: true });
}

export const handleSettingSave = (
  req: ApiRequest,
  res: ApiResponse,
  s: SessionPayload,
  db: Db,
  edisiId: number,
) => ubah(req, res, s, db, edisiId, false);

export const handleSettingReset = (
  req: ApiRequest,
  res: ApiResponse,
  s: SessionPayload,
  db: Db,
  edisiId: number,
) => ubah(req, res, s, db, edisiId, true);
