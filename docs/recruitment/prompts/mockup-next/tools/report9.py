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

NOT_REVIEWED = [
    "Eyes-on review was partial: the five reviewers ran into a usage limit. Reviewed by eye: the whole of n7-caas in dark, r3-checkin, r3-lc (3 of 9 states), r3-keadaan (2 of 9), n7-cutting, parts of r1-panel, r1-kalender and n7-malam.",
    "Never looked at by eye: n7-latihan, r1-panitia, n7-plot, r2-berkas, r2-qr, r3-soal, r3-putar, most of n7-bank, and light theme almost everywhere.",
    "These were only covered by the automatic checks below. Treat them as measured, not as reviewed.",
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
after, na = counts("audit9.json")

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
