# Phase 23: Profil Lab, the new Home

Status: built on the rig 2026-10-19, not shipped. Stage 0 mockup v3:
`Downloads/design-review/mockups/phase23` (published artifact
ThFheZp8HzArFsRQBTFutX). The mockup is the structural reference; the build
uses the live kit's finish.

## What a reader sees

Beranda (`/`, `/en/`, `/zh/`), top to bottom:

1. **Hero**, visitors only: the 1200 px IRIS logo (640 px on phones) over a
   breathing aurora, "Laboratorium IRIS" with IRIS in the kit rainbow, one
   line about the lab, Lihat Modul and Praktikum, and four counts (active
   Asisten shown, 6 divisions, 4 modules, events held; the last hides at 0).
   Lines blend in from a blur one after another, then one light sweep
   crosses the logo. Signed-in readers keep Beranda's own top (greeting,
   session card, Langit Lab, Empat Rasi) and get the profile below it.
2. **Divisi**: the Inti row (Koordinator, Wakil, Sekretaris, Bendahara),
   then six division cards (3 x 2 from 1100 px, 2 x 3 from 768 px, a
   sideways snap row on phones). A card opens the division dialog: its
   photo (lightbox on click), description, every active member with photo,
   name, code and position, Kepala first.
3. **Foto Bersama**: one photo per kepengurusan year, newest first, a year
   switch when there is more than one, clip reveal, lightbox over all years.
4. **Acara**: Workshop, ToT, Rekruitasi, each a Swiper 11 3D coverflow
   (rotate 12, depth 120, centred, newest in the middle), arrows, keyboard,
   swipe. A card opens the edition dialog: date, place, write up, gallery,
   lightbox (arrows, keys, swipe, counter, thumbnails).

Empty parts are hidden for visitors; holders of the `profil` right see an
Ubah link on each heading and an add hint where a part is empty.

Motion: one-shot motion (blend in, reveals, count up, tilt on mouse, clip
reveal, 3D) stops only for the OS reduced-motion setting. Low Detail, the
site default, maps the kit to tier 0 for the sky's endless drawing; on the
profile it only stands the aurora still. Reduced motion turns the
coverflow into a plain sideways row.

## Editor `/lab-profile`

For the new right `profil`: ADC (division), DEV (badge), Admins, and anyone
an Admin grants it in Tim. Asisten nav: Lab menu › Profil Lab. Three tabs in
Home's order:

- **Divisi**: Inti plus the six divisions. Per division its photo, one line
  and description (saved together, Save off until something changed and all
  three languages are filled); per member a photo that saves at once.
  Members, positions and codes come from Tim only.
- **Foto Bersama**: rows per year, Tambah Kepengurusan for the next year,
  photo, year (two years in a row), caption (also the alt), Delete with the
  kit confirm.
- **Acara**: kind switch, editions newest first, Tambah Edisi; title, date
  (kit date picker), place, write up; photos in Home's order (drag, or the
  arrow buttons), a star for the cover, remove.

Every text needs ID, EN and ZH; an empty language marks its tab and, once a
save is tried, says which are missing. Photos are shrunk in the browser to
1600 px and 480 px WebP (JPEG where WebP can't be written), up to 10 MB in,
and uploaded straight to Vercel Blob.

## Data (migration 0042_profil_lab)

- `asisten.foto_url`, `asisten.foto_kecil_url`.
- `profil_divisi` (divisi pk, photo urls, `baris`, `deskripsi` jsonb
  {id,en,zh}); no row means the built-in texts in `src/lib/profil.ts`.
- `profil_foto_bersama` (tahun unique, photo urls, `keterangan`).
- `profil_acara` (jenis workshop|tot|rekrutasi, judul, tempat, ringkasan,
  tanggal date, sampul_id) and `profil_acara_foto` (acara_id fk cascade,
  urls, optional alt, urutan).

Retention leaves all of it (test in `api/_lib/__tests__/profil.test.ts`).

## API `api/profil/[aksi].ts` (12th function, the Hobby cap)

- `GET baca`, public, edge cached 30 s (stale 300 s); pages that heard the
  `profil` topic ask with `?v=` and get it fresh. People carry name, code,
  position and photo; never a NIM (unit test and rig check).
- `POST` with the `profil` right: `unggah` (Blob client handshake, image
  types, 6 MB), `divisi-simpan`, `foto-asisten` (by code, active only),
  `bersama-simpan|hapus`, `acara-simpan` (the edition with its whole ordered
  photo list, cover by index; a photo of another edition rolls the whole
  save back), `acara-hapus`. Every write audits (`profil_*`, labelled in
  Audit) and sends topic `profil`; replaced or removed photos' blobs are
  deleted best effort.

## Rulings made while building

- Tim never deletes an Asisten, so photos follow status: only active people
  show; the editor removes a photo (and its blobs).
- Photo alt text for event photos is optional (default: the edition title
  and number); team photo captions double as alt.
- Coverflow is centred like the reference, not bounded (bounded left the
  active card off centre at wide screens).
- No commits until the whole set ships (user rule).

## Verification on the rig

- Unit: 959/959 (`npx vitest run --maxWorkers=2`), new: `src/lib/__tests__/profil.test.ts`,
  `api/_lib/__tests__/profil.test.ts`, hak and siaran topic tests updated.
- `astro check` and the API tsc: only the rig-only `db.ts` line. `astro build` passes;
  Swiper sits in its own lazy `Acara` chunk.
- Rig scripts in `Downloads/design-review/rig`: `p23_seed.mjs` (API rules,
  rights, three languages, Blob host, rollback, no NIM), `p23_profil.mjs`
  (Home as visitor, DES, TST at 360 to 1680, ID/EN/ZH, reduced motion:
  dialogs, lightbox, Esc order, coverflow, year switch, no sideways scroll,
  no NIM), `p23_editor.mjs` (403 for DES, saves, real upload handshake,
  drag order, delete, a second Home window refreshing live, nav entry),
  `p23_flash.mjs` (no flash, hero title stays put), `pop2/pop4`,
  `leak_api.mjs` and `leak_pages.mjs` with the new route and page.

## To ship

pg_dump prod, apply `drizzle/0042_profil_lab.sql` by hand, then push with
the rest of the set. Prod starts with the built-in division texts, no
photos and no events: ADC fills it through `/lab-profile`.
