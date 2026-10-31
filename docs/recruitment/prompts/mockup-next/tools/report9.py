"""
Builds the R1 to R3 layout report page from the audit output (30 Oct 2026).
    python report9.py   ->  ../../../../../.b7pub/r1r3-report.html (staging copy for the Artifact tool)
Evidence crops come from shots/a9-before (the run before the fixes) and shots/a9 (the final run).
Counts are read from audit9.before.json and audit9.json; nothing is typed by hand except the curated findings.
"""
import base64, io, json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SH = os.path.join(HERE, "shots")
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".b7pub", "r1r3-report.html"))


def crop(folder, name, box, w=620):
    p = os.path.join(SH, folder, name)
    if not os.path.exists(p):
        return None
    im = Image.open(p).convert("RGB").crop(box)
    r = w / im.width
    im = im.resize((w, max(1, round(im.height * r))), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, "JPEG", quality=72)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


# (id, group, screen, states, sev, cat, title, seen, where, fix, status, evidence)
# status: fixed (changed and re-measured), applied (changed, not re-checked by eye), open, tool
F = [
    ("R3-01", "R3", "r3-lc", "Judge belum siap", "broken", "Horizontal alignment",
     "The yellow Judge belum siap banner is not on the card grid",
     "The banner spans x 96 to 1328. The problem rail and cards below span x 104 to 1336. That is 8px short on the left and 8px more short on the right, 16px of difference in total. It is the first thing the eye sees on that state.",
     "lc10.css .lc-off set margin 12px 16px 0, which beat the centring rule in rec3.css (.r3banner, width calc(100% - 48px)).",
     "Keep only margin-top on .lc-off so the shared banner rule centres it on the same 24px gutter.",
     "fixed", ("r3-lc__r3Run=mati__dark__1440x900.png", (80, 70, 1360, 330))),
    ("R3-02", "R3", "r3-keadaan, r3-soal", "every exam state with the bottom Back and Next bar", "ugly", "Horizontal alignment",
     "The bottom Back and Next bar sticks out past the question card",
     "Its hairline and tinted background run about 12px past the card on both sides (x 424 to 1348 against the card at 437 to 1336).",
     "rec3.css .r3t .r3main > .r3nav used margin 0 -12px with padding 10px 12px.",
     "margin 0 and padding 10px 0, so the bar ends where the card ends.",
     "applied", None),
    ("R3-03", "R3", "n7-malam", "every Malam Ujian state", "ugly", "Alignment of parts",
     "The stage stepper line sticks out past the first and last dot",
     "The line runs about 23px past the Persiapan dot on the left and past the Selesai dot on the right.",
     "rec7.css .n7-rail__line used left 22px and right 22px but each step is 90px wide, so the dot centres are 45px in.",
     "left 45px and right 45px.",
     "applied", None),
    ("R2-01", "R2", "n7-cutting", "Berkas stage", "broken", "Data on screen",
     "The cut line caption reads 70 pass and -10 fail with 60 candidates",
     "The preset cut line (70) is larger than the candidate count (60), so the fail number goes negative.",
     "screens-rec7c.js:93 cutN was not capped at the number of candidates.",
     "cutN = Math.min(cut, maxN).",
     "applied", None),
    ("R2-02", "R2", "n7-cutting", "light theme", "ugly", "Theme",
     "In light theme the active slider track is almost black",
     "The enabled slider track measures about #3b3b3b, while the locked sliders are light. Only accent-color was set, so the browser picked the track from the dark colour scheme.",
     "rec7.css .n7-range input[type=range].",
     "Set color-scheme from the frame theme (.dev[data-t]).",
     "applied", None),
    ("R1-01", "R1", "r1-panel, r1-home", "Hari Ini card, Berikutnya list", "ugly", "Text",
     "The year wraps alone onto a second line in date ranges",
     "The line reads Minggu, 25 Oktober 2026 sampai Sabtu, 31 Oktober and leaves 2026 by itself.",
     "rec1.css .rec-today header and .rec-today__next hints.",
     "text-wrap: balance on those date lines.",
     "applied", None),
    ("ALL-01", "R1+R2+R3", "every screen", "all", "ugly", "Text size",
     "Event names in the calendar and small labels were under 11px",
     "95 distinct elements at 10.1 to 10.9px, mostly the calendar event labels (rkal__lab).",
     "rec1.css .rkal__lab.",
     "Calendar labels are now 0.72rem (11.5px). The remaining small ones are uppercase captions (SISA WAKTU, panel lane labels) at 10.9px, kept as a decision: see the open list.",
     "fixed", None),
    ("ALL-02", "R1+R2+R3", "every screen", "all", "fragile", "Spacing",
     "Icon buttons used a 9px gap, off the 4px grid",
     "Every button with an icon had gap 9px.",
     "styles.css .btn.",
     "gap 8px.",
     "fixed", None),
    # ---- open
    ("R1-02", "R1", "n7-caas", "First Meet and Tes Tulis states", "ugly", "Copy",
     "The action card headline and its button disagree",
     "The card says Hadir di First Meet and Scan QR di tempat, but its main button says Pilih Malam Tes.",
     "Action card builder in screens-rec7b.js and screens-rec7c.js (line not pinned down).",
     "While the schedule is open to pick, the headline now says Pilih malam tesmu (or the interview or teaching version) with the button. Checked in a render.",
     "fixed", None),
    ("R1-03", "R1", "n7-caas", "Keadaan = setuju", "ugly", "Data on screen",
     "Two neighbouring cards show different dates and rooms",
     "One card says Selasa 17 November, TULT 0604. The next one says Rabu 18 November, TULT 0605.",
     "Both cards in screens-rec7b.js and screens-rec7c.js, which read dates from different places.",
     "The top card now reads its night and room from the slot the CaAs holds, the same one the schedule card uses. Checked in a render: after an approved change both say Rabu, 18 November, TULT 0605.",
     "fixed", None),
    ("R1-04", "R1", "n7-caas", "guest and closed states, modal footers", "ugly", "Horizontal alignment",
     "Ghost buttons do not line up with the text column",
     "Ghost buttons such as Gabung Grup LINE CaAs and Masuk start at about x 92 while the card text starts at about x 133. Modal footer ghosts (Nanti Saja, Kembali, Batal) sit about 19px right of the modal content edge.",
     "The ghost Btn style carries 20px of horizontal padding and is not pulled back.",
     "Give ghost buttons a negative margin equal to their padding where they stand at the start of a text column.",
     "open", None),
    ("R1-05", "R1", "n7-caas", "tiles row", "ugly", "Vertical alignment",
     "Tile titles sit on different lines in one row",
     "Berkasku has a 3-line subtitle, so its title is higher than the titles of its neighbours. Another tile leaves the single word terbuka alone on a line.",
     ".n7 quick tile row (fixed width tiles).",
     "Top-align the titles and cap subtitles at two lines.",
     "open", None),
    ("R1-06", "R1", "n7-caas", "journey with mist", "fragile", "Contrast",
     "The ??? labels over the bright mist are light grey on a light cloud",
     "The 7th node and its label at about x 1240, y 600 are hard to read.",
     "Fog layer in screens-rec7b.js:233.",
     "Give the labels a text colour that holds on the mist, or fade the mist under them.",
     "open", None),
    ("R1-07", "R1", "n7-caas", "different stages", "fragile", "Composition",
     "The top row changes height between states",
     "Envelope state 158px, plain action state 180px, guest and closed states 245px, so the page content jumps when the state changes.",
     "Top row grid (action card and next card).",
     "Give the row a min-height from the tallest state.",
     "open", None),
    ("R1-08", "R1", "r1-kalender", "month grid", "fragile", "Text",
     "Event labels are still cut (Open Recr..., Pengumu...)",
     "The labels are now 11.5px but a cell is narrower than a long event name.",
     ".rkal__lab with ellipsis.",
     "Show the full name in a tooltip and in the day dialog (already there), or use a two-line clamp.",
     "open", None),
    ("R1-09", "R1", "r1-home", "Beranda", "fragile", "Composition",
     "The recruitment call to action sits about 450px below the fold",
     "At 1280x720 the first screen shows only the greeting and the lab block.",
     "screens-home10.js.",
     "Move the recruitment block up when a stage is open.",
     "open", None),
    ("R2-03", "R2", "n7-cutting", "Mengajar, Wawancara, Tubes", "ugly", "Proportion",
     "The bar chart does not fill its card",
     "Axis and slider run x 137 to 810. Bars stop at x 724 (Mengajar) and x 787 (Wawancara, Tubes).",
     "Bar container in the Garis Potong card, screens-rec7c.js:151.",
     "Size the bars from the track width.",
     "open", None),
    ("R2-04", "R2", "n7-cutting", "Nilai Minimal", "ugly", "State",
     "The caption says 5 fail but every bar is teal",
     "No red bars show the failing candidates in Nilai Minimal mode.",
     "screens-rec7c.js near line 151 (data-in).",
     "Colour bars below the minimum.",
     "open", None),
    ("R2-05", "R2", "n7-cutting", "right card", "ugly", "Text",
     "Sudah diumumkan wraps onto two lines next to short side text",
     "The notice title breaks into Sudah and diumumkan.",
     "Notice row in the right card.",
     "white-space: nowrap on the title, wrap the side text instead.",
     "applied", None),
    ("R3-04", "R3", "r3-checkin", "Siap masuk, Server tak terhubung", "ugly", "Vertical alignment",
     "A 3-line check row pushes its neighbour about 11px lower",
     "In the two-column check list the neighbouring cell is centred instead of top aligned.",
     "rec3.css .r3chks and .r3chk.",
     "align-items: start on the two-column grid (checked in a render: Siaran langsung no longer drops lower).",
     "fixed", None),
    ("R3-05", "R3", "r3-checkin", "all", "ugly", "Horizontal alignment",
     "The Panggil Asisten ghost button is indented about 18px from the text",
     "Icon starts at x 385, paragraph above starts at x 367.",
     "Btn sm kind=ghost in .r3gate__help.",
     "margin-left -14px on .r3gate__help .btn--ghost, so the label starts at the text edge. The same indent on other ghost buttons (R1-04) is still open.",
     "applied", None),
    ("R3-06", "R3", "r3-checkin", "Cek berjalan", "ugly", "Contrast",
     "The disabled Mengecek Sambungan button has low contrast",
     "Dark label on a dimmed mid blue; readable but weak.",
     "Disabled primary button style.",
     "Use the disabled token pair with at least 4.5 to 1.",
     "open", None),
    ("R3-07", "R3", "r3-checkin", "Ruang tunggu", "fragile", "Composition",
     "The lobby sits at the top with about 170px empty below",
     "Eyebrow at y 26, card ends at y 550 inside a 720px frame.",
     ".r3lobby.",
     "Centre vertically or let the card grow.",
     "open", None),
    ("R3-08", "R3", "r3-lc", "default", "fragile", "Text",
     "Two problem tabs show Terbesar dari T... and Tertinggi dan T...",
     "Tab titles are cut with an ellipsis; the full title is only in a title attribute.",
     ".lc-rail__b b in lc10.css.",
     "Two-line clamp, so Terbesar dari Tiga and Tertinggi dan Terendah now show in full (checked in a render).",
     "fixed", None),
    ("R3-09", "R3", "r3-keadaan, r3-soal, r3-lc", "all", "fragile", "Text size",
     "SISA WAKTU, WAKTU LIVE CODING and DIJEDA captions are 10.9px",
     "Uppercase captions above the timer.",
     "Timer caption in rec3.css.",
     "Decision for you: raise to 11.5px or keep as a caption.",
     "open", None),
    ("R3-10", "R3", "n7-malam", "Atur Ruang with a seat open", "ugly", "State",
     "The seat drawer opens on top of the Atur Ruang drawer",
     "The reviewer saw the Judge status and queue hidden behind the seat drawer in 12 states. Some of these came from the harness leaking variants, so this needs one more look.",
     "screens-rec7.js:232 and :237.",
     "Close one drawer when the other opens.",
     "open", None),
    ("R3-11", "R3", "n7-bank", "editor", "ugly", "Alignment of parts",
     "The editor toolbar has controls of different heights",
     "Batalkan Soal, the Draf and Siap toggle and Simpan sit on one row and their heights differ.",
     "Editor toolbar in rec3.css.",
     "One control height for the row.",
     "open", None),
    ("R3-12", "R3", "n7-bank", "list tabs", "fragile", "Horizontal alignment",
     "Table columns shift between the part tabs",
     "FORMAT starts at x 483 on Logika and x 534 on FITB; STATUS at 1051 and 1108.",
     "Auto-sized table columns in the bank list.",
     "Fixed column widths.",
     "open", None),
    ("TOOL-01", "R1+R2+R3", "capture tool", "many", "fragile", "Tool",
     "The capture loop leaked a variant into the next state",
     "Reviewers saw identical shots for different states and light shots showing the wrong stage. Cause: variants were not cleared between states.",
     "tools/audit9.mjs.",
     "Fixed: variants are cleared before each state, and baseline or centred rows are no longer counted as misaligned.",
     "fixed", None),
]


