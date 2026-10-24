/**
 * The draw (EXAM-ENGINE 3). A seat's questions depend only on the edition's
 * salt, the seat id and the part, so when or how often they are computed does
 * not matter; the API still stores them. Integer math only (Math.imul,
 * >>> 0), so Node, the browser and the tests agree bit for bit.
 */
import type { DrawnItem, Lang, PartCount, PartKey, Protocol, Question, Rng } from "./exam-types.js";
import { PROTOCOLS } from "./exam-types.js";
import { makePerm, shuffle } from "./formats.js";

/* ----------------------------------------------------------------- seeds */

const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmacHex(saltHex: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    hexBytes(saltHex),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
}

/** HMAC-SHA256(salt, "draw:<seat>:<part>") in hex. The only async step. */
export const drawSeed = (saltHex: string, seatId: number, part: PartKey) =>
  hmacHex(saltHex, `draw:${seatId}:${part}`);

/** HMAC-SHA256(salt, "room:<id>"): the Live Coding deals of one room. */
export const roomSeed = (saltHex: string, roomId: number) => hmacHex(saltHex, `room:${roomId}`);

/* ------------------------------------------------------------- generator */

const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

/** xoshiro128** over a 4-word state (not all zero). */
export function xoshiro128ss(state: readonly number[]): Rng {
  const s = Uint32Array.from(state);
  return {
    u32() {
      const out = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
      const t = (s[1] << 9) >>> 0;
      s[2] ^= s[0];
      s[3] ^= s[1];
      s[1] ^= s[2];
      s[0] ^= s[3];
      s[2] ^= t;
      s[3] = rotl(s[3], 11);
      return out;
    },
  };
}

function splitmix32(x: number): number {
  let z = (x + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** FNV-1a over the tags, joined with NUL. */
function tagHash(tags: readonly (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = tags.join("\u0000");
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** A generator from a 32-byte hex seed mixed with tags ("q", questionId). */
export function rngFrom(seedHex: string, ...tags: (string | number)[]): Rng {
  const b = hexBytes(seedHex.padEnd(64, "0").slice(0, 64));
  const word = (i: number) =>
    ((b[i * 4] << 24) | (b[i * 4 + 1] << 16) | (b[i * 4 + 2] << 8) | b[i * 4 + 3]) >>> 0;
  const h = tagHash(tags);
  const state = [0, 1, 2, 3].map((i) =>
    splitmix32(word(i) ^ word(i + 4) ^ h ^ Math.imul(i + 1, 0x9e3779b9)),
  );
  if (!state.some((x) => x !== 0)) state[0] = 1;
  return xoshiro128ss(state);
}

/* ------------------------------------------------------------- the draw */

export class DrawShort extends Error {
  constructor(
    readonly lang: Lang,
    readonly need: number,
    readonly have: number,
  ) {
    super(`draw: ${lang} needs ${need}, the pool has ${have}`);
  }
}

const LANG_ORDER: Lang[] = ["cpp", "py", "any"];
const ofLang = (pool: readonly Question[], lang: Lang) =>
  lang === "any" ? [...pool] : pool.filter((p) => p.lang === lang);

/** Each language of the counts with fewer questions than it shows. */
export function poolShortfall(
  counts: Partial<Record<Lang, PartCount>>,
  pool: readonly Question[],
): { lang: Lang; need: number; have: number }[] {
  return LANG_ORDER.flatMap((lang) => {
    const c = counts[lang];
    const have = ofLang(pool, lang).length;
    return c && have < c.shown ? [{ lang, need: c.shown, have }] : [];
  });
}

/**
 * One seat's questions for one part. `pool` is the part's ready, not voided
 * questions. C++ block first, then PY (or the one `any` block).
 */
export function drawPart(
  seedHex: string,
  counts: Partial<Record<Lang, PartCount>>,
  pool: readonly Question[],
): DrawnItem[] {
  const sorted = [...pool].sort((a, b) => a.id - b.id);
  const items: DrawnItem[] = [];
  for (const lang of LANG_ORDER) {
    const c = counts[lang];
    if (!c) continue;
    const mine = ofLang(sorted, lang);
    if (mine.length < c.shown) throw new DrawShort(lang, c.shown, mine.length);
    for (const question of shuffle(mine, rngFrom(seedHex, "pick", lang)).slice(0, c.shown)) {
      items.push({
        q: question.id,
        v: question.version,
        lang,
        perm: makePerm(question, rngFrom(seedHex, "q", question.id)),
      });
    }
  }
  return items;
}

/* ------------------------------------------------------ Live Coding deals */

/** The k-th topic of a room: every topic once per cycle, then a fresh shuffle. */
export function topicAt(roomSeedHex: string, readyTopicIds: readonly number[], k: number): number {
  const n = readyTopicIds.length;
  if (n === 0) throw new RangeError("topicAt: no ready topic");
  const ids = [...readyTopicIds].sort((a, b) => a - b);
  const cycle = Math.floor(k / n);
  return shuffle(ids, rngFrom(roomSeedHex, "topic", cycle))[k % n];
}

/** The least used of the topic's protocols in the room, ties from the seed. */
export function pickProtocol(
  fits: readonly Protocol[],
  used: Partial<Record<Protocol, number>>,
  roomSeedHex: string,
  k: number,
  exclude?: Protocol,
): Protocol {
  const inOrder = PROTOCOLS.filter((p) => fits.includes(p));
  const open = inOrder.filter((p) => p !== exclude);
  const choices = open.length ? open : inOrder;
  const least = Math.min(...choices.map((p) => used[p] ?? 0));
  const ties = choices.filter((p) => (used[p] ?? 0) === least);
  return shuffle(ties, rngFrom(roomSeedHex, "proto", k))[0];
}
