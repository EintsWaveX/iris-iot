/** The small sample file Impor offers: one question of two formats, in the syntax the dry run reads. */
export const SAMPLE_MD = `---
part: logika
lang: cpp
format: single
title: Contoh pilihan tunggal
status: draft
---
Berapa angka yang tercetak di Serial Monitor?

\`\`\`cpp
int a = 3;
int b = a * 2 + 1;
Serial.println(b);
\`\`\`

- [ ] 6
- [x] 7
- [ ] 9
- [ ] 3

---
part: fitb
lang: cpp
format: fitb
title: Contoh isi celah
status: draft
blanks:
  1: { accept: ["OUTPUT"] }
  2: { accept: ["HIGH", "1"] }
---
Lengkapi sketsa yang menyalakan LED.

\`\`\`cpp
void setup() {
  pinMode(2, __(1)__);
  digitalWrite(2, __(2)__);
}

void loop() {}
\`\`\`
`;