# 31 Oct 2026: the open findings were fixed in rec11.css (and two JS files). "fixed" = re-measured or seen in the pass-4 shots,
# "applied" = changed but not re-checked (the last audit run was stopped by low memory).
UPDATE = {
    "R1-04": ("applied", "rec11.css: the guest card's button row starts in the text column and the first ghost is pulled back by 27px (26 padding, 1 border). Seen in the pass-4 shot of the guest state: the row starts at the text column; the 27px pull was added after that shot."),
    "R1-05": ("fixed", "rec11.css: tiles top-align, the subtitle stops at two lines and balances. Seen in the pass-4 shot: the four titles sit level and the long subtitle wraps in two even lines."),
    "R1-06": ("applied", "rec11.css: the ??? labels keep full strength with a halo in the surface colour. Dark theme seen in pass 4; light theme not re-checked."),
    "R1-07": ("applied", "rec11.css: .n7-top holds 245px above 1100px wide. Not re-measured across every state."),
    "R1-08": ("applied", "rec11.css and the app: a long event name takes a second line before it is cut. Pass 4 shows the truncated count at 0 on the calendar, but a new clipped count of 95 appears, so a name longer than two lines is still cut."),
    "R1-09": ("fixed", "screens-profil23.js: signed in, the recruitment banner sits under the greeting and above the Lab Sky. Pass 4: the below-the-fold hits on r1-home drop from 48 to 3."),
    "R2-03": ("applied", "rec11.css: .n7-spark is the full width of the card body. Not re-measured."),
    "R2-04": ("applied", "rec11.css: bars under the cut are a clear red (78%). Not re-measured."),
    "R3-06": ("applied", "rec11.css and the app: a disabled primary uses the surface pair with muted text instead of 45% accent. Not re-measured."),
    "R3-07": ("applied", "rec11.css and the app: the lobby is centred in the frame with safe centring. Not re-measured."),
    "R3-09": ("applied", "rec11.css and the app: timer captions are 11.5px. Pass 4: tiny text on r3-keadaan and r3-soal drops from 55 to 15 per screen; the 15 left are other captions."),
    "R3-10": ("applied", "screens-rec7.js: opening a seat closes the side drawer and the other way round. Not re-checked in the shots."),
    "R3-11": ("applied", "rec11.css: the editor header row shares one control height. Not re-measured."),
    "R3-12": ("applied", "rec11.css and the app: fixed column widths on the bank list. Not re-measured."),
}
F = [(*r[:9], UPDATE[r[0]][1] if r[0] in UPDATE else r[9], UPDATE[r[0]][0] if r[0] in UPDATE else r[10], r[11]) for r in F]

