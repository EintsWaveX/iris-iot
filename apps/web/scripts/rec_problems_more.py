"""
The sixteen newer default problems (4 Nov 2026): easy 5 to 8, medium 5 to 8 and the eight hard
(Susah) ones. rec-problems.py runs this file with `prob` in scope.
"""


def add(prob):
    # ---------------------------------------------------------------- easy, 5 to 8
    prob(
        "Luas dan Keliling", "easy",
        "Baca panjang dan lebar sebuah persegi panjang, lalu cetak luas dan kelilingnya.",
        "Satu baris berisi dua bilangan bulat p dan l, masing-masing antara 1 dan 1000.",
        "Satu baris: luas, spasi, keliling.",
        '#include <stdio.h>\nint main(void) {\n  int p, l;\n  scanf("%d %d", &p, &l);\n  printf("%d %d\\n", p * l, 2 * (p + l));\n  return 0;\n}\n',
        ["4 3\n", "10 10\n", "1 1\n", "1000 1000\n", "1 1000\n", "25 8\n", "7 13\n", "500 2\n", "999 1\n", "12 12\n"],
    )
    prob(
        "Nilai Mutlak", "easy",
        "Baca satu bilangan bulat, lalu cetak nilai mutlaknya (tanpa tanda minus).",
        "Satu bilangan bulat n antara -100000 dan 100000.",
        "Satu bilangan: nilai mutlak n.",
        '#include <stdio.h>\nint main(void) {\n  int n;\n  scanf("%d", &n);\n  printf("%d\\n", n < 0 ? -n : n);\n  return 0;\n}\n',
        ["-7\n", "15\n", "0\n", "-100000\n", "100000\n", "-1\n", "1\n", "-99999\n", "42\n", "-500\n"],
    )
    prob(
        "Jumlah 1 sampai N", "easy",
        "Baca n, lalu cetak hasil 1 + 2 + 3 + ... + n.",
        "Satu bilangan bulat n antara 1 dan 10000.",
        "Satu bilangan: jumlah semua bilangan dari 1 sampai n.",
        '#include <stdio.h>\nint main(void) {\n  int n;\n  long long jumlah = 0;\n  scanf("%d", &n);\n  for (int i = 1; i <= n; i++) jumlah += i;\n  printf("%lld\\n", jumlah);\n  return 0;\n}\n',
        ["5\n", "100\n", "1\n", "10000\n", "2\n", "99\n", "50\n", "7777\n", "1000\n", "3\n"],
    )
    prob(
        "Bagi dan Sisa", "easy",
        "Baca dua bilangan bulat a dan b, lalu cetak hasil bagi dan sisa bagi a dengan b.",
        "Satu baris berisi dua bilangan bulat: a antara 0 dan 10000, b antara 1 dan 100.",
        "Satu baris: a / b, spasi, a % b (pembagian bulat).",
        '#include <stdio.h>\nint main(void) {\n  int a, b;\n  scanf("%d %d", &a, &b);\n  printf("%d %d\\n", a / b, a % b);\n  return 0;\n}\n',
        ["17 5\n", "100 7\n", "0 3\n", "10000 1\n", "10000 100\n", "5 9\n", "99 10\n", "64 8\n", "1 1\n", "9999 99\n"],
    )

    # -------------------------------------------------------------- medium, 5 to 8
    prob(
        "Faktorial", "medium",
        "Baca n, lalu cetak n! (n faktorial), yaitu 1 x 2 x 3 x ... x n. Nilai 0! adalah 1.",
        "Satu bilangan bulat n antara 0 dan 12.",
        "Satu bilangan: n!.",
        '#include <stdio.h>\nint main(void) {\n  int n;\n  long long hasil = 1;\n  scanf("%d", &n);\n  for (int i = 2; i <= n; i++) hasil *= i;\n  printf("%lld\\n", hasil);\n  return 0;\n}\n',
        ["5\n", "3\n", "0\n", "1\n", "12\n", "10\n", "7\n", "2\n", "11\n", "6\n"],
    )
    prob(
        "Hitung Vokal", "medium",
        "Baca satu kata, lalu cetak ada berapa huruf vokal (a, i, u, e, o) di dalamnya.",
        "Satu kata dari huruf kecil, panjang 1 sampai 100.",
        "Satu bilangan: jumlah huruf vokal.",
        '#include <stdio.h>\n#include <string.h>\nint main(void) {\n  char s[128];\n  int n = 0;\n  scanf("%100s", s);\n  for (int i = 0; s[i]; i++) if (strchr("aiueo", s[i])) n++;\n  printf("%d\\n", n);\n  return 0;\n}\n',
        ["universitas\n", "bcdfg\n", "aeiou\n", "a\n", "telkom\n", "pemrograman\n", "iris\n", "xyz\n", "ooooo\n", "laboratorium\n"],
    )
    prob(
        "Rata-rata Nilai", "medium",
        "Baca n nilai, lalu cetak rata-ratanya dengan dua angka di belakang koma.",
        "Baris pertama berisi n (1 sampai 7). Baris kedua berisi n bilangan bulat antara 0 dan 100.",
        "Satu bilangan: rata-rata dengan dua angka di belakang koma (printf \"%.2f\").",
        '#include <stdio.h>\nint main(void) {\n  int n, x, jumlah = 0;\n  scanf("%d", &n);\n  for (int i = 0; i < n; i++) {\n    scanf("%d", &x);\n    jumlah += x;\n  }\n  printf("%.2f\\n", (double)jumlah / n);\n  return 0;\n}\n',
        ["4\n80 90 70 60\n", "3\n1 2 2\n", "1\n100\n", "2\n0 0\n", "5\n100 100 100 100 99\n", "3\n1 1 2\n", "6\n10 20 30 40 50 60\n", "2\n3 4\n", "7\n1 2 3 4 5 6 7\n", "4\n0 0 0 1\n"],
    )
    prob(
        "Bilangan Fibonacci", "medium",
        "Deret Fibonacci dimulai 1, 1, lalu tiap angka adalah jumlah dua angka sebelumnya (1, 1, 2, 3, 5, 8, ...). Baca n, lalu cetak angka ke-n.",
        "Satu bilangan bulat n antara 1 dan 40.",
        "Satu bilangan: angka ke-n dari deret Fibonacci.",
        '#include <stdio.h>\nint main(void) {\n  int n;\n  long long a = 1, b = 1;\n  scanf("%d", &n);\n  for (int i = 3; i <= n; i++) {\n    long long c = a + b;\n    a = b;\n    b = c;\n  }\n  printf("%lld\\n", b);\n  return 0;\n}\n',
        ["10\n", "1\n", "2\n", "3\n", "40\n", "20\n", "30\n", "5\n", "15\n", "25\n"],
    )

    # ---------------------------------------------------------------- hard (Susah)
    prob(
        "Urutkan Array", "hard",
        "Baca n bilangan, lalu cetak urutannya dari yang terkecil ke yang terbesar.",
        "Baris pertama berisi n (1 sampai 100). Baris kedua berisi n bilangan bulat antara -1000 dan 1000.",
        "Satu baris: n bilangan yang sudah urut naik, dipisah spasi.",
        '#include <stdio.h>\nint main(void) {\n  int n, a[100];\n  scanf("%d", &n);\n  for (int i = 0; i < n; i++) scanf("%d", &a[i]);\n  for (int i = 0; i < n - 1; i++)\n    for (int j = 0; j < n - 1 - i; j++)\n      if (a[j] > a[j + 1]) {\n        int t = a[j];\n        a[j] = a[j + 1];\n        a[j + 1] = t;\n      }\n  for (int i = 0; i < n; i++) printf(i == n - 1 ? "%d\\n" : "%d ", a[i]);\n  return 0;\n}\n',
        ["5\n3 1 4 1 5\n", "4\n9 8 7 6\n", "1\n42\n", "2\n2 1\n", "6\n-5 3 0 -5 8 -1\n", "3\n1 2 3\n", "7\n1000 -1000 0 500 -500 250 -250\n", "5\n7 7 7 7 7\n", "8\n8 7 6 5 4 3 2 1\n", "4\n0 -1 0 1\n"],
    )
    prob(
        "FPB dan KPK", "hard",
        "Baca dua bilangan, lalu cetak FPB (faktor persekutuan terbesar) dan KPK (kelipatan persekutuan terkecil) keduanya.",
        "Satu baris berisi dua bilangan bulat a dan b, masing-masing antara 1 dan 1000000.",
        "Satu baris: FPB, spasi, KPK. KPK bisa lebih besar dari 2 miliar, pakai long long.",
        '#include <stdio.h>\nint main(void) {\n  long long a, b;\n  scanf("%lld %lld", &a, &b);\n  long long x = a, y = b;\n  while (y != 0) {\n    long long r = x % y;\n    x = y;\n    y = r;\n  }\n  printf("%lld %lld\\n", x, a / x * b);\n  return 0;\n}\n',
        ["12 18\n", "7 13\n", "1 1\n", "1000000 1000000\n", "999983 999979\n", "100 75\n", "48 180\n", "1 1000000\n", "123456 654321\n", "17 51\n"],
    )
    prob(
        "Ubah ke Biner", "hard",
        "Baca n, lalu cetak n dalam bilangan biner (hanya angka 0 dan 1, tanpa nol di depan). Biner dari 0 adalah 0.",
        "Satu bilangan bulat n antara 0 dan 1000000000.",
        "Satu baris: n dalam biner.",
        "#include <stdio.h>\nint main(void) {\n  long long n;\n  char s[64];\n  int len = 0;\n  scanf(\"%lld\", &n);\n  if (n == 0) s[len++] = '0';\n  while (n > 0) {\n    s[len++] = (char)('0' + n % 2);\n    n /= 2;\n  }\n  for (int i = len - 1; i >= 0; i--) putchar(s[i]);\n  putchar('\\n');\n  return 0;\n}\n",
        ["10\n", "5\n", "0\n", "1\n", "2\n", "255\n", "1000000000\n", "1024\n", "7\n", "65535\n"],
    )
    prob(
        "Jumlah Bilangan Prima", "hard",
        "Baca n, lalu cetak jumlah semua bilangan prima yang kurang dari atau sama dengan n.",
        "Satu bilangan bulat n antara 1 dan 100000.",
        "Satu bilangan: jumlah semua prima sampai n (pakai long long). Kalau tidak ada prima, cetak 0.",
        '#include <stdio.h>\nint main(void) {\n  static char bukan[100001];\n  int n;\n  long long jumlah = 0;\n  scanf("%d", &n);\n  for (int i = 2; i <= n; i++) {\n    if (bukan[i]) continue;\n    jumlah += i;\n    for (long long j = (long long)i * i; j <= n; j += i) bukan[j] = 1;\n  }\n  printf("%lld\\n", jumlah);\n  return 0;\n}\n',
        ["10\n", "20\n", "1\n", "2\n", "3\n", "100\n", "100000\n", "1000\n", "50\n", "99999\n"],
    )
    prob(
        "Transpose Matriks", "hard",
        "Baca sebuah matriks r baris x c kolom, lalu cetak transposenya (baris jadi kolom dan sebaliknya).",
        "Baris pertama berisi r dan c (masing-masing 1 sampai 10). Lalu r baris, tiap baris berisi c bilangan bulat.",
        "c baris, tiap baris berisi r bilangan dipisah spasi.",
        '#include <stdio.h>\nint main(void) {\n  int r, c, m[10][10];\n  scanf("%d %d", &r, &c);\n  for (int i = 0; i < r; i++)\n    for (int j = 0; j < c; j++) scanf("%d", &m[i][j]);\n  for (int j = 0; j < c; j++) {\n    for (int i = 0; i < r; i++) printf(i == r - 1 ? "%d\\n" : "%d ", m[i][j]);\n  }\n  return 0;\n}\n',
        ["2 3\n1 2 3\n4 5 6\n", "3 2\n1 2\n3 4\n5 6\n", "1 1\n9\n", "1 4\n1 2 3 4\n", "4 1\n1\n2\n3\n4\n", "2 2\n1 0\n0 1\n", "3 3\n1 2 3\n4 5 6\n7 8 9\n", "2 5\n-1 -2 -3 -4 -5\n5 4 3 2 1\n", "5 2\n1 2\n3 4\n5 6\n7 8\n9 10\n", "3 1\n5\n-5\n0\n"],
    )
    prob(
        "Hitung Tiap Huruf", "hard",
        "Baca satu kata, lalu cetak berapa kali tiap huruf muncul, berurutan dari a sampai z. Huruf yang tidak muncul tidak dicetak.",
        "Satu kata dari huruf kecil, panjang 1 sampai 100.",
        "Satu baris per huruf yang muncul, bentuknya \"huruf: jumlah\".",
        "#include <stdio.h>\nint main(void) {\n  char s[128];\n  int n[26] = {0};\n  scanf(\"%100s\", s);\n  for (int i = 0; s[i]; i++) n[s[i] - 'a']++;\n  for (int k = 0; k < 26; k++)\n    if (n[k]) printf(\"%c: %d\\n\", 'a' + k, n[k]);\n  return 0;\n}\n",
        ["banana\n", "aab\n", "z\n", "lalalababa\n", "iris\n", "mississippi\n", "aaaaaaaaaa\n", "telkom\n", "zzzyyyxxx\n", "pemrograman\n"],
    )
    prob(
        "Jumlah Terbesar Berurutan", "hard",
        "Baca n bilangan, lalu cari jumlah terbesar dari sederet angka yang berurutan (minimal satu angka) di array itu.",
        "Baris pertama berisi n (1 sampai 100). Baris kedua berisi n bilangan bulat antara -1000 dan 1000.",
        "Satu bilangan: jumlah terbesar yang mungkin. Kalau semua angka negatif, jawabannya angka terbesar (paling dekat ke 0).",
        '#include <stdio.h>\nint main(void) {\n  int n, x, terbaik, sekarang;\n  scanf("%d", &n);\n  scanf("%d", &x);\n  terbaik = sekarang = x;\n  for (int i = 1; i < n; i++) {\n    scanf("%d", &x);\n    sekarang = sekarang > 0 ? sekarang + x : x;\n    if (sekarang > terbaik) terbaik = sekarang;\n  }\n  printf("%d\\n", terbaik);\n  return 0;\n}\n',
        ["8\n-2 1 -3 4 -1 2 1 -5\n", "5\n1 2 3 4 5\n", "1\n-5\n", "3\n-3 -2 -1\n", "4\n5 -9 6 -2\n", "6\n2 -1 2 -1 2 -1\n", "2\n-1 -1\n", "7\n1 -2 3 -4 5 -6 7\n", "5\n-1 -2 -3 -4 -5\n", "4\n1000 -1000 1000 -1000\n"],
    )
    prob(
        "Baris Segitiga Pascal", "hard",
        "Segitiga Pascal dimulai dari baris ke-0 yang isinya 1. Tiap angka di baris berikutnya adalah jumlah dua angka di atasnya (1; 1 1; 1 2 1; 1 3 3 1; ...). Baca n, lalu cetak baris ke-n.",
        "Satu bilangan bulat n antara 0 dan 15.",
        "Satu baris: angka-angka baris ke-n, dipisah spasi.",
        '#include <stdio.h>\nint main(void) {\n  int n;\n  long long c = 1;\n  scanf("%d", &n);\n  for (int k = 0; k <= n; k++) {\n    printf(k == n ? "%lld\\n" : "%lld ", c);\n    c = c * (n - k) / (k + 1);\n  }\n  return 0;\n}\n',
        ["4\n", "0\n", "1\n", "2\n", "5\n", "10\n", "15\n", "3\n", "8\n", "12\n"],
    )
