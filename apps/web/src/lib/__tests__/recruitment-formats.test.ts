/**
 * The seven formats (EXAM-ENGINE 1.3): shuffles, the candidate's view,
 * credit as an exact fraction, validation and the structure fingerprint.
 */
import { describe, expect, it } from "vitest";
import type {
  FitbQ,
  FixQ,
  LinesQ,
  MatchQ,
  MultiQ,
  OrderQ,
  Question,
  Rng,
  SingleQ,
} from "../recruitment/exam-types";
import { frac, isOne } from "../recruitment/frac";
import {
  credit,
  makePerm,
  newId,
  normalizeBlank,
  shuffle,
  structureKey,
  toView,
  validateQuestion,
} from "../recruitment/formats";

/** A small fixed generator, so the tests do not depend on draw.ts. */
function lcg(seed: number): Rng {
  let s = seed >>> 0;
  return {
    u32() {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s;
    },
  };
}

const opts = (...ids: string[]) => ids.map((id) => ({ id, text: `opsi ${id}` }));

const single: SingleQ = {
  id: 1,
  part: "logika",
  lang: "cpp",
  format: "single",
  version: 1,
  body: { prompt: "Pilih satu.", options: opts("a1", "b2", "c3", "d4"), shuffle: true },
  answer: { correct: "b2" },
};
const multi: MultiQ = {
  id: 2,
  part: "logika",
  lang: "cpp",
  format: "multi",
  version: 1,
  body: { prompt: "Pilih yang benar.", options: opts("a1", "b2", "c3", "d4"), shuffle: true },
  answer: { correct: ["a1", "c3"] },
};
const lines: LinesQ = {
  id: 3,
  part: "kodingan",
  lang: "cpp",
  format: "lines",
  version: 1,
  body: {
    prompt: "Klik baris yang salah.",
    code: { lang: "cpp", src: "int a = 1;\n\nint b = a +;\nreturn b;" },
  },
  answer: { lines: [3] },
};
const fix: FixQ = {
  id: 4,
  part: "kodingan",
  lang: "py",
  format: "fix",
  version: 1,
  body: {
    prompt: "Pilih isi yang benar.",
    code: { lang: "py", src: "x = 1\nwhile x < 3:\n    x =+ 1" },
    slots: [
      {
        line: 2,
        options: [
          { id: "s2a", text: "while x < 3:" },
          { id: "s2b", text: "while x <= 3:" },
        ],
      },
      {
        line: 3,
        options: [
          { id: "s3a", text: "    x =+ 1" },
          { id: "s3b", text: "    x += 1" },
          { id: "s3c", text: "    x + 1" },
        ],
      },
    ],
  },
  answer: { picks: { 2: "s2a", 3: "s3b" } },
};
const order: OrderQ = {
  id: 5,
  part: "logika",
  lang: "cpp",
  format: "order",
  version: 1,
  body: {
    prompt: "Susun.",
    lang: "cpp",
    lines: [
      { id: "k9", text: "void setup() {" },
      { id: "m2", text: "  Serial.begin(115200);" },
      { id: "p4", text: "}" },
      { id: "q7", text: "void loop() {" },
      { id: "r1", text: "}" },
    ],
  },
  answer: { order: ["k9", "m2", "p4", "q7", "r1"], also: [] },
};
const order4: OrderQ = {
  ...order,
  id: 6,
  body: {
    prompt: "Susun.",
    lang: "cpp",
    lines: [
      { id: "l1", text: "satu" },
      { id: "l2", text: "dua" },
      { id: "l3", text: "tiga" },
      { id: "l4", text: "empat" },
    ],
  },
  answer: { order: ["l1", "l2", "l3", "l4"], also: [] },
};
const match: MatchQ = {
  id: 7,
  part: "mikro",
  lang: "any",
  format: "match",
  version: 1,
  body: {
    prompt: "Pasangkan.",
    left: [
      { id: "g1", text: "LED mati" },
      { id: "g2", text: "Tombol naik turun" },
      { id: "g3", text: "Selalu 4095" },
    ],
    right: [
      { id: "p1", text: "Kaki terbalik" },
      { id: "p2", text: "Pin mengambang" },
      { id: "p3", text: "Ke 3V3" },
      { id: "p4", text: "Pengalih" },
    ],
  },
  answer: { pairs: { g1: "p1", g2: "p2", g3: "p3" } },
};
const fitb: FitbQ = {
  id: 8,
  part: "fitb",
  lang: "cpp",
  format: "fitb",
  version: 1,
  body: {
    prompt: "Isi bagian kosong.",
    code: { lang: "cpp", src: "Serial.__(1)__(115200);\nSerial.println(__(2)__);" },
    blanks: [{ n: 1 }, { n: 2, width: 14, hint: "teks" }],
  },
  answer: { blanks: { 1: { accept: ["begin"] }, 2: { accept: ['"halo"'], space: "none" } } },
};