# By-eye review of the screens that had only automatic checks (workflow wf_1dac0d04-fdf, 6 reviewers, 1440x900 dark and light).
EYES = json.load(open(os.path.join(SH, "eyes5.json"), encoding="utf-8"))
EYE_META = {  # index: (group, short title, status, note on what was done)
    1: ("R1", "The Ringkasan pill in the header is pale on pale in the light theme", "open", ""),
    2: ("R1", "The Hari Ini card icon is an empty box and sits above the text line", "open", ""),
    3: ("R1", "The year wraps alone on a second line in the Hari Ini date range", "applied", "rec11.css: text-wrap pretty on hints and ledes."),
    4: ("R1", "The Sebagai toggle and Keluar differ in height and corner radius", "open", ""),
    5: ("R3", "The bottom bar of the draw screen has no side padding", "applied", "rec11.css: 16px side padding on .r3step__bar."),
    6: ("R3", "The disabled Lihat Soalmu button is hard to read", "applied", "Same rule as R3-06."),
    7: ("R3", "The Kembali sheet under Soalmu Malam Ini runs off the frame as two mismatched layers", "open", ""),
    8: ("R3", "Draw card titles on two lines push their point line down in one card", "open", ""),
    9: ("R3", "The draw screen leaves its lower half empty", "open", ""),
    10: ("R1", "The Panitia pill in the header is pale on pale in the light theme", "open", ""),
    11: ("R1", "The Asisten search placeholder is cut mid-word and the only chip is truncated", "open", ""),
    12: ("R1", "Division names are cut once the star buttons appear", "open", ""),
    13: ("R1", "The Asisten card title is larger than the division titles and starts at another height", "open", ""),
    14: ("R2", "The tab strip rule in the review drawer stops about 40px short of the content", "open", ""),
    15: ("R2", "The candidate detail modal is lopsided: 170px empty in the left column", "open", ""),
    16: ("R2", "The page subtitle behind a short modal is sliced by its top edge", "open", ""),
    17: ("R2", "The Tutup button sits 20px inside the column edge", "applied", "rec11.css: a lone ghost button in a footer is pulled back by its padding."),
    18: ("R2", "The Catatan placeholder is faint in the light theme", "open", ""),
    19: ("R2", "Day cards start at different heights when a title wraps", "open", ""),
    20: ("R2", "The last board column is cut at the board edge", "open", ""),
    21: ("R2", "The Papan search is 52px tall beside 44px buttons", "applied", "rec11.css: in a row with small buttons the search is 44px."),
    22: ("R2", "The Plotting pill and a hint are washed out in the light theme", "open", ""),
    23: ("R2", "The not-yet-here dots on the QR screen are invisible in the light theme", "applied", "rec11.css: a 1.5px ring on the dots."),
    24: ("R2", "The big count and its caption do not share a baseline", "open", ""),
    25: ("R2", "The last dot row is 10px above the code card", "applied", "rec11.css: 12px under the dot grid."),
    26: ("R2", "The QR display leaves a quarter of its width and a third of its height empty", "open", ""),
    27: ("R2", "The dot size and the code card width change a lot between states", "open", ""),
    28: ("R2", "The QR subtitle leaves the word Deli alone on a line", "applied", "rec11.css: text-wrap pretty."),
    29: ("R2", "The QR frame's top edge moves between states", "open", ""),
    30: ("R2", "The status card keeps its button far from its message", "open", ""),
    31: ("R2", "The Kedaluwarsa card is taller and moves its icon and link", "open", ""),
    32: ("R2", "The Kirim button and the code placeholder are faint in the light theme", "open", ""),
    33: ("R2", "Download XLSX is indented 19px from the content edge in the Absensi dialog", "applied", "rec11.css: a first ghost button in a footer is pulled back by its padding."),
}
_n = {"R1": 9, "R2": 5, "R3": 12}
for i, e in enumerate(EYES, 1):
    g, title, status, note = EYE_META[i]
    _n[g] += 1
    F.append((f"{g}-{_n[g]:02d}", g, e["screen"], "by-eye review", e["severity"], e["category"].replace("-", " ").capitalize(), title,
              e["seen"], e["where"], (e["fix"] + (" Done: " + note if note else "")), status, None))

