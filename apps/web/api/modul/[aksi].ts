/**
 * /api/modul/:aksi — Praktikan only, except `kunci` (Asisten only). The editor's server side: draft
 * retrieval, per-blank checking, and the gated full-file download. Kept as
 * one dynamic-segment function for the same reason api/session/[aksi].ts
 * and api/auth/[aksi].ts already are: the Vercel Hobby plan's serverless
 * function ceiling (see MIGRATIONS.md's Stage 4 note).
 *
 * GET  /api/modul/draft?modul=&berkas=   — this group's saved answers for one file (isi + benar only, never the key).
 * POST /api/modul/cek    { modul, berkas, nomor, jawaban } — check one blank, persist the attempt.
 * GET  /api/modul/unduh?modul=&berkas=   — the reconstructed file, gated on every blank being correct.
 * GET  /api/modul/kunci?modul=&berkas=[&unduh=1&bahasa=] — Asisten only: the key per blank
 *      (Show Answers on the module page), or the complete file.
 * GET  /api/modul/kode?modul=             — anyone: the module's Praktikan files as published
 *      (blanks only, never answers), so the Code step shows a version newer than the build.
 * POST /api/modul/minta  { modul, berkas, nomor, catatan } — a group asks its Asisten for a hint.
 * POST /api/modul/minta-batal { id }       — the group takes a waiting request back.
 * GET  /api/modul/blank?kelompok=          — Asisten only: one group's every blank in the
 *      running session (answer, tries, who, key, hint, requests), for the Konsol's Blank tab.
 * POST /api/modul/petunjuk { kelompok, soal, teks, minta? } — Asisten only: answer a
 *      request, or send a group a hint unasked.
 * kode-edit, kode-simpan, kode-terbit, kode-buang, kode-pulihkan — the ASO code editor
 *      (_lib/kode-editor.ts), for the `kode` right.
 * Blanks and answers come from the module's published version (_lib/kode-aktif.ts).
 * draft and cek also take `kelompok=N` from an Asisten (Lihat Sebagai Praktikan, Phase 9):
 *      any Asisten reads group N of the running module; only N's Asisten answers for it.
 *
 * The single most important rule in this file: a correct answer string
 * never appears in any response body, bundled script, or error message
 * that a Praktikan can reach. `kunci` and the code editor's actions are the
 * exceptions, and they check the Asisten role (and the `kode` right) first.
 * cekCelah() only ever returns a boolean plus a "why" line that exists
 * independently of the answer itself.
 */
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { requireMethod, jsonBody, noStore, pgErrorCode } from "../_lib/http.js";
import {
  requireCurrentPraktikanSesi,
  requirePraktikanBaca,
  requireRole,
  tolakPraktikanTot,
} from "../_lib/session.js";
import { nomorWakil, wakilKelompok } from "../_lib/wakil.js";
import { getDb } from "../../src/lib/db.js";
import {
  anggota,
  asisten,
  jawaban,
  kelompok,
  percobaanMasuk,
  petunjukMinta,
  sesiAnggota,
} from "../../src/lib/schema.js";
import { isNimTot } from "../../src/lib/tot.js";
import { currentSesi } from "../../src/lib/sesi.js";
import { parseBlanks, soalKode, soalKodePrefix } from "../../src/lib/blanks.js";
import {
  bantuanCelah,
  cekCelah,
  jumlahCelah,
  kanonik,
  kenapaCelah,
  kodeModul,
  type BahasaUi,
  type KodeAktif,
} from "../_lib/kode-aktif.js";
import { SALAH_UNTUK_BANTUAN } from "../../src/lib/kode-jurnal.js";
import {
  daftarMinta,
  handleBlank,
  handleMinta,
  handleMintaBatal,
  handlePetunjuk,
} from "../_lib/petunjuk.js";
import {
  handleKodeBuang,
  handleKodeEdit,
  handleKodePulihkan,
  handleKodeSimpan,
  handleKodeTerbit,
} from "../_lib/kode-editor.js";
import { personalize } from "../../src/lib/group-identity.js";
import { statusRiwayat } from "../../src/lib/akses.js";
import type { SessionPayload } from "../../src/lib/auth.js";
import { and, asc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { denganSiaran } from "../_lib/siaran.js";

const MAX_JAWABAN_LEN = 200;

/** The UI language a reply's help text is written in. */
function bahasaUi(v: unknown): BahasaUi {
  const x = Array.isArray(v) ? v[0] : v;
  return x === "en" || x === "zh" ? x : "id";
}

async function parseModulBerkas(
  query: Record<string, string | string[] | undefined>,
): Promise<{ modul: number; berkas: string; kode: KodeAktif } | null> {
  const modulRaw = query.modul;
  const berkasRaw = query.berkas;
  const modul = Number(Array.isArray(modulRaw) ? modulRaw[0] : modulRaw);
  const berkas = Array.isArray(berkasRaw) ? berkasRaw[0] : berkasRaw;
  if (!Number.isInteger(modul) || modul < 1 || modul > 4) return null;
  if (!berkas || !/^[a-z0-9_]+$/.test(berkas)) return null;
  const kode = await kodeModul(modul);
  if (jumlahCelah(kode, berkas) === 0) return null;
  return { modul, berkas, kode };
}

/** Which jawaban rows count as "this group's answers" right now. The
 *  same (group, blank) has one row per session, so an unscoped read used to
 *  mix them: the editor showed whichever row Postgres happened to return
 *  last, and the download could pass on a blank the running session's own
 *  report still counted wrong. In the running session of this module (its
 *  own sign-in, or an Asisten viewing as a group) only its rows count,
 *  matching handleLaporan's scope exactly.
 *
 *  History (2026-10-07): group ids are shared by every slot's Group N, so
 *  the group alone also mixed in other slots' answers. Now it is the
 *  sessions this NIM signed in to, each with the group the session's own
 *  roster snapshot had them in (handleResults does the same). Mode TOT
 *  needs no rule of its own: a dummy only ever signs in to TOT sessions,
 *  and a real Praktikan never does. Callers order by diubahPada, so the
 *  newest row per blank wins. */
async function jawabanScope(
  sesiIni: { id: number } | null,
  kelompokId: number,
  prefix: string,
  nim: string,
) {
  const base = like(jawaban.soalKode, `${prefix}%`);
  if (sesiIni) return and(base, eq(jawaban.kelompokId, kelompokId), eq(jawaban.sesiId, sesiIni.id));
  const ikut = await getDb()
    .selectDistinct({ sesiId: sesiAnggota.sesiId, kelompokId: kelompok.id })
    .from(percobaanMasuk)
    .innerJoin(
      sesiAnggota,
      and(eq(sesiAnggota.sesiId, percobaanMasuk.sesiId), eq(sesiAnggota.nim, percobaanMasuk.nim)),
    )
    .innerJoin(kelompok, eq(kelompok.nomor, sesiAnggota.kelompokNomor))
    .where(
      and(
        eq(percobaanMasuk.nim, nim),
        eq(percobaanMasuk.jenis, "praktikan"),
        eq(percobaanMasuk.berhasil, true),
      ),
    );
  if (ikut.length === 0) return sql`false`;
  return and(
    base,
    or(...ikut.map((x) => and(eq(jawaban.sesiId, x.sesiId), eq(jawaban.kelompokId, x.kelompokId)))),
  );
}

/** The running session of this module, when this reader is in it: its own
 *  sign-in, or an Asisten viewing as a group. Anyone else reads history. */
async function sesiBaca(session: SessionPayload, modul: number, wakil: boolean) {
  const running = await currentSesi();
  if (!running || running.modul !== modul) return null;
  return wakil || session.sesiId === running.id ? running : null;
}

/** The journal gate (akses.ts statusRiwayat): this student's running
 *  session of the module, or its history once that is open (2026-10-06).
 *  Answers "riwayat_belum_terbuka" to someone who did the practicum but
 *  whose history isn't open yet, "belum_praktikum" to anyone else. */
async function bolehJurnal(
  res: ApiResponse,
  session: SessionPayload,
  modul: number,
): Promise<boolean> {
  const st = await statusRiwayat(session);
  if (st.jurnal.includes(modul)) return true;
  res.status(200).json({
    ok: false,
    kode: st.diikuti.includes(modul) ? "riwayat_belum_terbuka" : "belum_praktikum",
  });
  return false;
}

/** History is read only (2026-10-06): a Praktikan checks blanks only in
 *  the running session of that module they signed in to. Practising at
 *  home after the class used to be allowed. */
async function bolehTulis(res: ApiResponse, session: SessionPayload, modul: number) {
  if (session.role !== "praktikan") return true;
  const running = await currentSesi();
  if (running && session.sesiId === running.id && running.modul === modul) return true;
  res.status(200).json({ ok: false, kode: "riwayat_baca_saja" });
  return false;
}

async function handleDraft(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
  wakil = false,
) {
  const parsed = await parseModulBerkas(req.query);
  if (!parsed) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (!wakil && !(await bolehJurnal(res, session, parsed.modul))) return;
  const kelompokId = session.kelompokId;
  if (!kelompokId) {
    res.status(200).json({ ok: false, kode: "kelompok_tidak_diketahui" });
    return;
  }

  const prefix = soalKodePrefix(parsed.modul, parsed.berkas);
  const sesiIni = await sesiBaca(session, parsed.modul, wakil);
  const db = getDb();
  const rows = await db
    .select({
      soalKode: jawaban.soalKode,
      isi: jawaban.isi,
      benar: jawaban.benar,
      salah: jawaban.salah,
      oleh: jawaban.diubahOleh,
      pada: jawaban.diubahPada,
      sesiId: jawaban.sesiId,
    })
    .from(jawaban)
    .where(await jawabanScope(sesiIni, kelompokId, prefix, session.nim))
    .orderBy(asc(jawaban.diubahPada));

  // Who filled each blank, by first name of the group's own members only:
  // the editor says "Kirana filled blank (4)" without exposing anyone
  // outside the group.
  const nims = [...new Set(rows.map((r) => r.oleh).filter((x): x is string => !!x))];
  const nama = new Map<string, string>();
  if (nims.length > 0) {
    const ang = await db
      .select({ nim: anggota.nim, nama: anggota.nama })
      .from(anggota)
      .where(and(eq(anggota.kelompokId, kelompokId), inArray(anggota.nim, nims)));
    for (const a of ang) nama.set(a.nim, a.nama);
  }

  // A filler outside the group is an Asisten (Lihat Sebagai Praktikan):
  // the group sees "diisi asisten", Asisten see the name and code.
  const luar = nims.filter((n) => !nama.has(n));
  const asistenNama = new Map<string, string>();
  if (luar.length > 0) {
    const as = await db
      .select({ nim: asisten.nim, nama: asisten.nama, kode: asisten.kode })
      .from(asisten)
      .where(inArray(asisten.nim, luar));
    for (const a of as)
      asistenNama.set(a.nim, a.kode ? `${a.nama} (${a.kode.toUpperCase()})` : a.nama);
  }

  // The explanation once a blank is right, the written hint once it went
  // wrong twice: neither is the answer, both follow the group's state.
  const lang = bahasaUi(req.query.lang);
  const out: Record<
    string,
    {
      isi: string;
      benar: boolean;
      saya: boolean;
      oleh: string | null;
      asisten?: boolean;
      salah: number;
      pada: string;
      kenapa?: string;
      bantuan?: string;
    }
  > = {};
  for (const row of rows) {
    const nomor = row.soalKode.slice(prefix.length);
    const olehAsisten = !!row.oleh && asistenNama.has(row.oleh);
    const kenapa = row.benar ? kenapaCelah(parsed.kode, parsed.berkas, Number(nomor), lang) : "";
    const bantuan =
      !row.benar && row.salah >= SALAH_UNTUK_BANTUAN
        ? bantuanCelah(parsed.kode, parsed.berkas, Number(nomor), lang)
        : "";
    out[nomor] = {
      isi: row.isi,
      benar: row.benar,
      saya: row.oleh === session.nim,
      oleh: row.oleh
        ? (nama.get(row.oleh) ?? (wakil ? (asistenNama.get(row.oleh) ?? null) : null))
        : null,
      ...(olehAsisten ? { asisten: true } : {}),
      salah: row.salah,
      pada: row.pada.toISOString(),
      ...(kenapa ? { kenapa } : {}),
      ...(bantuan ? { bantuan } : {}),
    };
  }
  const sesiIds = [
    ...new Set([sesiIni?.id, ...rows.map((r) => r.sesiId)].filter((x): x is number => !!x)),
  ];
  const minta = await daftarMinta(kelompokId, sesiIds, prefix);
  // Not a secret -- a group already knows its own number, and this is the
  // signal the editor's Code step uses to show the sketch's identity line
  // (GROUP_ID, LORA_SYNC_WORD) as THIS group's own value rather than the
  // generic template's, matching what the gated download already produces.
  res.status(200).json({
    ok: true,
    jawaban: out,
    minta,
    nomorKelompok: session.kelompokNomor ?? null,
  });
}

async function handleCek(
  req: ApiRequest,
  res: ApiResponse,
  session: SessionPayload,
  wakil = false,
) {
  const body = jsonBody(req);
  const modul = Number(body.modul);
  const berkas = typeof body.berkas === "string" ? body.berkas : "";
  const nomor = Number(body.nomor);
  const jawabanTeks = typeof body.jawaban === "string" ? body.jawaban : "";

  if (
    !Number.isInteger(modul) ||
    modul < 1 ||
    modul > 4 ||
    !/^[a-z0-9_]+$/.test(berkas) ||
    !Number.isInteger(nomor) ||
    nomor < 1 ||
    jawabanTeks.length === 0 ||
    jawabanTeks.length > MAX_JAWABAN_LEN
  ) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }

  if (!wakil && !(await bolehJurnal(res, session, modul))) return;
  if (!wakil && !(await bolehTulis(res, session, modul))) return;

  const kelompokId = session.kelompokId;
  const nomorKelompok = session.kelompokNomor;
  if (!kelompokId || !nomorKelompok) {
    res.status(200).json({ ok: false, kode: "kelompok_tidak_diketahui" });
    return;
  }

  const soal = soalKode(modul, berkas, nomor);
  const lang = bahasaUi(body.lang ?? body.bahasa);
  const kode = await kodeModul(modul);
  const result = cekCelah(kode, berkas, nomor, jawabanTeks, nomorKelompok, lang);
  if (!result.ditemukan) {
    res.status(200).json({ ok: false, kode: "soal_tidak_ada" });
    return;
  }

  const running = await currentSesi();
  const db = getDb();

  // Mode TOT: a dummy writes only inside a TOT session. Home practice rows
  // (sesiId null) sit on group ids real groups share, so they'd leak.
  if (!running && isNimTot(session.nim)) {
    res.status(200).json({ ok: false, kode: "modul_terkunci" });
    return;
  }

  // sesiId is only meaningful while a session is running (see jawaban's own
  // schema comment); practising at home writes a row with sesiId null, and
  // the table's partial unique index is what still keeps that to one row
  // per group per blank instead of growing one per attempt.
  //
  // The no-session branch must match sesiId IS NULL explicitly: without it,
  // one home-practice check rewrote this blank's row in every past session
  // too, overwriting the isi/benar/percobaan those sessions' reports read.
  const target = and(
    running ? eq(jawaban.sesiId, running.id) : isNull(jawaban.sesiId),
    eq(jawaban.kelompokId, kelompokId),
    eq(jawaban.soalKode, soal),
  );

  // Incremented in SQL rather than read-then-written, so two groupmates
  // checking the same blank at once both count.
  const perbarui = () =>
    db
      .update(jawaban)
      .set({
        isi: jawabanTeks,
        benar: result.benar,
        percobaan: sql`${jawaban.percobaan} + 1`,
        salah: result.benar ? sql`${jawaban.salah}` : sql`${jawaban.salah} + 1`,
        versi: 1,
        diubahOleh: session.nim,
        diubahPada: new Date(),
      })
      .where(target)
      .returning({ id: jawaban.id, salah: jawaban.salah });

  let [baris] = await perbarui();
  if (!baris) {
    try {
      [baris] = await db
        .insert(jawaban)
        .values({
          sesiId: running?.id ?? null,
          kelompokId,
          soalKode: soal,
          isi: jawabanTeks,
          benar: result.benar,
          percobaan: 1,
          salah: result.benar ? 0 : 1,
          diubahOleh: session.nim,
        })
        .returning({ id: jawaban.id, salah: jawaban.salah });
    } catch (err) {
      // A groupmate inserted this same row between our update and insert
      // (the editor is shared by the whole group). Their row exists now, so
      // record this attempt on it instead of failing the request.
      if (pgErrorCode(err) !== "23505") throw err;
      [baris] = await perbarui();
    }
  }

  // A blank that is right needs no hint any more: its waiting requests close.
  if (result.benar && running) {
    await db
      .update(petunjukMinta)
      .set({ batal: true })
      .where(
        and(
          eq(petunjukMinta.sesiId, running.id),
          eq(petunjukMinta.kelompokId, kelompokId),
          eq(petunjukMinta.soalKode, soal),
          isNull(petunjukMinta.teks),
        ),
      );
  }

  const salah = baris?.salah ?? 0;
  const bantuan =
    !result.benar && salah >= SALAH_UNTUK_BANTUAN ? bantuanCelah(kode, berkas, nomor, lang) : "";
  res.status(200).json({
    ok: true,
    benar: result.benar,
    kenapa: result.kenapa,
    salah,
    ...(bantuan ? { bantuan } : {}),
  });
}

