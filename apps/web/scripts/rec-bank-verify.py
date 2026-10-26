#!/usr/bin/env python3
"""
Runs or compiles every question of the default bank (scripts/rec-bank/*.md)
and checks what the key says against what the program really does.

  python scripts/rec-bank-verify.py                 everything
  python scripts/rec-bank-verify.py --only Servo    titles containing "Servo"
  python scripts/rec-bank-verify.py --no-arduino    skip arduino-cli (g++ and python only)

What it does, per format:
  single / multi  the code in the prompt is run (python, or g++ with the shim in
                  rec-bank-verify/shim.h) and its output must be the right option;
                  multi claims are evaluated one by one (CLAIMS below).
  match           the left side is evaluated and must equal its right side.
  order           every accepted order (the key and each `also`) is compiled with
                  arduino-cli for esp32:esp32:esp32, or run for Python.
  fitb            the answer is put in the blanks (every accepted spelling for
                  Python) and the program is run or compiled.
  fix             the right picks are applied and run or compiled; wrong picks are
                  shown to fail or to behave differently (PICKS and SIMS below).
  lines           the bug lines are replaced (FIXED below) and the fixed program
                  behaves while each bug alone does not.

Needs: python, g++, `npx tsx` (to read the Markdown with the app's own parser),
arduino-cli with the esp32 core 3.3.12 and the DHT sensor library, ESP32Servo.
Results of arduino-cli are cached by source hash in the temp folder.
"""
import argparse
import hashlib
import itertools
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent
SHIM = HERE / "rec-bank-verify"
TMP = pathlib.Path(tempfile.gettempdir()) / "rec-bank-verify"
TMP.mkdir(exist_ok=True)
FQBN = "esp32:esp32:esp32"

results = []  # (title, check, ok, detail)
args = None


def rec(title, check, ok, detail=""):
    """ok=None means skipped (arduino-cli not run); it counts as neither."""
    if ok is None:
        print(f"  skip {title}: {check}")
        return
    results.append((title, check, bool(ok), detail))
    print(("  ok   " if ok else "  FAIL ") + f"{title}: {check}" + (f"  [{detail}]" if detail and not ok else ""))


# ---------------------------------------------------------------- runners


def py_run(src, timeout=8):
    f = TMP / "run.py"
    f.write_text(src, encoding="utf-8")
    try:
        p = subprocess.run([sys.executable, "-I", str(f)], capture_output=True, text=True, timeout=timeout, encoding="utf-8")
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"
    return p.returncode, p.stdout, p.stderr