const ALL: Question[] = [single, multi, lines, fix, order, order4, match, fitb];

describe("credit", () => {
  it("single: 1 for the right pick, else 0, null is 0", () => {
    expect(credit(single, { pick: "b2" })).toEqual(frac(1));
    expect(credit(single, { pick: "a1" })).toEqual(frac(0));
    expect(credit(single, { pick: null })).toEqual(frac(0));
    expect(credit(single, null)).toEqual(frac(0));
  });

  it("multi: (right − wrong) ÷ |correct|, never below 0 (4.4)", () => {
    expect(credit(multi, { picks: ["a1", "c3"] })).toEqual(frac(1));
    expect(credit(multi, { picks: ["a1"] })).toEqual(frac(1, 2));
    expect(credit(multi, { picks: ["a1", "b2", "c3"] })).toEqual(frac(1, 2));
    expect(credit(multi, { picks: ["b2", "d4"] })).toEqual(frac(0));
    expect(credit(multi, { picks: ["a1", "a1"] })).toEqual(frac(1, 2));
    expect(credit(multi, { picks: [] })).toEqual(frac(0));
  });

  it("lines: the checkbox formula over line numbers; one bug gives 0 or 1", () => {
    expect(credit(lines, { picks: [3] })).toEqual(frac(1));
    expect(credit(lines, { picks: [3, 4] })).toEqual(frac(0));
    expect(credit(lines, { picks: [1] })).toEqual(frac(0));
  });

  it("fix: right slots ÷ slots", () => {
    expect(credit(fix, { picks: { 2: "s2a", 3: "s3b" } })).toEqual(frac(1));
    expect(credit(fix, { picks: { 2: "s2a", 3: null } })).toEqual(frac(1, 2));
    expect(credit(fix, { picks: {} })).toEqual(frac(0));
  });

  it("order: exact gives 1, otherwise LCS ÷ n × 1/2 (4.4: 3/8)", () => {
    expect(credit(order4, { order: ["l1", "l2", "l3", "l4"] })).toEqual(frac(1));
    expect(credit(order4, { order: ["l1", "l3", "l2", "l4"] })).toEqual(frac(3, 8));
    expect(credit(order4, { order: ["l4", "l3", "l2", "l1"] })).toEqual(frac(1, 8));
    expect(credit(order4, null)).toEqual(frac(0));
  });

  it("order: identical lines are interchangeable (texts, not ids)", () => {
    expect(credit(order, { order: ["k9", "m2", "r1", "q7", "p4"] })).toEqual(frac(1));
  });

  it("order: another accepted order also earns 1", () => {
    const q: OrderQ = {
      ...order4,
      answer: { order: ["l1", "l2", "l3", "l4"], also: [["l3", "l4", "l1", "l2"]] },
    };
    expect(credit(q, { order: ["l3", "l4", "l1", "l2"] })).toEqual(frac(1));
  });

  it("order: a value that is not a permutation of the lines earns 0", () => {
    expect(credit(order4, { order: ["l1", "l2", "l3"] })).toEqual(frac(0));
    expect(credit(order4, { order: ["l1", "l1", "l3", "l4"] })).toEqual(frac(0));
    expect(credit(order4, { order: ["l1", "l2", "l3", "zz"] })).toEqual(frac(0));
  });

  it("match: right pairs ÷ left rows", () => {
    expect(credit(match, { pairs: { g1: "p1", g2: "p2", g3: "p3" } })).toEqual(frac(1));
    expect(credit(match, { pairs: { g1: "p1", g2: "p4", g3: null } })).toEqual(frac(1, 3));
  });

  it("fitb: right blanks ÷ blanks (4.4: 1 of 2 is 1/2)", () => {
    expect(credit(fitb, { blanks: { 1: "begin", 2: '"halo"' } })).toEqual(frac(1));
    expect(credit(fitb, { blanks: { 1: " begin ", 2: "x" } })).toEqual(frac(1, 2));
    expect(credit(fitb, { blanks: { 1: "Begin", 2: "“halo”" } })).toEqual(frac(1, 2));
    expect(credit(fitb, { blanks: { 2: ' " halo " ' } })).toEqual(frac(1, 2));
    expect(credit(fitb, { blanks: {} })).toEqual(frac(0));
    expect(credit(fitb, { blanks: { 2: '"ha lo"' } })).toEqual(frac(1, 2));
  });
});

