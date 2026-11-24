/**
 * Applies "Plottingan Wawancara.pdf" (Wawancara I, 24-27 Nov 2026) to the live edition: the Penguji of each
 * Wawancara slot and how many sit with each CaAs (rec_slot.crew_sizes, 1 to 3).
 *
 * It writes exactly what the panel's iv-crew-set and iv-crew-size do (rec_slot_examiner role 'penguji' in booth
 * order, crew_sizes, and the two audit rows), so the Plotting tab reads it as if a panitia had set it by hand.
 * PJ (pj_luar, pj_dalam) are not in the PDF and are never touched. A slot with no row in the PDF is skipped
 * (its crew is left as it is).
 *
 * Dry run by default (reads only, prints the plan and what would change):
 *
 *   node scripts/rec-plot-wawancara.mjs --plan-only                  # checks the PDF's data alone, no database
 *   DATABASE_URL=... node scripts/rec-plot-wawancara.mjs             # dry run against the live database
 *   DATABASE_URL=... node scripts/rec-plot-wawancara.mjs --apply --by <your Asisten NIM> [--accept-warnings]
 *
 * --apply writes everything in one transaction (all slots or none). Blockers (an unknown code, a slot that is not
 * there, an Asisten in two rooms at once, one Asisten twice in a slot) always stop it; warnings (a slot time that is not
 * the PDF's, more plotted rows than CaAs in the slot) stop it unless --accept-warnings.
 * DATABASE_URL is only read from the environment and never printed.
 */
/* ------------------------------------------------------------------ the PDF
 * One entry per day, room and session; each row is a CaAs' booth, [Asisten 1, Asisten 2, ...] ("" or missing =
 * nobody). A blank Asisten 2 means that booth really has one Asisten. Rows after the last filled one are left out.
 * Tue Sesi 1 reads 18.00-19.30 in the PDF; the other days' Sesi 1 read 18.30-19.30; Sesi 2 is 19.30-21.00. */
const PLAN = [
  {
    day: "2026-11-24",
    rooms: {
      15.11: {
        s1: [["ICA", "GAN"], ["TWT", "ADD"], ["NUE"], ["TRA", "TIR"]],
        s2: [
          ["NAB", "GRY"],
          ["ADD", "MCU"],
          ["NUE", "REG"],
          ["TIR", "GAN"],
        ],
      },
      15.14: {
        s1: [["GRY", "LYY"], ["MCU", "NAT"], ["REG", "LUV"], ["NAB"]],
        s2: [["ICA", "LYY"], ["TWT", "NAT"], ["LUV"], ["TRA"]],
      },
    },
    start1: "18.00",
  },
  {
    day: "2026-11-25",
    rooms: {
      15.11: {
        s1: [
          ["OCU", "MCU"],
          ["IKY", "BAR"],
          ["TWT", "GMW"],
          ["LYY", "REG"],
        ],
        s2: [
          ["MCU", "TWT"],
          ["BAR", "LYY"],
          ["GMW", "ZAN"],
          ["REG", "XIN"],
        ],
      },
      15.14: {
        s1: [
          ["ZAN", "GAN"],
          ["XIN", "TIR"],
          ["TRA", "NUE"],
          ["LUV", "ICA"],
        ],
        s2: [
          ["GAN", "TRA"],
          ["TIR", "LUV"],
          ["OCU", "NUE"],
          ["IKY", "NAT"],
        ],
      },
    },
  },
  {
    day: "2026-11-26",
    rooms: {
      15.11: {
        s1: [
          ["XIN", "ADD"],
          ["LYY", "NUE"],
        ],
        s2: [
          ["ADD", "GMW"],
          ["NUE", "NAB"],
          ["NAT", "MCD"],
          ["LYY", "XIN"],
        ],
      },
      15.14: {
        s1: [
          ["NAB", "ICA"],
          ["GMW", "OCU"],
          ["LUV", "MCD"],
        ],
        s2: [],
      },
    },
  },
  {
    day: "2026-11-27",
    rooms: {
      15.11: { s1: [["BAR"], ["MCD"], ["NAB"], ["NUE"]], s2: [] },
      15.14: { s1: [["GAN"], ["XIN"], ["BRY"]], s2: [] },
    },
  },
];
const EXPECT = { s1: "18.30", s2: "19.30" };

/* ------------------------------------------------------------------ helpers */

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = flag("--apply");
const PLAN_ONLY = flag("--plan-only");
const ACCEPT = flag("--accept-warnings");
const BY = val("--by");

