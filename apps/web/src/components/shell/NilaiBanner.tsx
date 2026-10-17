/**
 * The score reminder on every Asisten page (Phase 18 Lupa Input Nilai),
 * shown by HadirNotice when no attendance state needs the space. It follows
 * whoever holds a group until it is sent with Kirim Nilai and saved in
 * SeeLabs: at the session end, 20:00, 22:30 (the PJ sees the session's open
 * groups) and 23:00 (a queued robot may not make it), then, after 23:59:59,
 * as Lupa Input Nilai with the late path (Token Khusus). Failed robot jobs
 * and groups waiting for a lender come first. It only points: the Score
 * Table and the SeeLabs page (?tabel= / ?seelabs=) hold the buttons.
 */
import { useEffect, useState } from "react";
import { href, tanggalPanjang } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { kelompokLabel } from "../../lib/labels";
import type { LupaSaya, NilaiSaya, TahapNilai } from "../../lib/lupa-nilai";
import { N } from "./nilaiStrings";

export interface NilaiData {
  tahap: TahapNilai;
  batas: string;
  saya: NilaiSaya[];
  pj: NilaiSaya[];
  lupa: LupaSaya[];
}

/** "Kelompok 4 dan 5": the numbers share one label word. */
export function sebutKelompok(nomor: number[], lang: Lang): string {
  const n = [...new Set(nomor)].sort((a, b) => a - b);
  if (n.length <= 1) return n.length ? kelompokLabel(n[0], lang) : "";
  const kata = N[lang].and;
  const sambung = lang === "zh" ? "、" : ", ";
  const depan = n.slice(0, -1).join(sambung);
  return lang === "zh"
    ? kelompokLabel(n[0], lang).replace(String(n[0]), `${depan}${kata}${n[n.length - 1]}`)
    : kelompokLabel(n[0], lang).replace(String(n[0]), `${depan} ${kata} ${n[n.length - 1]}`);
}

/** The Konsol link that opens an ended session's table or SeeLabs page. */
export const tautanNilai = (lang: Lang, sesiId: number, halaman: "tabel" | "seelabs") =>
  href(lang, `/session?${halaman}=${sesiId}`);

/** Session word for a line: "Kamis, 1 Oktober 2026 · Sesi 3". */
export function kapanSesi(x: { tanggal: string; slot: number | null }, lang: Lang): string {
  const sesi = lang === "en" ? "Session" : lang === "zh" ? "第" : "Sesi";
  const nama = x.slot ? (lang === "zh" ? `${sesi} ${x.slot} 节` : `${sesi} ${x.slot}`) : "";
  return `${tanggalPanjang(x.tanggal, lang)}${nama ? ` · ${nama}` : ""}`;
}

