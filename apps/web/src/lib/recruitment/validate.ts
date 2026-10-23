/**
 * Input checks for recruitment writes, pure. Each returns the cleaned value
 * or the name of the first field that failed, so the API answers
 * `data_salah` with `field` and the page can mark that input.
 */
import { PALETTE_KEYS } from "./calendar.js";
import {
  AUDIENCES,
  EVENT_KINDS,
  GATES,
  STAGES,
  type Audience,
  type Biodata,
  type EventKind,
  type GateKey,
  type StageKey,
} from "./types.js";

const objek = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function teks(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
}

export type Gagal = { ok: false; field: string };

/** A NIM that is safe to put into an R2 key. */
export const cekNimRek = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9A-Za-z]{4,20}$/.test(v);

/** A real calendar date, YYYY-MM-DD. */
export function cekTanggal(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const JAM_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function cekBiodata(raw: unknown): { ok: true; biodata: Biodata } | Gagal {
  if (!objek(raw)) return { ok: false, field: "biodata" };
  const r = raw;
  if (
    !Number.isInteger(r.angkatan) ||
    (r.angkatan as number) < 2010 ||
    (r.angkatan as number) > 2040
  )
    return { ok: false, field: "angkatan" };
  const kelas = teks(r.kelas, 1, 40);
  if (!kelas) return { ok: false, field: "kelas" };
  const phone = typeof r.phone === "string" ? r.phone.replace(/[\s-]/g, "") : "";
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return { ok: false, field: "phone" };
  const lineId = teks(r.lineId, 1, 40);
  if (!lineId) return { ok: false, field: "lineId" };
  const address = teks(r.address, 5, 300);
  if (!address) return { ok: false, field: "address" };
  const motivation = teks(r.motivation, 5, 200);
  if (!motivation || /[\r\n]/.test(motivation)) return { ok: false, field: "motivation" };
  return {
    ok: true,
    biodata: { angkatan: r.angkatan as number, kelas, phone, lineId, address, motivation },
  };
}

/** The fields an event save carries, cleaned. */
export interface EventBersih {
  kind: EventKind;
  title: string;
  startsOn: string;
  endsOn: string;
  dayStart: string | null;
  dayEnd: string | null;
  place: string | null;
  internal: boolean;
  audience: Audience;
  gates: GateKey[];
  stage: StageKey | null;
  color: string | null;
}

export function cekEvent(raw: unknown): { ok: true; event: EventBersih } | Gagal {
  if (!objek(raw)) return { ok: false, field: "event" };
  const r = raw;
  if (!(EVENT_KINDS as readonly unknown[]).includes(r.kind)) return { ok: false, field: "kind" };
  const title = teks(r.title, 1, 80);
  if (!title) return { ok: false, field: "title" };
  if (!cekTanggal(r.startsOn)) return { ok: false, field: "startsOn" };
  if (!cekTanggal(r.endsOn) || r.endsOn < r.startsOn) return { ok: false, field: "endsOn" };

  const awal = r.dayStart ?? null;
  const akhir = r.dayEnd ?? null;
  if (awal === null && akhir !== null) return { ok: false, field: "dayStart" };
  if (awal !== null && akhir === null) return { ok: false, field: "dayEnd" };
  if (awal !== null && (typeof awal !== "string" || !JAM_RE.test(awal)))
    return { ok: false, field: "dayStart" };
  if (
    akhir !== null &&
    (typeof akhir !== "string" || !JAM_RE.test(akhir) || akhir <= (awal as string))
  )
    return { ok: false, field: "dayEnd" };

  let place: string | null = null;
  if (r.place !== undefined && r.place !== null) {
    if (typeof r.place !== "string" || r.place.trim().length > 80)
      return { ok: false, field: "place" };
    place = r.place.trim() || null;
  }
  if (r.internal !== undefined && typeof r.internal !== "boolean")
    return { ok: false, field: "internal" };
  const audience = r.audience ?? "all";
  if (!(AUDIENCES as readonly unknown[]).includes(audience))
    return { ok: false, field: "audience" };

  const gates = r.gates ?? [];
  if (
    !Array.isArray(gates) ||
    gates.some((g) => !(GATES as readonly unknown[]).includes(g)) ||
    new Set(gates).size !== gates.length
  )
    return { ok: false, field: "gates" };

  const stage = r.stage ?? null;
  if (stage !== null && !(STAGES as readonly unknown[]).includes(stage))
    return { ok: false, field: "stage" };
  const color = r.color ?? null;
  if (color !== null && !(PALETTE_KEYS as readonly unknown[]).includes(color))
    return { ok: false, field: "color" };

  return {
    ok: true,
    event: {
      kind: r.kind as EventKind,
      title,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
      dayStart: awal as string | null,
      dayEnd: akhir as string | null,
      place,
      internal: (r.internal as boolean | undefined) ?? false,
      audience: audience as Audience,
      gates: gates as GateKey[],
      stage: stage as StageKey | null,
      color: color as string | null,
    },
  };
}