const minutes = (hhmm) => {
  const [h, m] = hhmm.split(".").map(Number);
  return h * 60 + m;
};
const blockers = [];
const warnings = [];
const block = (m) => blockers.push(m);
const warn = (m) => warnings.push(m);

/** The flat plan: one entry per day, room and session that has at least one row. */
const entries = [];
for (const d of PLAN)
  for (const [room, ses] of Object.entries(d.rooms))
    for (const s of ["s1", "s2"]) {
      const rows = ses[s];
      if (!rows.length) continue;
      const expect = s === "s1" && d.start1 ? d.start1 : EXPECT[s];
      const flat = rows.flat();
      const dup = flat.filter((c, i) => flat.indexOf(c) !== i);
      if (dup.length)
        block(`${d.day} ${room} ${s}: ${[...new Set(dup)].join(", ")} twice in one slot`);
      for (const r of rows)
        if (r.length < 1 || r.length > 3)
          block(`${d.day} ${room} ${s}: a booth with ${r.length} Asisten (must be 1 to 3)`);
      entries.push({
        day: d.day,
        room,
        session: s,
        expect,
        rows,
        flat,
        sizes: rows.map((r) => r.length),
      });
    }

// The same Asisten in both rooms of one session (the crew board's clash check, run on the PDF alone).
for (const d of PLAN)
  for (const s of ["s1", "s2"]) {
    const seen = new Map();
    for (const e of entries.filter((x) => x.day === d.day && x.session === s))
      for (const c of e.flat) {
        if (seen.has(c) && seen.get(c) !== e.room)
          block(`${d.day} ${s}: ${c} is in ${seen.get(c)} and ${e.room} at the same time`);
        seen.set(c, e.room);
      }
  }

const show = (e) => e.rows.map((r) => r.join("+")).join(" | ");

/* ------------------------------------------------------------------ run */