async function handleUnduh(req: ApiRequest, res: ApiResponse, session: SessionPayload) {
  const parsed = await parseModulBerkas(req.query);
  if (!parsed) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  if (!(await bolehJurnal(res, session, parsed.modul))) return;
  const kelompokId = session.kelompokId;
  const nomorKelompok = session.kelompokNomor;
  if (!kelompokId || !nomorKelompok) {
    res.status(200).json({ ok: false, kode: "kelompok_tidak_diketahui" });
    return;
  }

  const total = jumlahCelah(parsed.kode, parsed.berkas);
  const prefix = soalKodePrefix(parsed.modul, parsed.berkas);

  const sesiIni = await sesiBaca(session, parsed.modul, false);
  const db = getDb();
  const rows = await db
    .select({ soalKode: jawaban.soalKode, benar: jawaban.benar })
    .from(jawaban)
    .where(await jawabanScope(sesiIni, kelompokId, prefix, session.nim))
    .orderBy(asc(jawaban.diubahPada));

  // The downloaded file gets each blank's as-authored canonical text, not
  // the student's raw isi: "blescan.h" with stray spaces passes the
  // normalized check but would not compile spliced into `#include <...>`.
  // Newest row per blank wins, the same rule handleDraft shows the editor,
  // so a blank the editor currently marks wrong never passes the gate.
  const answers = new Map<number, string>();
  for (const row of rows) {
    const nomor = Number(row.soalKode.slice(prefix.length));
    if (!row.benar) {
      answers.delete(nomor);
      continue;
    }
    const canonical = kanonik(parsed.kode, parsed.berkas, nomor, nomorKelompok);
    if (canonical === undefined) continue;
    answers.set(nomor, canonical);
  }

  if (answers.size < total) {
    res.status(200).json({ ok: false, kode: "belum_lengkap", benar: answers.size, total });
    return;
  }

  // Reconstruct from this praktikan's own selected language track -- a
  // student working the id/ carousel gets the id/ comments back, not a
  // silently swapped-in en/ file with the same code.
  const bahasa = req.query.bahasa === "en" ? "en" : "id";
  const aktif = parsed.kode.berkas.get(parsed.berkas)!;
  const filename = aktif.berkas.path;
  const template = aktif.templat[bahasa];

  const segments = parseBlanks(template);
  const reconstructedGeneric = segments
    .map((s) => (s.kind === "text" ? s.text : (answers.get(s.nomor) ?? "")))
    .join("");

  // The single most safety-critical line in this handler: every group's
  // download otherwise carries group 1's identity verbatim (GROUP_ID, and
  // for Module 4, LORA_SYNC_WORD too), which is not a cosmetic label -- it
  // is what keeps five groups' boards from colliding with each other over
  // the air or on the same BLE UUID / MQTT topic. See group-identity.ts's
  // own header for the concrete failure this fixes.
  const reconstructed = personalize(parsed.berkas, reconstructedGeneric, nomorKelompok);

  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.end(reconstructed);
}

