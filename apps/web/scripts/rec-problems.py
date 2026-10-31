"""
The default Live Coding problems in C (B7.2): eight problems, four easy and
four medium. Each carries its statement, a reference solution and a list of
inputs; the expected outputs are NOT typed here, they are what the reference
prints when gcc builds and runs it. The first two inputs are the samples the
candidate sees, the rest are the hidden tests.

    python scripts/rec-problems.py          writes src/lib/recruitment/seed-problems.ts
    python scripts/rec-problems.py --check  fails when that file is out of date or a reference misbehaves
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "lib", "recruitment", "seed-problems.ts")

STARTER = "#include <stdio.h>\n\nint main(void) {\n  \n  return 0;\n}\n"

P = []


def prob(title, tier, brief, inp, out, ref, inputs, samples=2):
    P.append(dict(title=title, tier=tier, brief=brief, inp=inp, out=out, ref=ref, inputs=inputs, samples=samples))


prob(
    "Jumlah Dua Bilangan", "easy",
    "Baca dua bilangan bulat, lalu cetak jumlahnya.",
    "Satu baris berisi dua bilangan bulat a dan b, masing-masing antara -1000 dan 1000.",
    "Satu bilangan: a + b.",
    '#include <stdio.h>\nint main(void) {\n  int a, b;\n  scanf("%d %d", &a, &b);\n  printf("%d\\n", a + b);\n  return 0;\n}\n',
    ["3 5\n", "-4 10\n", "0 0\n", "1000 1000\n", "-1000 -1000\n", "-1000 1000\n", "123 877\n", "-7 -3\n"],
)
prob(
    "Genap atau Ganjil", "easy",
    "Baca satu bilangan bulat, lalu cetak GENAP atau GANJIL.",
    "Satu bilangan bulat n antara 0 dan 100000.",
    "GENAP kalau n genap, GANJIL kalau tidak.",
    '#include <stdio.h>\nint main(void) {\n  int n;\n  scanf("%d", &n);\n  puts(n % 2 == 0 ? "GENAP" : "GANJIL");\n  return 0;\n}\n',
    ["7\n", "10\n", "0\n", "1\n", "100000\n", "99999\n", "2\n", "54321\n"],
)
prob(
    "Terbesar dari Tiga", "easy",
    "Baca tiga bilangan bulat, lalu cetak yang terbesar.",
    "Satu baris berisi tiga bilangan bulat antara -1000 dan 1000.",
    "Satu bilangan: yang terbesar.",
    '#include <stdio.h>\nint main(void) {\n  int a, b, c;\n  scanf("%d %d %d", &a, &b, &c);\n  int m = a;\n  if (b > m) m = b;\n  if (c > m) m = c;\n  printf("%d\\n", m);\n  return 0;\n}\n',
    ["3 9 4\n", "-5 -2 -8\n", "1 1 1\n", "-1000 -1000 -999\n", "1000 -1000 0\n", "7 7 3\n", "0 -1 -2\n", "5 12 12\n"],
)
prob(
    "Hitung Mundur", "easy",
    "Baca n, lalu cetak dari n turun sampai 1.",
    "Satu bilangan bulat n antara 1 dan 20.",
    "Bilangan dari n sampai 1 dalam satu baris, dipisah spasi.",
    '#include <stdio.h>\nint main(void) {\n  int n;\n  scanf("%d", &n);\n  for (int i = n; i >= 1; i--) printf(i == 1 ? "%d\\n" : "%d ", i);\n  return 0;\n}\n',
    ["5\n", "1\n", "2\n", "10\n", "20\n", "3\n", "15\n", "7\n"],
)
prob(
    "Tertinggi dan Terendah", "medium",
    "Baca n bilangan, lalu cetak yang tertinggi dan yang terendah.",
    "Baris pertama berisi n (1 sampai 100). Baris kedua berisi n bilangan bulat antara -1000 dan 1000.",
    "Satu baris: tertinggi, spasi, terendah.",
    '#include <stdio.h>\nint main(void) {\n  int n, x, hi, lo;\n  scanf("%d", &n);\n  scanf("%d", &x);\n  hi = lo = x;\n  for (int i = 1; i < n; i++) {\n    scanf("%d", &x);\n    if (x > hi) hi = x;\n    if (x < lo) lo = x;\n  }\n  printf("%d %d\\n", hi, lo);\n  return 0;\n}\n',
    ["5\n3 9 -2 7 4\n", "3\n-5 -2 -8\n", "1\n42\n", "2\n5 5\n", "4\n1000 -1000 0 1\n", "6\n-1 -1 -1 -1 -1 -1\n", "7\n10 20 30 40 50 60 70\n", "5\n9 8 7 6 5\n", "3\n0 0 -1\n", "8\n-3 4 -3 4 -3 4 -3 5\n"],
)
prob(
    "Balik Array", "medium",
    "Baca n bilangan, lalu cetak urutannya dari belakang.",
    "Baris pertama berisi n (1 sampai 100). Baris kedua berisi n bilangan bulat.",
    "Satu baris: n bilangan dari yang terakhir, dipisah spasi.",
    '#include <stdio.h>\nint main(void) {\n  int n, a[100];\n  scanf("%d", &n);\n  for (int i = 0; i < n; i++) scanf("%d", &a[i]);\n  for (int i = n - 1; i >= 0; i--) printf(i == 0 ? "%d\\n" : "%d ", a[i]);\n  return 0;\n}\n',
    ["4\n5 8 2 9\n", "1\n7\n", "2\n1 2\n", "5\n1 2 3 4 5\n", "3\n-1 0 1\n", "6\n10 10 20 20 30 30\n", "5\n9 -9 9 -9 9\n", "7\n1 3 5 7 9 11 13\n", "3\n100 200 300\n", "4\n0 0 0 1\n"],
)
prob(
    "Bilangan Prima", "medium",
    "Baca n, lalu cetak YA kalau n prima, TIDAK kalau bukan.",
    "Satu bilangan bulat n antara 1 dan 10000.",
    "YA atau TIDAK.",
    '#include <stdio.h>\nint main(void) {\n  int n, ok = 1;\n  scanf("%d", &n);\n  if (n < 2) ok = 0;\n  for (int i = 2; i * i <= n; i++) if (n % i == 0) ok = 0;\n  puts(ok ? "YA" : "TIDAK");\n  return 0;\n}\n',
    ["7\n", "9\n", "1\n", "2\n", "4\n", "97\n", "9973\n", "10000\n", "49\n", "9999\n"],
)
prob(
    "Palindrom", "medium",
    "Baca satu kata, lalu cetak YA kalau terbaca sama dari depan dan belakang.",
    "Satu kata dari huruf kecil, panjang 1 sampai 100.",
    "YA atau TIDAK.",
    '#include <stdio.h>\n#include <string.h>\nint main(void) {\n  char s[128];\n  scanf("%100s", s);\n  int n = (int)strlen(s), ok = 1;\n  for (int i = 0; i < n / 2; i++) if (s[i] != s[n - 1 - i]) ok = 0;\n  puts(ok ? "YA" : "TIDAK");\n  return 0;\n}\n',
    ["katak\n", "iris\n", "a\n", "ab\n", "aa\n", "abcba\n", "abccba\n", "abcdba\n", "tamat\n", "level\n"],
)


def run_all():
    out = []
    with tempfile.TemporaryDirectory() as d:
        for i, p in enumerate(P):
            src = os.path.join(d, f"p{i}.c")
            exe = os.path.join(d, f"p{i}" + (".exe" if os.name == "nt" else ""))
            open(src, "w", newline="\n").write(p["ref"])
            c = subprocess.run(["gcc", "-O2", "-std=c11", "-Wall", "-Werror", "-o", exe, src], capture_output=True, text=True)
            if c.returncode:
                sys.exit(f"{p['title']}: reference does not compile\n{c.stderr}")
            tests = []
            for inp in p["inputs"]:
                r = subprocess.run([exe], input=inp, capture_output=True, text=True, timeout=5)
                if r.returncode:
                    sys.exit(f"{p['title']}: reference failed on {inp!r}")
                tests.append(dict(input=inp, output=r.stdout))
            if len({t["input"] for t in tests}) != len(tests):
                sys.exit(f"{p['title']}: two tests share an input")
            out.append(dict(
                title=p["title"], tier=p["tier"],
                body=dict(statement=p["brief"], input=p["inp"], output=p["out"], starter=STARTER),
                limits=dict(timeMs=1000, memKb=65536),
                samples=tests[: p["samples"]], tests=tests,
                reference=p["ref"],
            ))
    return out


def render(items):
    head = (
        "/**\n * The default Live Coding problems in C. GENERATED by scripts/rec-problems.py, do not edit by hand:\n"
        " * the expected outputs are what each reference solution prints under gcc.\n */\n"
        'import type { CProblemDraft } from "./c-problem.js";\n\n'
        "export const SEED_PROBLEMS: CProblemDraft[] = "
    )
    return head + json.dumps(items, ensure_ascii=False, indent=2) + ";\n"


if __name__ == "__main__":
    text = render(run_all())
    if "--check" in sys.argv:
        cur = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if cur != text:
            sys.exit("seed-problems.ts is out of date: run python scripts/rec-problems.py")
        print(f"ok: {len(P)} problems")
    else:
        open(OUT, "w", encoding="utf-8", newline="\n").write(text)
        print(f"wrote {len(P)} problems")
