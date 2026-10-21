/**
 * Kelola TP › Pengumuman (2026-10-21, the LMS Pengumuman's on IRIS): write a
 * notice to Praktikan from a template (TP Dibuka, Ingatkan yang Belum, TP
 * Ditutup, Nilai Keluar) or freely, in the Reguler and INT languages, shown
 * until a time; switch the two automatic ones; see and remove what is up.
 * Every Asisten reads it; the TP right and Admins write. ?tpl= picks a
 * template (the live card's Ingatkan yang Belum opens it with ?tpl=ingat).
 */
import { useState } from "react";
import Confirm from "../ui/Confirm";
import Dropdown from "../ui/Dropdown";
import Pill from "../ui/Pill";
import SegmentedControl from "../ui/SegmentedControl";
import { DateField, Switch, TimeField } from "../ui/Controls";
import { getJson, postJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { bagiWib, isoWib, type JendelaTp } from "../../lib/tp";
import {
  ISI_MAKS,
  JENIS_KABAR,
  JUDUL_MAKS,
  templatKabar,
  type JenisKabar,
  type KabarSimpan,
  type OtoKabar,
  type SasaranKabar,
  type TeksKabar,
} from "../../lib/tp-kabar";
import { waktuPanjang } from "../tp/shared";
import { KS } from "./kabarStrings";

interface DataKabar {
  ok: boolean;
  boleh: boolean;
  oto: OtoKabar;
  jendela: Record<string, JendelaTp | null>;
  kabar: KabarDiKelola[];
}

/** A notice as Kelola TP lists it: who posted it, and a message's Praktikan. */
export type KabarDiKelola = KabarSimpan & {
  oleh: string;
  pada: string;
  nama: string | null;
  milikku: boolean;
};

function tplDariUrl(): JenisKabar {
  const v = typeof location === "undefined" ? null : new URL(location.href).searchParams.get("tpl");
  return JENIS_KABAR.includes(v as JenisKabar) ? (v as JenisKabar) : "bebas";
}

export default function KabarTab({ lang, modul }: { lang: Lang; modul: number }) {
  const t = KS[lang];
  const poll = usePoll(
    () => getJson<DataKabar>("/api/tp/kabar").then((d) => (d.ok ? d : null)),
    120_000,
    true,
    ["tp"],
  );
  const d = poll.data;
  if (!d) return <span className="skeleton" style={{ height: 420 }} />;
  return (
    <div className="tppengaturan__grid">
      <div className="stack stack--lg">
        {d.boleh ? (
          <TulisPanel lang={lang} modulAwal={modul} jendela={d.jendela} onDone={poll.refresh} />
        ) : (
          <p className="banner">{t.bacaSaja}</p>
        )}
      </div>
      <div className="stack stack--lg">
        <OtoPanel lang={lang} oto={d.oto} boleh={d.boleh} onDone={poll.refresh} />
        <SudahPanel lang={lang} kabar={d.kabar} boleh={d.boleh} onDone={poll.refresh} />
      </div>
    </div>
  );
}

/* ============================================================= write */

const tujuhHari = () => bagiWib(new Date(Date.now() + 7 * 86_400_000).toISOString());

function TulisPanel({
  lang,
  modulAwal,
  jendela,
  onDone,
}: {
  lang: Lang;
  modulAwal: number;
  jendela: DataKabar["jendela"];
  onDone: () => void;
}) {
  const t = KS[lang];
  // A template's text for a module; it shows until the window's close when
  // that is still ahead (opening, reminder), else for a week.
  const isi = (jenis: JenisKabar, m: number | null) => {
    const j = m ? (jendela[String(m)] ?? null) : null;
    const x = m ? templatKabar(jenis, m, j) : templatKabar("bebas", 1, null);
    const keTutup =
      (jenis === "buka" || jenis === "ingat") && j && Date.parse(j.tutup) > Date.now();
    return { ...x, sampai: keTutup ? bagiWib(j.tutup) : tujuhHari() };
  };
  // Jadwalkan starts at the window's opening for TP Dibuka while it is
  // still ahead, else an hour from now.
  const mulaiAwal = (jenis: JenisKabar, m: number | null) => {
    const j = m ? (jendela[String(m)] ?? null) : null;
    return bagiWib(
      jenis === "buka" && j && Date.parse(j.buka) > Date.now()
        ? j.buka
        : new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000 + 3_600_000).toISOString(),
    );
  };
  const [mulai, setMulai] = useState<{ tanggal: string; jam: string } | null>(null);
  const awal = () => {
    const jenis = tplDariUrl();
    const m = jenis === "bebas" ? null : modulAwal;
    return { jenis, modul: m, ...isi(jenis, m) };
  };
  const [f, setF] = useState<{
    jenis: JenisKabar;
    modul: number | null;
    sasaran: SasaranKabar;
    judul: TeksKabar;
    isi: TeksKabar;
    sampai: { tanggal: string; jam: string };
  }>(awal);
  const [sibuk, setSibuk] = useState(false);

  const pilih = (jenis: JenisKabar, m: number | null) => {
    // A template is about a module: none picked yet takes this page's.
    const mm = jenis !== "bebas" && m === null ? modulAwal : m;
    setF({ jenis, modul: mm, ...isi(jenis, mm) });
    if (mulai) setMulai(mulaiAwal(jenis, mm));
  };
  const mulaiIso = mulai ? isoWib(mulai.tanggal, mulai.jam) : null;
  const kirim = async () => {
    setSibuk(true);
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/tp/kabar", {
      modul: f.modul,
      jenis: f.jenis,
      sasaran: f.modul ? f.sasaran : "semua",
      judul: f.judul,
      isi: f.isi,
      ...(mulaiIso ? { mulai: mulaiIso } : {}),
      sampai: isoWib(f.sampai.tanggal, f.sampai.jam),
    }).catch(() => ({ ok: false, kode: "" }));
    setSibuk(false);
    const nanti = !!mulaiIso && Date.parse(mulaiIso) > Date.now();
    window.Toast?.show(
      r.ok
        ? nanti
          ? t.jadwalOk(waktuPanjang(mulaiIso!, lang))
          : t.umumkanOk
        : (t.galat[r.kode ?? ""] ?? t.gagal),
      r.ok ? "ok" : "warn",
    );
    if (!r.ok) return;
    setF({ ...f, jenis: "bebas", ...isi("bebas", f.modul) });
    setMulai(null);
    onDone();
  };
  const teks = (k: "judul" | "isi", b: "id" | "en", v: string) =>
    setF({ ...f, [k]: { ...f[k], [b]: v } });

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.tulisH}</h2>
        <span className="hint">{t.tulisLede}</span>
      </div>
      <div className="stack">
        <div className="field">
          <span className="field__label">{t.templat}</span>
          <div className="row tpkabar__tpl" role="group" aria-label={t.templat}>
            {JENIS_KABAR.map((j) => (
              <Pill key={j} pressed={f.jenis === j} onClick={() => pilih(j, f.modul)}>
                {t.jenis[j]}
              </Pill>
            ))}
          </div>
        </div>
        <div className="tpkabar__pair">
          <Dropdown
            id="kabar-modul"
            label={t.modul}
            value={String(f.modul ?? 0)}
            onChange={(v) => pilih(f.jenis, Number(v) || null)}
            options={[
              ...(f.jenis === "bebas" ? [{ value: "0", label: t.semuaModul }] : []),
              ...[1, 2, 3, 4].map((m) => ({ value: String(m), label: t.modulN(m) })),
            ]}
          />
          {f.modul !== null && (
            <div className="field">
              <span className="field__label">{t.sasaran}</span>
              <SegmentedControl
                aria-label={t.sasaran}
                fill
                value={f.sasaran}
                onValueChange={(v) => setF({ ...f, sasaran: v as SasaranKabar })}
                options={[
                  { value: "semua", label: t.sSemua },
                  { value: "belum", label: t.sBelum },
                ]}
              />
            </div>
          )}
        </div>
        <div className="tpkabar__pair">
          <div className="stack">
            <label className="field">
              <span className="field__label">{t.judulReg}</span>
              <input
                className="field__input"
                value={f.judul.id}
                maxLength={JUDUL_MAKS}
                onChange={(e) => teks("judul", "id", e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">{t.isiReg}</span>
              <textarea
                className="field__input field__textarea"
                rows={4}
                maxLength={ISI_MAKS}
                value={f.isi.id}
                onChange={(e) => teks("isi", "id", e.target.value)}
              />
            </label>
          </div>
          <div className="stack">
            <label className="field">
              <span className="field__label">{t.judulInt}</span>
              <input
                className="field__input"
                value={f.judul.en}
                maxLength={JUDUL_MAKS}
                onChange={(e) => teks("judul", "en", e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">{t.isiInt}</span>
              <textarea
                className="field__input field__textarea"
                rows={4}
                maxLength={ISI_MAKS}
                value={f.isi.en}
                onChange={(e) => teks("isi", "en", e.target.value)}
              />
              <span className="hint">{t.intHint}</span>
            </label>
          </div>
        </div>
        <div className="tpkabar__pair">
          <div className="field">
            <span className="field__label">{t.kapan}</span>
            <SegmentedControl
              aria-label={t.kapan}
              fill
              value={mulai ? "jadwal" : "sekarang"}
              onValueChange={(v) => setMulai(v === "jadwal" ? mulaiAwal(f.jenis, f.modul) : null)}
              options={[
                { value: "sekarang", label: t.kSekarang },
                { value: "jadwal", label: t.kJadwal },
              ]}
            />
            {mulai && (
              <div className="tpwinform__row">
                <DateField
                  value={mulai.tanggal}
                  onChange={(v) => setMulai({ ...mulai, tanggal: v })}
                  label={t.tglMulai}
                  lang={lang}
                />
                <TimeField
                  value={mulai.jam}
                  onChange={(v) => setMulai({ ...mulai, jam: v })}
                  label={t.jamMulai}
                  lang={lang}
                />
              </div>
            )}
          </div>
          <div className="field">
            <span className="field__label">{t.sampai}</span>
            <div className="tpwinform__row">
              <DateField
                value={f.sampai.tanggal}
                onChange={(v) => setF({ ...f, sampai: { ...f.sampai, tanggal: v } })}
                label={t.tglSampai}
                lang={lang}
              />
              <TimeField
                value={f.sampai.jam}
                onChange={(v) => setF({ ...f, sampai: { ...f.sampai, jam: v } })}
                label={t.jamSampai}
                lang={lang}
              />
            </div>
          </div>
        </div>
        <Pratinjau lang={lang} modul={f.modul} judul={f.judul} isi={f.isi} />
        <button
          type="button"
          className="btn btn--primary tpkabar__kirim"
          disabled={sibuk || !f.judul.id.trim() || !f.isi.id.trim()}
          onClick={() => void kirim()}
        >
          {mulai ? t.jadwalkan : t.umumkan}
        </button>
      </div>
    </section>
  );
}

/** What the notice looks like on a Praktikan's TP card, in each class's
 *  language (an empty English falls back, as it does for them). */
function Pratinjau({
  lang,
  modul,
  judul,
  isi,
}: {
  lang: Lang;
  modul: number | null;
  judul: TeksKabar;
  isi: TeksKabar;
}) {
  const t = KS[lang];
  const ada = judul.id.trim() || isi.id.trim();
  const versi = (b: "id" | "en") => ({
    judul: judul[b].trim() || judul.id,
    isi: isi[b].trim() || isi.id,
  });
  return (
    <div className="field">
      <span className="field__label">{t.pratinjau}</span>
      {ada ? (
        <div className="tpkabar__pair">
          {(["id", "en"] as const).map((b) => {
            const v = versi(b);
            return (
              <div key={b} className="stack stack--sm">
                <span className="hint">{b === "id" ? t.pratinjauReg : t.pratinjauInt}</span>
                <ul className="tpkabar" lang={b}>
                  <li className="banner">
                    <span className="stack stack--sm">
                      <b>{v.judul}</b>
                      <span>{v.isi}</span>
                      {modul && <span className="hint">{t.modulN(modul)}</span>}
                    </span>
                  </li>
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <span className="hint">{t.pratinjauKosong}</span>
      )}
    </div>
  );
}

/* ========================================================= automatic */

function OtoPanel({
  lang,
  oto,
  boleh,
  onDone,
}: {
  lang: Lang;
  oto: OtoKabar;
  boleh: boolean;
  onDone: () => void;
}) {
  const t = KS[lang];
  const [sibuk, setSibuk] = useState(false);
  const ubah = async (x: Partial<OtoKabar>) => {
    setSibuk(true);
    const r = await postJson<{ ok: boolean }>("/api/tp/kabar-oto", x).catch(() => ({ ok: false }));
    setSibuk(false);
    window.Toast?.show(r.ok ? t.otoOk : t.gagal, r.ok ? "ok" : "warn");
    if (r.ok) onDone();
  };
  const baris = (k: keyof OtoKabar, judul: string, hint: string) => (
    <li>
      <span className="stack" style={{ gap: 0, minWidth: 0 }}>
        <b>{judul}</b>
        <span className="hint">{hint}</span>
      </span>
      <Switch
        on={oto[k]}
        label={judul}
        disabled={!boleh || sibuk}
        busy={sibuk}
        onChange={(v) => void ubah({ [k]: v })}
      />
    </li>
  );
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.otoH}</h2>
        <span className="hint">{t.otoLede}</span>
      </div>
      <ul className="tpcek tpcek--satu">
        {baris("buka", t.otoBuka, t.otoBukaHint)}
        {baris("mepet", t.otoMepet, t.otoMepetHint)}
      </ul>
    </section>
  );
}

/* ============================================================ posted */

function SudahPanel({
  lang,
  kabar,
  boleh,
  onDone,
}: {
  lang: Lang;
  kabar: DataKabar["kabar"];
  boleh: boolean;
  onDone: () => void;
}) {
  const t = KS[lang];
  const [hapus, setHapus] = useState<number | null>(null);
  const now = Date.now();
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.sudahH}</h2>
      </div>
      {kabar.length ? (
        <ul className="tppeserta__list">
          {kabar.map((k) => {
            const tampil = !k.sampai || Date.parse(k.sampai) > now;
            const nanti = Date.parse(k.mulai) > now;
            return (
              <li key={k.id} data-selesai={tampil ? undefined : "yes"}>
                <span className="grow stack" style={{ gap: 0 }}>
                  <b>{k.judul.id}</b>
                  {k.sasaran === "satu" && <span className="tpkabar__isi">{k.isi.id}</span>}
                  <span className="hint">
                    {[
                      k.modul ? t.modulN(k.modul) : "",
                      k.sasaran === "belum" ? t.untukBelum : "",
                      k.sasaran === "satu" ? t.untukSatu(k.nama ?? k.nim ?? "") : "",
                      !tampil
                        ? t.selesai
                        : nanti
                          ? t.dijadwalkan(waktuPanjang(k.mulai, lang))
                          : k.sampai
                            ? t.tampilSampai(waktuPanjang(k.sampai, lang))
                            : t.tampilTerus,
                      t.oleh(k.oleh, waktuPanjang(k.pada, lang)),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {(boleh || k.milikku) && (
                  <button type="button" className="btn btn--sm" onClick={() => setHapus(k.id)}>
                    {t.hapus}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hint">{t.sudahKosong}</p>
      )}
      <Confirm
        open={hapus !== null}
        onOpenChange={(v) => !v && setHapus(null)}
        title={t.hapusH}
        body={t.hapusBody}
        confirmLabel={t.hapus}
        cancelLabel={t.batal}
        tone="danger"
        lang={lang}
        onConfirm={async () => {
          const r = await postJson<{ ok: boolean }>("/api/tp/kabar-hapus", { id: hapus }).catch(
            () => ({ ok: false }),
          );
          window.Toast?.show(r.ok ? t.hapusOk : t.gagal, r.ok ? "ok" : "warn");
          if (r.ok) onDone();
          return r.ok;
        }}
      />
    </section>
  );
}