describe("normalizeBlank", () => {
  it("trims by default and keeps case", () => {
    expect(normalizeBlank("  Begin ", {})).toBe("Begin");
  });
  it("straightens curly quotes and applies NFC", () => {
    expect(normalizeBlank("“a” ‘b’", {})).toBe("\"a\" 'b'");
    expect(normalizeBlank("é", {})).toBe("é");
  });
  it("collapse, none, exact and ignore case", () => {
    expect(normalizeBlank(" a   b ", { space: "collapse" })).toBe("a b");
    expect(normalizeBlank(" a  b ", { space: "none" })).toBe("ab");
    expect(normalizeBlank(" a ", { space: "exact" })).toBe(" a ");
    expect(normalizeBlank("HIGH", { case: "ignore" })).toBe("high");
  });
});

describe("makePerm and toView", () => {
  it("is the same for the same generator", () => {
    for (const q of ALL) expect(makePerm(q, lcg(7))).toEqual(makePerm(q, lcg(7)));
  });

  it("single keeps the authored order when shuffle is off", () => {
    const q: SingleQ = { ...single, body: { ...single.body, shuffle: false } };
    expect(makePerm(q, lcg(3))).toEqual({ options: ["a1", "b2", "c3", "d4"] });
  });

  it("lines and fitb have no perm", () => {
    expect(makePerm(lines, lcg(1))).toBeNull();
    expect(makePerm(fitb, lcg(1))).toBeNull();
  });

  it("an order question never starts right, for any seed", () => {
    for (let s = 0; s < 300; s++) {
      const perm = makePerm(order, lcg(s)) as { lines: string[] };
      expect(isOne(credit(order, { order: perm.lines }))).toBe(false);
      expect([...perm.lines].sort()).toEqual(["k9", "m2", "p4", "q7", "r1"]);
    }
  });

  it("shuffles every item set as a permutation", () => {
    const p = makePerm(match, lcg(11)) as { left: string[]; right: string[] };
    expect([...p.left].sort()).toEqual(["g1", "g2", "g3"]);
    expect([...p.right].sort()).toEqual(["p1", "p2", "p3", "p4"]);
    const f = makePerm(fix, lcg(11)) as { slots: Record<number, string[]> };
    expect([...f.slots[3]].sort()).toEqual(["s3a", "s3b", "s3c"]);
  });

  it("the view follows the perm and never carries the key", () => {
    const perm = { options: ["d4", "c3", "b2", "a1"] };
    const v = toView(single, perm);
    expect(v).toEqual({
      format: "single",
      prompt: "Pilih satu.",
      options: opts("d4", "c3", "b2", "a1"),
    });
    for (const q of ALL) {
      const text = JSON.stringify(toView(q, makePerm(q, lcg(5))));
      expect(text).not.toContain("correct");
      expect(text).not.toContain("accept");
      expect(text).not.toContain("shuffle");
    }
  });

  it("the fitb view gives every blank a width, 10 by default", () => {
    const v = toView(fitb, null);
    expect(v.format === "fitb" && v.blanks).toEqual([
      { n: 1, width: 10 },
      { n: 2, width: 14, hint: "teks" },
    ]);
  });

  it("the order view lists the lines in perm order", () => {
    const v = toView(order4, { lines: ["l3", "l1", "l4", "l2"] });
    expect(v.format === "order" && v.lines.map((l) => l.id)).toEqual(["l3", "l1", "l4", "l2"]);
  });
});

describe("shuffle", () => {
  it("returns a permutation and leaves the input alone", () => {
    const a = [1, 2, 3, 4, 5, 6];
    const b = shuffle(a, lcg(9));
    expect(a).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...b].sort()).toEqual(a);
  });
});