async function main() {
  console.log(
    `PDF plan: ${entries.length} slots, ${entries.reduce((n, e) => n + e.rows.length, 0)} booths`,
  );
  if (PLAN_ONLY) {
    for (const e of entries)
      console.log(
        `  ${e.day} ${e.room} ${e.session} ${e.expect}: ${show(e)}   sizes ${JSON.stringify(e.sizes)}`,
      );
    return finish(false);
  }
  if (APPLY && !BY) {
    console.error("--apply needs --by <your Asisten NIM> (it goes in the audit rows)");
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set (read it from /etc/iris-web/env on the server; never paste it anywhere)",
    );
    process.exit(2);
  }
  const { default: pg } = await import("pg"); // loaded here so --plan-only needs no install
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const [ed] = (
      await client.query(
        `select id, year, title from rec_edition where status = 'live' order by year desc limit 1`,
      )
    ).rows;
    if (!ed) throw new Error("no live edition");
    console.log(`Edition: ${ed.year} ${ed.title} (id ${ed.id})`);

    const pool = new Map(
      (
        await client.query(
          `select nim, kode from asisten where status not in ('nonaktif', 'alumni')`,
        )
      ).rows.map((r) => [String(r.kode).toUpperCase(), r.nim]),
    );
    const kodeDari = new Map([...pool].map(([k, n]) => [n, k]));
    const unknown = [...new Set(entries.flatMap((e) => e.flat))].filter((c) => !pool.has(c));
    if (unknown.length) block(`codes not among the active Asisten: ${unknown.join(", ")}`);

    const slots = (
      await client.query(
        `select s.id, s.room, s.crew_sizes,
                (s.starts_at at time zone 'Asia/Jakarta')::date::text as day,
                to_char(s.starts_at at time zone 'Asia/Jakarta', 'HH24.MI') as t0,
                to_char(s.ends_at at time zone 'Asia/Jakarta', 'HH24.MI') as t1,
                (select count(*)::int from rec_slot_assignment a where a.slot_id = s.id and a.stage = 'wawancara') as booths
           from rec_slot s where s.edition_id = $1 and s.stage = 'wawancara' order by s.starts_at, s.room, s.id`,
        [ed.id],
      )
    ).rows;
    const cur = new Map();
    for (const r of (
      await client.query(
        `select slot_id, asisten_nim from rec_slot_examiner
          where role = 'penguji' and slot_id = any($1) order by pos, asisten_nim`,
        [slots.map((s) => s.id)],
      )
    ).rows) {
      if (!cur.has(r.slot_id)) cur.set(r.slot_id, []);
      cur.get(r.slot_id).push(kodeDari.get(r.asisten_nim) ?? r.asisten_nim);
    }

    const used = new Set();
    const todo = [];
    for (const e of entries) {
      const tag = `${e.day} ${e.room} ${e.session}`;
      const cand = slots.filter(
        (s) => s.day === e.day && s.room.replace(/\D/g, "") === e.room.replace(/\D/g, ""),
      );
      if (!cand.length) {
        block(
          `${tag}: no Wawancara slot for that day and room (rooms there: ${
            slots
              .filter((s) => s.day === e.day)
              .map((s) => s.room)
              .join(", ") || "none"
          })`,
        );
        continue;
      }
      const best = cand
        .map((s) => ({ s, d: Math.abs(minutes(s.t0) - minutes(e.expect)) }))
        .sort((a, b) => a.d - b.d)[0];
      if (best.d > 45) {
        block(`${tag}: nearest slot starts ${best.s.t0}, the PDF expects ${e.expect}`);
        continue;
      }
      if (used.has(best.s.id)) {
        block(`${tag}: slot ${best.s.id} is already matched to another session`);
        continue;
      }
      used.add(best.s.id);
      if (best.d > 0)
        warn(`${tag}: slot starts ${best.s.t0}-${best.s.t1}, the PDF says ${e.expect}`);
      if (e.rows.length > best.s.booths)
        warn(
          `${tag}: the PDF plots ${e.rows.length} booths but only ${best.s.booths} CaAs sit in slot ${best.s.id}`,
        );
      todo.push({ e, slot: best.s, before: cur.get(best.s.id) ?? [] });
    }

    console.log("");
    for (const { e, slot, before } of todo) {
      console.log(
        `slot ${slot.id}  ${e.day}  ${slot.room}  ${slot.t0}-${slot.t1}  (${slot.booths} CaAs)  [${e.session}]`,
      );
      console.log(`   PDF    ${show(e)}   sizes ${JSON.stringify(e.sizes)}`);
      console.log(
        `   now    ${before.length ? before.join(" ") : "(no Penguji)"}   sizes ${JSON.stringify(slot.crew_sizes)}`,
      );
    }
    const skipped = slots.filter((s) => !used.has(s.id));
    if (skipped.length)
      console.log(
        `\nLeft alone (not in the PDF): ${skipped.map((s) => `${s.id} ${s.day} ${s.room} ${s.t0}`).join(", ")}`,
      );

    if (!finish(true)) return;
    if (!APPLY) return console.log("\nDry run: nothing written. Add --apply --by <NIM> to write.");

    await client.query("begin");
    try {
      for (const { e, slot } of todo) {
        const nims = e.flat.map((c) => pool.get(c));
        // iv-crew-set: replace the slot's Penguji, in booth order.
        await client.query(
          `delete from rec_slot_examiner where slot_id = $1 and role = 'penguji'`,
          [slot.id],
        );
        for (let pos = 0; pos < nims.length; pos++)
          await client.query(
            `insert into rec_slot_examiner (slot_id, asisten_nim, role, pos) values ($1, $2, 'penguji', $3)`,
            [slot.id, nims[pos], pos],
          );
        // iv-crew-size: sizes cut to the CaAs there are, as the endpoint's cleanSizes does.
        const sizes = e.sizes.slice(0, slot.booths);
        await client.query(`update rec_slot set crew_sizes = $2::jsonb where id = $1`, [
          slot.id,
          sizes.length ? JSON.stringify(sizes) : null,
        ]);
        await client.query(
          `insert into audit (aktor_nim, aksi, detail) values ($1, 'rec_iv_crew', $2)`,
          [
            BY,
            JSON.stringify({
              stage: "wawancara",
              slotIds: [slot.id],
              role: "penguji",
              nims,
              via: "rec-plot-wawancara.mjs",
            }),
          ],
        );
        await client.query(
          `insert into audit (aktor_nim, aksi, detail) values ($1, 'rec_iv_crew_size', $2)`,
          [
            BY,
            JSON.stringify({
              stage: "wawancara",
              slotId: slot.id,
              sizes,
              via: "rec-plot-wawancara.mjs",
            }),
          ],
        );
      }
      await client.query("commit");
      console.log(`\nApplied to ${todo.length} slots.`);
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  } finally {
    await client.end();
  }
}

/** Prints blockers and warnings; true when applying may go on. */
function finish(db) {
  for (const b of blockers) console.log(`BLOCKER  ${b}`);
  for (const w of warnings) console.log(`WARNING  ${w}`);
  const ok = !blockers.length && (!warnings.length || ACCEPT || !APPLY);
  if (blockers.length) console.log("\nStopped: fix the blockers first.");
  else if (warnings.length && APPLY && !ACCEPT)
    console.log("\nStopped: read the warnings, then add --accept-warnings.");
  else if (!db) console.log("PDF data is consistent (no clashes, no duplicates).");
  return ok;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
