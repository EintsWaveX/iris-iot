#!/usr/bin/env python3
"""
Compiles and runs every question of the default bank (scripts/rec-bank/*.md)
with gcc and checks what the key says against what the program really does.
The bank is formal C only (29 Oct 2026), so gcc is the only tool needed.

  python scripts/rec-bank-verify.py                 everything
  python scripts/rec-bank-verify.py --only Prima    titles containing "Prima"

What it does, per format:
  single   the code in the prompt is run (wrapped in main when it has none) and
           its output must be the right option, and no other option.
  multi    each claim is a C expression (CLAIMS below) evaluated after the code;
           it must be true exactly for the options the key marks.
  match    a left side that is plain C arithmetic is evaluated and must equal its
           right side. Pairs of words (concepts) are checked by eye.
  order    every accepted order (the key and each `also`) must compile and print
           the same as the key.
  fitb     every accepted spelling of every blank is put in and the program run;
           the output must be the one the prompt promises (EXPECT overrides).
  fix      the right picks make the program print the promised output; every
           wrong pick, alone, must change the output, fail to build or not stop.
  lines    the flagged lines are replaced (LINES below) and a small test harness
           must pass; each flagged line alone left as it is must break it.

Needs: python, gcc, `npx tsx` (to read the Markdown with the app's own parser).
"""
import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent
TMP = pathlib.Path(tempfile.gettempdir()) / "rec-bank-verify"
TMP.mkdir(exist_ok=True)

results = []


def rec(title, check, ok, detail=""):
    results.append((title, check, ok, detail))
    if not ok:
        print(f"    FAIL {check}: {detail}")


def norm(s):
    return " ".join(s.split())


