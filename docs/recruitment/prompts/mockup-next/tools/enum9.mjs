import { open } from "./lib8.mjs";
const t = await open();
const list = await t.p.evaluate(() => P9.screens.filter((s) => ["q1", "q2", "q3"].includes(s.group)).map((s) => ({ id: s.id, group: s.group, title: s.title, variants: (s.variants || []).map((v) => ({ key: v.key, def: v.def, opts: v.options.map((o) => o.v + "=" + o.l) })) })));
let n = 0;
for (const s of list) { const c = 1 + s.variants.reduce((a, v) => a + v.opts.length - 1, 0); n += c; console.log(s.group, s.id, "states:", c, "|", s.variants.map((v) => v.key + "(" + v.opts.length + ")").join(" ")); }
console.log("total states", n, "screens", list.length);
await t.b.close();
import fs from "node:fs"; fs.writeFileSync("./shots/enum9.json", JSON.stringify(list, null, 1));
