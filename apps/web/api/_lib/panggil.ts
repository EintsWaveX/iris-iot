/**
 * Panggil DEV (Ada Masalah?, 2026-10-10): an Asisten stuck in the lab calls
 * the DEVs (the ASO and ARM divisions who built the site, src/lib/hak.ts).
 * No new table: a call is an audit row `panggil_dev` {sesiId, catatan},
 * answered by `panggil_dev_datang` {id} from a DEV or closed by the caller
 * with `panggil_dev_batal` {id}. A call stays open for 30 minutes.
 *
 * POST /api/session/panggil {aksi: "panggil", catatan?} | {aksi: "datang", id}
 *   | {aksi: "batal", id}
 * The open calls ride on GET /api/session/waspada, which every Asisten page
 * already polls (shell/LabAlert.tsx): DEVs see the calls for them, the
 * caller sees whether someone is coming.
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { ApiRequest, ApiResponse } from "./http.js";
import { jsonBody } from "./http.js";
import { muatOrang } from "./hak.js";
import { getDb } from "../../src/lib/db.js";
import { asisten, audit } from "../../src/lib/schema.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { writeAudit } from "../../src/lib/auth.js";
import type { SessionPayload } from "../../src/lib/auth.js";

export const PANGGIL_MENIT = 30;
const CATATAN_MAKS = 300;

export interface Panggilan {
  id: number;
  pada: string;
  oleh: { nim: string; nama: string; kode: string | null };
  catatan: string;
  sesi: { id: number; modul: number } | null;
  datang: { nama: string; kode: string | null; pada: string } | null;
}

function baca(detail: string | null): Record<string, unknown> {
  try {
    const d = JSON.parse(detail ?? "{}") as unknown;
    return d && typeof d === "object" ? (d as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Calls of the last 30 minutes not closed by their caller, newest first. */
export async function panggilanTerbuka(): Promise<Panggilan[]> {
  const db = getDb();
  const sejak = new Date(Date.now() - PANGGIL_MENIT * 60_000);
  const rows = await db
    .select()
    .from(audit)
    .where(
      and(
        inArray(audit.aksi, ["panggil_dev", "panggil_dev_datang", "panggil_dev_batal"]),
        gte(audit.pada, sejak),
      ),
    )
    .orderBy(desc(audit.id))
    .limit(200);
  const calls = rows.filter((r) => r.aksi === "panggil_dev");
  if (!calls.length) return [];
  const ref = (r: (typeof rows)[number]) => Number(baca(r.detail).id);
  const batal = new Set(rows.filter((r) => r.aksi === "panggil_dev_batal").map(ref));
  const datang = new Map<number, (typeof rows)[number]>();
  // Oldest answer wins: the first DEV to say so is the one coming.
  for (const r of [...rows].reverse())
    if (r.aksi === "panggil_dev_datang" && !datang.has(ref(r))) datang.set(ref(r), r);
  const nims = [
    ...new Set([...calls.map((c) => c.aktorNim), ...[...datang.values()].map((d) => d.aktorNim)]),
  ];
  const orang = new Map(
    (
      await db
        .select({ nim: asisten.nim, nama: asisten.nama, kode: asisten.kode })
        .from(asisten)
        .where(inArray(asisten.nim, nims))
    ).map((o) => [o.nim, o]),
  );
  return calls
    .filter((c) => !batal.has(c.id))
    .map((c) => {
      const d = baca(c.detail);
      const a = datang.get(c.id);
      const modul = Number(d.modul);
      return {
        id: c.id,
        pada: c.pada.toISOString(),
        oleh: {
          nim: c.aktorNim,
          nama: orang.get(c.aktorNim)?.nama ?? c.aktorNim,
          kode: orang.get(c.aktorNim)?.kode ?? null,
        },
        catatan: typeof d.catatan === "string" ? d.catatan : "",
        sesi:
          Number.isInteger(d.sesiId) && modul >= 1 && modul <= 4
            ? { id: Number(d.sesiId), modul }
            : null,
        datang: a
          ? {
              nama: orang.get(a.aktorNim)?.nama ?? a.aktorNim,
              kode: orang.get(a.aktorNim)?.kode ?? null,
              pada: a.pada.toISOString(),
            }
          : null,
      };
    });
}

/** Who may answer a call: the DEVs (and the Pencipta, who is one in spirit). */
export async function bisaJawab(nim: string): Promise<boolean> {
  const o = await muatOrang(nim);
  return !!o && (o.badges.includes("dev") || o.badges.includes("pencipta"));
}

export async function handlePanggil(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const body = jsonBody(req);
  const aksi = body.aksi;
  const tolak = (kode: string) => res.status(200).json({ ok: false, kode });
  const terbuka = await panggilanTerbuka();

  if (aksi === "panggil") {
    const catatan =
      typeof body.catatan === "string" ? body.catatan.trim().slice(0, CATATAN_MAKS) : "";
    // One open call per person: a second press answers with the first.
    const lama = terbuka.find((c) => c.oleh.nim === session.nim && !c.datang);
    if (lama) return res.status(200).json({ ok: true, id: lama.id, sudah: true });
    const running = await currentSesi();
    await writeAudit(session.nim, "panggil_dev", {
      catatan,
      ...(running ? { sesiId: running.id, modul: running.modul } : {}),
    });
    const [baru] = await getDb()
      .select({ id: audit.id })
      .from(audit)
      .where(and(eq(audit.aksi, "panggil_dev"), eq(audit.aktorNim, session.nim)))
      .orderBy(desc(audit.id))
      .limit(1);
    return res.status(200).json({ ok: true, id: baru?.id ?? null });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return tolak("format_salah");
  const c = terbuka.find((x) => x.id === id);
  if (!c) return tolak("tidak_ada");

  if (aksi === "datang") {
    if (!(await bisaJawab(session.nim))) return tolak("tanpa_hak");
    if (c.datang) return res.status(200).json({ ok: true, sudah: true });
    await writeAudit(session.nim, "panggil_dev_datang", { id });
    return res.status(200).json({ ok: true });
  }
  if (aksi === "batal") {
    if (c.oleh.nim !== session.nim) return tolak("tanpa_hak");
    await writeAudit(session.nim, "panggil_dev_batal", { id });
    return res.status(200).json({ ok: true });
  }
  return tolak("format_salah");
}