/** The Asisten's key for one file, as group `kelompok` would get it (group
 *  1 by default, the generic template's own identity). With `unduh=1` the
 *  complete file instead, in the asked language track. */
async function handleKunci(req: ApiRequest, res: ApiResponse) {
  const parsed = await parseModulBerkas(req.query);
  if (!parsed) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const k = Number(req.query.kelompok ?? 1);
  const nomorKelompok = Number.isInteger(k) && k >= 1 && k <= 10 ? k : 1;
  const total = jumlahCelah(parsed.kode, parsed.berkas);
  const kunci: Record<string, string> = {};
  for (let n = 1; n <= total; n++) {
    const v = kanonik(parsed.kode, parsed.berkas, n, nomorKelompok);
    if (v !== undefined) kunci[n] = v;
  }
  if (req.query.unduh !== "1") {
    // What the Praktikan get around each blank, so the Asisten knows it too.
    const lang = bahasaUi(req.query.lang);
    const bantu: Record<string, { kenapa: string; bantuan: string; juga: string[] }> = {};
    for (let n = 1; n <= total; n++) {
      bantu[n] = {
        kenapa: kenapaCelah(parsed.kode, parsed.berkas, n, lang),
        bantuan: bantuanCelah(parsed.kode, parsed.berkas, n, lang),
        juga: parsed.kode.berkas.get(parsed.berkas)?.urut[n - 1]?.juga ?? [],
      };
    }
    res.status(200).json({ ok: true, kunci, bantu });
    return;
  }
  const bahasa = req.query.bahasa === "en" ? "en" : "id";
  const aktif = parsed.kode.berkas.get(parsed.berkas)!;
  const filename = aktif.berkas.path;
  const template = aktif.templat[bahasa];
  const generic = parseBlanks(template)
    .map((s) => (s.kind === "text" ? s.text : (kunci[s.nomor] ?? "")))
    .join("");
  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.end(personalize(parsed.berkas, generic, nomorKelompok));
}

