/**
 * LMS › Ringkasan: the TP window live. Before it opens, a countdown to
 * opening; while open, the countdown to closing, who handed in (with a
 * bar), the next Orange Pi sync counting down and the files just in;
 * after it closes, who is still missing. Below: each class's progress,
 * what IRIS does in the LMS by itself (each can be turned off), what to
 * check, the connection and what IRIS did there lately.
 */
import { useState, type CSSProperties } from "react";
import Pill from "../ui/Pill";
import { Switch } from "../ui/Controls";
import { getJson, href, postJson, useTick } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import { TPS } from "../tp/tpStrings";
import type { Lang } from "../../lib/kelas";
import { Countdown, waktuPanjang } from "../tp/shared";
import { LS } from "./lmsStrings";
import { Head, lalu, galatTeks } from "./lmsShared";
import { BacaSaja, type TabLms } from "./LmsPage";

interface Ringkas {
  ok: boolean;
  kode?: string;
  modul: number;
  jendela: { buka: string; tutup: string; sumber: string } | null;
  keadaan: "belum" | "buka" | "tutup" | null;
  masuk: number;
  peserta: number;
  perKursus: { id: number; label: string; peserta: number; masuk: number; ada: boolean }[];
  baru: { nama: string; kursus: string | null; pada: string }[];
  kelasSiap: number;
  kelasJumlah: number;
  mahasiswaLms: number | null;
  luar: number | null;
  cek: { k: string; n?: number; kelas?: string[]; galat?: string | null }[];
  otomatis: {
    nyala: Record<string, boolean | undefined>;
    ubah: Record<string, { oleh: string; pada: string } | undefined>;
  };
  sambungan: { ada: boolean; kelola: boolean; akun: string | null; pada: string | null };
  sinkron: { terakhir: string | null; hasil: string | null; galat: string | null; jedaMs: number };
  log: {
    pada: string;
    oleh: string;
    aksi: string;
    langkah: string | null;
    modul: number | null;
    judul: string | null;
    kelas: number;
    gagal: number;
  }[];
  sinkronLog: { pada: string; oleh: string; hasil: string; baru: number; galat: string | null }[];
  boleh: boolean;
}

const OTO = ["tugas", "tanggal", "pdf", "nilai", "umum", "kalender"] as const;

