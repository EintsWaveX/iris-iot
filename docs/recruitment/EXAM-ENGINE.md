# IRIS Open Recruitment: Exam Engine (Tes Tulis & Koding)

Status: reviewed with the user, 2026-10-24 (prompt 08, sessions iris-aso-25 and iris-aso-61). The answers to the open items are in section 11.2; Part B (pure modules) builds against this.
Product rules: `PRD.md` section 7. Shape of the app: `ARCHITECTURE.md` sections 2, 7 to 9.
This file is the contract prompts 09 to 13 build against. Where it differs from ARCHITECTURE, this file wins for the exam and the difference is listed in section 11.

How to read it:
- **Normative** means "build exactly this". Everything in a code block named after a file in `src/lib/recruitment/` is normative.
- *(08's call)* marks a rule PRD 7 left open that I settled without asking. They are collected in the appendix so the user can check them in one place.
- *(ruling 2026-10-24)* marks a rule the user decided in this session (also in `STATUS.md`).
- **Default** marks content I wrote as the starting point: the seed bank, the Live Coding topics and templates, the rubric rows, the parts config. It ships as the edition's default and the Panitia edit or replace all of it in the web *(ruling 2026-10-24)*. A seed question carries `sample = true`, which only puts a "Bawaan" badge on it in the bank.

## 0. Words and conventions

| Word | Meaning |
|---|---|
| Edition | `rec_edition` (2026). Every exam row carries `edition_id`. |
| Room | One exam room: one Tes Tulis slot from S2 (`rec_slot`, stage `tes_tulis`) on one evening. A room has one Master at a time. |
| Rehearsal room | A room with `rehearsal = true` ("Ruang Latihan"). It draws from the same pool as a real room, its draws never set `shown_at`, and its seats count nowhere (no N, no M, no scores). The rig and the 16 Nov prod check use these. *(08's call)* |
| Seat | One candidate's place in the exam: one row per candidate per edition, plus a separate one if they sit a rehearsal room (`rec_exam_seat`). It belongs to one room at a time and keeps its draws and answers if Panitia move it (Susulan). |
| Part | A timed block: `logika`, `fitb`, `kodingan`, `mikro` (Phase 1) and `livecode` (Phase 2). "Debugging" is the sum of `kodingan` and `mikro`. |
| Pool | The `ready`, not voided questions of one part (and language) that a room may draw. Seed questions are in it like any other. |
| Draw | The questions one seat gets for one part, with their shuffles. Stored. |
| View | A question as the candidate sees it: the body with the seat's shuffle applied and no answer key. |
| Value | What the candidate answered for one question (format specific JSON). |
| Credit (c) | How right a value is, 0 to 1, as an exact fraction. |
| Master | The pengawas running the room's controls. Pengawas: everyone else plotted for that room. |
| Grader | Who fills a Live Coding rubric sheet: the room's plotted pengawas, Akademik and the Ketua *(ruling 2026-10-24)*. |

Conventions:
- **Time** in the room state is server epoch milliseconds (`number`). Pages read the server clock with `jamServer()` from `src/lib/jam.ts` (it narrows the laptop's offset from every API answer's `Date` header). Copy shows WIB, full dates.
- **Identifiers** in new code are English, like `types.ts`. Error codes (`kode`) stay Indonesian snake case, like the S1 API.
- **The API is the truth.** The relay only fans out. A page that lost the relay refetches from the API.
- **Pure modules** (normative, built by 08, imported by everyone, re-implemented by no one): `src/lib/recruitment/exam-types.ts`, `formats.ts`, `draw.ts`, `scoring.ts`, `room.ts`, and the small exact fraction helper `frac.ts` they share.

## 1. Question model

### 1.1 The row
`rec_question` (full column list in section 10.1). What matters here:

| Field | Type | Notes |
|---|---|---|
| `part` | `logika \| fitb \| kodingan \| mikro` | Live Coding topics are not questions (section 9.2). |
| `lang` | `cpp \| py \| any` | `any` only in a part whose config has one `any` count (Mikro by default). |
| `format` | `single \| multi \| lines \| fix \| order \| match \| fitb` | The seven formats of PRD 7.2. |
| `title` | text | The bank's label for the author. Never shown to candidates. |
| `body` | JSON | What the candidate may see. Format specific (1.3). |
| `answer` | JSON | The key. Never leaves the server except to the `bank` right. |
| `refs` | `int[]` | `rec_reference` ids attached to this question (section 8). |
| `status` | `draft \| ready` | Only `ready` joins a pool. |
| `sample` | boolean | Seed question I wrote ("Bawaan" badge in the bank). Drawn like any other; the badge only tells Akademik which ones are still the seeds. An edit by a person clears it. *(ruling 2026-10-24)* |
| `version` | int | +1 on every save. |
| `shown_at` | timestamp, null | Set the first time a real seat starts a part with this question in its draw. From then on the structure is locked (1.4). |
| `voided_at` | timestamp, null | Voided questions leave every seat's numerator and denominator (13 owns the action). |

### 1.2 The body's text
- `prompt` is Markdown: paragraphs, **bold**, *italic*, inline code, fenced code blocks with a language (`cpp`, `py`, `text`), lists, simple tables, and images written `![alt](img:<id>)` that point at `body.images`.
- No raw HTML and **no links**: a link renders as its text only (the test must never navigate out). The renderer escapes everything else.
- Code is highlighted with `src/lib/highlight.ts`, the same look as the Kode Jurnal editor.
- `images`: `{ id, key, alt, w, h }[]`, where `key` is an R2 key under `recruitment/<edition>/bank/`. A candidate loads an image only through `GET media` while that question is in their draw (section 10.3).

### 1.3 The seven formats
Every format defines four shapes and three functions. The shapes live in `exam-types.ts`; the functions in `formats.ts`:
- `body` (stored), `answer` (stored), `view` (what the candidate's page gets), `value` (what the candidate sends).
- `makePerm(question, rng)`: the seat's shuffle. `toView(question, perm)`: body plus shuffle, minus the key. `credit(question, value)`: an exact fraction 0 to 1. A question is **fully correct** when its credit is exactly 1 (this is what M counts).
- `value = null` means unanswered: credit 0, still counted as shown (PRD 7.4).
- `checkValue(question, value)` is what `test-answer` stores: the format's one field, only ids, line numbers and blank numbers the question has, no repeats, a blank at most `MAX_BLANK` (200) characters. Anything else is refused with `nilai_salah`. `credit()` never throws: a value of the wrong shape earns 0, so one bad row can never stop a part's scores from being read. *(W1, 2026-10-24)*
- **Option, line and pair ids are random and opaque:** 6 characters of `a` to `z` and `0` to `9`, made by `newId()` when the item is created, and never changed once the question is shown. The view sends items only in perm order with these ids. Ids in written order (`a b c`, `l1 l2`, `k1` beside `p1`) would let a candidate sort Parsons lines by id or pair match items by number. Positions on screen come only from the perm.
- The stored body keeps the authored order, and the editor and export use it. It never reaches a candidate as it is: `toView` is the only way out.

**1. Single choice (`single`)**
- body: `{ prompt, options: { id, text }[] (2 to 8), shuffle: boolean (default true) }`
- answer: `{ correct: id }`
- perm: `{ options: id[] }` (the authored order when `shuffle` is false)
- value: `{ pick: id | null }`
- credit: 1 if `pick === correct`, else 0.

**2. Checkbox (`multi`)**
- body: like single, 2 to 10 options. The number of right options is never shown *(ruling 2026-10-24)*.
- answer: `{ correct: id[] }` (at least 1)
- value: `{ picks: id[] }`
- credit: `max(0, (right picks − wrong picks) ÷ |correct|)`; fully correct when `picks` equals `correct` as a set.

**3. Click the buggy line(s) (`lines`)**
- body: `{ prompt, code: { lang, src } }`. Lines are `src.split("\n")`, numbered from 1. Blank lines cannot be clicked.
- answer: `{ lines: number[] }` (at least 1, no blank line)
- perm: none. value: `{ picks: number[] }`
- credit: the checkbox formula over line numbers. The candidate may always pick several lines and is never told how many are wrong *(ruling 2026-10-24)*; with one bug the same formula gives 0 or 1, as PRD 7.4 asks.

**4. Pick the fix per line (`fix`)**
- body: `{ prompt, code: { lang, src }, slots: { line: number, options: { id, text }[] (2 to 6) }[] (1 to 8) }`. Each slot line shows the original text with a kit Dropdown of whole replacement lines. The original text counts as an option only if the author lists it (a red herring slot keeps its line).
- answer: `{ picks: Record<line, id> }`
- perm: `{ slots: Record<line, id[]> }` (option order per slot)
- value: `{ picks: Record<line, id | null> }`
- credit: correct slots ÷ number of slots.

**5. Order the lines (`order`, Parsons)**
- body: `{ prompt, lang, lines: { id, text }[] (3 to 15) }`, sorted by id (random), so even the stored body says nothing about the answer. Each `text` keeps its leading indentation; the candidate only orders, and every line belongs *(ruling 2026-10-24)*.
- answer: `{ order: id[], also: id[][] }`. `also` lists other orders that are exactly right too (two independent declarations, `setup()` and `loop()` swapped). Empty by default. *(08's call)*
- perm: `{ lines: id[] }`, the starting order. It is never right already: `makePerm` reshuffles until the starting text sequence matches no accepted order.
- value: `{ order: id[] } | null`. It stays null until the candidate moves a line, so an untouched question earns nothing.
- credit: compare **texts**, not ids, so identical lines (two `}`) are interchangeable. 1 when the candidate's texts equal any accepted order's texts; else `max over accepted orders of LCS(candidate, accepted) ÷ n × 1/2`, where LCS is the longest common subsequence (PRD 7.4: "the longest correct subsequence ÷ the number of lines, times 0.5").

**6. Match pairs (`match`)**
- body: `{ prompt, left: { id, text }[] (2 to 8), right: { id, text }[] }`, with `right` holding `left.length` to `left.length + 2` items (up to two distractors) *(08's call)*.
- answer: `{ pairs: Record<leftId, rightId> }`, one to one.
- perm: `{ left: id[], right: id[] }`
- value: `{ pairs: Record<leftId, rightId | null> }`. The UI is one kit Dropdown per left row; picking a right item another row holds moves it, so the value stays one to one.
- credit: correct pairs ÷ `left.length`.

**7. Fill in the blanks (`fitb`)**
- body: `{ prompt, code?: { lang, src }, blanks: { n, width, hint? }[] }`. A blank is written `__(n)__` (two or more underscores each side) in `code.src` or in `prompt`, and renders as the IRIS blank look: an underscore run input with its number. Several blanks may share a line. *(08's call: the practicum's `________ // (n)` form allows one blank per line, and `[[n]]` or `{{n}}` collide with real Python and C++.)*
- `width` is the input's width in characters (default 10) and grows as the candidate types. It never comes from the answer.
- answer: `{ blanks: Record<n, { accept: string[], case: "exact" | "ignore", space: "exact" | "trim" | "collapse" | "none" }> }`. Defaults: `case: "exact"`, `space: "trim"` *(08's call: C++ and Python are case sensitive)*.
- Before comparing, both sides are NFC normalized and curly quotes become straight ones; then the blank's `space` rule (`trim` ends, `collapse` inner runs to one space, `none` removes all whitespace) and `case` rule apply.
- perm: none. value: `{ blanks: Record<n, string> }`
- credit: correct blanks ÷ number of blanks.

`validateQuestion(q)` in `formats.ts` returns `{ field, kode }[]` for every rule above (counts, ids unique, the key pointing at real ids or lines, `also` orders being permutations, blank numbers 1..k each present once in the source and in the key). The editor, the import and `question-save` all call it.

### 1.4 After a question is shown *(ruling 2026-10-24)*
Once `shown_at` is set:
- **Text** (prompt, option texts, line texts, hints, images' alt) may still change. The candidate sees the new text on their next load.
- **The key** may change only with a note. It is logged in `rec_question_log`, and every seat is rescored on the next read (scores are computed from raw values, section 4).
- **The structure** may not change: option ids, line count, slot lines and their option ids, Parsons line ids, match ids, blank numbers. `structureKey(q)` in `formats.ts` is the canonical fingerprint; `question-save` refuses a change of it with `struktur_terkunci`.
- **A broken question is voided** (13), which removes it from every seat that saw it. A replacement is a new question.
- Questions that were never shown edit freely and may be deleted. New questions may join the pool between evenings; PRD 7.9 only locks publishing while a room runs.
- While any real room of the edition is in `persiapan`, a part or the spins (opened and not finished), saves that change a `ready` question, or move a question into or out of `ready`, answer `ruang_berjalan`. Drafts edit freely, and so does everything between evenings.

### 1.5 Import and export (Markdown + YAML)
One UTF-8 `.md` file holds any number of questions. Each question starts with a YAML front matter between two `---` lines, followed by its Markdown body. Inside a prompt, use `***` for a horizontal rule; a line `---` followed by `key:` lines starts the next question.

Front matter keys: `id` (export only; with an id the import updates that question), `part`, `lang`, `format`, `status` (`draft` default), `title`, `sample`, `refs` (reference URLs that must already exist in the bank, otherwise the dry run reports them), `shuffle` (single, multi), `bugs` (lines), `also` (order, 1-based line numbers of the authored block), `blanks` (fitb).

Body rules per format:
- **single, multi:** the prompt, then the **last** task list: `- [x]` right, `- [ ]` wrong.
- **lines:** the prompt, then one fenced code block (the code). `bugs:` names the wrong lines.
- **fix:** the prompt, the code block, then per slot a heading `### Baris N` (or `### Line N`) and a task list of replacement lines, each in backticks so indentation survives.
- **order:** the prompt, then one code block holding the lines **in the right order**. Empty lines in it are skipped.
- **match:** the prompt, then a two column table. Each row is a pair; a row with an empty left cell adds a distractor on the right.
- **fitb:** the prompt and a code block holding `__(n)__` blanks; `blanks:` gives each blank's `accept`, `case`, `space`, `width`, `hint`.

The file never names item ids. A new question gets fresh random ids (1.3). An update (front matter `id`) keeps the stored ids by position in the authored order, so a shown question's structure survives the round trip; a different item count is a structure change (`struktur_terkunci` once shown).

The dry run (`bank-import` with `dry: true`) parses everything, runs `validateQuestion`, and answers one row per question (`create` or `update`, or its errors with line numbers) without writing. Export writes the same syntax, so export then import is a round trip (09 tests it for every format). The parser and writer live in a pure `src/lib/recruitment/bank-io.ts` (09 owns it).

#### Examples (seed content, one per format in C++ and in Python)
These fourteen are also the first entries of 09's rig seed. On 2026-10-24, with the answer applied, every Python program below was run, the two plain C++ snippets were compiled with g++ and run, and the five sketches (both orders of the Parsons one) were compiled with arduino-cli for `esp32:esp32:esp32`. The answers marked right are what they actually printed. The match questions hold no program.

````markdown
---
part: logika
lang: cpp
format: single
title: Jumlah bilangan ganjil
sample: true
status: ready
---
Berapa angka yang tercetak di Serial Monitor?

```cpp
int nilai = 7;
int hasil = 0;
for (int i = 1; i <= nilai; i += 2) {
  hasil += i;
}
Serial.println(hasil);
```

- [ ] 12
- [x] 16
- [ ] 28
- [ ] 9

---
part: logika
lang: py
format: single
title: Suhu di atas 30
sample: true
status: ready
---
Apa keluaran program ini?

```py
suhu = [31, 28, 35, 29, 33]
panas = [t for t in suhu if t > 30]
print(len(panas), max(panas))
```

- [x] `3 35`
- [ ] `2 35`
- [ ] `3 33`
- [ ] `5 35`

---
part: logika
lang: cpp
format: multi
title: uint8_t meluap
sample: true
status: ready
---
Pilih semua pernyataan yang benar tentang potongan ini.

```cpp
uint8_t a = 200;
uint8_t b = 100;
uint8_t c = a + b;
int d = a + b;
```

- [x] `c` bernilai 44
- [x] `d` bernilai 300
- [ ] `c` bernilai 300
- [x] `a + b` dihitung sebagai `int` sebelum disimpan
- [ ] Kompilasi gagal karena tipe datanya beda

---
part: logika
lang: py
format: multi
title: setdefault pada dict
sample: true
status: ready
---
Setelah kode ini jalan, pernyataan mana saja yang benar?

```py
data = {"suhu": 30, "lembap": 70}
data["suhu"] += 2
data.setdefault("lembap", 0)
data.setdefault("cahaya", 512)
```

- [x] `data["suhu"]` bernilai 32
- [ ] `data["lembap"]` bernilai 0
- [x] `data` sekarang punya 3 kunci
- [x] `data["cahaya"]` bernilai 512
- [ ] `len(data)` bernilai 2

---
part: kodingan
lang: cpp
format: lines
title: LED dan tombol pull-up
sample: true
status: ready
bugs: [6, 11]
---
Sketsa ini harus menyalakan LED selama tombol (INPUT_PULLUP) ditekan. Klik baris yang salah.

```cpp
const int TOMBOL = 4;
const int LED = 2;

void setup() {
  pinMode(TOMBOL, INPUT_PULLUP);
  pinMode(LED, INPUT);
}

void loop() {
  int baca = digitalRead(TOMBOL);
  if (baca = LOW) {
    digitalWrite(LED, HIGH);
  } else {
    digitalWrite(LED, LOW);
  }
}
```

---
part: kodingan
lang: py
format: lines
title: Nilai tertinggi
sample: true
status: ready
bugs: [2, 4]
---
Fungsi ini harus mengembalikan bacaan tertinggi, termasuk saat semua bacaan negatif. Klik baris yang salah.

```py
def tertinggi(bacaan):
    maks = 0
    for i in range(len(bacaan)):
        if i > maks:
            maks = bacaan[i]
    return maks
```

---
part: kodingan
lang: cpp
format: fix
title: DHT ke JSON
sample: true
status: ready
---
Sketsa ini membaca suhu DHT11 tiap 2 detik lalu mengirimnya sebagai JSON. Pilih isi yang benar untuk tiap baris yang ditandai.

```cpp
#include <DHT.h>
DHT dht(15, DHT11);
unsigned long terakhir = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  if (millis() - terakhir < 2000) return;
  terakhir = millis();
  float t = dht.readTemperature();
  if (t == NAN) return;
  Serial.printf("{\"suhu\":%d}\n", t);
}
```

### Baris 6
- [ ] `  Serial.begin(115200);`
- [x] `  Serial.begin(115200); dht.begin();`
- [ ] `  dht.begin(115200);`

### Baris 10
- [x] `  if (millis() - terakhir < 2000) return;`
- [ ] `  if (millis() - terakhir > 2000) return;`
- [ ] `  if (millis() < 2000) return;`

### Baris 13
- [ ] `  if (t == NAN) return;`
- [x] `  if (isnan(t)) return;`
- [ ] `  if (t == 0) return;`

### Baris 14
- [ ] `  Serial.printf("{\"suhu\":%d}\n", t);`
- [x] `  Serial.printf("{\"suhu\":%.1f}\n", t);`
- [ ] `  Serial.printf("{\"suhu\":%s}\n", t);`

---
part: kodingan
lang: py
format: fix
title: Tiga bacaan per detik
sample: true
status: ready
---
Program ini harus mencetak tiga bacaan dengan jeda 1 detik. Pilih isi yang benar untuk tiap baris yang ditandai.

```py
import time

def baca_sensor():
    return 25.0

hitung = 0
while hitung < 3:
    nilai = baca_sensor()
    print("Bacaan", hitung, ":", nilai)
    time.sleep(1000)
    hitung =+ 1
```

### Baris 7
- [x] `while hitung < 3:`
- [ ] `while hitung <= 3:`
- [ ] `while hitung > 3:`

### Baris 10
- [ ] `    time.sleep(1000)`
- [x] `    time.sleep(1)`
- [ ] `    time.delay(1)`

### Baris 11
- [ ] `    hitung =+ 1`
- [x] `    hitung += 1`
- [ ] `    hitung + 1`

---
part: logika
lang: cpp
format: order
title: Kirim potensiometer
sample: true
status: ready
also: [[1, 5, 6, 7, 8, 9, 2, 3, 4]]
---
Susun baris berikut menjadi sketsa yang mengirim nilai potensiometer lewat Serial setiap 1 detik.

```cpp
const int POT = 34;
void setup() {
  Serial.begin(115200);
}
void loop() {
  int nilai = analogRead(POT);
  Serial.println(nilai);
  delay(1000);
}
```

---
part: logika
lang: py
format: order
title: Rata-rata bergerak
sample: true
status: ready
---
Susun fungsi yang menghitung rata-rata bergerak dari tiap tiga bacaan berurutan.

```py
def rata_bergerak(data):
    hasil = []
    for i in range(2, len(data)):
        jendela = data[i - 2:i + 1]
        hasil.append(sum(jendela) / 3)
    return hasil
```

---
part: mikro
lang: cpp
format: match
title: Gejala dan penyebab
sample: true
status: ready
---
Pasangkan tiap gejala pada rangkaian ESP32 dengan penyebab yang paling mungkin.

| Gejala | Penyebab |
|---|---|
| LED tidak pernah menyala walau kodenya benar | Kaki LED terbalik |
| Bacaan tombol naik turun sendiri saat tidak ditekan | Pin tombol mengambang tanpa pull-up atau pull-down |
| `analogRead` selalu 4095 | Pin analog tersambung langsung ke 3V3 |
| DHT selalu memberi NaN | Kabel data DHT masuk ke pin yang beda dengan di kode |
| ESP32 restart saat servo bergerak | Catu daya tidak cukup (brownout) |
|  | Baud rate Serial Monitor beda dengan `Serial.begin` |

---
part: logika
lang: py
format: match
title: Metode string
sample: true
status: ready
---
Pasangkan tiap ekspresi Python dengan hasilnya.

| Ekspresi | Hasil |
|---|---|
| `"iris-iot".upper()` | `'IRIS-IOT'` |
| `"a,b,c".split(",")` | `['a', 'b', 'c']` |
| `" 25 ".strip()` | `'25'` |
| `"suhu".replace("u", "o")` | `'soho'` |
| `"3" * 3` | `'333'` |
|  | `9` |

---
part: fitb
lang: cpp
format: fitb
title: Kedip tanpa delay
sample: true
status: ready
blanks:
  1: { accept: ["OUTPUT"] }
  2: { accept: ["millis()"], space: none }
  3: { accept: ["LOW", "0"] }
---
Lengkapi sketsa yang mengedipkan LED tiap 500 ms tanpa `delay()`.

```cpp
const int LED = 2;
unsigned long terakhir = 0;
bool nyala = false;

void setup() {
  pinMode(LED, __(1)__);
}

void loop() {
  if (millis() - terakhir >= 500) {
    terakhir = __(2)__;
    nyala = !nyala;
    digitalWrite(LED, nyala ? HIGH : __(3)__);
  }
}
```

---
part: fitb
lang: py
format: fitb
title: Kemas dan buka JSON
sample: true
status: ready
blanks:
  1: { accept: ["dumps"] }
  2: { accept: ["loads"] }
  3: { accept: ["str"] }
---
Lengkapi program yang mengemas bacaan menjadi teks JSON lalu membukanya lagi. Baris terakhir mencetak `True`.

```py
import json

def kemas(suhu, lembap):
    data = {"suhu": suhu, "lembap": lembap}
    return json.__(1)__(data)

def buka(pesan):
    data = json.__(2)__(pesan)
    return data["suhu"]

print(buka(kemas(29.5, 61)))
print(type(kemas(1, 2)) is __(3)__)
```
````

## 2. Parts config per edition

`rec_exam_config` holds one JSON per edition (`ExamConfig` in `exam-types.ts`). `DEFAULT_EXAM_CONFIG` is PRD 7.1:

| Part | Minutes | Counts (shown / pool target) | Cap |
|---|---|---|---|
| `logika` | 15 | C++ 10 / 20, PY 5 / 10 | 1000 |
| `fitb` | 15 | C++ 10 / 20, PY 5 / 10 (the PRD's 15 / 30 at the default 10 / 5 ratio) | 1000 |
| `kodingan` | 10 | C++ 5 / 10, PY 5 / 10 *(08's call: PRD gives 10 / 20 total with no split)* | 500 |
| `mikro` | 20 | any 5 / 10 *(08's call: one count, questions may be C++ or PY)* | 500 |
| `livecode` | 45 | 1 topic × 1 protocol | 1000 (rubric) |

```ts
// exam-types.ts (shape; values above)
interface ExamConfig {
  v: 1;
  /** The room's budget bar, minutes (PRD 7.1: 120, a budget, not a cap) */
  budgetMin: number;
  /** Phase 1 then Live Coding, in this order (PRD 7.8) */
  order: PartKey[];                    // ["logika", "fitb", "kodingan", "mikro", "livecode"]
  parts: Record<Phase1Part, {
    minutes: number;                   // 1..60
    counts: Partial<Record<Lang, { shown: number; pool: number }>>;  // cpp+py, or any alone
  }>;
  livecode: { minutes: number; protocols: Protocol[]; graders: 2 };
}
```

Rules:
- Caps are not config: `PART_CAP` in `exam-types.ts` is `{ logika: 1000, fitb: 1000, kodingan: 500, mikro: 500 }` (PRD 7.4), so Phase 1 is out of 3000 and the test out of 4000.
- `pool` is a target for the counter ("12 dari 20 siap"), not a limit. A room's Start needs, per part and language, at least `shown` questions that are ready and not voided (`bank_kurang` otherwise). The seed bank (09) holds at least that many for the default config, so a room can start on the defaults alone *(ruling 2026-10-24)*.
- The C++/PY split of FITB is the two `shown` numbers (default 10 and 5).
- `validateConfig(c)` in `room.ts` returns field errors (minutes 1 to 60 for Phase 1 parts and 10 to 120 for Live Coding, `shown ≥ 1`, `pool ≥ shown`, `order` is exactly the five parts with `livecode` last, a part has `any` alone or `cpp`/`py` without `any`).
- The config **locks** when the first real room of the edition starts (`locked_at`); after that only `budgetMin` may change. Seats on different evenings must see the same shape. *(08's call)* Per room changes go through the Master's ± time.
- The salt for the draw (`salt`, 32 random bytes in hex) sits in the same row, is generated on first save, and never leaves the server.

## 3. Draw

### 3.1 Seeds
- `seed = HMAC-SHA256(salt, "draw:" + seatId + ":" + part)` as hex, from `drawSeed(saltHex, seatId, part)` in `draw.ts` (WebCrypto, async; the only async function in the pure modules).
- `rngFrom(seedHex, ...tags)` builds a xoshiro128** generator from the seed bytes mixed with the tags (`"q", questionId` for one question's shuffle). Integer math only (`Math.imul`, `>>> 0`), so Node, the browser and the tests agree bit for bit.
- Because a seat's draw depends only on the salt, its own id and the part, when or how often it is computed does not matter. It is still stored, so a later pool change can never move a seat's questions.

### 3.2 The algorithm (`drawPart` in `draw.ts`)
Input (`drawPart(seed, counts, pool)`): the seed, the part's counts, and the pool (every question of the part that is ready and not voided, for real and rehearsal rooms alike), each with its full body for the shuffles.
1. Sort the pool by id.
2. For each language of the part's counts, in the order `cpp`, `py`, `any`: take the pool's questions of that language (for `any`, every question), shuffle them with Fisher Yates from `rngFrom(seed, "pick", lang)`, and keep the first `shown`. Fewer than `shown` throws `DrawShort` (the Start guard checks first with `poolShortfall`).
3. Order on screen: the C++ block, then the PY block, each in drawn order *(08's call: no switching languages back and forth)*.
4. For each kept question: `perm = makePerm(question, rngFrom(seed, "q", question.id))`. A question's shuffle depends on the seat and the question only, not on its position.
5. Output: `{ q, v, lang, perm }[]` (`v` is the question version at draw time, kept for the audit).

No repeats inside a seat: a part never holds a question twice, and parts have disjoint pools (`part` is a column).

### 3.3 What is stored, and when
- `rec_exam_seat.draw` is JSON: `{ [part]: { at, room, items: DrawnItem[] } }` (`SeatDraw`). `room` is the room the seat sat in when it started the part.
- The draw for a part is written the **first time that seat fetches the part after it started** (`GET test`), in one statement that only writes if that part's key is still absent. Two tabs racing compute the same draw anyway.
- **This write is what "started a part" means** for scoring: a seat with no draw for a part never started it, so it is out of that part's N (PRD 7.4). A late seat that opens a running part starts it then, with the room's time left.
- **No time, no draw:** the draw is written only while `seatLeft > 0` for that seat. A seat that first opens a part when its time is already over (the room's time ran out and it has no extra) gets the lobby view and no draw, so it stays `absent` and out of N, instead of joining N with an empty sheet that would raise every drawn question's weight. *(W1, 2026-10-24)*
- The first real draw containing a question sets that question's `shown_at` (structure lock).
- **Reconnect or reload:** the stored draw is reused as is; the view is rebuilt from the current question text with the stored perm.
- **Reopen previous:** the same stored draw; answers are kept.
- **Seat moved to another room** (Susulan): draws and answers move with the seat; parts it already started are not drawn again, and **stay closed**: `test-answer` takes answers to a part only while the seat sits in the draw's `room` (`bagian_ruang_lain` otherwise, and the runner shows that part as done). In the new room the seat does only the parts it never started; what it answered before is scored as it is *(ruling 2026-10-24)*.
- **Voided after the draw:** the item stays in the stored draw. The candidate sees "Soal ini dibatalkan" in its place, and scoring skips it.

### 3.4 Live Coding spins (also in `draw.ts`)
- **Room seed:** `roomSeed = HMAC-SHA256(salt, "room:" + roomId)`.
- **Topics are dealt like cards.** The k-th topic spin in the room takes `topicAt(roomSeed, readyTopicIds, k)`: cycle `floor(k / n)` is a fresh Fisher Yates shuffle of the ids sorted ascending, from `rngFrom(roomSeed, "topic", cycle)`. Every topic is used once before any repeats. The API takes `k` from a counter in the room row, incremented in the same statement that stores the spin, so two seats spinning at once get different cards.
- **Protocol:** `pickProtocol(fits, used, roomSeed, k, exclude?)` takes, among the topic's `fits` (minus `exclude`), the protocol used least so far in the room, and breaks ties with `rngFrom(roomSeed, "proto", k)`. The room stays balanced across BLE, HTTP/WebSocket and MQTT *(08's call)*.
- **Re-roll (Master, one seat, with a reason):** `topic` deals the next card that differs from the seat's topic, then the protocol is picked again; `protocol` picks again with the current one excluded. Either is allowed during the spins and while Live Coding runs. Every spin is appended to `rec_livecode.spins` with who did it (`seat`, `master`, `auto`).

## 4. Scoring

### 4.1 Formula (PRD 7.4, exact)
For each question q, over every **real** seat of the edition that **started** q's part and has q in its draw, across all evenings and Susulan, with voided questions out:
- `N_q` = number of those seats; `M_q` = how many have `credit = 1`.
- `p_q = (M_q + 1) / (N_q + 2)`, `w_q = 2 − p_q = (2N_q + 3 − M_q) / (N_q + 2)`, between 1 and 2.

For one seat and one Phase 1 part:
- `ratio = Σ c_q · w_q ÷ Σ w_q` over the seat's drawn, not voided questions of that part (unanswered ones count with c = 0).
- `score = roundHalfUp(cap × ratio)` with the part's cap (1000 for Logika and FITB, 500 for Kodingan and Mikro).
- `debugging = kodingan + mikro` (each rounded first, PRD: "each computed with a 500 cap, then added").
- `phase1 = logika + fitb + debugging` (out of 3000).

Live Coding (section 9.8): each grader's sheet gives an exact ratio `Σ weight·value/max ÷ Σ weight`. `livecode = roundHalfUp(1000 × mean of the graders' ratios)` over the sheets that count (the first two from two different people). `total = phase1 + livecode` (out of 4000).

**Arithmetic:** every credit, weight and ratio is an exact fraction (`frac.ts`, BigInt numerator and denominator), and rounding happens once per part score: `roundHalfUp(cap × n/d) = floor((2·cap·n + d) / (2·d))`. No floating point anywhere in a score, so the API, the Cutting board and the tests can never disagree by one point. *(08's call)*

### 4.2 Edge cases
| Case | Result |
|---|---|
| Unanswered (`value` null) | c = 0, still counts as shown (PRD). |
| A seat never started a part (no draw) | That part scores 0 and is flagged `absent`; the seat is not in the part's N. |
| A seat started, but every question it drew is voided | Ratio 0, flagged `empty`. Penilaian shows a warning for Akademik to judge. *(08's call)* |
| A question nobody started (N = 0) | Never enters any sum. Its stats show N 0, p 1/2, w 3/2. |
| Order lines, partly right | LCS rule of 1.3, fifth format. |
| Rehearsal seats | Counted nowhere: not in N or M, no score rows. |
| Two tabs answering | The last write wins; the runner warns (10). |
| A key fixed after the evening | Every seat is rescored on the next read; frozen scores change only after an unfreeze. |

### 4.3 Provisional and final
- **Provisional:** computed on every read from the raw answers, the current keys and the current voids. Panitia see these as "Sementara". N and M grow as evenings happen, so a seat's score moves until the last room closes.
- **Finalkan** (Ketua or anyone in Akademik, the `bank` right *(ruling 2026-10-24)*) is allowed only when:
  - every room of the edition that has seats is `finished`, and none is open;
  - every seat that got a Live Coding topic has two counted grader sheets.
  It writes a `rec_score_freeze` row: every candidate's part scores, phase 1, livecode, total and flags, plus every question's N, M, p and w. The Cutting board and Penilaian then read the freeze ("Final").
- **Unfreeze** (same right) needs a note, marks the freeze superseded, and brings back provisional reads until the next Finalkan. Key fixes and voids are refused while frozen (`nilai_final`).
- Candidates never see any score, at any time (PRD 1 and 5.5).

### 4.4 Worked example (normative: `recruitment-scoring.test.ts` reproduces it)
One part, Logika (cap 1000). Item ids are written as letters here for reading; real ids are random (1.3). Four questions:
- q1 single: right option `b`.
- q2 multi: right options `{a, c}`.
- q3 order: four lines `l1 l2 l3 l4` with distinct texts.
- q4 fitb: two blanks.

Four seats started the part, each drawing three questions. S5 never opened the part.

| Seat | q1 | q2 | q3 | q4 |
|---|---|---|---|---|
| S1 | `b`: c = 1 | `{a, c}`: c = 1 | `l1 l2 l3 l4`: c = 1 | not drawn |
| S2 | `a`: c = 0 | `{a}`: (1 − 0) / 2 = 1/2 | not drawn | 1 of 2 blanks: 1/2 |
| S3 | `b`: c = 1 | not drawn | `l1 l3 l2 l4`: LCS 3, 3/4 × 1/2 = 3/8 | 2 of 2: c = 1 |
| S4 | not drawn | `{a, b, c}`: (2 − 1) / 2 = 1/2 | untouched: c = 0 | 0 of 2: c = 0 |

Statistics (S5 is out of every N):

| q | N | M (fully correct) | p | w |
|---|---|---|---|---|
| q1 | 3 (S1, S2, S3) | 2 (S1, S3) | 3/5 | 7/5 |
| q2 | 3 (S1, S2, S4) | 1 (S1) | 2/5 | 8/5 |
| q3 | 3 (S1, S3, S4) | 1 (S1) | 2/5 | 8/5 |
| q4 | 3 (S2, S3, S4) | 1 (S3) | 2/5 | 8/5 |

Part scores:

| Seat | Σ c·w | Σ w | ratio | 1000 × ratio | score |
|---|---|---|---|---|---|
| S1 | 7/5 + 8/5 + 8/5 = 23/5 | 23/5 | 1 | 1000 | **1000** |
| S2 | 0 + 4/5 + 4/5 = 8/5 | 23/5 | 8/23 | 347.83 | **348** |
| S3 | 7/5 + 3/5 + 8/5 = 18/5 | 23/5 | 18/23 | 782.61 | **783** |
| S4 | 4/5 + 0 + 0 = 4/5 | 24/5 | 1/6 | 166.67 | **167** |
| S5 | | | | | **0**, `absent` |

Variants the tests also pin:
- **q4 voided:** q1 to q3 keep N 3 and their M, so S2 = (0 + 4/5) ÷ (7/5 + 8/5) = 4/15 → 266.67 → **267**, S3 = (7/5 + 3/5) ÷ 3 = 2/3 → **667**, S4 = (4/5) ÷ (16/5) = 1/4 → **250**, S1 **1000**.
- **Debugging:** the same questions and answers as Kodingan and as Mikro (cap 500 each) give S2 `round(500 × 8/23) = 174` and `round(500 × 8/23) = 174`, so Debugging **348**; S3 `391 + 391 = 782`.
- **A tie rounds up:** `roundHalfUp(500 × 5/8) = 313` (312.5).
- **Live Coding**, the default rubric of 9.8 (weights 3, 2, 2, 1, 2; every row out of 4): grader A `3, 4, 3, 2, 3` gives 7.75 / 10, grader B `4, 3, 4, 3, 3` gives 8.75 / 10, so livecode = `round(1000 × (0.775 + 0.875) / 2)` = **825**.
- **A total:** Logika 783, FITB 348, Debugging 174 + 391 = 565, so phase 1 = 1696; with livecode 825 the total is **2521**.

## 5. Room state machine

### 5.1 Stored state
`rec_exam_room.state` is a `RoomState`. Every write goes through `act()` in `room.ts`, under `UPDATE ... WHERE id = $id AND seq = $seen`; zero rows means someone else wrote first (`versi_lama`), and the console refetches.

```ts
// exam-types.ts
interface RoomState {
  v: 1;
  seq: number;                        // +1 on every accepted action
  stage: "setup" | "prep" | "parts" | "spin" | "finished";
  cur: PartKey | null;                // the part running or last run; null before the first Start
  runs: Partial<Record<PartKey, PartRun>>;
  startedAt: number | null;           // the first Start (the budget bar's zero)
  finishedAt: number | null;
  master: { nim: string; since: number } | null;
  ask: { nim: string; at: number } | null;   // a pengawas asked to take over
}
interface PartRun {
  durMs: number;                      // the room's length for this part: config minutes ± room changes
  usedMs: number;                     // the room clock consumed up to `mark`; pauses do not count
  mark: number | null;                // when the current running stretch began; null unless running
  state: "running" | "paused" | "ended";
  pausedAt: number | null;
  extra: Record<string, number>;      // seat id → extra ms on top of durMs
  startedAt: number;
  endedAt: number | null;
  endedBy: "time" | "skip" | null;
  leftAtSkip: number;                 // what the room had left when skipped; Reopen gives it back
  reopened: number;
}
```

### 5.2 Timer math (all in `room.ts`, all from server time)
- `clock(run, now) = usedMs + (running ? now − mark : 0)`
- `roomLeft = max(0, durMs − clock)`, and for a seat `seatLeft = max(0, durMs + extra[seat] − clock)`
- While running, a seat's deadline is `mark + durMs + extra[seat] − usedMs`. While paused, the time left is frozen.
- **Lazy end:** `normalize(state, now)` runs before every action and every read. A running part whose clock passed `durMs + max(extra)` becomes `ended` with `endedAt` set to the exact instant that happened, not the time of the read. Nobody has to be online when time runs out.
- **Pages** compute the same functions with `jamServer()` (`src/lib/jam.ts`) for "now", redraw once a second for display, and arm one local timer for their own deadline. At that instant they send the last autosave and switch to the lobby view without waiting for a message.
- **Grace:** answers that arrive up to `GRACE_MS = 5000` after the seat's own end still save (in flight when time ran out). `answerOpen(state, seatId, part, now)` is the server's one check for every answer write.
- **Budget bar:** `budget(state, config, now)` returns `elapsedMs` (wall time since the first Start, spins and lobbies included), `plannedLeftMs` (the minutes of the parts not started yet, plus what the current part has left), `projectedMs = elapsed + plannedLeft`, `budgetMs`, and `overMs = max(0, projected − budget)`. It also returns one segment per part with its real start and end. The console warns from the moment `overMs > 0` ("Diperkirakan lewat 8 menit").

### 5.3 States
`roomView(state, now)` names the state the seats and the console show:

| View | Stored as | Meaning |
|---|---|---|
| `setup` | stage `setup` | Created in Plotting, not opened. The candidate's test page says the room is not open yet. |
| `persiapan` | stage `prep` | Opened by the Master. Seats check in: fullscreen, connection check, name confirm. |
| `part-running` | `parts`, run `running`, `clock < durMs` | A Phase 1 part runs. |
| `livecode-running` | the same with `cur = livecode` | The Live Coding timer runs. |
| `part-paused` | run `paused` | Every timer frozen, seats blurred "Dijeda". `part` tells which. |
| `part-ended` | run running with `clock ≥ durMs`, or ended less than `GRACE_MS` ago | The room's time is over. Seats with extra time still work (the console shows "1 kursi masih mengerjakan"). Start is not allowed yet. |
| `lobby` | run `ended`, grace over | The part is over for everyone. The Master may Start the next part, Reopen this one, give one seat more time, or Finish. |
| `livecode-spin` | stage `spin` | The two slot machines. No timer. |
| `finished` | stage `finished` | Final. No reopen. |

### 5.4 Actions and guards
`act(state, action, ctx)` returns `{ ok: true, state, effects }` or `{ ok: false, kode }`. `ctx` carries what the reducer cannot know: `now`, the actor's nim, `isMaster`, `canBeMaster(nim)` (plotted as pengawas for this room, and `bolehJadiMaster`), `masterStale`, `isToday` (the slot's date in WIB), `rehearsal`, `seatsIn` (checked-in seat ids), `poolOk(part)` and the config. `effects` tell the API what else to do (auto-spin the rest, close the Live Coding channels at Finish, apply a re-roll).

Control actions (only the Master; each carries `seq`):

| Action | Params | Allowed when | Effect |
|---|---|---|---|
| `open` | | `setup`, and today is the slot's date (rehearsal: any day) | `prep`. Check-in opens. |
| `start` | | `persiapan`; or `lobby`; or `livecode-spin` | From `persiapan` or `lobby`: the next part in `order` starts running, or the spins if the next part is `livecode`. From the spins: seats without a topic or protocol get one (effect `spin-rest`), then the Live Coding timer starts. Needs `poolOk(part)` (`bank_kurang`: for a Phase 1 part the counts of section 2, for `livecode` at least one ready topic) and at least one checked-in seat (`kursi_kosong`). |
| `pause` | | `part-running`, `livecode-running` or `part-ended` | Freezes every timer. |
| `resume` | | `part-paused` | Runs again from where it stopped. |
| `skip` | | running, paused or `part-ended` | Ends the part now for every seat, extra time included. Keeps `leftAtSkip`. |
| `reopen` | `addMs ≥ 0` | `lobby`, and the part is the last one started | The part runs again with `leftAtSkip + addMs` for everyone; extras are cleared; answers stay. Seats that handed the part in (Kumpulkan) may go back in: on an accepted reopen the API clears `done[part]` for every seat of the room *(ruling 2026-10-24)*. A part that ran out of time has nothing left, so `addMs` must be above 0 (`perlu_waktu`). |
| `time` | `deltaMs`: a nonzero multiple of 1 min, −10 to +30 min (the buttons are +1, +5, −1) | running or paused, while `roomLeft > 0` | `durMs = max(clock, durMs + delta)`. A cut can end the room's time now, but never in the past. After the room's time is over, use Reopen or seat time (`waktu_ruang_habis`). |
| `seat-time` | `seatId` (checked in), `deltaMs` 1 to 30 min | running, paused, `part-ended`, or `lobby` of the last part started | `extra[seat] = max(extra[seat], clock − durMs) + delta`, so the seat gets exactly `delta` more even if its time already ran out. Once the part has ended for everyone (the lobby, or the grace before it), the part runs again for that seat alone with exactly `delta`: `durMs` drops to what the room used and only that seat keeps an extra, so nobody else gets time back, even after a Skip. Start waits for that seat. |
| `finish` | `early?`, `reason?` | `lobby` of the last part; `lobby` of an earlier part or `livecode-spin` only with `early` and a reason; `persiapan` (nothing started, cancel) only with a reason | `finished`. Effect `lc-close`: revoke the MQTT accounts, close the gateway rooms, export the traffic logs, close the relay room. Behind a HoldButton. |
| `reroll` | `seatId`, `what: topic \| protocol`, `reason` | `livecode-spin`, `livecode-running` or paused Live Coding | Effect `reroll` (12 applies it with `draw.ts`); `seq` +1 so the seat replays its reel. |

Master actions (the actor must be allowed to be Master: plotted as pengawas for this room, active, never the Pencipta):

| Action | Allowed when | Effect |
|---|---|---|
| `claim` (Jadi Master) | no Master, or the Master is stale | The actor becomes Master; any ask is cleared. With a stale Master the console calls it Ambil Alih and asks to confirm. |
| `ask` (Minta Jadi Master) | a live Master who is someone else | `ask` = the actor. The Master sees Serahkan and Tolak. |
| `give` (Serahkan) | the actor is Master; `to` may be Master | `master = to` at once (as Konsol's "beri"); the ask is cleared. |
| `decline` (Tolak) | the actor is Master and an ask is open | The ask is cleared. |
| `release` (Lepas Master) | the actor is Master | No Master; any pengawas may claim. |

- **Stale:** the Master's console pings `room-master` (act `ping`, not a state change) every 20 s; the API keeps `master_seen_at`. No ping for 60 s makes the Master stale. The room keeps running either way: timers live on the server, so a Master's laptop closing changes nothing for the seats. *(08's call)*
- **Two Masters racing** is impossible: `claim` checks the stored Master inside the same `seq` guarded update.
- **Codes:** `bukan_master`, `versi_lama`, `tahap_salah`, `bank_kurang`, `kursi_kosong`, `bukan_hari_ini`, `perlu_waktu`, `waktu_ruang_habis`, `perlu_alasan`, `nilai_salah`, `kursi_tak_dikenal`, `bukan_pengawas`, `tidak_boleh_master`, `ada_master`.
- **Every accepted action** is written to `rec_exam_log` (who, act, params, `seq`) and broadcast (section 6).

### 5.5 Seats
- **Seat row:** created at the candidate's first check-in step (10), one per candidate per edition and rehearsal flag (`UNIQUE(edition_id, candidate_id, rehearsal)`). The console lists the room's candidates from `rec_slot_assignment` (06) and joins their seats, so a candidate who never came shows as "Belum masuk".
- **Check-in:** three steps on `/recruitment/test` during `persiapan`, or later for a late seat: enter fullscreen, a connection check (one round trip to the API and the relay, with the measured clock offset), and a name confirm ("Benar, ini aku"). Live Coding also checks for Chromium (Web Serial and Web Bluetooth) and warns early. *(08's call)*
- **Late seat:** checks in while a part runs and starts it with the room's time left. Parts already over score 0 for it (`absent`). The Master may give seat time.
- **Kumpulkan** (hand in a part early): allowed with a Confirm. The seat's part is done (`seat.done[part]`), answers are refused after it, and the seat waits in the lobby view. *(08's call)* A Reopen of that part lets it back in (5.4).
- **Reconnect:** the seat keeps everything (section 3.3); the time left is recomputed from the server. The runner keeps unsent answers in `localStorage` and sends them on return, and the server's `answerOpen` decides.
- **Move** (`room-move`, the plotting right): only into a room in `setup` or `persiapan`, and only for a seat with no part running in its current room. Draws and answers stay with the seat. *(08's call)*
- **Kits** (Logistik, the `kitLoans` right): the console's Persiapan list records the kit code lent to each candidate and when it came back (`rec_kit_loan`).

### 5.6 What a seat sees
| View | The candidate's screen |
|---|---|
| No room, or `setup` | "Ruang tesmu belum dibuka." The evening's date, time and place. |
| `persiapan` | The three check-in steps, then the lobby: the parts tonight with their minutes, the rules, "Menunggu pengawas memulai". |
| `part-running`, time left | One question per screen, the navigator strip (answered, flagged), the timer (HH:MM:SS), the reference drawer. |
| `part-running`, own time over or Kumpulkan | "Waktu bagian ini habis. Jawabanmu sudah tersimpan." Waiting. |
| `part-paused` | The questions blurred and inert, "Dijeda", the frozen timer. |
| `part-ended`, `lobby` | "Logika selesai." Next: the part's name and minutes. Waiting. |
| Fullscreen left while time runs | The cover (section 7). |
| `livecode-spin` | The topic reel, then the protocol reel, each with a Putar button; then the brief, the protocol and the other end's details. |
| `livecode-running` | Editor, references, Compile and Flash, the serial monitor, the other end panel, the timer. |
| `finished` | "Tes selesai. Terima kasih sudah ikut." What they handed in (parts done, Live Coding submitted), never a score. |

## 6. Relay protocol (`rec-room:<id>`)

### 6.1 Rooms
The exam gets its own room type on the relay (`apps/relay`), next to Konsol, siaran and aliran:
- `GET /ujian/rec-<id>?tiket=…`: a page's WebSocket (`rec-<id>` matches `/^rec-[1-9]\d{0,8}$/`).
- `POST /ujian/rec-<id>/kirim`: the API's batch `{ m: Msg[] }`, signed with `KONSOL_RELAY_SECRET` like aliran's, 64 KB at most.
- `POST /ujian/rec-<id>/tutup`: the API closes every socket after Finish (close code 4000).
- One hibernating Durable Object per room. `setWebSocketAutoResponse("ping", "pong")` answers pings without waking it. An alarm every 30 s while sockets are open closes those silent for 75 s; pages ping every 25 s.

### 6.2 Tickets
`src/lib/recruitment/room-relay.ts` (pure, 11 owns) holds the ticket and the filter, signed with `tanda.ts` like `aliran.ts`:

```ts
interface TiketUjian {
  v: 1; p: "ujian";
  r: string;                          // "rec-<roomId>"
  peran: "panitia" | "kursi";
  s: number | null;                   // the seat id: required for kursi, null for panitia
  u: string;                          // nim
  exp: number;                        // unix seconds, 60 s after signing
  n: string;                          // single use nonce, at least 16 characters
}
```
- `GET test-ticket` signs a `kursi` ticket for the session's own seat. The seat id comes from the database, never from the page.
- `GET room-ticket?id=` signs a `panitia` ticket for: the room's plotted pengawas, the `bank` right, the `plotPengawas` right, and the `kitLoans` right. Graders are the room's pengawas plus Akademik and the Ketua, so they are covered.
- A reconnect asks for a new ticket. The relay refuses a nonce it has seen.

### 6.3 Messages
Text frames `{ j, s?, d }`. Data rides in the frame, not just a topic name, so 35 seats never refetch at once. Down, from the API to the room:

| `j` | Goes to | `d` | Sent on |
|---|---|---|---|
| `ruang` | everyone | `RoomPublic`: `seq`, `stage`, `cur`, each run with `maxExtraMs` in place of the per-seat extras, `startedAt`, `finishedAt`, `now` | every accepted room action |
| `kursi` | that seat and panitia | `{ seq, extraMs, done, moved?, reroll? }` | seat time, Kumpulkan, a move, a re-roll |
| `pelanggaran` | panitia | `{ s, id, kinds, at, back }` | a strike opens or closes |
| `catatan` | panitia | `{ candidateId }` | a note changed (refetch) |
| `master` | panitia | `{ master, ask }` | claim, ask, give, decline, release |
| `kompilasi` | that seat and panitia | `{ s, job, status, ms? }` | a compile job changes state (12) |
| `antrean` | everyone | `{ order: seatId[] }` | the compile queue moves (12). Seat ids only, no names. |
| `hadir` | panitia | `{ kursi: seatId[], panitia: nim[] }` | from the relay itself, when someone joins or leaves (1 s debounce) |

Up, from a page's socket:

| `j` | From | `d` | Notes |
|---|---|---|---|
| `kemajuan` | a seat | `{ part, answered, total }` | At most once every 2 s. The relay stamps `s` from the ticket and passes it to panitia. Display only: the console's real counts come from `GET room`. |
| `ping` | everyone | | The auto response. |

Panitia sockets send nothing up; their actions are API writes. `bolehTerimaUjian(att, m)`: panitia get everything; a seat gets `ruang`, `antrean`, and messages whose `s` is its own.

Why seats talk to the API, not the relay: strikes, answers and check-ins must be recorded, and the relay stores nothing. Presence and progress are display only, so they ride the socket, and Durable Object WebSocket messages are billed at 20 to 1. A full evening stays well under the free plan's daily requests.

### 6.4 When the relay drops
- The page keeps its timers from the last `RoomPublic` and `jamServer()`, shows a small "Sambungan langsung putus" chip, and reconnects with a new ticket after 1, 2, 5, 10, then every 15 s.
- **Only while the socket is down**, it refetches `GET test` (seat) or `GET room` (console) every 15 s, so a part that starts meanwhile is never missed. On reconnect it refetches once.
- Every write still goes to the API, which judges by its own state. A seat that never hears a `ruang` still cannot answer outside its time.

## 7. Soft lockdown

| Signal | Kind | Detected by | Strike |
|---|---|---|---|
| Fullscreen left | `layar` | `fullscreenchange` with no fullscreen element | yes, and the cover shows |
| Tab hidden | `tab` | `visibilitychange` to hidden | yes |
| Window lost focus | `fokus` | `window` blur | yes |
| Paste attempt | `tempel` | `paste`, captured and prevented | yes |
| Devtools heuristic | `alat` | a `resize` where outer minus inner is above 160 px wide or 200 px tall while fullscreen; F12, Ctrl+Shift+I/J/C, Cmd+Opt+I/J (prevented) | yes |
| Second tab or device | `ganda` | the API: an answer or check-in from another `tab` id within 60 s of the last | yes, logged by the API *(not in PRD 7.6; kept as a strike, ruling 2026-10-24)* |
| Copy, cut, context menu, print, select-all outside a field | | prevented | no |

- **Debounce:** a signal within 1.5 s of an open strike joins it (its kinds are added). A strike closes when the page is fullscreen, visible and focused again, which gives its duration. The runner posts `test-strike` when a strike opens (with `keepalive`, so it goes out while the tab hides) and again when it closes. Offline strikes are queued and sent with their original server time. At most 50 records per seat per part; after that only the count grows. *(08's call)*
- **Live Coding** *(ruling 2026-10-24)*: the same signals, except paste works when the text equals the page's internal clipboard, the last text copied or cut inside the editor or its panels through the page's own handler. Any other paste is refused and is a `tempel` strike. While a device picker the page opened is up (`navigator.serial.requestPort`, `navigator.bluetooth.requestDevice`, the flasher's connect), `fokus` and `tab` are ignored from just before the call until 1 s after it settles.
- **Esc:** in Chromium fullscreen the runner calls `navigator.keyboard.lock(["Escape"])`, so one tap of Esc no longer drops fullscreen (holding it still does). *(08's call)*
- **The cover** shows whenever the seat's part is running for it and nothing is fullscreen. It is a full-page layer over the blurred, inert test, with the timer still visible, the line "Tes ini berjalan di layar penuh. Waktumu tetap berjalan." and one button, **Kembali ke Layar Penuh** (fullscreen needs that click). Layers portal into the fullscreen element (`useFullscreenEl` in the kit).
- **The Master sees** on every seat tile a strike count and the total time away, a live "Sedang keluar" state while a strike is open, and a popover timeline (time, what happened in words, how long). Nothing fails automatically (PRD 7.6); the Master decides, and may write a note.
- **Out of reach on purpose:** screenshots, phones, a second laptop. The pengawas in the room handle those.

## 8. Reference snapshots

### 8.1 Pipeline (09, server side)
1. **Input:** an `http`/`https` URL, or an uploaded `.html` file (the fallback for pages that only render with JavaScript). Only the `bank` right.
2. **Fetch:** resolve the host and refuse loopback, private, link local, CGNAT, multicast and IPv6 ULA addresses; check every redirect (at most 5) the same way. 10 s overall, 3 MB of HTML at most, `text/html` or `application/xhtml+xml` only (`text/plain` becomes one `<pre>`), user agent `IRIS-Snapshot/1 (+https://irisiotlab.com)`.
3. **Content root:** a per host selector, with a field per reference to override it. Defaults: GitHub `article.markdown-body`; Sphinx sites (docs.python.org, ESP-IDF, arduino-esp32) `[role=main]`, then `div.body`; docs.arduino.cc `main article`, then `main`; anything else `main`, `article`, `[role=main]`, then `body`.
4. **Sanitize** with a real HTML parser and an **allowlist** (never a regex over HTML):
   - Tags kept: headings, `p`, `div`, `span`, `section`, `article`, `header`, `footer`, `ul`, `ol`, `li`, `dl`, `dt`, `dd`, the table tags, `pre`, `code`, `kbd`, `samp`, `var`, `blockquote`, `em`, `strong`, `b`, `i`, `u`, `s`, `sub`, `sup`, `small`, `mark`, `br`, `hr`, `img`, `figure`, `figcaption`, `details`, `summary`, and `a` (rewritten below). Everything else goes, with its content for script, style, template, iframe, object, embed, form and the form controls, and kept as text for the rest.
   - Attributes kept: `id`, `lang`, `dir`, `colspan`, `rowspan`, `alt`, `title`, `width`, `height`, and `class` on `pre` and `code` (for the language). All `on*`, `style`, `srcdoc`, `formaction`, `xlink:href` and `data-*` go.
   - **All page CSS goes,** including `<style>`, `<link>` and `style=`. The snapshot is shown with IRIS's own reader stylesheet. *(08's call: one legible look for every source, and no CSS to sanitize. ARCHITECTURE said "inline CSS where small".)*
   - `<base>`, every `<meta>` (refresh included) and `<link>` are removed.
5. **Links:**
   - An `a[href="#x"]` whose target exists stays an in-page link. When it doesn't but `#user-content-x` does, it is rewritten to that (GitHub READMEs).
   - Every other `a` becomes `<span class="ref-link" title="<absolute URL>">text</span>`: readable, inert.
6. **Images:** `img[src]`, or `data-src` when `src` is a lazy placeholder, the best `srcset` candidate up to 1600 px. Fetched with the same guards, at most 40 per page and 1 MB each, then inlined as `data:` URIs. An inline `<svg>` becomes an `<img>` with an SVG `data:` URI, because SVG loaded as an image never runs script. Anything else, or anything too big, becomes "[gambar dilewati]".
7. **Code blocks** are re-highlighted with `src/lib/highlight.ts` when the language is known from the class (`language-cpp`, `highlight-python3`...).
8. **Store** one self-contained document: `<!doctype html>`, `<meta charset="utf-8">`, the reader stylesheet, a header line (title, source host, fetch date), then the sanitized content. It goes to R2 at `recruitment/<edition>/ref/<sha256>.html`, 6 MB at most. `rec_reference` keeps the URL, title, selector, key, hash, size, status (`ok` or `gagal` with the error) and when and by whom. Refetch makes a new object and repoints the row.

### 8.2 Serving
- **`GET ref?id=`** streams the document from R2. Allowed for the `bank` right, or for a seat whose current part is running for it and has this reference attached (at part level, or on one of the questions it drew in that part). Outside a running part, a seat cannot read references. *(08's call)*
- **Headers:**
  - `Content-Type: text/html; charset=utf-8`
  - `Content-Security-Policy: default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox`
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`, `X-Frame-Options: SAMEORIGIN`
  - `Cache-Control: private, max-age=600`
- **The drawer** loads it in `<iframe sandbox src="/api/recruitment/ref?id=…" referrerpolicy="no-referrer">`, with an empty `sandbox` (no scripts, no same origin, no top navigation, no popups). The CSP `sandbox` directive sandboxes the document even if it is opened outside the iframe. In-page anchors still scroll inside the frame.
- Copying text out of the frame cannot be stopped (it is another document), but pasting it into the test is a refused, logged paste (section 7).
- The pages' own CSP must allow framing the API path (`frame-src 'self'`). 10 checks `vercel.json` and `scripts/check_csp_hashes.mjs`.

### 8.3 Pages to test (09)
Real pages:
- A GitHub README (`https://github.com/links2004/arduinoWebSockets`): relative images, `user-content-` anchors.
- The Arduino reference (`https://docs.arduino.cc/language-reference/en/functions/digital-io/digitalwrite/`).
- ESP-IDF's MQTT client (`https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/protocols/mqtt.html`): Sphinx, `¶` header links.
- docs.python.org `socket` (`https://docs.python.org/3/library/socket.html`): a very long page full of anchors.
- arduino-esp32 Wi-Fi (`https://docs.espressif.com/projects/arduino-esp32/en/latest/api/wifi.html`).

Fixtures for the sanitizer's tests: `<script>`, `on*` attributes, `javascript:` links (also `jav&#x09;ascript:`), `data:text/html` links, `<base href>`, meta refresh, `form`, `iframe`, `object`, `embed`, inline SVG with `<script>` and with `onload`, CSS `url()` to another host, `<img src=x onerror>`, `srcset` pointing at another host, protocol relative `//host` links, `<noscript>`/`<style>` nesting tricks.

And in Playwright: click every link inside each real snapshot and confirm the frame and the page never leave their URLs.

## 9. Live Coding (Phase 2)

### 9.1 Spins
- When the Master starts Live Coding, the room enters `livecode-spin`. Each seat sees the topic reel with a **Putar** button. The press calls `lc-spin { what: "topic" }`; the server deals (3.4), stores the result and answers it, and the reel's motion lands on that answer. Then the protocol reel does the same with `{ what: "protocol" }`. Pressing again returns the stored result (idempotent).
- **The reel never shows other real titles.** The other cells are decoys ("Topik ?" with a category glyph), blurred while spinning; only the landed cell is the real title. Later evenings share the pool, so the full topic list should not flash past 35 screens. *(08's call)* The protocol reel shows the real three: BLE, HTTP/WebSocket, MQTT *(ruling 2026-10-24)*.
- Start (the Live Coding timer) deals to every seat still without a topic or protocol (`by: "auto"`), and their reels play by themselves.
- Re-roll is the Master's `reroll` action (section 5.4); the seat's reels replay.
- `rec_livecode` (one row per seat) keeps `topic_id`, `protocol`, `variant` (`http` or `ws` for an HTTP/WebSocket seat, picked by the candidate in the editor), `spins` (every spin with `at`, `what`, the value, `by`, `reason`), the code, its revision, the gateway token, the MQTT account, the last 50 compile and flash events, and the traffic log's R2 key after Finish.

### 9.2 Topic pool (defaults, editable in the bank)
`rec_lc_topic`: `title`, `brief` (Markdown: what to build, solvable in about 30 minutes), `fits` (the protocols it works with), `parts` (kit parts it needs), `libs` (from the PC's allowlist), `hints` (for graders only), `status`, `sample`. The editor sits in the bank (12 builds it; 09 leaves a tab for it).

| Default topic | Brief, in one line | Kit parts | Fits |
|---|---|---|---|
| Lampu Jarak Jauh | Kirim status tombol, terima perintah nyala atau mati untuk LED | LED, tombol | all |
| Monitor Suhu Ruang | Kirim suhu dan kelembapan tiap 2 detik, terima batas alarm, bunyikan buzzer saat lewat | DHT11, buzzer | all |
| Dimmer Potensiometer | Kirim posisi potensiometer dalam persen, terima kecerahan LED (PWM) | potensiometer, LED | all |
| Alarm Pintu | Tombol sebagai sensor pintu: kirim tiap buka dan tutup dengan hitungannya, terima perintah aktif atau nonaktif | tombol, buzzer, LED | all |
| Penghitung Pengunjung | Hitung tekanan tombol, kirim totalnya, terima perintah reset | tombol, LED | all |
| Lampu Lalu Lintas | Tiga LED berganti seperti lampu lalu lintas, kirim fasenya, terima mode normal atau kedip | 3 LED | all |

The six above are the edition's default topics *(ruling 2026-10-24: defaults ship, Akademik edits them in the bank)*. Their kit parts are the practicum kit's; Logistik's real list goes into each topic's `parts` from the bank editor.

### 9.3 Protocol templates (defaults, editable in the bank)
`rec_lc_template` holds one sketch per protocol, two for HTTP/WebSocket (`http`, `ws`). When a seat's protocol is set, its template becomes the starting code of each of the seat's boards (9.3a). The per seat values are not pasted into the code: every compile job carries a generated header, `iris_seat.h`, which the agent writes beside `s.ino`, and every template starts with `#include "iris_seat.h"` *(08's call)*. So the editor never holds a password or token, and a hotspot change needs only a recompile. The header defines `IRIS_WIFI_SSID`, `IRIS_WIFI_PASS` (the board's hotspot, 9.6a), `IRIS_SEAT` (`"s<seatId>"`), `IRIS_BOARD` (1 or 2), `IRIS_TOKEN`, `IRIS_WS_HOST`, `IRIS_WS_PATH`, `IRIS_HTTP_URL`, `IRIS_MQTT_URI`, `IRIS_MQTT_USER`, `IRIS_MQTT_PASS`, `IRIS_TOPIC` (`"rec/s<seatId>/"`), `IRIS_BLE_NAME` (`"IRIS-s<seatId>-<board>"`), `IRIS_SERVICE_UUID`, `IRIS_TX_UUID`, `IRIS_RX_UUID`. The agent's input check refuses a sketch that defines any `IRIS_` name itself.

Every template:
- connects to Wi-Fi with the header's hotspot (the BLE template does not: its other end is the page, so a BLE board takes no hotspot place)
- defines the seat's endpoint constants
- has one connect helper, one send helper and one receive callback
- prints `[INFO]` lines at boot
- leaves the topic logic in a marked `// TODO` region

The libraries are the practicum's own: the core's BLE (Module 1), arduinoWebSockets (Module 2), the core's HTTPClient, and the core's built-in `esp-mqtt` for MQTT over WebSocket. On 2026-10-24 an `esp-mqtt` client over WebSocket compiled on core 3.3.12 for the DevKit V1 (1,002,200 bytes), and the same skeleton with `iris_seat.h` for the ESP32-S3 (960,244 bytes, cold build 3 min 34 s on this laptop); 12 writes the real templates and compiles each for both chips.

### 9.3a Boards per seat *(ruling 2026-10-24)*
- Logistik lends each seat **one or two boards, any mix** of ESP32 DevKit V1 and ESP32-S3: two DevKits, two S3s, or one of each. `rec_kit_loan.boards` records them (`[{ n: 1 | 2, chip: "esp32" | "esp32s3", code? }]`).
- **Targets:** `esp32` builds with `esp32:esp32:esp32`, `esp32s3` with `esp32:esp32:esp32s3`. The S3 sketch keeps the core defaults (USB CDC on boot off), so `Serial` is the UART port the DevKitC labels COM or UART, the one the candidate plugs in. *(08's call)*
- **Editor:** one tab per board, "Papan 1" and "Papan 2". Papan 1 always exists; the candidate adds Papan 2 with **Tambah Papan** (and may remove it while it has never compiled). Each tab has its own chip picker, preset from the kit loan, its own code and revision, its own Compile and Flash, and its own serial monitor. Both tabs start from the seat's protocol template; the topic decides what each board does, and a topic may be solved on one board alone.
- **One seat, two devices:** both boards use the seat's token and account. WebSocket and HTTP paths end in the board (`/rec/w/<token>/<n>`, `/rec/h/<token>/<n>[/<path>]`); MQTT clients are `s<seatId>-b<n>` under the seat's account, so the two boards may talk to each other through `rec/s<seatId>/#`; BLE names are `IRIS-s<seatId>-<n>` and the page's central panel may connect both. Traffic lines carry `b` (the board).
- **Flash:** the detected chip must match the tab's target. On a mismatch the page says which chip it found and offers **Ganti ke ESP32-S3** (or back), which switches the tab's target and compiles again in one press (`chip_beda`).
- **Grading** stays per seat: one rubric sheet covers both boards.

### 9.4 Compile jobs (API and the PC agent)
- **Queue:** `rec_compile_job`: `id`, `seat_id` (null for a warm-up), `room_id`, `status` (`antre`, `diambil`, `selesai`, `gagal`), `sketch` (64 KB at most), `fqbn`, `libs`, `requested_at`, `claimed_at`, `server_id`, `finished_at`, `ok`, `log` (32 KB at most), `bin_key`, `bin_size`, `sha256`, `ms`, `kode`.
- **Fairness:** one job per board of a seat waiting or running (`rec_compile_job.board`, 1 or 2). While a job waits, pressing Compile again replaces its sketch in place and keeps its place in line. While it runs, Compile is disabled. Claims go `ORDER BY requested_at, id FOR UPDATE SKIP LOCKED`, up to the agent's free workers.
- **Delivery:** the agent heartbeat (`api/agent`), like the SeeLabs robot. While any room is in `livecode-spin` or Live Coding, the reply asks for a 2 s beat. Each beat claims jobs and returns them as `kompilasi: CompileJob[]`:
  ```ts
  interface CompileJob {
    id: number;
    sketch: string;
    fqbn: string;                       // "esp32:esp32:esp32" (DevKit V1) or "esp32:esp32:esp32s3"
    header: string;                     // iris_seat.h, written beside s.ino (9.3)
    libs: string[];                     // a subset of the agent's allowlist
    timeoutS: 120;
    put: { url: string; tiket: string }; // relay R2 PUT for recruitment/<ed>/lc/<seatId>/<jobId>.bin
  }
  interface CompileResult {
    id: number;
    ok: boolean;
    ms: number;
    log: string;                        // ANSI stripped, temp paths replaced by "sketch/"
    bin?: { size: number; sha256: string };
    kode?: "galat_kompilasi" | "waktu_habis" | "berbahaya" | "terlalu_besar" | "agen_galat";
  }
  ```
  Results come back on the next beat, or at once with a POST of the same shape. A job claimed but unanswered for 180 s goes back to the queue once, then fails `agen_diam`.
- **Agent rules** (12, `pc/agent`):
  - **Input checks:** the sketch is written to `s/s.ino` in a fresh temp dir. Refused as `berbahaya`: an `#include` with an absolute path, `..` or a backslash, and `incbin` anywhere (the assembler's file embed).
  - **Sandbox:** arduino-cli runs as an unprivileged user under bubblewrap, with no network, the Arduino data and the allowlisted libraries read only, only the temp dir writable, and `/etc/iris-*` and the agent's home out of sight. It also gets `timeout 120`, a 1.5 GB memory cap and `nice 10`.
  - **Output:** the merged image with its trailing `0xFF` trimmed (4-byte aligned), uploaded with the job's ticket.
  - **Speed:** workers = physical cores − 1 by default, each with its own warm `--build-path`. When a room enters the spins, the API queues one warm-up job per `(fqbn, libs)` of the dealt topics' templates and the room's lent chips, so the first real compile of the evening is already warm.
- **Measured here** (this laptop, Windows, 2026-10-24): cold build 2 min 13 s, warm rebuild 54 s, merged image 4,194,304 bytes raw and 1,067,888 trimmed. The PC (Linux) should do far better; 14's load test checks that the 35th compile of a burst ends within about 60 s and reports if not.
- **Protocol bump:**
  - The agent's `AGENT_PROTOCOL` goes 8 → 9 together with the site's `AGEN_PROTOKOL_TERBARU`.
  - Its info reports `kompilasi: { core: "esp32:esp32@3.3.12", fqbn: [...], libs: [...] }`, and compile jobs go only to an agent at 9 or later that reports it.
  - The bundle goes out through the Updates card before 17 Nov (14).
- **The page:**
  - It shows the queue position from the `antrean` message and the result from `kompilasi`.
  - It shows the log, with errors linked to editor lines.
  - On success it fetches the image through `GET lc-bin?job=` (a 302 to a 10 minute relay link).

### 9.5 Flashing (esptool-js in the browser)
1. `navigator.serial.requestPort` with the usual USB-serial filters (CP210x, CH340, FTDI, Espressif native USB). Strikes pause during the picker (section 7).
2. `new ESPLoader({ transport, baudrate: 921600, romBaudrate: 115200 })`, `main()` to detect the chip. The chip must match the job's target (`ESP32` for `esp32:esp32:esp32`, `ESP32-S3` for `esp32s3`); otherwise `chip_beda`.
3. `writeFlash({ fileArray: [{ data, address: 0x0 }], flashSize: "keep", flashMode: "keep", flashFreq: "keep", eraseAll: false, compress: true })`. The trimmed merged image holds the bootloader, partition table, boot_app0 and the app at their offsets for either chip, so 0x0 is right for both. Progress feeds the bar.
4. Hard reset, release the port, and open the serial monitor at 115200 with `components/live/useSerialBoard.ts` and `src/lib/serial-lines.ts` (Module 1's Live view).
5. On a failure, retry at 460800, then 115200, and tell the candidate to hold BOOT if the board never answers. Every flash posts `lc-flash { job, ok, ms, chip, kode? }`.
6. 12 pins an exact esptool-js version (0.7.0 was the latest on 2026-10-24).

### 9.6 The other ends *(ruling 2026-10-24: all over the Internet, through irisiotlab.com)*
A board needs only a phone hotspot with Internet (9.6a). Everything else runs on the gateway Worker (`apps/ws`, which already serves Module 2 on ws.irisiotlab.com and Module 3 on broker.irisiotlab.com), in one Durable Object per exam room:

| Protocol | The ESP32 connects to | IRIS's side |
|---|---|---|
| WebSocket | `ws://ws.irisiotlab.com:80/rec/w/<token>/<n>` (arduinoWebSockets client) | The seat's page and graders on the same room object; frames pass both ways. |
| HTTP | `http://ws.irisiotlab.com:80/rec/h/<token>/<n>[/<path>]`, GET or POST, body 4 KB at most | Answers `{ "ok": true, "t": <server ms>, "echo": <body>, "cmd": <the next command the page queued, or null> }`. A device that only makes requests can still receive commands. |
| MQTT | `ws://broker.irisiotlab.com:80/rec/s/<token>`, WebSocket subprotocol `mqtt` (`esp-mqtt`) | The gateway passes the bytes to Module 3's PC bridge (`pc/modul3/modul3_bridge.py`, already dialing out), which pipes them to the lab Mosquitto on `localhost:1883`. Mosquitto checks the seat's account and ACL. |
| BLE | Advertises as `IRIS-s<seatId>-<n>` with the template's GATT service (no Wi-Fi) | A Web Bluetooth central panel in the seat's page: scan, connect, notify, read, write. The page copies each BLE event into the room's log over its gateway socket. |

- **Tokens:** `<token>` is a `tanda.ts` signed payload `{ v: 1, p: "lc", r: roomId, s: seatId, exp }` with a new secret, `REC_GATEWAY_SECRET` (in Vercel and the Worker, never in code). `exp` is the room's end plus 2 h. The Worker checks it without a lookup. Finish marks the room closed in its object, which then refuses every token of that room.
- **Page sockets:** `wss://ws.irisiotlab.com/rec/web?tiket=…` with an IRIS-signed, 60 s, single use ticket. Role `seat` (its own seat only, may send) or `grader` (every seat of the room, view only).
- **MQTT accounts:**
  - One per seat, `rec<roomId>s<seatId>` with a random 24-character password, made when the room enters the spins and kept sealed with `rahasia.ts` in `rec_livecode`.
  - An agent job (`mqtt`, create or delete) provisions them on the lab Mosquitto. 12 checks whether it runs the dynamic security plugin; otherwise a `rec` password file and ACL include, reloaded with SIGHUP.
  - ACL: read and write `rec/s<seatId>/#` only.
  - The bridge's own account `iris-rec-pantau` subscribes `rec/#` to mirror the traffic into the log and publishes `rec/+/down/#` for the page.
  - Every account of the room is deleted at Finish. None is ever written in code or the repo.
- **Topics:** `rec/s<seatId>/up/<name>` from the device, `rec/s<seatId>/down/<name>` to it.
- **Cloudflare:** nothing new. The exam rides broker.irisiotlab.com (Module 3's MQTT host, live since 2026-10-24) instead of a third `mqtt.irisiotlab.com` name *(08's call: the twin gateway the user asked for already exists under that name)*. Both hosts already answer plain HTTP and WebSocket on port 80; 12 checks that no Cloudflare rule forces HTTPS on the `/rec/` paths.

### 9.6a Wi-Fi in the room: phone hotspots *(ruling 2026-10-24)*
- The boards do not join the building Wi-Fi. They join **phone hotspots** that pengawas (or Panitia) bring into the room, on mobile data, so one crowded access point never slows a whole room. The candidates' laptops stay on the building Wi-Fi; only boards join hotspots, and flashing is over USB.
- **Candidate's own hotspot *(ruling 2026-10-24, later)*:** a hotspot may belong to one candidate instead of the room. The candidate types their own phone's SSID and password on the seat page (sealed like the others, never in the editor or the code), it becomes a hotspot row owned by that seat with `cap` equal to the seat's Wi-Fi boards (1 or 2), and the seat's boards are assigned to it first. Pengawas hotspots stay as the fallback for seats that bring none. Nothing is shared across the room by default, and a seat that has no phone is never blocked. The Master console still groups boards by hotspot, so one candidate's phone dropping shows as that seat only.
- **How many:** a phone hotspot takes about 10 devices at most (Android usually 10, iPhone fewer reliably), so a room needs one hotspot per 8 Wi-Fi boards, not one per room. A room of 35 seats with one board each needs 5; with two boards each, up to 9. BLE boards need none. *(08's call: 8 per hotspot by default, editable per hotspot)*
- **Room setup** lists the hotspots: owner, SSID, password (sealed with `rahasia.ts`, never in code or the repo) and capacity. The console shows "Butuh 5 hotspot, ada 3" from the lent boards and the dealt protocols.
- **Assignment:** when a seat's protocol is dealt, each of its Wi-Fi boards gets the hotspot with the most free places (ties to the lowest one), so the boards of one seat usually share a phone. The Master can move a board to another hotspot from the seat's menu; the seat's page shows **Compile Ulang** because the header changed.
- **Phone settings**, shown in the room setup and in the pengawas' Persiapan checklist: 2.4 GHz band (neither the ESP32 nor the S3 has 5 GHz; on an iPhone turn on Maximize Compatibility), WPA2 or WPA2/WPA3 (not WPA3 only), the hotspot's auto off disabled, the phone on a charger. A seat's traffic over 45 minutes is a few megabytes at most.
- **Health:** the gateway reports each board's connect and drop; the console groups boards by hotspot, so a phone that dropped shows as one red group, not as scattered seats.

### 9.7 Traffic log
One JSON line per event, kept in the room object's storage during the evening:
```json
{"t":1763385012345,"s":12,"via":"mqtt","dir":"up","k":"rec/s12/up/suhu","n":4,"d":"29.5"}
{"t":1763385012980,"s":12,"via":"ws","dir":"down","k":"frame","n":17,"d":"{\"led\":\"nyala\"}"}
{"t":1763385013002,"s":12,"via":"http","dir":"up","k":"POST /rec/h/…/data","n":22,"d":"{\"tombol\":1,\"n\":14}"}
{"t":1763385014110,"s":12,"via":"ble","dir":"up","k":"notify 6e400003","n":2,"d":"MQ==","b64":true}
{"t":1763385015000,"s":12,"via":"ws","dir":"sys","k":"connect","n":0,"d":"esp32"}
```
- `t`: server ms. `dir`: `up` (device to IRIS), `down` (IRIS to device), or `sys` (connect, disconnect, error, rate limited).
- `k`: the topic, path, characteristic or frame. `d`: text up to 1024 characters, or base64 with `"b64": true`. `n`: the real byte count.
- **Caps:** 5,000 lines and 20 messages a second per seat. Beyond that a `sys` line counts what was dropped.
- **Live view:** graders and the seat receive lines over their gateway sockets.
- **At Finish** the API asks the room object for each seat's lines, writes `recruitment/<edition>/lc/<seatId>/traffic.jsonl` to R2 and stores the key in `rec_livecode.traffic_key`.
- Compile and flash events live in `rec_livecode.runs`, not here. Everything is kept 6 months with the edition (PRD 10).

### 9.8 Grading (default rubric rows, editable)
```ts
interface Rubric { id: number; stage: "tes_tulis"; kind: "livecode"; rows: RubricRow[] }
interface RubricRow { key: string; label: string; max: number; weight: number; hint?: string }
```
| key | Label (default) | max | weight |
|---|---|---|---|
| `jalan` | Sistem berjalan dari sensor sampai IRIS | 4 | 3 |
| `protokol` | Protokol dipakai dengan benar | 4 | 2 |
| `data` | Data dikirim dan diterima sesuai topik | 4 | 2 |
| `kode` | Kode rapi dan terstruktur | 4 | 1 |
| `jelas` | Bisa menjelaskan alur sistemnya | 4 | 2 |

- **Each row** is scored 0 to `max` in whole steps; the sheet shows the levels as words (0 belum ada, 1 baru mulai, 2 sebagian, 3 hampir, 4 lengkap).
- **Sheet score:** `ratio = Σ weight·value/max ÷ Σ weight` (exact), shown as `round(1000 × ratio)`.
- **Who grades:** the room's plotted pengawas, Akademik and the Ketua *(ruling 2026-10-24)*. Graders pick seats from the grading list, which shows how many sheets each seat has.
- **Which sheets count:** the first two submitted by two different people. A third submit answers `sudah_dua`. A grader may edit their own sheet until Finalkan, or withdraw it to free the place.
- `livecodeScore(rubric, sheets)` in `scoring.ts` gives the seat's score (section 4.1) and `null` while fewer than two sheets count.
- **When:** grading opens when the Live Coding timer starts and closes at Finalkan.
- `rec_rubric` and `rec_rubric_score` are the generic tables of ARCHITECTURE 2. 12 creates them if 15 has not, keyed by `stage` and `kind` so S4 reuses them.

## 10. Data, API and the work split

### 10.1 Tables (S3)
All rows carry `edition_id` unless they hang off a row that does. Types follow 0048: `serial` ids, `text` enums, `jsonb`, `timestamptz`.

| Table | Columns | Migration (owner) |
|---|---|---|
| `rec_exam_config` | `edition_id` PK, `config` jsonb, `salt` text, `locked_at`, `updated_by`, `updated_at` | 0051 (11 lands it, 09 uses it) |
| `rec_question` | `id`, `edition_id`, `part`, `lang`, `format`, `title`, `body` jsonb, `answer` jsonb, `refs` int[], `status` (draft), `sample` (false), `version` (1), `shown_at`, `voided_at`, `voided_by`, `void_note`, `created_by`, `updated_by`, `updated_at`; index `(edition_id, part, status)` | 0051 |
| `rec_question_log` | `id`, `question_id` (cascade), `who`, `kind` (`save`, `key`, `status`, `void`, `unvoid`, `delete`), `before`, `after`, `note`, `at` | 0051 |
| `rec_reference` | `id`, `edition_id`, `url`, `title`, `selector`, `r2_key`, `sha256`, `bytes`, `status` (`ok`, `gagal`), `error`, `fetched_at`, `by` | 0051 |
| `rec_part_ref` | `edition_id`, `part`, `reference_id` (cascade), `sort`; PK of the first three | 0051 |
| `rec_slot_examiner` | `slot_id` (06's `rec_slot`), `asisten_nim`, `role` (`pengawas`; S4 adds `examiner`); PK `(slot_id, asisten_nim, role)` | 0051, unless 06 or 15 made it |
| `rec_exam_room` | `id`, `edition_id`, `slot_id` unique, `title`, `rehearsal` (false), `state` jsonb, `master_seen_at`, `topic_next` (0), `hotspots` jsonb (`[{ id, owner, ssid, pass sealed, cap }]`, 9.6a), `created_by`, `created_at`, `updated_at` | 0051 |
| `rec_exam_log` | `id`, `room_id`, `at`, `who`, `act`, `params` jsonb, `seq` | 0051 |
| `rec_seat_note` | `id`, `room_id`, `candidate_id`, `author_nim`, `text`, `at`, `updated_at`; unique `(room_id, candidate_id, author_nim)` | 0051 |
| `rec_kit_loan` | `id`, `room_id`, `candidate_id`, `kit_code`, `boards` jsonb (9.3a), `lent_by`, `lent_at`, `returned_at`, `returned_to` | 0051 |
| `rec_exam_seat` | `id`, `edition_id`, `room_id`, `candidate_id`, `rehearsal`, `checkin` jsonb, `draw` jsonb ({}), `done` jsonb ({}), `tab`, `tab_at`, `created_at`, `last_seen_at`; unique `(edition_id, candidate_id, rehearsal)` | 0051 |
| `rec_answer` | `seat_id` (cascade), `question_id`, `part`, `value` jsonb, `rev`, `tab`, `at`; PK `(seat_id, question_id)` | 0051 |
| `rec_strike` | `id`, `seat_id` (cascade), `room_id`, `part`, `client_id`, `kinds` text[], `at`, `back_at`; unique `(seat_id, client_id)` | 0051 |
| `rec_lc_topic`, `rec_lc_template`, `rec_livecode`, `rec_compile_job`, `rec_rubric`, `rec_rubric_score` | sections 9.2 to 9.8 | 0052 (12) |
| `rec_score_freeze` | `id`, `edition_id`, `stage`, `at`, `by`, `note`, `scores` jsonb, `stats` jsonb, `superseded_at`, `superseded_by`, `unfreeze_note` | 0053 (13) |

- `rec_answer` has no stored credit and no `final`. Credit is computed on read and frozen by Finalkan, and whether a write is still allowed comes from the room state (`answerOpen`).
- Migrations are drizzle generated, with one snapshot chain. Parallel sessions must never generate at the same time, so 11 generates **0051 once** for every table of 09, 10 and 11, right after 06's 0049 and W1's 0050 (rec_account, the oprec accounts) exist, and tells 09 and 10. 12 then generates 0052 and 13 0053, one after the other. If 06 needs a second migration, it asks 11 first.

### 10.2 Siaran topics (letters only)
`recroom`: a room was set up, opened or finished. The candidate page shows or hides the test entry; the room list refreshes. `recbank`: the bank, config or references changed. `recscore`: a void, a key fix, a grader sheet, a freeze or an unfreeze. Every S3 write action is listed in `siaran-topik.ts` (high frequency writes such as `test-answer`, `test-strike` and `room-master` ping map to `[]`; they ride the relay room).

### 10.3 API actions
All in `api/recruitment/[aksi].ts`, dispatched to one handler per area. Errors are `{ ok: false, kode }` with a real status, like S1. Lists are small (a few hundred rows at most), so none is paged. Request and response types are in `exam-types.ts`.

**09 · bank, config, references** (the `bank` right):

| Method · action | Request | Response |
|---|---|---|
| GET `exam-config` | | `{ config, locked, pools }` (ready, draft, seed and void counts per part and language) |
| POST `exam-config-save` | `{ config }` | `{ config }`; `terkunci` after the first real Start |
| GET `questions?part=&lang=&status=` | | `{ questions: QuestionRow[] }` |
| GET `question?id=` | | `{ question, log }` |
| POST `question-save` | `{ id?, part, lang, format, title, body, answer, refs, status, note? }` | `{ question }`; `format_salah` (+ errors), `struktur_terkunci`, `perlu_catatan`, `ruang_berjalan` |
| POST `question-delete` | `{ id }` | `{ ok }`; `sudah_tampil` once shown |
| POST `bank-import` | `{ text, dry }` | `{ items: { index, title, action, errors }[] }` |
| GET `bank-export?part=` | | `text/markdown` |
| POST `media-ticket` | `{ mime, size, sha256 }` | relay PUT ticket for `recruitment/<ed>/bank/<sha256>.<ext>` (png, jpeg, webp, svg; 2 MB) |
| GET `media?key=` | | 302 to a 10 minute link; also a seat whose current draw uses the image |
| GET `references` | | `{ references, attachments }` |
| POST `reference-add` | `{ url, title?, selector? }` | `{ reference }` (fetches and sanitizes, up to about 15 s) |
| POST `reference-refetch` · `reference-upload` · `reference-delete` | `{ id }` · `{ title, html, url? }` · `{ id }` | `{ reference }` |
| POST `reference-attach` | `{ id, part?, questionId?, on }` | `{ attachments }` |
| GET `ref?id=` | | the sanitized document (8.2); also a seat in a running part that has it |

**10 · the runner** (Praktikan who are candidates):

| Method · action | Request | Response |
|---|---|---|
| GET `test` | | `TestView`: `now`, `room` (`RoomPublic` or null), `seat` (`SeatSelf` or null), `part` (`{ key, items: QuestionView[], answers, refs }` or null) |
| POST `test-checkin` | `{ step: "fullscreen" \| "connection" \| "name", tab, info? }` | `{ seat }` |
| POST `test-answer` | `{ part, q, value, rev, tab }` | `{ rev, at, warn? }` (`warn: "tab_lain"`); `waktu_habis` outside `answerOpen`; `nilai_salah` when `checkValue` refuses the value; `bagian_ruang_lain` when the seat started that part in another room (3.3) |
| POST `test-strike` | `{ id, kinds, at, back? }` | `{ ok }` |
| POST `test-submit` | `{ part }` | `{ done }` (Kumpulkan) |
| GET `test-ticket` | | `{ url, tiket }` (relay, `kursi`) |

**11 · rooms and the console** (`plotPengawas` for setup; the room's plotted pengawas, `bank`, `plotPengawas` or `kitLoans` to watch):

| Method · action | Request | Response |
|---|---|---|
| GET `rooms` | | `{ rooms: RoomRow[] }` |
| POST `room-setup` | `{ slotId, title?, rehearsal?, pengawas: nim[], hotspots?: { id?, owner, ssid, pass?, cap }[] }` (a missing `pass` keeps the stored one) | `{ room }` |
| GET `room?id=` | | `ConsoleView`: state, `now`, seats (assignment, seat, check-in, progress, strikes, kit, extra), notes, master, pengawas |
| POST `room-act` | `{ id, seq, act, ...params }` (5.4) | `{ state }` |
| POST `room-master` | `{ id, act: "claim" \| "ask" \| "give" \| "decline" \| "release" \| "ping", to? }` | `{ master, ask }` |
| POST `room-note` | `{ id, candidateId, text }` | `{ notes }` |
| POST `room-kit` | `{ id, candidateId, kit, boards, returned? }` (`kitLoans`) | `{ kits }` |
| POST `room-move` | `{ candidateId, toRoomId }` (`plotting`) | `{ seat }` |
| GET `room-ticket?id=` | | `{ url, tiket }` (relay, `panitia`) |
| GET `room-log?id=` | | `{ log }` |

**12 · Live Coding:**

| Method · action | Who | Request | Response |
|---|---|---|---|
| POST `lc-spin` | seat | `{ what: "topic" \| "protocol" }` | `{ topic?, protocol?, reel }` |
| GET `lc` | seat | | `LiveCodeSelf`: brief, protocol, variant, boards (per board: chip, code, rev, hotspot label, endpoints), recent runs, queue positions |
| POST `lc-code` | seat | `{ board, code, rev }` | `{ rev }` |
| POST `lc-board` | seat | `{ add: true }` · `{ remove: 2 }` · `{ board, chip }` | `{ boards }` |
| POST `lc-variant` | seat | `{ variant: "http" \| "ws" }` | `{ code }` (the other template, filled) |
| POST `lc-compile` | seat | `{ board, code, rev }` | `{ job, position }` |
| GET `lc-bin?job=` | seat | | 302 to a 10 minute link |
| POST `lc-flash` | seat | `{ job, ok, ms, chip, kode? }` | `{ ok }` |
| POST `lc-hotspot` | Master | `{ seatId, board, hotspot }` | `{ boards }` |
| GET `lc-ticket` | seat, graders | | `{ url, tiket }` (gateway) |
| GET `lc-room?id=` | graders | | seats with topic, protocol, last compile and flash, sheet count |
| GET `lc-rubric` · POST `lc-grade` · POST `lc-grade-withdraw` | graders | `{ seatId, values, note }` · `{ seatId }` | `{ sheet }`; `sudah_dua` |
| GET `lc-topics` · POST `lc-topic-save` · POST `lc-topic-delete` · GET `lc-templates` · POST `lc-template-save` | `bank` | | |
| agent `kompilasi` / `hasilKompilasi`, `mqtt` jobs | the PC agent | 9.4, 9.6 | |

**13 · scores** (Panitia see totals; the `bank` right adds the rest):

| Method · action | Request | Response |
|---|---|---|
| GET `scores?roomId=` | | `{ final, rows: ScoreRow[] }`: per candidate the four parts (or `absent`), debugging, phase1, livecode, total, flags |
| GET `score-stats` | | per question N, M, p, w and the most picked wrong option (`bank`) |
| POST `question-void` · `question-unvoid` | `{ id, note }` | `{ question }` (`bank`) |
| POST `score-finalize` · `score-unfreeze` | `{ note? }` · `{ note }` | `{ freeze }` (`bank`; 4.3) |

**Candidates never reach** another seat, any question's key, the bank, the topic pool, a reference outside their running part, the roster of a room, or any score. Every seat action takes the seat from the session (NIM to candidate to seat), never from the request.

### 10.4 Who owns which files
| Owner | Files |
|---|---|
| **08** (read only for 09 to 13) | `src/lib/recruitment/exam-types.ts`, `frac.ts`, `formats.ts`, `draw.ts`, `scoring.ts`, `room.ts`; tests `src/lib/__tests__/recruitment-{frac,formats,draw,scoring,room}.test.ts` |
| **11** | Day 1: the S3 section of `schema.ts` and `drizzle/0051_*` (every table of 10.1 marked 0051), the five dispatch lines in `[aksi].ts`, every S3 entry in `siaran-topik.ts`. Then: `api/_lib/recruitment-room.ts`, `src/lib/recruitment/room-relay.ts` (+ tests), `apps/relay/src/ujian.ts` (+ `apps/relay/test/uji-ujian.mjs`), `components/recruitment/panel/tes/ruang/`, rig `rec_room_*.mjs` |
| **09** | `api/_lib/recruitment-bank.ts`, `api/_lib/recruitment-snapshot.ts` (+ tests), `src/lib/recruitment/bank-io.ts` (+ tests), `components/recruitment/panel/tes/bank/`, the seed bank `scripts/rec-bank-seed.ts` (at least the default `shown` count per part and language, every question run or compiled before it goes in), rig `rec_bank_*.mjs` |
| **10** | `api/_lib/recruitment-seat.ts`, `pages/recruitment/test.astro` (+ `en/`, `zh/`), `components/recruitment/exam/` (the renderers in `exam/render/` are shared with 09's preview; the lockdown hooks in `exam/lockdown/`), rig `rec_runner_*.mjs` |
| **12** | `drizzle/0052_*` and its `schema.ts` section, `api/_lib/recruitment-livecode.ts`, `components/recruitment/livecode/`, `apps/ws/src/` (the `rec` routes on ws and broker), the PC agent in `Downloads/IRIS ASO/pc/agent/` (`compile` and `mqtt` jobs, tests; the Module 3 bridge carries the exam's MQTT unchanged unless 12 finds otherwise), rig `rec_lc_*.mjs` |
| **13** | `drizzle/0053_*` and its `schema.ts` section, `api/_lib/recruitment-score.ts`, `components/recruitment/panel/tes/penilaian/`, the Tes Tulis score column on 06's Cutting board (tell 06's owner first), rig `rec_score_*.mjs` |

Rules:
- `exam-types.ts` and the pure modules change only additively (a new optional field or a new type), with the change in the builder's handoff. A rename, a removal or a different meaning goes to W1 by SendMessage first.
- 10 lands its renderers first, so 09's preview can import them. Until then 09 previews the `toView` JSON.
- Commit order on the branch: 11's day 1 base → 09, 10 and 11 → 12 → 13. Every commit passes check, lint, the tests and the secret scan.

## 11. Changes to ARCHITECTURE, and what is still open

### 11.1 Changes this file makes
1. `rec_exam_seat` is one row per candidate per edition (and per rehearsal flag), not per room. `room_id` moves with a Susulan.
2. `rec_answer` stores no credit and no `final` (10.1).
3. Snapshots drop all page CSS and use IRIS's reader stylesheet (8.1).
4. The HTTP collector and the WebSocket other end live on the gateway Worker (`ws.irisiotlab.com/rec/...`), not on Vercel (`api/recruitment/collect/`) or the relay: Vercel answers plain HTTP with a redirect to HTTPS, and an ESP32 would then need TLS. MQTT is broker.irisiotlab.com (Module 3's host) over WebSocket *(ruling 2026-10-24, host per 9.6)*.
5. Traffic lives in the gateway room's object during the evening and in R2 after Finish (`traffic_key`), not in a JSON column.
6. New tables: `rec_exam_config`, `rec_question_log`, `rec_part_ref`, `rec_exam_log`, `rec_seat_note`, `rec_kit_loan`, `rec_strike`, `rec_lc_topic`, `rec_lc_template`, `rec_compile_job`, `rec_score_freeze`.
7. Topics `recroom`, `recbank`, `recscore` instead of `rec-plotting`, `rec-bank` (02's letters only rule). The exam's relay room is its own type, `/ujian/rec-<id>`.
8. Rehearsal rooms (section 0).

### 11.2 The user's answers (2026-10-24)
1. **Kit:** each seat has one or two boards, ESP32 DevKit V1 and ESP32-S3 in any mix (9.3a). The topic list ships as the six defaults and is edited in the bank. Still to come from Logistik, by about 10 Nov: the sensors and actuators per kit, typed into each topic's `parts`.
2. **Rubric:** the default rows of 9.8 ship and stay editable.
3. **Wi-Fi:** phone hotspots per room instead of the building Wi-Fi; about one per 8 boards (9.6a). On the day the pengawas type their hotspots into the room setup.
4. **Cloudflare:** agreed; no new host is needed because broker.irisiotlab.com already exists (9.6).
5. **The bank and the config:** my seed bank and `DEFAULT_EXAM_CONFIG` are the defaults; Akademik adjusts both in the web. 09's seed holds enough questions for a room to start on the defaults.

### 11.3 From the S3 mockup (08c, signed off 2026-10-24 19:04; accepted by the user with W1's adjustments)
Additive to the sections named; 09 to 12 build them as written here (`handoffs/08c.md` has the screens).
1. **Hidden peer sheets (9.8, 10):** `lc-rubric` gives a grader, for the other sheets of a seat, only who and when, never the values, so the two graders do not anchor on each other. After Finalkan the `bank` right sees every sheet in full.
2. **Topic icon (9.1, 9.2):** `rec_lc_topic.icon` (a kit icon name; the default comes from the topic's category) for the landed reel cell and the decoys' glyphs. 12 adds the column to its 0052.
3. **Re-roll reason to the seat (5.4, 6.3):** the `kursi` message's `reroll` carries `{ what, reason }`, where `reason` is one of a fixed list (`kit_rusak`, `papan_tidak_cocok`, `topik_terlalu_mirip`, `lainnya`), shown to the candidate in words. The seat is told "Diundi ulang oleh pengawas" and never the Asisten's code; the code stays in `rec_exam_log` for the Panitia (W1's adjustment: Asisten data stays off the candidate's page).
4. **Typical compile time (9.4):** `antrean` (or the seat's own Live Coding state) carries `typicalMs` per fqbn, the median `ms` of the room's last 20 successful jobs, null before there are 3, for "biasanya sekitar 40 detik".
5. **Hotspot need before the deal (9.6a):** the console counts every lent board as Wi-Fi until the protocols are dealt, then drops the BLE seats' boards. Seats with their own phone count against their own hotspot, not the pengawas' (as 9.6a).
6. **Words (7, 11's console):** a strike is a **kejadian** in the UI everywhere, so it never collides with the pengawas' **catatan**. The kinds in words are 08c's `S3.KIND` in `rec3-data.js`.

Shapes the mockup assumes for 9.6a, confirmed: a `hotspots` row's `owner` is a Panitia code or `{ seat: <seatId> }`; a seat row carries `by` (`cand` or `master`), so the room setup shows a candidate-typed SSID read only and never the password; a seat has at most one row; `cap` is computed from the seat's lent Wi-Fi boards, not stored; the candidate's endpoint (10) takes `{ ssid, pass }` and answers `{ ssid }` only.

Also settled with 06 (W1, 2026-10-24): `rec_exam_seat.room_id` stays a column. Rehearsal seats sit in rooms no Tes Tulis assignment points to, and `test-answer` checks the room in one row read. Every write that changes a candidate's tes_tulis assignment (06's `slot-set` move, Auto Isi, a confirmed change request) also sets the non-rehearsal seat's `room_id` to the room whose `slot_id` is the new slot, in the same transaction, when both rows exist; a seat created later takes it at creation. 11 adds that to 06's handlers.

## Appendix: 08's calls (for the user to check)
1. Rehearsal rooms draw from the same pool, never lock a question, and count nowhere (0).
2. Parsons questions may list other exactly right orders (`also`) (1.3).
3. Match pairs are one to one with up to two distractors on the right (1.3).
4. FITB blanks are written `__(n)__`, several per line. They default to case `exact` and spaces `trim`, compare after NFC with straight quotes, and are 10 characters wide unless set (1.3).
5. Kodingan shows 5 C++ and 5 Python questions; Mikro shows 5 of any language (2).
6. The parts config locks at the edition's first real Start (2).
7. Each part shows its C++ questions first, then the Python ones (3.2).
8. Topics are dealt like cards in each room; the protocol goes to the least used one the topic fits (3.4).
9. Scores use exact fractions and round half up once per part (4.1).
10. A seat whose drawn questions were all voided scores 0 with an `empty` flag for Akademik to judge (4.2).
11. Finalkan needs every room finished and two grader sheets for every Live Coding seat (4.3).
12. Answers save up to 5 s after a seat's time ends (5.2).
13. Reopen clears per-seat extras. Seat time in the lobby reopens the part for that seat alone (5.4).
14. Finish before the last part needs a reason (5.4).
15. A Master who has not pinged for 60 s is stale and can be taken over (5.4).
16. Check-in has three steps plus a Chromium check for Live Coding. Kumpulkan hands a part in early. Seats move only into rooms not yet started (5.5).
17. Strikes merge within 1.5 s and keep 50 records per part. Esc is locked in Chromium fullscreen (7).
18. Snapshots use IRIS's reader stylesheet, and a seat reads references only during a running part that has them (8).
19. The topic reel shows decoys, never the other real titles (9.1).
20. Per seat values reach the sketch through a generated `iris_seat.h`, never pasted into the code (9.3).
21. The S3 keeps the core's USB defaults, so the candidate plugs into the UART port (9.3a).
22. A second board is added by the candidate with Tambah Papan; one rubric sheet covers both boards (9.3a).
23. The exam's MQTT rides broker.irisiotlab.com instead of a new mqtt.irisiotlab.com (9.6).
24. 8 Wi-Fi boards per hotspot by default; boards go to the hotspot with the most free places; BLE boards take none (9.6a).
