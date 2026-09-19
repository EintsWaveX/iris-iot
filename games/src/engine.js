/**
 * Arena Asisten IRIS - pure game logic engine.
 *
 * This file is intentionally framework-free: no DOM access, no network
 * calls, no database client. It is loaded both as a plain <script> in the
 * browser (assigning `window.Engine`) and evaluated directly under Node
 * for the test suite (assigning `globalThis.Engine`). Keep it free of
 * `import`/`export` syntax so both environments can run it unmodified.
 */

const Engine = {};

/**
 * Single internal source of randomness so shuffle behavior stays
 * consistent everywhere it is needed. Draws are never seeded - each call
 * to drawGroups should be genuinely random.
 *
 * @returns {number} a pseudo-random float in [0, 1)
 */
function random() {
  return Math.random();
}

/**
 * Fisher-Yates shuffle. Shuffles in place and also returns the array for
 * convenience.
 *
 * @template T
 * @param {T[]} arr - array to shuffle in place
 * @returns {T[]} the same array, shuffled
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Produces a division-balanced random draw of present assistants into
 * `groupCount` groups.
 *
 * Algorithm:
 *  1. Filter `roster` down to entries whose `kode` is in `presentCodes`.
 *  2. Bucket the filtered entries by `divisi`.
 *  3. Fisher-Yates shuffle within each division bucket.
 *  4. Shuffle the order of the division buckets themselves.
 *  5. Concatenate into one flat list, then deal round-robin into
 *     `groupCount` groups (index i goes to group i % groupCount). Dealing
 *     round-robin over a division-ordered list is what spreads each
 *     division across groups instead of clumping it into one.
 *  6. Fisher-Yates shuffle within each resulting group so the display
 *     order doesn't give away which division everyone came from.
 *
 * @param {string[]} presentCodes - kode values of assistants who showed up
 * @param {{kode: string, divisi: string}[]} roster - the full roster
 * @param {number} [groupCount=4] - number of groups to deal into
 * @returns {string[][]} array of `groupCount` arrays of kode strings
 */
Engine.drawGroups = (presentCodes, roster, groupCount = 4) => {
  const presentSet = new Set(presentCodes);
  const present = roster.filter((person) => presentSet.has(person.kode));

  const buckets = new Map();
  for (const person of present) {
    if (!buckets.has(person.divisi)) buckets.set(person.divisi, []);
    buckets.get(person.divisi).push(person.kode);
  }

  const divisionLists = Array.from(buckets.values()).map((list) => shuffle(list));
  shuffle(divisionLists);

  const flat = [].concat(...divisionLists);

  const groups = Array.from({ length: groupCount }, () => []);
  flat.forEach((kode, i) => {
    groups[i % groupCount].push(kode);
  });

  return groups.map((group) => shuffle(group));
};

/**
 * Resolves the bracket state for a single game document into a clean
 * summary, guarding against stale champion state after a re-draw.
 *
 * Semifinal 1 is group index 0 vs 1; Semifinal 2 is group index 2 vs 3.
 * Winners are stored as the winning GROUP INDEX (0-3), not 1/2.
 *
 * @param {{draw: string[][], sf1: (number|null), sf2: (number|null), champion: (number|null)}} gameDoc
 * @returns {{sf1: (number|null), sf2: (number|null), finalists: [(number|null), (number|null)], champion: (number|null)}}
 */
Engine.resolveBracket = (gameDoc) => {
  const sf1 = gameDoc.sf1 === undefined ? null : gameDoc.sf1;
  const sf2 = gameDoc.sf2 === undefined ? null : gameDoc.sf2;
  const finalists = [sf1, sf2];

  const storedChampion = gameDoc.champion === undefined ? null : gameDoc.champion;
  const champion = finalists.includes(storedChampion) ? storedChampion : null;

  return { sf1, sf2, finalists, champion };
};

/**
 * Computes cumulative standings across all games for every roster member.
 *
 * Scoring per game (only games that have a `draw`):
 *  - Everyone in the champion group gets 3 points and juara += 1.
 *  - Everyone in a finalist group that did NOT win gets 1 point and
 *    finalis += 1.
 *  - A group that only won its semifinal, with the final not yet decided,
 *    still counts as a finalist (1 point). Once the final IS decided, the
 *    champion group gets 3 points only (not 3+1 - champion supersedes the
 *    finalist bonus for that same game).
 *
 * @param {(Object.<string, Object>|Array<Object>)} gamesDocs - map or array of game docs
 * @param {{kode: string, nama: string, divisi: string}[]} roster - the full roster
 * @returns {{kode: string, nama: string, divisi: string, points: number, juara: number, finalis: number}[]}
 */
Engine.computeStandings = (gamesDocs, roster) => {
  const stats = new Map();
  for (const person of roster) {
    stats.set(person.kode, {
      kode: person.kode,
      nama: person.nama,
      divisi: person.divisi,
      points: 0,
      juara: 0,
      finalis: 0,
    });
  }

  const games = Array.isArray(gamesDocs) ? gamesDocs : Object.values(gamesDocs || {});

  for (const gameDoc of games) {
    if (!gameDoc || !gameDoc.draw) continue;

    const { finalists, champion } = Engine.resolveBracket(gameDoc);
    const [f1, f2] = finalists;

    for (const groupIndex of finalists) {
      if (groupIndex === null || groupIndex === undefined) continue;
      const group = gameDoc.draw[groupIndex] || [];
      const isChampion = champion !== null && groupIndex === champion;

      for (const kode of group) {
        const entry = stats.get(kode);
        if (!entry) continue; // ignore codes not present in roster

        if (isChampion) {
          entry.points += 3;
          entry.juara += 1;
        } else {
          entry.points += 1;
          entry.finalis += 1;
        }
      }
    }

    // Avoid double-crediting a group that appears as both f1 and f2
    // (shouldn't normally happen, but guards against malformed data).
    void f1;
    void f2;
  }

  return Array.from(stats.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.nama.localeCompare(b.nama);
  });
};

if (typeof window !== "undefined") window.Engine = Engine;
if (typeof globalThis !== "undefined") globalThis.Engine = Engine;
