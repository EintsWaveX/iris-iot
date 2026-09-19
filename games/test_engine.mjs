// Node test runner for games/src/engine.js — no dependencies, no framework.
// Run with: node games/test_engine.mjs

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const enginePath = path.join(__dirname, "src", "engine.js");
const engineSrc = await readFile(enginePath, "utf-8");

// engine.js is a plain script (no module syntax) that assigns to
// globalThis.Engine — running it through `new Function` lets us reuse the
// exact same file the browser loads, with no transpilation or shims.
new Function(engineSrc)();
const Engine = globalThis.Engine;

let passCount = 0;
let failCount = 0;

function assert(cond, msg) {
  if (!cond) {
    failCount += 1;
    console.error(`FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  passCount += 1;
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.log(`not ok - ${name}`);
    console.log(`    ${err.message}`);
  }
}

// ---- Fixtures -------------------------------------------------------

const divisions = {
  Inti: 4,
  ASO: 4,
  ARD: 4,
  ADS: 3,
  ADC: 3,
  AER: 4,
  ARM: 3,
};

function buildRoster() {
  const roster = [];
  let n = 1;
  for (const [divisi, count] of Object.entries(divisions)) {
    for (let i = 0; i < count; i++) {
      roster.push({
        kode: `K${n}`,
        nama: `Nama ${String(n).padStart(2, "0")}`,
        nim: `NIM${n}`,
        divisi,
      });
      n += 1;
    }
  }
  return roster;
}

const roster = buildRoster();
assert(roster.length === 25, "fixture roster has 25 members");

// ---- Test 1: group sizes with all 25 present -------------------------

test("drawGroups: all present -> sizes [7,6,6,6] (some order), total 25", () => {
  const presentCodes = roster.map((r) => r.kode);
  const groups = Engine.drawGroups(presentCodes, roster, 4);
  assert(groups.length === 4, "returns 4 groups");
  const sizes = groups.map((g) => g.length).sort((a, b) => a - b);
  assert(
    JSON.stringify(sizes) === JSON.stringify([6, 6, 6, 7]),
    `sizes should sort to [6,6,6,7], got ${JSON.stringify(sizes)}`
  );
  const total = groups.reduce((sum, g) => sum + g.length, 0);
  assert(total === 25, `total should be 25, got ${total}`);
});

// ---- Test 2: no duplicates, no omissions ------------------------------

test("drawGroups: every present code appears exactly once", () => {
  const presentCodes = roster.map((r) => r.kode);
  const groups = Engine.drawGroups(presentCodes, roster, 4);
  const flat = [].concat(...groups);
  assert(flat.length === presentCodes.length, "flat length matches present count");
  const seen = new Set();
  for (const kode of flat) {
    assert(!seen.has(kode), `duplicate code found: ${kode}`);
    seen.add(kode);
  }
  for (const kode of presentCodes) {
    assert(seen.has(kode), `missing code: ${kode}`);
  }
});

// ---- Test 3: division balance over 200 runs ---------------------------

test("drawGroups: division balance holds over 200 runs", () => {
  const presentCodes = roster.map((r) => r.kode);
  const divisionSizes = {};
  for (const r of roster) {
    divisionSizes[r.divisi] = (divisionSizes[r.divisi] || 0) + 1;
  }

  for (let run = 0; run < 200; run++) {
    const groups = Engine.drawGroups(presentCodes, roster, 4);
    for (const group of groups) {
      const counts = {};
      for (const kode of group) {
        const person = roster.find((r) => r.kode === kode);
        counts[person.divisi] = (counts[person.divisi] || 0) + 1;
      }
      for (const [divisi, count] of Object.entries(counts)) {
        const maxAllowed = Math.ceil(divisionSizes[divisi] / 4) + 1;
        assert(
          count <= maxAllowed,
          `run ${run}: division ${divisi} had ${count} in one group (max allowed ${maxAllowed}, division size ${divisionSizes[divisi]})`
        );
      }
    }
  }
});

// ---- Test 4: absent members ---------------------------------------

test("drawGroups: absent members never appear, sizes [5,5,5,5]", () => {
  const absentCodes = new Set(["K1", "K5", "K9", "K13", "K17"]);
  const presentCodes = roster.filter((r) => !absentCodes.has(r.kode)).map((r) => r.kode);
  assert(presentCodes.length === 20, "20 present after removing 5");

  const groups = Engine.drawGroups(presentCodes, roster, 4);
  const sizes = groups.map((g) => g.length).sort((a, b) => a - b);
  assert(
    JSON.stringify(sizes) === JSON.stringify([5, 5, 5, 5]),
    `sizes should be [5,5,5,5], got ${JSON.stringify(sizes)}`
  );

  const flat = [].concat(...groups);
  for (const absent of absentCodes) {
    assert(!flat.includes(absent), `absent code ${absent} should not appear`);
  }
});

// ---- Test 5: zero present -------------------------------------------

test("drawGroups: zero present returns 4 empty arrays without throwing", () => {
  const groups = Engine.drawGroups([], roster, 4);
  assert(groups.length === 4, "returns 4 groups");
  for (const g of groups) {
    assert(Array.isArray(g) && g.length === 0, "each group is an empty array");
  }
});

// ---- Test 6: resolveBracket champion guard ---------------------------

test("resolveBracket: null champion when stored champion is not a finalist", () => {
  const gameDoc = {
    draw: [["a"], ["b"], ["c"], ["d"]],
    sf1: 0,
    sf2: null,
    champion: 2, // stale: 2 never made the final (sf2 undecided)
  };
  const result = Engine.resolveBracket(gameDoc);
  assert(result.sf1 === 0, "sf1 preserved");
  assert(result.sf2 === null, "sf2 preserved as null");
  assert(JSON.stringify(result.finalists) === JSON.stringify([0, null]), "finalists is [0, null]");
  assert(result.champion === null, "champion nulled out because 2 is not a finalist");
});

test("resolveBracket: champion preserved when it is a valid finalist", () => {
  const gameDoc = {
    draw: [["a"], ["b"], ["c"], ["d"]],
    sf1: 0,
    sf2: 3,
    champion: 3,
  };
  const result = Engine.resolveBracket(gameDoc);
  assert(JSON.stringify(result.finalists) === JSON.stringify([0, 3]), "finalists is [0, 3]");
  assert(result.champion === 3, "champion preserved as 3");
});

// ---- Test 7: computeStandings scoring ---------------------------------

test("computeStandings: champion +3/juara, losing finalist +1/finalis, uninvolved 0", () => {
  const miniRoster = [
    { kode: "A1", nama: "Alpha One", divisi: "Inti" },
    { kode: "A2", nama: "Alpha Two", divisi: "Inti" },
    { kode: "B1", nama: "Bravo One", divisi: "ASO" },
    { kode: "B2", nama: "Bravo Two", divisi: "ASO" },
    { kode: "C1", nama: "Charlie One", divisi: "ARD" },
    { kode: "C2", nama: "Charlie Two", divisi: "ARD" },
    { kode: "Z1", nama: "Zulu Bystander", divisi: "ARM" },
  ];

  const gamesDocs = {
    g1: {
      draw: [["A1", "A2"], ["B1", "B2"], ["C1", "C2"], []],
      sf1: 0, // group 0 beat group 1
      sf2: 2, // group 2 beat group 3
      champion: 0, // group 0 won the final
    },
  };

  const standings = Engine.computeStandings(gamesDocs, miniRoster);
  const byKode = Object.fromEntries(standings.map((s) => [s.kode, s]));

  assert(byKode.A1.points === 3 && byKode.A1.juara === 1, "A1 (champion group) has 3 points, juara 1");
  assert(byKode.A2.points === 3 && byKode.A2.juara === 1, "A2 (champion group) has 3 points, juara 1");

  assert(byKode.C1.points === 1 && byKode.C1.finalis === 1, "C1 (losing finalist) has 1 point, finalis 1");
  assert(byKode.C2.points === 1 && byKode.C2.finalis === 1, "C2 (losing finalist) has 1 point, finalis 1");

  assert(byKode.B1.points === 0, "B1 (lost semifinal, never a finalist) has 0 points");
  assert(byKode.B2.points === 0, "B2 (lost semifinal, never a finalist) has 0 points");

  assert(byKode.Z1.points === 0, "Z1 (uninvolved) has 0 points");
  assert(standings.some((s) => s.kode === "Z1"), "Z1 still appears in the output");
  assert(standings.length === miniRoster.length, "output has one entry per roster member");
});

// ---- Test 8: sorting ---------------------------------------------------

test("computeStandings: output is non-increasing in points", () => {
  const miniRoster = [
    { kode: "A1", nama: "Alpha One", divisi: "Inti" },
    { kode: "A2", nama: "Alpha Two", divisi: "Inti" },
    { kode: "B1", nama: "Bravo One", divisi: "ASO" },
    { kode: "B2", nama: "Bravo Two", divisi: "ASO" },
    { kode: "C1", nama: "Charlie One", divisi: "ARD" },
    { kode: "C2", nama: "Charlie Two", divisi: "ARD" },
    { kode: "Z1", nama: "Zulu Bystander", divisi: "ARM" },
  ];

  const gamesDocs = {
    g1: {
      draw: [["A1", "A2"], ["B1", "B2"], ["C1", "C2"], []],
      sf1: 0,
      sf2: 2,
      champion: 0,
    },
  };

  const standings = Engine.computeStandings(gamesDocs, miniRoster);
  for (let i = 1; i < standings.length; i++) {
    assert(
      standings[i - 1].points >= standings[i].points,
      `points not non-increasing at index ${i}: ${standings[i - 1].points} then ${standings[i].points}`
    );
  }
});

// ---- Summary ------------------------------------------------------------

console.log(`\n${passCount} assertions passed, ${failCount} failed.`);
if (failCount > 0) {
  process.exit(1);
}