NOT_REVIEWED = [
    "By eye in the first run: the whole of n7-caas in dark, r3-checkin, r3-lc (3 of 9 states), r3-keadaan (2 of 9), n7-cutting, parts of r1-panel, r1-kalender and n7-malam.",
    "By eye on 31 Oct 2026 (six reviewers, 1440x900, dark and light, every state): n7-latihan, r1-panitia, n7-plot, r2-berkas, r2-qr and r3-putar. Their findings are the by-eye rows at the end of the list.",
    "Still never looked at by eye: r3-soal, most of n7-bank, and light theme on most of the first-run screens.",
    "The last audit run was stopped by low memory, so changes made after the pass-4 screenshots are marked applied, not fixed: nothing in this report claims a measurement that was not made.",
]


def counts(path):
    d = json.load(open(os.path.join(SH, path), encoding="utf-8"))
    seen, k = set(), {}
    for r in d["results"]:
        for x in r.get("findings", []):
            if x["sev"] == "info":
                continue
            i = (r["screen"], x["kind"], x["el"])
            if i in seen:
                continue
            seen.add(i)
            k[x["kind"]] = k.get(x["kind"], 0) + 1
    return k, len([r for r in d["results"] if not r.get("error")])


before, nb = counts("audit9.before.json")
_p3 = json.load(open(os.path.join(SH, "audit9.pass3.json"), encoding="utf-8"))["results"]
_p4 = json.load(open(os.path.join(SH, "audit9.pass4.json"), encoding="utf-8"))["results"]
_re = {r["screen"] for r in _p4}
json.dump({"results": [r for r in _p3 if r["screen"] not in _re] + _p4}, open(os.path.join(SH, "audit9.merged.json"), "w", encoding="utf-8"))
after, na = counts("audit9.merged.json")

rows = []
for (i, g, scr, st, sev, cat, title, seen, where, fix, status, ev) in F:
    b = a = None
    if ev:
        b = crop("a9-before", ev[0], ev[1])
        a = crop("a9", ev[0], ev[1])
    rows.append(dict(id=i, g=g, screen=scr, states=st, sev=sev, cat=cat, title=title, seen=seen, where=where, fix=fix, status=status, before=b, after=a))

html = open(os.path.join(HERE, "report9.template.html"), encoding="utf-8").read()
html = html.replace("/*DATA*/", "const DATA = " + json.dumps(dict(rows=rows, before=before, after=after, nb=nb, na=na, notReviewed=NOT_REVIEWED), ensure_ascii=False) + ";")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w", encoding="utf-8").write(html)
print("wrote", OUT, len(html) // 1024, "KB", len(rows), "findings")