export default function NilaiBanner({ lang, data }: { lang: Lang; data: NilaiData }) {
  const t = N[lang];
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { saya, pj, lupa } = data;
  let tone: "ok" | "warn" | "danger" = "warn";
  let eyebrow = "";
  let head = "";
  let body = "";
  let aksi: { label: string; to: string } | null = null;

  const grupDari = (daftar: NilaiSaya[], sesiId: number) =>
    sebutKelompok(
      daftar.filter((g) => g.sesiId === sesiId).map((g) => g.nomor),
      lang,
    );

  if (saya.length) {
    const gagal = saya.find((g) => g.robot === "gagal");
    const akun = saya.find((g) => g.butuhAkun);
    const antre = saya.find((g) => g.robot === "antre" && !g.tersimpan);
    const utama = gagal ?? akun ?? antre ?? saya[0];
    eyebrow = `${kapanSesi(utama, lang)} · ${t.jumlah(saya.length)}`;
    const tabel = tautanNilai(lang, utama.sesiId, "tabel");
    if (gagal) {
      tone = "danger";
      head = t.gagalH(grupDari(saya, gagal.sesiId));
      const galat = gagal.galat ?? "";
      if (galat === "ditolak" || galat === "segel_rusak") {
        body = t.gagalDitolak;
        aksi = { label: t.sandi, to: href(lang, "/account") };
      } else if (galat === "butuh_token" || galat === "token_salah") {
        body = t.gagalToken;
        aksi = { label: t.token, to: tautanNilai(lang, gagal.sesiId, "seelabs") };
      } else {
        body = t.gagalLain;
        aksi = { label: t.selesai, to: tautanNilai(lang, gagal.sesiId, "seelabs") };
      }
    } else if (akun) {
      head = t.akunH(grupDari(saya, akun.sesiId));
      body = t.akunB;
      aksi = { label: t.akun, to: tautanNilai(lang, akun.sesiId, "seelabs") };
    } else if (antre && data.tahap === "robot") {
      tone = "danger";
      head = t.antreH(grupDari(saya, antre.sesiId));
      body = t.antreB;
      aksi = { label: t.selesai, to: tautanNilai(lang, antre.sesiId, "seelabs") };
    } else if (data.tahap === "akhir") {
      head = t.akhirH(saya.length);
      body = t.akhirB;
      aksi = { label: t.selesai, to: tabel };
    } else {
      const jam = data.tahap === "malam" ? "20:00" : data.tahap === "terakhir" ? "22:30" : "23:00";
      const sisaMenit = Math.max(
        0,
        Math.floor((new Date(data.batas).getTime() + 1000 - now) / 60_000),
      );
      head = t.ingatH(jam, saya.length);
      body = t.sisa(Math.floor(sisaMenit / 60), sisaMenit % 60);
      aksi = { label: t.selesai, to: tabel };
    }
  } else if (pj.length) {
    const x = pj[0];
    eyebrow = `${kapanSesi(x, lang)} · ${t.jumlah(pj.length)}`;
    head = t.pjH(pj.length);
    body = t.pjB([...new Set(pj.map((g) => g.pemegangKode).filter(Boolean))].join(", "));
    aksi = { label: t.tabel, to: tautanNilai(lang, x.sesiId, "tabel") };
  } else if (lupa.some((g) => !g.menyusulPada)) {
    tone = "danger";
    const buka = lupa.filter((g) => !g.menyusulPada);
    const x = buka[0];
    eyebrow = `${kapanSesi(x, lang)} · ${t.jumlah(buka.length)}`;
    head = t.lewatH(
      sebutKelompok(
        buka.filter((g) => g.sesiId === x.sesiId).map((g) => g.nomor),
        lang,
      ),
    );
    // Not sent yet: the first step is Kirim Nilai in the table; the token only
    // comes once the scores are sent and just the save is missing.
    if (buka.some((g) => g.sesiId === x.sesiId && g.kurang.includes("kirim"))) {
      body = t.lewatKirimB;
      aksi = { label: t.selesai, to: tautanNilai(lang, x.sesiId, "tabel") };
    } else {
      body = t.lewatB;
      aksi = { label: t.token, to: tautanNilai(lang, x.sesiId, "seelabs") };
    }
  } else if (lupa.length) {
    // Everything missed was put in during the last day: "Diinput Menyusul"
    tone = "ok";
    const x = lupa[0];
    eyebrow = kapanSesi(x, lang);
    head = t.menyusulH(
      sebutKelompok(
        lupa.filter((g) => g.sesiId === x.sesiId).map((g) => g.nomor),
        lang,
      ),
    );
    const pada = Math.max(...lupa.map((g) => new Date(g.menyusulPada ?? 0).getTime()));
    const wib = new Date(pada + 7 * 3600_000);
    const jam = `${String(wib.getUTCHours()).padStart(2, "0")}:${String(wib.getUTCMinutes()).padStart(2, "0")}`;
    body = t.menyusulB(`${tanggalPanjang(wib.toISOString().slice(0, 10), lang)} ${jam}`);
  } else return null;

  return (
    <div
      className={`offline banner hadir banner--${tone}`}
      role="region"
      aria-live="polite"
      aria-label={t.region}
    >
      <div className="hadir__text">
        <span className="eyebrow">{eyebrow}</span>
        <span className="hadir__big">{head}</span>
        <span className="hint">{body}</span>
      </div>
      {aksi && (
        <div className="hadir__acts">
          <a className="btn btn--primary btn--sm" href={aksi.to}>
            {aksi.label}
          </a>
        </div>
      )}
    </div>
  );
}