export default function RingkasTab({ lang, ke }: { lang: Lang; ke: (v: TabLms) => void }) {
  const t = LS[lang];
  const poll = usePoll(() => getJson<Ringkas>("/api/lms/ringkas"), 60_000, true, ["tp", "lms"]);
  const d = poll.data;
  const [ubah, setUbah] = useState<Record<string, boolean>>({});
  if (!d) return <span className="skeleton" style={{ height: 520 }} />;
  if (!d.ok) return <p className="banner banner--warn">{galatTeks(d.kode, lang)}</p>;

  const nyala = (k: string) => ubah[k] ?? d.otomatis.nyala[k] === true;
  const setOto = async (k: string, v: boolean) => {
    setUbah((u) => ({ ...u, [k]: v }));
    const r = await postJson<{ ok: boolean }>("/api/lms/otomatis", { kunci: k, nyala: v }).catch(
      () => ({
        ok: false,
      }),
    );
    if (!r.ok) {
      setUbah((u) => ({ ...u, [k]: !v }));
      window.Toast?.show(galatTeks("lms_tak_terjangkau", lang), "warn");
    }
    poll.refresh();
  };

  // The log: IRIS's own actions and the Orange Pi's syncs, newest first.
  const log = [
    ...d.log.map((l) => ({
      pada: l.pada,
      apa: t.logAksi(l.aksi, l.langkah, l.modul, l.judul),
      siapa: l.oleh === "pi" ? TPS[lang].olehPi : l.oleh === "otomatis" ? t.olehOtomatis : l.oleh,
      di: l.kelas > 1 ? t.kelasN(l.kelas) : "",
      tone: l.gagal ? "warn" : "ok",
    })),
    ...d.sinkronLog.map((l) => ({
      pada: l.pada,
      apa: l.hasil === "ok" ? t.logSinkron(l.baru) : t.logSinkronGagal(l.galat ?? "?"),
      siapa:
        l.oleh === "pi" ? TPS[lang].olehPi : l.oleh === "halaman" ? TPS[lang].olehHalaman : l.oleh,
      di: "",
      tone: l.hasil === "ok" ? "ok" : "warn",
    })),
  ]
    .sort((a, b) => b.pada.localeCompare(a.pada))
    .slice(0, 6);

  return (
    <div className="stack stack--lg">
      <BacaSaja lang={lang} boleh={d.boleh} />
      {!d.sambungan.ada && (
        <div className="banner banner--warn">
          <span className="stack stack--sm">
            <b>{t.belumTersambung}</b>
            <span>{t.belumTersambungBody}</span>
          </span>
          <button type="button" className="btn btn--sm" onClick={() => ke("sambung")}>
            {t.bukaSambungan}
          </button>
        </div>
      )}
      <Kini lang={lang} d={d} />
      <section className="panel slr-card">
        <Head title={t.perKelas} desc={t.perKelasHint} />
        <ul className="lms-heat">
          {d.perKursus.map((k) => (
            <li key={k.id} data-full={k.peserta > 0 && k.masuk >= k.peserta ? "yes" : undefined}>
              <b className="mono">{k.label}</b>
              <span className="num">
                {k.masuk}/{k.peserta}
              </span>
              <span
                className="lms-bar lms-bar--sm"
                style={{ "--p": k.peserta ? Math.min(1, k.masuk / k.peserta) : 0 } as CSSProperties}
              >
                <i />
              </span>
            </li>
          ))}
        </ul>
      </section>
      <div className="lms-two">
        <section className="panel slr-card">
          <Head title={t.otoH} desc={t.otoHint} />
          <ul className="lms-auto">
            {OTO.map((k) => {
              const u = d.otomatis.ubah[k];
              return (
                <li key={k}>
                  <span className="stack stack--sm">
                    <b>{t.oto[k]}</b>
                    <span className="hint">
                      {u
                        ? (nyala(k) ? t.otoUbah : t.otoUbahMati)(u.oleh, lalu(u.pada, lang))
                        : t.otoMati}
                    </span>
                  </span>
                  <Switch
                    on={nyala(k)}
                    onChange={(v) => void setOto(k, v)}
                    label={t.oto[k]}
                    disabled={!d.boleh}
                  />
                </li>
              );
            })}
          </ul>
        </section>
        <div className="stack stack--lg">
          <section className="panel slr-card">
            <Head
              title={t.cekH}
              aside={d.cek.length ? <Pill tone="warn">{d.cek.length}</Pill> : undefined}
            />
            {d.cek.length ? (
              <ul className="lms-cek">
                {d.cek.map((c) => (
                  <Cek key={c.k} lang={lang} c={c} modul={d.modul} ke={ke} />
                ))}
              </ul>
            ) : (
              <p className="hint">{t.cekKosong}</p>
            )}
          </section>
          <section className="panel slr-card">
            <Head
              title={t.sambunganH}
              aside={
                <Pill tone={!d.sambungan.ada ? "warn" : d.sambungan.kelola ? "ok" : "warn"}>
                  {!d.sambungan.ada ? t.terputus : d.sambungan.kelola ? t.tersambung : t.hanyaBaca}
                </Pill>
              }
            />
            {d.sambungan.akun && (
              <span className="hint">
                {d.sambungan.akun}
                {d.sambungan.pada ? ` · ${waktuPanjang(d.sambungan.pada, lang)}` : ""}
              </span>
            )}
            <span className="hint">{t.satuSesi}</span>
            <div className="slr-acts">
              <button type="button" className="btn" onClick={() => ke("sambung")}>
                {t.bukaSambungan}
              </button>
            </div>
          </section>
        </div>
      </div>
      <section className="panel slr-card">
        <Head title={t.logH} />
        {log.length ? (
          <ul className="tplog lms-log">
            {log.map((l, i) => (
              <li key={i} data-tone={l.tone}>
                <span className="mono">{lalu(l.pada, lang)}</span>
                <span className="grow stack" style={{ gap: 0 }}>
                  <b>{l.apa}</b>
                  <span className="hint">
                    {l.siapa}
                    {l.di ? ` · ${l.di}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">{t.logKosong}</p>
        )}
      </section>
    </div>
  );
}

/** The live card at the top. */
function Kini({ lang, d }: { lang: Lang; d: Ringkas }) {
  const t = LS[lang];
  useTick(1000);
  const j = d.jendela;
  const k = d.keadaan;
  const persen = d.peserta ? Math.round((d.masuk / d.peserta) * 100) : 0;
  const belum = Math.max(0, d.peserta - d.masuk);
  // The next Orange Pi sync: five minutes after the last one, while open.
  const berikut = d.sinkron.terakhir ? Date.parse(d.sinkron.terakhir) + d.sinkron.jedaMs : null;
  const sisa = berikut ? Math.max(0, Math.round((berikut - Date.now()) / 1000)) : null;
  const sinkronTeks =
    k !== "buka" || sisa === null
      ? "·"
      : sisa === 0
        ? t.sinkronSegera
        : `${Math.floor(sisa / 60)}:${String(sisa % 60).padStart(2, "0")}`;
  return (
    <section className="panel lms-now" data-fase={k ?? "kosong"}>
      <div className="lms-now__main">
        {!j || !k ? (
          <>
            <span className="field__label">{t.tpBelumAda(d.modul)}</span>
            <span className="hint">{t.tpBelumAdaBody}</span>
          </>
        ) : k === "belum" ? (
          <>
            <span className="field__label">{t.tpDibukaDalam(d.modul)}</span>
            <Countdown to={j.buka} lang={lang} />
            <span className="hint">
              {t.sampai(waktuPanjang(j.buka, lang), waktuPanjang(j.tutup, lang))}.{" "}
              {t.siapDiKelas(d.kelasSiap)}
            </span>
          </>
        ) : k === "buka" ? (
          <>
            <span className="field__label lms-now__lbl">
              <span className="dot dot--ok dot--pulse" aria-hidden="true" />
              {t.tpTerbuka(d.modul)}
            </span>
            <Countdown to={j.tutup} lang={lang} />
            <span className="hint">{waktuPanjang(j.tutup, lang)}</span>
          </>
        ) : (
          <>
            <span className="field__label">{t.tpDitutup(d.modul)}</span>
            <b className="lms-now__big">{belum ? t.belumKumpul(belum) : t.semuaKumpul}</b>
            <span className="hint">
              {waktuPanjang(j.tutup, lang)}. {t.telatDiterima}
            </span>
          </>
        )}
      </div>
      <div className="lms-now__side">
        <div className="lms-meter">
          <div className="row row--between">
            <span className="field__label">{t.terkumpul}</span>
            <b className="num">
              {d.masuk} / {d.peserta}
            </b>
          </div>
          <span
            className="lms-bar"
            style={{ "--p": d.peserta ? Math.min(1, d.masuk / d.peserta) : 0 } as CSSProperties}
          >
            <i />
          </span>
          <span className="hint">
            {k === "belum" || !k ? t.mulaiDihitung : t.dariTerdaftar(persen)}
          </span>
        </div>
        <dl className="lms-mini">
          <div>
            <dt>{t.sinkronBerikut}</dt>
            <dd className="mono">{sinkronTeks}</dd>
          </div>
          <div>
            <dt>{t.kelasSiap}</dt>
            <dd>
              {d.kelasSiap} / {d.kelasJumlah}
            </dd>
          </div>
          <div>
            <dt>{t.mahasiswaLms}</dt>
            <dd>{d.mahasiswaLms ?? "·"}</dd>
          </div>
          <div>
            <dt>{t.hanyaLms}</dt>
            <dd>{d.luar ?? "·"}</dd>
          </div>
        </dl>
      </div>
      {k === "buka" && (
        <div className="lms-now__feed">
          <span className="field__label">{t.baruMasuk}</span>
          {d.baru.length ? (
            <ul className="lms-arr">
              {d.baru.slice(0, 4).map((b) => (
                <li key={`${b.nama}${b.pada}`}>
                  <b>{b.nama}</b>
                  <span className="hint mono">{b.kursus ?? ""}</span>
                  <span className="hint">{lalu(b.pada, lang)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="hint">{t.belumAdaMasuk}</span>
          )}
        </div>
      )}
      {k === "tutup" && d.boleh && (
        <div className="lms-now__feed lms-now__feed--acts">
          <a className="btn btn--primary" href={href(lang, `/grading?modul=${d.modul}`)}>
            {t.mulaiMenilai}
          </a>
          {belum > 0 && (
            <a className="btn" href={href(lang, "/lms?tpl=tutup#umum")}>
              {t.ingatkan}
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function Cek({
  lang,
  c,
  modul,
  ke,
}: {
  lang: Lang;
  c: Ringkas["cek"][number];
  modul: number;
  ke: (v: TabLms) => void;
}) {
  const t = LS[lang];
  const [judul, hint, tombol, tujuan] =
    c.k === "luar"
      ? [t.cek.luar(c.n ?? 0), t.cek.luarHint, t.lihat, "sambung" as TabLms]
      : c.k === "grup"
        ? [t.cek.grup((c.kelas ?? []).join(", ")), t.cek.grupHint, t.buat, "kelas" as TabLms]
        : c.k === "tanggal"
          ? [t.cek.tanggal(c.n ?? 0, modul), t.cek.tanggalHint, t.samakan, "sambung" as TabLms]
          : c.k === "hilang"
            ? [t.cek.hilang(c.n ?? 0, modul), t.cek.hilangHint, t.buat, "sambung" as TabLms]
            : c.k === "kunci"
              ? [t.cek.kunci, t.cek.kunciHint, t.lihat, "sambung" as TabLms]
              : [t.cek.sinkron, c.galat ?? "", t.lihat, "sambung" as TabLms];
  return (
    <li>
      <b>{judul}</b>
      <span className="hint">{hint}</span>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => ke(tujuan)}>
        {tombol}
      </button>
    </li>
  );
}