/** The module's Praktikan files as published: blanks only, no answers. */
async function handleKode(req: ApiRequest, res: ApiResponse) {
  const modul = Number(req.query.modul);
  if (!Number.isInteger(modul) || modul < 1 || modul > 4) {
    res.status(200).json({ ok: false, kode: "format_salah" });
    return;
  }
  const k = await kodeModul(modul);
  res.status(200).json({
    ok: true,
    versi: k.versi,
    berkas: [...k.berkas.values()].map((b) => ({
      slug: b.berkas.slug,
      path: b.berkas.path,
      templat: b.templat,
    })),
  });
}

const EDITOR: Record<
  string,
  (req: ApiRequest, res: ApiResponse, s: SessionPayload) => Promise<void>
> = {
  "kode-simpan": handleKodeSimpan,
  "kode-terbit": handleKodeTerbit,
  "kode-buang": handleKodeBuang,
  "kode-pulihkan": handleKodePulihkan,
};

async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  if (await tolakPraktikanTot(req, res)) return;

  if (req.query.aksi === "kode") {
    if (!requireMethod(req, res, "GET")) return;
    return handleKode(req, res);
  }
  if (req.query.aksi === "kode-edit") {
    if (!requireMethod(req, res, "GET")) return;
    const s = requireRole(req, res, "asisten");
    if (!s) return;
    return handleKodeEdit(req, res, s);
  }
  const editor = EDITOR[String(req.query.aksi)];
  if (editor) {
    if (!requireMethod(req, res, "POST")) return;
    const s = requireRole(req, res, "asisten");
    if (!s) return;
    return editor(req, res, s);
  }

  if (req.query.aksi === "kunci") {
    if (!requireMethod(req, res, "GET")) return;
    if (!requireRole(req, res, "asisten")) return;
    return handleKunci(req, res);
  }
  if (req.query.aksi === "blank") {
    if (!requireMethod(req, res, "GET")) return;
    if (!requireRole(req, res, "asisten")) return;
    return handleBlank(req, res);
  }
  if (req.query.aksi === "petunjuk") {
    if (!requireMethod(req, res, "POST")) return;
    const s = requireRole(req, res, "asisten");
    if (!s) return;
    return handlePetunjuk(req, res, s);
  }

  const aksi = req.query.aksi;

  // Lihat Sebagai Praktikan (Phase 9): an Asisten reads any group of the
  // running module, and answers only for the group they hold.
  const wakil = aksi === "draft" || aksi === "cek" ? nomorWakil(req, jsonBody(req)) : null;
  if (wakil !== null) {
    const as = await wakilKelompok(req, res, wakil, aksi === "cek");
    if (!as) return;
    const running = await currentSesi();
    const m = Number(aksi === "cek" ? jsonBody(req).modul : req.query.modul);
    if (!running || running.modul !== m) {
      res.status(200).json({ ok: false, kode: "modul_bukan_sesi" });
      return;
    }
    if (aksi === "draft") {
      if (!requireMethod(req, res, "GET")) return;
      return handleDraft(req, res, as, true);
    }
    if (!requireMethod(req, res, "POST")) return;
    return handleCek(req, res, as, true);
  }

  // Reading (draft, unduh) works from history; writing (cek) is the session's.
  const session =
    aksi === "draft" || aksi === "unduh"
      ? await requirePraktikanBaca(req, res, Number(req.query.modul))
      : await requireCurrentPraktikanSesi(req, res);
  if (!session) return;

  if (aksi === "draft") {
    if (!requireMethod(req, res, "GET")) return;
    return handleDraft(req, res, session);
  }
  if (aksi === "cek") {
    if (!requireMethod(req, res, "POST")) return;
    return handleCek(req, res, session);
  }
  if (aksi === "unduh") {
    if (!requireMethod(req, res, "GET")) return;
    return handleUnduh(req, res, session);
  }
  if (aksi === "minta") {
    if (!requireMethod(req, res, "POST")) return;
    return handleMinta(req, res, session);
  }
  if (aksi === "minta-batal") {
    if (!requireMethod(req, res, "POST")) return;
    return handleMintaBatal(req, res, session);
  }

  res.status(404).json({ ok: false, kode: "tidak_ditemukan" });
}

// A successful write tells every open page what changed (_lib/siaran.ts).
export default denganSiaran("modul", handler);
