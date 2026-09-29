/**
 * Phase 8: which assistant holds which group in a session.
 *
 * The schedule lists each slot's assistants in group order, but some slots
 * have fewer than five (the International class on Thursday slot 2 has
 * three, Saturday slot 2 has four), so one assistant may hold several
 * groups. Groups are handed out in contiguous blocks, as evenly as
 * possible and front-loaded, so neighbouring tables stay with the same
 * assistant: 5 groups over 3 assistants is 2, 2, 1.
 */
export function bagiKelompok<T>(
  asisten: readonly T[],
  kelompok: readonly number[],
): Map<number, T> {
  const out = new Map<number, T>();
  const k = asisten.length;
  const n = kelompok.length;
  if (k === 0 || n === 0) return out;
  if (k >= n) {
    kelompok.forEach((g, i) => out.set(g, asisten[i]));
    return out;
  }
  const base = Math.floor(n / k);
  const extra = n % k;
  let gi = 0;
  for (let ai = 0; ai < k; ai++) {
    const size = base + (ai < extra ? 1 : 0);
    for (let j = 0; j < size; j++) out.set(kelompok[gi++], asisten[ai]);
  }
  return out;
}

/**
 * Whether `nim` may write scores for `kelompokId`. An unassigned group is
 * open to any assistant (sessions from before Phase 8 have no assignment
 * rows, and a group can be left unassigned on purpose); an assigned one
 * only to its holder. Taking a group over is a separate, audited action.
 */
export function bolehIsiNilai(
  pemilik: ReadonlyMap<number, string>,
  kelompokId: number,
  nim: string,
): boolean {
  const owner = pemilik.get(kelompokId);
  return owner === undefined || owner === nim;
}

/** How many groups each assistant holds, for the "holds 2 groups" hint. */
export function jumlahPegangan(pemilik: ReadonlyMap<number, string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const nim of pemilik.values()) out.set(nim, (out.get(nim) ?? 0) + 1);
  return out;
}
