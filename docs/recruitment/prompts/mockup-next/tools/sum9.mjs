import fs from "node:fs";
const d = JSON.parse(fs.readFileSync("./shots/audit9.json", "utf8"));
const by = new Map();
for (const r of d.results) {
  if (r.error) { console.log("ERR", r.screen, r.state, r.error); continue; }
  for (const f of r.findings) {
    const k = `${r.screen}|${f.kind}|${f.el}`;
    if (!by.has(k)) by.set(k, { screen: r.screen, ...f, n: 0, states: new Set(), sizes: new Set(), first: r });
    const b = by.get(k); b.n++; b.states.add(r.state); b.sizes.add(r.size + r.theme[0]);
  }
}
const rows = [...by.values()].filter((x) => x.sev !== "info");
const kinds = {};
for (const x of rows) kinds[x.kind] = (kinds[x.kind] || 0) + 1;
console.log("distinct findings", rows.length, kinds);
const sevOrder = { broken: 0, ugly: 1, fragile: 2, info: 3 };
rows.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev] || a.screen.localeCompare(b.screen));
for (const x of rows.filter((x) => x.sev !== "fragile")) console.log(x.sev.padEnd(7), x.screen.padEnd(11), x.kind.padEnd(20), x.el.slice(0, 60).padEnd(60), "|", x.detail.slice(0, 150), `| ${x.states.size}st ${[...x.sizes].join(",")}`);