describe("validateQuestion", () => {
  it("passes every fixture", () => {
    for (const q of ALL) expect(validateQuestion(q)).toEqual([]);
  });

  const kodes = (q: Question) => validateQuestion(q).map((e) => e.kode);

  it("single: option count, ids and the key", () => {
    expect(kodes({ ...single, body: { ...single.body, options: opts("a1") } })).toContain(
      "opsi_jumlah",
    );
    expect(kodes({ ...single, body: { ...single.body, options: opts("a1", "a1") } })).toContain(
      "id_ganda",
    );
    expect(kodes({ ...single, answer: { correct: "zz9" } })).toContain("kunci_salah");
    expect(kodes({ ...single, body: { ...single.body, prompt: " " } })).toContain("prompt_kosong");
  });

  it("multi needs at least one right option", () => {
    expect(kodes({ ...multi, answer: { correct: [] } })).toContain("kunci_salah");
  });

  it("lines: the key must name real, non-blank lines", () => {
    expect(kodes({ ...lines, answer: { lines: [2] } })).toContain("baris_kosong");
    expect(kodes({ ...lines, answer: { lines: [9] } })).toContain("kunci_salah");
    expect(kodes({ ...lines, answer: { lines: [] } })).toContain("kunci_salah");
  });

  it("fix: slots on real lines, each keyed to its own option", () => {
    expect(kodes({ ...fix, answer: { picks: { 2: "s3b", 3: "s3b" } } })).toContain("kunci_salah");
    expect(kodes({ ...fix, answer: { picks: { 2: "s2a" } } })).toContain("kunci_salah");
    const far = {
      ...fix,
      body: { ...fix.body, slots: [{ ...fix.body.slots[0], line: 9 }, fix.body.slots[1]] },
    };
    expect(kodes(far)).toContain("baris_salah");
  });

  it("order: the key and every also are permutations; the lines are not all the same", () => {
    expect(kodes({ ...order4, answer: { order: ["l1", "l2", "l3"], also: [] } })).toContain(
      "kunci_salah",
    );
    expect(
      kodes({
        ...order4,
        answer: { order: order4.answer.order, also: [["l1", "l1", "l2", "l3"]] },
      }),
    ).toContain("kunci_salah");
    const same = {
      ...order4,
      body: { ...order4.body, lines: order4.body.lines.map((l) => ({ ...l, text: "}" })) },
    };
    expect(kodes(same)).toContain("baris_sama");
  });

  it("match: right has left to left + 2 items, pairs one to one", () => {
    expect(kodes({ ...match, answer: { pairs: { g1: "p1", g2: "p1", g3: "p3" } } })).toContain(
      "kunci_salah",
    );
    const many = {
      ...match,
      body: { ...match.body, right: [...match.body.right, ...opts("x1", "x2")] },
    };
    expect(kodes(many)).toContain("opsi_jumlah");
  });

  it("fitb: blanks 1..k, each once in the source and in the key", () => {
    expect(kodes({ ...fitb, body: { ...fitb.body, blanks: [{ n: 1 }] } })).toContain("celah_salah");
    expect(kodes({ ...fitb, answer: { blanks: { 1: { accept: ["begin"] } } } })).toContain(
      "kunci_salah",
    );
    expect(
      kodes({ ...fitb, answer: { blanks: { 1: { accept: [] }, 2: { accept: ["x"] } } } }),
    ).toContain("kunci_salah");
    const twice = {
      ...fitb,
      body: { ...fitb.body, code: { lang: "cpp" as const, src: "__(1)__ __(1)__ ___(2)___" } },
    };
    expect(kodes(twice)).toContain("celah_salah");
  });
});

describe("structureKey", () => {
  it("ignores text and the key, notices ids and counts", () => {
    const base = structureKey(single);
    expect(
      structureKey({
        ...single,
        body: { ...single.body, prompt: "Lain." },
        answer: { correct: "a1" },
      }),
    ).toBe(base);
    expect(
      structureKey({ ...single, body: { ...single.body, options: opts("a1", "b2", "c3", "e5") } }),
    ).not.toBe(base);
    const l = structureKey(lines);
    expect(
      structureKey({ ...lines, body: { ...lines.body, code: { lang: "cpp", src: "a\n\nb\nc" } } }),
    ).toBe(l);
    expect(
      structureKey({ ...lines, body: { ...lines.body, code: { lang: "cpp", src: "a\nb" } } }),
    ).not.toBe(l);
    const f = structureKey(fitb);
    expect(
      structureKey({ ...fitb, body: { ...fitb.body, blanks: [{ n: 1 }, { n: 2 }, { n: 3 }] } }),
    ).not.toBe(f);
  });
});

describe("newId", () => {
  it("is 6 characters of a to z and 0 to 9", () => {
    for (let i = 0; i < 50; i++) expect(newId()).toMatch(/^[a-z0-9]{6}$/);
    expect(newId(lcg(1))).toBe(newId(lcg(1)));
  });
});
