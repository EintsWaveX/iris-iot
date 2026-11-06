/** The small sample file Impor offers in the Live Coding tab: one problem, in the syntax the dry run reads. */
export const SAMPLE_PROBLEM_MD = `---
title: Contoh Jumlah Dua Bilangan
tier: easy
status: draft
time: 1000
memory: 65536
---

## Soal

Baca dua bilangan bulat, lalu cetak jumlahnya.

## Input

Satu baris berisi dua bilangan bulat a dan b, masing-masing antara -1000 dan 1000.

## Output

Satu bilangan: a + b.

## Kode Awal

\`\`\`c
#include <stdio.h>

int main(void) {
  return 0;
}
\`\`\`

## Contoh

### Input

\`\`\`
3 5
\`\`\`

### Output

\`\`\`
8
\`\`\`

## Test

### Input

\`\`\`
0 0
\`\`\`

### Output

\`\`\`
0
\`\`\`

### Input

\`\`\`
1000 1000
\`\`\`

### Output

\`\`\`
2000
\`\`\`

### Input

\`\`\`
-7 -3
\`\`\`

### Output

\`\`\`
-10
\`\`\`

## Reference Solution

\`\`\`c
#include <stdio.h>

int main(void) {
  int a, b;
  scanf("%d %d", &a, &b);
  printf("%d\n", a + b);
  return 0;
}
\`\`\`
`;