def cpp_run(src, flags=None, timeout=20):
    """Compile with g++ (shim on the include path) and run. Returns (compiled, out, err)."""
    c = TMP / "run.cpp"
    exe = TMP / "run.exe"
    c.write_text(src, encoding="utf-8")
    if exe.exists():
        exe.unlink()
    p = subprocess.run(["g++", "-std=c++17", "-w", "-I", str(SHIM), *(flags or []), str(c), "-o", str(exe)], capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        return False, "", p.stderr
    r = subprocess.run([str(exe)], capture_output=True, text=True, timeout=timeout)
    return True, r.stdout, r.stderr


def cpp_compile_only(src, flags=None):
    c = TMP / "chk.cpp"
    c.write_text(src, encoding="utf-8")
    p = subprocess.run(["g++", "-std=c++17", "-I", str(SHIM), "-fsyntax-only", *(flags or []), str(c)], capture_output=True, text=True, timeout=120)
    return p.returncode == 0, p.stderr


CACHE_FILE = TMP / "ino-cache.json"
try:
    CACHE = json.loads(CACHE_FILE.read_text())
except Exception:
    CACHE = {}


def ino_compile(src):
    """arduino-cli compile for the ESP32 DevKit V1 board. Returns (ok, message)."""
    if args.no_arduino:
        return None, "skipped"
    key = hashlib.sha256((FQBN + src).encode()).hexdigest()
    if key in CACHE:
        return CACHE[key]["ok"], CACHE[key]["msg"]
    name = "s" + key[:10]
    d = TMP / "ino" / name
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{name}.ino").write_text(src, encoding="utf-8")
    p = subprocess.run(["arduino-cli", "compile", "--fqbn", FQBN, str(d)], capture_output=True, text=True, timeout=900, encoding="utf-8", errors="replace")
    msg = (p.stderr or p.stdout).strip().splitlines()
    msg = "\n".join([m for m in msg if "error" in m.lower()][:4]) or (msg[-1] if msg else "")
    CACHE[key] = {"ok": p.returncode == 0, "msg": msg}
    CACHE_FILE.write_text(json.dumps(CACHE))
    return p.returncode == 0, msg


# ---------------------------------------------------------------- helpers


def clean(t):
    return re.sub(r"\s+", " ", t.replace("`", "")).strip()


def fence(prompt):
    m = re.search(r"```(\w+)\n(.*?)\n```", prompt, re.S)
    return (m.group(1), m.group(2)) if m else (None, None)


def opt_text(q, oid):
    for o in q["body"]["options"]:
        if o["id"] == oid:
            return o["text"]
    return None


def replace_lines(src, repl):
    lines = src.split("\n")
    for n, t in repl.items():
        lines[int(n) - 1] = t
    return "\n".join(lines)


def is_sketch(src):
    return "void setup" in src


def cpp_wrap_fragment(code, extra=""):
    """A fragment of statements (or a sketch with setup) as a program for g++."""
    if is_sketch(code):
        return f'#include "shim.h"\n{code}\nint main() {{ setup(); {extra} return 0; }}\n'
    return f'#include "shim.h"\nint main() {{\n{code}\n{extra}\nreturn 0; }}\n'


# ---------------------------------------------------------------- per-question knowledge

# Claims of multi questions: option text (cleaned) -> expression evaluated after the code.
CLAIMS = {
    "uint8_t meluap": {
        "c bernilai 44": "c == 44",
        "d bernilai 300": "d == 300",
        "c bernilai 300": "c == 300",
        "a + b dihitung sebagai int sebelum disimpan": "std::is_same<decltype(a + b), int>::value",
        "Kompilasi gagal karena tipe datanya beda": "false /* it compiled: this program is the proof */",
    },
    "setdefault pada dict": {
        'data["suhu"] bernilai 32': 'data["suhu"] == 32',
        'data["lembap"] bernilai 0': 'data["lembap"] == 0',
        "data sekarang punya 3 kunci": "len(data) == 3",
        'data["cahaya"] bernilai 512': 'data["cahaya"] == 512',
        "len(data) bernilai 2": "len(data) == 2",
    },
    "Array setengah terisi": {
        "n bernilai 5": "n == 5",
        "data[3] bernilai 0": "data[3] == 0",
        "jumlah bernilai 60": "jumlah == 60",
        "n bernilai 3": "n == 3",
        "data[5] adalah elemen terakhir yang sah": "(n - 1) == 5",
    },
}

# Python programs whose last printed line must be the single answer's text are generic.
# Matches that cannot be evaluated (facts about circuits).
NO_EVAL = {"Gejala dan penyebab"}

# Lines questions: the fixed text for each bug line (key: line number, 1-based).
FIXED = {
    "LED dan tombol pull-up": {6: "  pinMode(LED, OUTPUT);", 11: "  if (baca == LOW) {"},
    "Nilai tertinggi": {2: "    maks = bacaan[0]", 4: "        if bacaan[i] > maks:"},
    "Rata-rata bacaan analog": {8: "  int jumlah = 0;", 9: "  for (int i = 0; i < 10; i++) {"},
    "Servo menyapu bolak-balik": {12: "  servo.write(sudut);", 15: "    langkah = -langkah;"},
    "Rata-rata bacaan yang sah": {5: "        if b is None or b < -40 or b > 80:", 9: "    return jumlah / n"},
    "Deteksi lonjakan": {3: "    for i in range(1, len(bacaan)):", 5: "        if abs(selisih) > batas:"},
    "Pin yang salah pilih": {2: "const int LED_STATUS = 25;", 3: "const int RELAY = 26;"},
}

# Python tests appended to a lines/fix program: (call, expected output of the fixed program)
PY_TESTS = {
    "Nilai tertinggi": ("print(tertinggi([-5, -2, -9]), tertinggi([3, 8, 1]))", "-2 8"),
    "Rata-rata bacaan yang sah": ("print(rata_valid([20, None, 100, 30, -50, 40]))", "30.0"),
    "Deteksi lonjakan": ("print(lonjakan([20, 21, 40, 22, 50], 10))", "[2, 3, 4]"),
}

# Sketch simulations: driver code appended to the sketch (see shim.h) and what the fixed one prints.
SIM_DRIVERS = {
    "Rata-rata bacaan analog": (
        "static void __attribute__((noinline)) dirty() { volatile char j[4096]; for (int i = 0; i < 4096; i++) j[i] = 0x7f; }\n"
        "int main() { W.analog[34] = 100; setup(); dirty(); loop(); printf(\"reads=%d\\n\", W.analogCalls); return 0; }",
        "100.00\nreads=10",
    ),
    "Hitung tekan tombol": (
        "int main() {\n"
        "  W.read = [](int) { unsigned long t = W.ms; bool low = (t >= 100 && t < 300) || (t >= 500 && t < 505) || (t >= 510 && t < 700); return low ? LOW : HIGH; };\n"
        "  setup();\n"
        "  for (int i = 0; i < 800; i++) { loop(); W.ms++; }\n"
        "  printf(\"mode=%d\\n\", W.pinmode[4]); return 0; }",
        "1\n2\nmode=2",
    ),
    "Servo menyapu bolak-balik": (
        "int main() { setup(); for (int i = 0; i < 200; i++) loop();\n"
        "  int mn = 9999, mx = -9999; for (int a : W.servo) { if (a < mn) mn = a; if (a > mx) mx = a; }\n"
        "  printf(\"min=%d max=%d\\n\", mn, mx); return 0; }",
        "min=0 max=180",
    ),
    "Kecerahan LED naik turun": (
        "int main() { setup(); for (int i = 0; i < 300; i++) loop();\n"
        "  int mn = 99999, mx = -1; for (int d : W.duty) { if (d < mn) mn = d; if (d > mx) mx = d; }\n"
        "  printf(\"res=%d min=%d max=%d\\n\", W.res[2], mn, mx); return 0; }",
        "res=8 min=0 max=255",
    ),
}

# Wrong picks that must not even compile (Arduino core 3.3.12): (title, line, text)
MUST_NOT_COMPILE = [("Kecerahan LED naik turun", 6, "ledcSetup")]


# ---------------------------------------------------------------- handlers


def check_single(q):
    t = q["title"]
    lang, code = fence(q["body"]["prompt"])
    right = clean(opt_text(q, q["answer"]["correct"]))
    if t == "Pembagi tegangan":
        v = 3.3 * 20 / (10 + 20)
        text = f"{v:.1f}".replace(".", ",") + " V"
        rec(t, f"3,3 V x 20 / (10 + 20) = {text}", clean(text) == right, f"key {right}")
        wrong = [clean(o["text"]) for o in q["body"]["options"] if o["id"] != q["answer"]["correct"]]
        rec(t, "no wrong option equals it", clean(text) not in wrong)
        return
    if not code:
        rec(t, "has code to run", False, "no fenced block in the prompt")
        return
    if lang == "py":
        rc, out, err = py_run(code)
        got = out.strip()
        ok = rc == 0
    else:
        ok, out, err = cpp_run(cpp_wrap_fragment(code))
        got = out.strip()
    rec(t, "runs", ok, err[:200])
    rec(t, f"prints the right option ({right})", got == right, f"printed {got!r}")
    wrong = [clean(o["text"]) for o in q["body"]["options"] if o["id"] != q["answer"]["correct"]]
    rec(t, "no wrong option is the output", got not in wrong)
    if lang != "py" and is_sketch(code):
        r, m = ino_compile(code)
        rec(t, "compiles for the ESP32", r, m)


def check_multi(q):
    t = q["title"]
    lang, code = fence(q["body"]["prompt"])
    claims = CLAIMS.get(t)
    if t == "I2C pada ESP32":
        src = ('#include <Wire.h>\nstatic_assert(SDA == 21 && SCL == 22, "default I2C pins of the DevKit V1");\n'
               "void setup() { Wire.begin(); }\nvoid loop() {}\n")
        r, m = ino_compile(src)
        rec(t, "SDA is GPIO21 and SCL is GPIO22 (static_assert on the real core)", r, m)
        rec(t, "the other claims are textbook (pull-ups, address clash, no MOSI or MISO, no chip select)", True)
        return
    if t == "Parameter referensi":
        refs(q)
        return
    if not claims:
        rec(t, "has claim checks", False, "add it to CLAIMS")
        return
    right = set(q["answer"]["correct"])
    for o in q["body"]["options"]:
        key = clean(o["text"])
        if key not in claims:
            rec(t, f"claim known: {key}", False)
            continue
        expr = claims[key]
        if lang == "py":
            rc, out, err = py_run(code + f"\nprint(bool({expr}))")
            truth = out.strip() == "True"
            ok = rc == 0
        else:
            ok, out, err = cpp_run(cpp_wrap_fragment(code, f'printf("%d", (int)({expr}));'), flags=["-include", "type_traits"])
            truth = out.strip().endswith("1")
        should = o["id"] in right
        rec(t, f"{'true' if should else 'false'}: {key}", ok and truth == should, f"evaluated {truth} {err[:100]}")


def refs(q):
    t = q["title"]
    lang, code = fence(q["body"]["prompt"])
    funcs = code.split("void setup")[0]
    head = '#include "shim.h"\n' + funcs + "\n"
    ok, out, err = cpp_run(head + 'int main() { int x = 1; int y = 1; tambah(x, y); printf("%d %d\\n", x, y); return 0; }\n')
    rec(t, "x stays 1 and y becomes 6", ok and out.strip() == "1 6", out.strip() + err[:100])
    okc, msg = cpp_compile_only(head + "int main() { tambah(1, 2); }\n")
    rec(t, "tambah(1, 2); does not compile", not okc, "it compiled")
    okc, msg = cpp_compile_only(head + "int main() { int a = 1, b = 2; tambah(a, b); }\n")
    rec(t, "and tambah(a, b) with variables does", okc, msg[:100])
    # the options: x=6 false, y=6 true, a is a copy true, (1, 2) fails true, b is a copy false
    right = {clean(o["text"]) for o in q["body"]["options"] if o["id"] in q["answer"]["correct"]}
    want = {"y menjadi 6 setelah tambah(x, y)", "a di dalam tambah adalah salinan dari x", "tambah(1, 2); tidak bisa dikompilasi"}
    rec(t, "the key marks exactly the three true claims", right == want, str(right))



def check_match(q):
    t = q["title"]
    if t in NO_EVAL:
        rec(t, "facts about circuits, nothing to run", True)
        return
    left = {o["id"]: o["text"] for o in q["body"]["left"]}
    right = {o["id"]: o["text"] for o in q["body"]["right"]}
    pairs = q["answer"]["pairs"]
    exprs = [left[l].strip("`") for l in pairs]
    if q["lang"] == "py":
        src = "\n".join(f"print(repr({e}))" for e in exprs)
        rc, out, err = py_run(src)
        got = out.strip().split("\n")
        rec(t, "evaluates", rc == 0, err[:200])
    else:
        body = "\n".join(f'std::cout << ({e}) << "\\n";' for e in exprs)
        ok, out, err = cpp_run(f"#include <iostream>\nint main() {{\n{body}\nreturn 0; }}\n")
        got = out.strip().split("\n")
        rec(t, "evaluates", ok, err[:200])
    for (l, r), g in zip(pairs.items(), got):
        want = right[r].strip("`")
        rec(t, f"{left[l]} = {want}", g == want, f"got {g}")
    used = set(pairs.values())
    spare = [right[r].strip("`") for r in right if r not in used]
    allres = got
    rec(t, "the distractors equal no result", all(s not in allres for s in spare))


def build_order(q, order):
    by = {l["id"]: l["text"] for l in q["body"]["lines"]}
    return "\n".join(by[i] for i in order) + "\n"


def check_order(q):
    t = q["title"]
    orders = [q["answer"]["order"]] + (q["answer"].get("also") or [])
    for n, o in enumerate(orders):
        src = build_order(q, o)
        if q["lang"] == "py" or q["body"].get("lang") == "py":
            rc, out, err = py_run(src)
            rec(t, f"order {n + 1} runs", rc == 0, err[:200])
        else:
            r, m = ino_compile(src)
            rec(t, f"order {n + 1} compiles", r, m)


def blank_ids(src):
    return [int(m) for m in re.findall(r"_+\((\d+)\)_+", src)]


def fill(src, answers):
    return re.sub(r"_+\((\d+)\)_+", lambda m: answers[int(m.group(1))], src)


def check_fitb(q):
    t = q["title"]
    src = q["body"]["code"]["src"]
    blanks = q["answer"]["blanks"]
    first = {int(n): b["accept"][0] for n, b in blanks.items()}
    prog = fill(src, first)
    if q["lang"] == "py":
        rc, base, err = py_run(prog)
        rec(t, "answer runs", rc == 0, err[:200])
        m = re.search(r"mencetak `([^`]+)`", q["body"]["prompt"])
        if m:
            rec(t, f"last line is {m.group(1)}", base.strip().split("\n")[-1] == m.group(1), base.strip()[-80:])
        for n, b in blanks.items():
            for alt in b["accept"][1:]:
                variant = dict(first)
                variant[int(n)] = alt
                rc2, out2, _ = py_run(fill(src, variant))
                rec(t, f"blank {n} also accepts {alt}", rc2 == 0 and out2 == base)
    else:
        r, m = ino_compile(prog)
        rec(t, "answer compiles for the ESP32", r, m)
        for n, b in blanks.items():
            for alt in b["accept"][1:]:
                variant = dict(first)
                variant[int(n)] = alt
                r, m = ino_compile(fill(src, variant))
                rec(t, f"blank {n} also accepts {alt}", r, m)


def apply_picks(q, picks):
    src = q["body"]["code"]["src"]
    repl = {}
    for slot in q["body"]["slots"]:
        want = picks[str(slot["line"])] if str(slot["line"]) in picks else None
        for o in slot["options"]:
            if o["id"] == want:
                repl[slot["line"]] = o["text"]
    return replace_lines(src, repl)


def fix_variants(q):
    """Yields (line, option text, source with that slot wrong and the others right)."""
    right = q["answer"]["picks"]
    src_right = apply_picks(q, right)
    for slot in q["body"]["slots"]:
        for o in slot["options"]:
            if o["id"] == right[str(slot["line"])]:
                continue
            yield slot["line"], o["text"], replace_lines(src_right, {slot["line"]: o["text"]})


def sim(title, src):
    drv, _ = SIM_DRIVERS[title]
    ok, out, err = cpp_run(f'#include "shim.h"\n{src}\n{drv}\n', timeout=20)
    return ok, out.strip(), err


def check_fix(q):
    t = q["title"]
    good = apply_picks(q, q["answer"]["picks"])
    if q["lang"] == "py":
        rc, out, err = py_run(good)
        rec(t, "right picks run", rc == 0, err[:200])
        base = (rc, out)
        # a slot already right in the shown code stays as it is; wrong picks must fail or change the output
        for line, text, src in fix_variants(q):
            rc2, out2, _ = py_run(src)
            rec(t, f"wrong pick on line {line} is wrong: {text.strip()}", (rc2, out2) != base, "same output")
        shown = q["body"]["code"]["src"]
        rc3, out3, _ = py_run(shown)
        rec(t, "the code as shown is wrong (fails or differs)", (rc3, out3) != base)
        return
    r, m = ino_compile(good)
    rec(t, "right picks compile for the ESP32", r, m)
    for tt, line, frag in MUST_NOT_COMPILE:
        if tt != t:
            continue
        for l, text, src in fix_variants(q):
            if l == line and frag in text:
                r, m = ino_compile(src)
                rec(t, f"{text.strip()} does not compile on core 3.3.12", None if r is None else r is False, m)
    if t in SIM_DRIVERS:
        ok, base, err = sim(t, good)
        rec(t, "right picks behave", ok and base == SIM_DRIVERS[t][1], f"{base!r} {err[:100]}")
        for line, text, src in fix_variants(q):
            if any(tt == t and l == line and f in text for tt, l, f in MUST_NOT_COMPILE):
                continue
            ok2, out2, _ = sim(t, src)
            rec(t, f"wrong pick on line {line} behaves differently: {text.strip()}", ok2 and out2 != base, out2.replace("\n", " | "))
        ok3, out3, _ = sim(t, q["body"]["code"]["src"])
        rec(t, "the code as shown misbehaves", ok3 and out3 != base, out3.replace("\n", " | "))


def check_lines(q):
    t = q["title"]
    fixed = FIXED.get(t)
    if not fixed:
        rec(t, "has a FIXED entry", False)
        return
    bugs = sorted(q["answer"]["lines"])
    rec(t, "the key names exactly the lines FIXED replaces", bugs == sorted(fixed), f"{bugs} vs {sorted(fixed)}")
    src = q["body"]["code"]["src"]
    for n, text in fixed.items():
        rec(t, f"line {n} really changes", src.split("\n")[n - 1] != text)
    good = replace_lines(src, fixed)
    if q["lang"] == "py":
        test, want = PY_TESTS[t]
        rc, out, err = py_run(good + "\n" + test)
        rec(t, f"fixed behaves ({want})", rc == 0 and out.strip() == want, f"{out.strip()!r} {err[:100]}")
        for n in fixed:
            one = replace_lines(src, {k: v for k, v in fixed.items() if k != n})
            rc2, out2, _ = py_run(one + "\n" + test)
            rec(t, f"bug on line {n} alone misbehaves", rc2 != 0 or out2.strip() != want, out2.strip())
        return
    if t == "Pin yang salah pilih":
        gpio(q)
        return
    r, m = ino_compile(good)
    rec(t, "fixed compiles for the ESP32", r, m)
    r, m = ino_compile(src)
    rec(t, "the buggy one compiles too (the bugs are logic)", r, m)
    if t in SIM_DRIVERS:
        ok, base, err = sim(t, good)
        rec(t, "fixed behaves", ok and base == SIM_DRIVERS[t][1], f"{base!r} {err[:100]}")
        for n in fixed:
            one = replace_lines(src, {k: v for k, v in fixed.items() if k != n})
            ok2, out2, _ = sim(t, one)
            rec(t, f"bug on line {n} alone misbehaves", ok2 and out2 != base, out2.replace("\n", " | "))


def gpio(q):
    t = q["title"]
    probe = (
        '#include "driver/gpio.h"\n'
        "static_assert(!GPIO_IS_VALID_OUTPUT_GPIO(34), \"GPIO34 is input only\");\n"
        "static_assert(GPIO_IS_VALID_OUTPUT_GPIO(25), \"GPIO25 is a normal output\");\n"
        "static_assert(GPIO_IS_VALID_GPIO(35) && !GPIO_IS_VALID_OUTPUT_GPIO(35), \"GPIO35 is input only\");\n"
        "void setup() {}\nvoid loop() {}\n"
    )
    r, m = ino_compile(probe)
    rec(t, "GPIO34 and 35 cannot be outputs, GPIO25 can (static_assert on the real core)", r, m)
    r, m = ino_compile(replace_lines(q["body"]["code"]["src"], FIXED[t]))
    rec(t, "the fixed sketch compiles", r, m)
    rec(t, "GPIO6 to 11 are wired to the SPI flash (ESP32 datasheet, DevKit V1 pinout)", True)


HANDLERS = {"single": check_single, "multi": check_multi, "match": check_match, "order": check_order, "fitb": check_fitb, "fix": check_fix, "lines": check_lines}


def main():
    global args
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--no-arduino", action="store_true")
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
        print(f"{q['part']}/{q['lang']}/{q['format']}: {q['title']}")
        try:
            HANDLERS[q["format"]](q)
        except Exception as e:  # a crash in a check is a failure, not a pass
            rec(q["title"], "check ran", False, repr(e))
    bad = [r for r in results if not r[2]]
    print(f"\n{len(results) - len(bad)} ok, {len(bad)} FAIL")
    for t, c, _, d in bad:
        print(f"  FAIL {t}: {c} [{d}]")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
