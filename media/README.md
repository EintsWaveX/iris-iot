# IRIS Laboratory — Media Content Package (IoT Practicum 2026/2027)

This folder packages everything the media team needs to post about the **Modul Praktikum Pemrograman Perangkat IoT** (source: `MODUL REG.pdf`, IRIS Laboratory, Semester Ganjil 2026/2027) without having to read the 90-page technical module themselves.

## What's in here

| File | Use it for |
|---|---|
| `fact-sheets/id/*.md`, `fact-sheets/en/*.md` | Background reading per post: plain-language explainer, learning objectives, hardware list, quotable facts, and verified external source links. One file per module (+ an intro file). Read the fact sheet before writing your own variation of a caption, or use the ready-made ones below as-is. |
| `captions/id/captions.md`, `captions/en/captions.md` | Ready-to-post Instagram captions (hook, body, CTA, hashtags), one per planned post, in Indonesian and English. |
| `asset-manifest.md` | Exact existing image files to pull for each post, plus what's still missing and needs to be shot. |
| `content-calendar.md` | Suggested posting order/sequence tying captions + assets together. Fill in your own publish dates. |

## How to use it

1. Open `content-calendar.md` to see the planned sequence of posts (intro → Module 1 → 2 → 3 → 4 → wrap-up).
2. For each post, grab the matching caption from `captions/{id or en}/captions.md`.
3. Pull the matching image(s) from the paths listed in `asset-manifest.md` — these are real files already in this repository, most already rendered as clean standalone PNGs (not screenshots cropped from the PDF).
4. If you want more technical detail or a different caption angle, check the matching `fact-sheets/{lang}/module-N-*.md` file — it also lists official outside sources (Bluetooth SIG, LoRa Alliance, Espressif, Raspberry Pi, Eclipse Mosquitto, ANTARES/Telkom) you can link to or screenshot from, if you want to cite something beyond IRIS's own material.

## Brand basics (already established in this project)

- **Logo:** `template/logo_iris.png`
- **Accent color:** `#40b0ff` (cyan-blue) — **Background/dark:** `#0d2444` (navy)
- **Font:** Cantarell (used in journals/slides; use a close system alternative for social graphics if needed)
- **Sign-off used across all journals/slides:** `</> Babai </>` and hashtag `#IRIS`

## What NOT to do

- Don't post source code screenshots as hero images — they're for the practicum, not for feeds. Use the clean diagram/board-photo PNGs listed in `asset-manifest.md` instead.
- Don't invent statistics or specs not in the fact sheets — every number/fact in `fact-sheets/` is either sourced directly from `MODUL REG.pdf` or from a verified official source linked in that file.
