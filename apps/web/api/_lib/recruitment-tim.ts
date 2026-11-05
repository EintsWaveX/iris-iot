/**
 * Tubes teams, read from the database (R5). Shared by the Tubes routes
 * (recruitment-s7.ts), the interview engine (a Presentasi turn belongs to a
 * team, keyed by its leader) and the Cutting (every member carries the
 * team's score). Writes live in recruitment-s7.ts.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../src/lib/db.js";
import {
  praktikan,
  recAccount,
  recCandidate,
  recTeam,
  recTeamMember,
  type RecTeamRow,
} from "../../src/lib/schema.js";
import { pickEligible, standing } from "../../src/lib/recruitment/standing.js";
import type { RecEvent } from "../../src/lib/recruitment/types.js";
import { muatHasilBanyak } from "./recruitment-data.js";

type Db = ReturnType<typeof getDb>;

export interface Peserta {
  id: number;
  nim: string;
  nama: string;
  kelas: string;
}

export interface Anggota extends Peserta {
  status: "invited" | "joined";
  by: string;
  at: Date;
}

export interface Tim {
  team: RecTeamRow;
  /** The leader first, then the other joined members, then the invited ones */
  members: Anggota[];
}

async function namaMap(db: Db, nims: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unik = [...new Set(nims)];
  if (!unik.length) return out;
  for (const r of await db
    .select({ nim: praktikan.nim, nama: praktikan.nama })
    .from(praktikan)
    .where(inArray(praktikan.nim, unik)))
    out.set(r.nim, r.nama);
  for (const r of await db
    .select({ nim: recAccount.nim, nama: recAccount.nama })
    .from(recAccount)
    .where(inArray(recAccount.nim, unik)))
    if (r.nama) out.set(r.nim, r.nama);
  return out;
}

/** Everyone of the edition with a name, by candidate id. */
export async function muatSemuaPeserta(
  db: Db,
  edisiId: number,
): Promise<Map<number, Peserta & { status: string; stage: string }>> {
  const rows = await db
    .select({
      id: recCandidate.id,
      nim: recCandidate.nim,
      bio: recCandidate.biodata,
      status: recCandidate.status,
      stage: recCandidate.currentStage,
    })
    .from(recCandidate)
    .where(eq(recCandidate.editionId, edisiId))
    .orderBy(asc(recCandidate.nim));
  const nama = await namaMap(
    db,
    rows.map((r) => r.nim),
  );
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        nim: r.nim,
        nama: nama.get(r.nim) ?? r.nim,
        kelas: r.bio.kelas,
        status: r.status,
        stage: r.stage,
      },
    ]),
  );
}

/**
 * The candidates who are in Tubes: they passed Wawancara (their envelope's reveal time has come) and
 * are still going. In Mode Latihan every approved sample CaAs counts, so the practice edition can try
 * the whole stage without waiting for real Cutting results.
 */
export async function muatKelayakan(
  db: Db,
  edisiId: number,
  events: readonly RecEvent[],
  now: Date,
  semua?: Map<number, Peserta & { status: string; stage: string }>,
): Promise<Peserta[]> {
  const peta = semua ?? (await muatSemuaPeserta(db, edisiId));
  const hasil = await muatHasilBanyak(db, [...peta.keys()]);
  const out: Peserta[] = [];
  for (const p of peta.values()) {
    if (p.status !== "approved") continue;
    // Practice follows the same rule as the real Oprec (5 Nov 2026): a sample CaAs reaches Tubes through
    // Lompat Tahap or by being passed on, not by a bypass.
    const st = standing(
      { status: p.status as never, currentStage: p.stage as never },
      hasil.get(p.id) ?? [],
      events,
      now,
    );
    if (!pickEligible(st, "tubes")) continue;
    out.push({ id: p.id, nim: p.nim, nama: p.nama, kelas: p.kelas });
  }
  return out;
}

/** Every team of the edition with its members. */
export async function muatTim(db: Db, edisiId: number): Promise<Tim[]> {
  const teams = await db
    .select()
    .from(recTeam)
    .where(eq(recTeam.editionId, edisiId))
    .orderBy(asc(recTeam.id));
  if (!teams.length) return [];
  const rows = await db
    .select()
    .from(recTeamMember)
    .where(
      inArray(
        recTeamMember.teamId,
        teams.map((t) => t.id),
      ),
    )
    .orderBy(asc(recTeamMember.id));
  const peserta = await muatSemuaPeserta(db, edisiId);
  return teams.map((team) => {
    const ms: Anggota[] = rows
      .filter((r) => r.teamId === team.id)
      .flatMap((r) => {
        const p = peserta.get(r.candidateId);
        return p
          ? [
              {
                id: p.id,
                nim: p.nim,
                nama: p.nama,
                kelas: p.kelas,
                status: r.status,
                by: r.by,
                at: r.at,
              },
            ]
          : [];
      });
    ms.sort(
      (a, b) =>
        Number(b.id === team.leaderId) - Number(a.id === team.leaderId) ||
        Number(b.status === "joined") - Number(a.status === "joined"),
    );
    return { team, members: ms };
  });
}

export const joined = (t: Tim) => t.members.filter((m) => m.status === "joined");

const depan = (nama: string) => nama.trim().split(/\s+/)[0] ?? nama;

/** The team's name: the one its leader gave, or "Tim" and the leader's first name. */
export function namaTim(t: Tim): string {
  if (t.team.name.trim()) return t.team.name.trim();
  const l = t.members.find((m) => m.id === t.team.leaderId);
  return `Tim ${l ? depan(l.nama) : t.team.id}`;
}

/** "Tim Budi · Budi, Citra, Dewi": the label the examiners and the Cutting show. */
export function labelTim(t: Tim): string {
  return `${namaTim(t)} · ${joined(t)
    .map((m) => depan(m.nama))
    .join(", ")}`;
}

/** Leader candidate id → the team's joined member ids (the leader included). */
export async function anggotaPerPemimpin(
  db: Db,
  edisiId: number,
  pemimpin: number[],
): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (!pemimpin.length) return out;
  const teams = await db
    .select({ id: recTeam.id, leaderId: recTeam.leaderId })
    .from(recTeam)
    .where(and(eq(recTeam.editionId, edisiId), inArray(recTeam.leaderId, pemimpin)));
  if (!teams.length) return out;
  const rows = await db
    .select({ teamId: recTeamMember.teamId, candidateId: recTeamMember.candidateId })
    .from(recTeamMember)
    .where(
      and(
        inArray(
          recTeamMember.teamId,
          teams.map((t) => t.id),
        ),
        eq(recTeamMember.status, "joined"),
      ),
    );
  for (const t of teams)
    out.set(
      t.leaderId,
      rows.filter((r) => r.teamId === t.id).map((r) => r.candidateId),
    );
  return out;
}

/** The leader of the team a candidate belongs to (themselves when they lead), or null when they have no team. */
export async function pemimpinDari(
  db: Db,
  edisiId: number,
  kandidatId: number,
): Promise<number | null> {
  const [r] = await db
    .select({ leaderId: recTeam.leaderId })
    .from(recTeamMember)
    .innerJoin(recTeam, eq(recTeam.id, recTeamMember.teamId))
    .where(
      and(
        eq(recTeamMember.candidateId, kandidatId),
        eq(recTeamMember.status, "joined"),
        eq(recTeam.editionId, edisiId),
      ),
    )
    .limit(1);
  return r?.leaderId ?? null;
}