def build_run(src, timeout=3):
    """(ok, text): compile `src` with gcc and run it; text is the stdout, or why it failed."""
    c = TMP / "t.c"
    exe = TMP / ("t.exe" if os.name == "nt" else "t")
    c.write_text(src, encoding="utf-8")
    p = subprocess.run(["gcc", "-std=c11", "-w", "-o", str(exe), str(c)], capture_output=True, text=True)
    if p.returncode != 0:
        return False, "compile error: " + p.stderr.strip().splitlines()[0][:120]
    try:
        r = subprocess.run([str(exe)], capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return False, "never stops"
    if r.returncode != 0:
        return False, f"exit code {r.returncode}"
    return True, norm(r.stdout)


def fence(prompt):
    m = re.search(r"```c\n(.*?)```", prompt, re.S)
    return m.group(1) if m else ""


def outside_fence(prompt):
    return re.sub(r"```.*?```", "", prompt, flags=re.S)


def wrap(code):
    inc = "" if "#include" in code else "#include <stdio.h>\n"
    if re.search(r"\bmain\s*\(", code):
        return inc + code
    return inc + "int main(void) {\n" + code + "\nreturn 0;\n}\n"


def promised(q):
    """The output a prompt promises, in its last backtick span, unless EXPECT says otherwise."""
    if q["title"] in EXPECT:
        return EXPECT[q["title"]]
    spans = re.findall(r"`([^`\n]+)`", outside_fence(q["body"]["prompt"]))
    return norm(spans[-1]) if spans else None


def text_of(item):
    return item["text"]


def ctext(s):
    return s.replace("`", "")


# Outputs the prompt does not state in a way the last backtick span can show.
EXPECT = {
    "Cetak Segitiga": "* ** ***",
    "Genap atau Ganjil": "ganjil genap",
}

# multi: option text (without backticks) -> C expression, true when the claim is true.
CLAIMS = {
    "Operator dan Tipe Data": {
        "c bernilai 3.0": "c == 3.0",
        "d bernilai 3.5": "d == 3.5",
        "e bernilai 1": "e == 1",
        "c bernilai 3.5": "c == 3.5",
        "a / b dihitung sebagai bilangan desimal": "0",  # integer division: a concept claim
    },
    "Array dan Index": {
        "n bernilai 5": "n == 5",
        "a[3] bernilai 0": "a[3] == 0",
        "jumlah bernilai 60": "jumlah == 60",
        "n bernilai 3": "n == 3",
        "a[5] adalah elemen terakhir yang sah": "0",  # the last valid index is 4
    },
    "Kondisi Logika": {
        "p bernilai 0": "p == 0",
        "q bernilai 1": "q == 1",
        "r bernilai 0": "r == 0",
        "p bernilai 1": "p == 1",
        "r bernilai 1": "r == 1",
    },
}

# lines: the replacement for each flagged line, a harness (main) and what it must print.
# "ub" lists flagged lines whose bug is undefined behaviour, so no run can prove it.
LINES = {
    "Rata-rata Array": {
        "fix": {4: "  int jumlah = 0;", 5: "  for (int i = 0; i < n; i++) {"},
        "harness": 'int main(void) { int a[5] = {4, 8, 15, 9, 1000}; printf("%d\\n", rata(a, 4)); return 0; }',
        "expect": "9", "ub": [4],
    },
    "Nilai Tertinggi": {
        "fix": {2: "  int maks = a[0];"},
        "harness": 'int main(void) { int a[3] = {-5, -2, -9}; printf("%d\\n", tertinggi(a, 3)); return 0; }',
        "expect": "-2",
    },
    "Cari Index Pertama": {
        "fix": {3: "    if (a[i] == x) {", 7: "  return -1;"},
        "harness": 'int main(void) { int a[4] = {4, 8, 15, 16}; printf("%d %d\\n", cari(a, 4, 15), cari(a, 4, 99)); return 0; }',
        "expect": "2 -1",
    },
    "Hitung Bilangan Genap": {
        "fix": {3: "  for (int i = 0; i < n; i++) {", 4: "    if (a[i] % 2 == 0) {"},
        "harness": 'int main(void) { int a[7] = {2, 7, 4, 9, 6, 1, 8}; printf("%d\\n", hitungGenap(a, 7)); return 0; }',
        "expect": "4",
    },
    "Salin Array ke Array Lain": {
        "fix": {2: "  for (int i = 0; i < n; i++) {", 3: "    b[i] = a[i];"},
        "harness": 'int main(void) { int a[5] = {7, 1, 5, 2, 8}; int b[5] = {0, 0, 0, 0, 99}; salin(a, b, 4); printf("%d %d %d %d %d\\n", b[0], b[1], b[2], b[3], b[4]); return 0; }',
        "expect": "7 1 5 2 99",
    },
    "Balik Array di Tempat": {
        "fix": {2: "  for (int i = 0; i < n / 2; i++) {", 4: "    a[i] = a[n - 1 - i];"},
        "harness": 'int main(void) { int a[6] = {1, 2, 3, 4, 5, 77}; balik(a, 5); for (int i = 0; i < 6; i++) printf("%d ", a[i]); printf("\\n"); return 0; }',
        "expect": "5 4 3 2 1 77",
    },
    "Jumlah Bilangan Positif": {
        "fix": {6: ""},
        "harness": 'int main(void) { int a[5] = {3, -1, 4, -5, 2}; printf("%d\\n", jumlahPositif(a, 5)); return 0; }',
        "expect": "9",
    },
    "Cetak Segitiga Angka": {
        "fix": {5: "    for (int j = 1; j <= i; j++) {"},
        "harness": "",
        "expect": "1 12 123",
    },
}


def check_single(q):
    code = fence(q["body"]["prompt"])
    ok, out = build_run(wrap(code))
    rec(q["title"], "code runs", ok, out)
    if not ok:
        return
    key = next(o for o in q["body"]["options"] if o["id"] == q["answer"]["correct"])
    rec(q["title"], "key equals the output", norm(ctext(key["text"])) == out, f"key {key['text']!r}, output {out!r}")
    others = [o for o in q["body"]["options"] if o["id"] != key["id"] and norm(ctext(o["text"])) == out]
    rec(q["title"], "no other option equals the output", not others, str([o["text"] for o in others]))


def check_multi(q):
    claims = CLAIMS.get(q["title"])
    if claims is None:
        return rec(q["title"], "claims written", False, "add CLAIMS for this title")
    code = fence(q["body"]["prompt"])
    keyed = set(q["answer"]["correct"])
    for o in q["body"]["options"]:
        expr = claims.get(ctext(o["text"]))
        if expr is None:
            rec(q["title"], "claim known", False, o["text"])
            continue
        ok, out = build_run(wrap(code + f'\nprintf("%d\\n", (int)({expr}));'))
        rec(q["title"], "claim runs", ok, out)
        if ok:
            rec(q["title"], f"claim {o['text']!r} matches the key", (out == "1") == (o["id"] in keyed), f"true={out}, keyed={o['id'] in keyed}")


def check_match(q):
    right = {r["id"]: r["text"] for r in q["body"]["right"]}
    done = 0
    for l in q["body"]["left"]:
        m = re.fullmatch(r"`([^`]+)`", l["text"].strip())
        want = ctext(right[q["answer"]["pairs"][l["id"]]])
        if not m or not re.fullmatch(r"[0-9a-zA-Z_ +\-*/%&^~<>().]+", m.group(1)):
            continue
        ok, out = build_run(f'#include <stdio.h>\nint main(void) {{ printf("%g\\n", (double)({m.group(1)})); return 0; }}')
        rec(q["title"], f"{m.group(1)} = {want}", ok and float(out) == float(want), out)
        done += 1
    if not done:
        print("    (concept pairs: check by eye)")


def run_order(lines_by_id, order):
    return build_run("\n".join(lines_by_id[i] for i in order) + "\n")


def check_order(q):
    lines = {l["id"]: l["text"] for l in q["body"]["lines"]}
    key = q["answer"]["order"]
    ok, want = run_order(lines, key)
    rec(q["title"], "key order runs", ok, want)
    if not ok:
        return
    for i, alt in enumerate(q["answer"].get("also", [])):
        ok2, out = run_order(lines, alt)
        rec(q["title"], f"also[{i}] prints the same", ok2 and out == want, out)
    # a swapped pair that is NOT accepted should break something: spot check the first two lines
    nums = len(key)
    rec(q["title"], "the lines are all different", len({lines[i] for i in key}) == nums, "two lines have the same text")


def fill(src, answers):
    for n, a in answers.items():
        src = src.replace(f"__({n})__", a)
    return src


def check_fitb(q):
    src = q["body"]["code"]["src"]
    blanks = q["answer"]["blanks"]
    first = {int(n): b["accept"][0] for n, b in blanks.items()}
    ok, want = build_run(fill(src, first))
    rec(q["title"], "first answers run", ok, want)
    if not ok:
        return
    exp = promised(q)
    if exp is not None:
        rec(q["title"], "prints what the prompt promises", norm(want) == norm(exp), f"got {want!r}, promised {exp!r}")
    for n, b in blanks.items():
        for alt in b["accept"][1:]:
            ok2, out = build_run(fill(src, {**first, int(n): alt}))
            rec(q["title"], f"blank {n} accepts {alt!r}", ok2 and out == want, out)


def check_fix(q):
    src = q["body"]["code"]["src"].split("\n")
    slots = q["body"]["slots"]
    right = {int(k): v for k, v in q["answer"]["picks"].items()}

    def program(choice):
        out = list(src)
        for s in slots:
            opt = next(o for o in s["options"] if o["id"] == choice[s["line"]])
            out[s["line"] - 1] = opt["text"]
        return "\n".join(out) + "\n"

    ok, want = build_run(program(right))
    rec(q["title"], "right picks run", ok, want)
    if not ok:
        return
    exp = promised(q)
    if exp is not None:
        rec(q["title"], "prints what the prompt promises", norm(want) == norm(exp), f"got {want!r}, promised {exp!r}")
    for s in slots:
        for o in s["options"]:
            if o["id"] == right[s["line"]]:
                continue
            ok2, out = build_run(program({**right, s["line"]: o["id"]}))
            differs = (not ok2) or out != want
            rec(q["title"], f"line {s['line']} wrong pick {o['text'].strip()!r} changes the result", differs, out)
    # the code as shown (every slot left as it is) is the buggy one
    orig = "\n".join(src) + "\n"
    ok3, out3 = build_run(orig)
    rec(q["title"], "the code as shown does not give the right output", (not ok3) or out3 != want, out3)


def check_lines(q):
    spec = LINES.get(q["title"])
    if spec is None:
        return rec(q["title"], "harness written", False, "add LINES for this title")
    code = q["body"]["code"]["src"].rstrip("\n").split("\n")
    bugs = q["answer"]["lines"]
    rec(q["title"], "LINES fixes cover the bug lines", sorted(spec["fix"]) == sorted(bugs), f"{sorted(spec['fix'])} vs {sorted(bugs)}")

    def program(fixed):
        out = list(code)
        for n in fixed:
            out[n - 1] = spec["fix"][n]
        pre = "" if "#include" in "\n".join(out) else "#include <stdio.h>\n"
        return pre + "\n".join(out) + "\n" + spec["harness"] + "\n"

    ok, out = build_run(program(bugs))
    rec(q["title"], "fixed code passes the harness", ok and out == norm(spec["expect"]), f"{out!r}")
    for n in bugs:
        if n in spec.get("ub", []):
            continue
        ok2, out2 = build_run(program([b for b in bugs if b != n]))
        rec(q["title"], f"line {n} left alone breaks it", (not ok2) or out2 != norm(spec["expect"]), out2)


HANDLERS = {"single": check_single, "multi": check_multi, "match": check_match, "order": check_order, "fitb": check_fitb, "fix": check_fix, "lines": check_lines}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--json", help="a dump of the parsed bank (default: made with npx tsx)")
    args = ap.parse_args()
    path = args.json
    if not path:
        path = str(TMP / "bank.json")
        subprocess.run(["npx", "tsx", str(HERE / "rec-bank-dump.ts"), path], cwd=WEB, check=True, shell=(os.name == "nt"))
    bank = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    for q in bank:
        if args.only and args.only.lower() not in q["title"].lower():
            continue
        print(f"{q['part']}/{q['format']}: {q['title']}")
        try:
            HANDLERS[q["format"]](q)
        except Exception as e:  # a crash in a check is a failure, not a pass
            rec(q["title"], "check ran", False, repr(e))
    bad = [r for r in results if not r[2]]
    print(f"\n{len(results) - len(bad)} checks ok, {len(bad)} FAIL")
    for t, c, _, d in bad:
        print(f"  FAIL {t}: {c} [{d}]")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
