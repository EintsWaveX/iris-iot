/**
 * LMS › Tugas: one row per assignment that exists under the same name in
 * the classes; its detail shows each class's submitted and late counts,
 * locks and dates, and the per Praktikan extensions. Buat Tugas makes any
 * assignment in every class (a wide two-column dialog), class by class;
 * TP Modul N stays with Penilaian and Sambungan.
 */
import { useMemo, useState } from "react";
import Dialog from "../ui/Dialog";
import Pill from "../ui/Pill";
import IconButton from "../ui/IconButton";
import Dropdown from "../ui/Dropdown";
import { DateField, Switch, TimeField } from "../ui/Controls";
import { getJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { waktuPanjang } from "../tp/shared";
import { LS } from "./lmsStrings";
import {
  BatchDialog,
  ClassPick,
  Head,
  galatTeks,
  langkah,
  sasaranKursus,
  type KursusRingan,
  type Sasaran,
} from "./lmsShared";
import { BacaSaja, type TabLms } from "./LmsPage";
import { MagnifyingGlassIcon, TrashIcon } from "@phosphor-icons/react";

interface KelasTugas {
  kursus: number;
  label: string;
  kelas: "reguler" | "inter";
  id: number;
  cmid: number;
  buka: string | null;
  tutup: string | null;
  siswa: number;
  masuk: number;
  telat: number;
  terkunci: number;
  lampiran: string[];
  perpanjang: {
    userid: number;
    nim: string | null;
    nama: string | null;
    sampai: string | null;
    alasan: string | null;
    oleh: string | null;
  }[];
}
interface Tugas {
  nama: string;
  tp: number | null;
  buka: string | null;
  tutup: string | null;
  sama: boolean;
  kelas: KelasTugas[];
}
interface DataTugas {
  ok: boolean;
  kode?: string;
  tugas: Tugas[];
  kursus: KursusRingan[];
  kelasJumlah: number;
  boleh: boolean;
  kelola: boolean;
}

export default function TugasTab({ lang }: { lang: Lang; ke: (v: TabLms) => void }) {
  const t = LS[lang];
  const poll = usePoll(() => getJson<DataTugas>("/api/lms/tugas"), 300_000, true, ["lms", "tp"]);
  const d = poll.data;
  const [pilih, setPilih] = useState<string | null>(null);
  const [buat, setBuat] = useState(false);
  if (!d) return <span className="skeleton" style={{ height: 420 }} />;
  if (!d.ok) return <p className="banner banner--warn">{galatTeks(d.kode, lang)}</p>;
  const sel = d.tugas.find((x) => x.nama === pilih) ?? null;
  return (
    <div className="stack stack--lg">
      <BacaSaja lang={lang} boleh={d.boleh} />
      <section className="panel slr-card">
        <Head
          title={t.tugasH}
          desc={t.tugasHint}
          aside={
            d.boleh && d.kelola ? (
              <button type="button" className="btn btn--primary" onClick={() => setBuat(true)}>
                {t.buatTugas}
              </button>
            ) : undefined
          }
        />
        {d.tugas.length ? (
          <ul className="lms-tgs">
            {d.tugas.map((x) => (
              <li key={x.nama} aria-selected={pilih === x.nama}>
                <span className="stack stack--sm grow">
                  <b>
                    {x.nama} {x.tp && <Pill tone="accent">TP</Pill>}
                  </b>
                  <span className="hint">
                    {x.buka && x.tutup
                      ? t.tugasDi(
                          x.kelas.length,
                          waktuPanjang(x.buka, lang),
                          waktuPanjang(x.tutup, lang),
                        )
                      : t.tugasDiTanpa(x.kelas.length)}
                  </span>
                </span>
                <Pill tone={x.sama && x.kelas.length === d.kelasJumlah ? "ok" : "warn"}>
                  {!x.sama ? t.bedaTanggal : t.samaDi(x.kelas.length)}
                </Pill>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setPilih(pilih === x.nama ? null : x.nama)}
                >
                  {t.buka}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">{t.tugasKosong}</p>
        )}
      </section>
      {sel && <Detail lang={lang} x={sel} boleh={d.boleh} onChanged={poll.refresh} />}
      {buat && (
        <BuatDialog
          lang={lang}
          kursus={d.kursus}
          onClose={() => setBuat(false)}
          onDone={poll.refresh}
        />
      )}
    </div>
  );
}

function Detail({
  lang,
  x,
  boleh,
  onChanged,
}: {
  lang: Lang;
  x: Tugas;
  boleh: boolean;
  onChanged: () => void;
}) {
  const t = LS[lang];
  const [kunci, setKunci] = useState<boolean | null>(null);
  const [ext, setExt] = useState(false);
  const [ulang, setUlang] = useState(false);
  const adaPdf = x.kelas.every((k) => k.lampiran.some((f) => /\.pdf$/i.test(f)));
  const terkunci = x.kelas.some((k) => k.terkunci > 0);
  const semua = x.kelas.flatMap((k) => k.perpanjang.map((p) => ({ ...p, k })));
  const cabut = async (p: (typeof semua)[number]) => {
    const r = await langkah("/api/lms/perpanjang", {
      tugas: p.k.id,
      kursus: p.k.kursus,
      userid: p.userid,
      sampai: null,
    });
    window.Toast?.show(r.ok ? t.cabutOk : galatTeks(r.kode, lang), r.ok ? "ok" : "warn");
    onChanged();
  };
  return (
    <section className="panel slr-card">
      <Head
        title={x.nama}
        desc={
          x.buka && x.tutup
            ? `${t.sampai(waktuPanjang(x.buka, lang), waktuPanjang(x.tutup, lang))}. ${t.telatDiterima}`
            : undefined
        }
        aside={<Pill tone={adaPdf ? "ok" : undefined}>{adaPdf ? t.pdfAda : t.pdfBelum}</Pill>}
      />
      <div className="tpscroll">
        <table className="tptable">
          <thead>
            <tr>
              <th>{t.kelas}</th>
              <th className="num">{t.tSubmitted}</th>
              <th className="num">{t.tTelat}</th>
              <th>{t.tKiriman}</th>
              <th>{t.tTanggal}</th>
            </tr>
          </thead>
          <tbody>
            {x.kelas.map((k) => (
              <tr key={k.kursus}>
                <td>
                  <b className="mono">{k.label}</b>
                </td>
                <td className="num mono">
                  {k.masuk}/{k.siswa}
                </td>
                <td className="num mono" data-warn={k.telat ? "yes" : undefined}>
                  {k.telat}
                </td>
                <td>
                  {k.terkunci ? (
                    <Pill tone="warn">{t.dikunci(k.terkunci)}</Pill>
                  ) : (
                    <Pill>{t.terbuka}</Pill>
                  )}
                </td>
                <td>
                  <Pill tone={k.buka === x.buka && k.tutup === x.tutup ? "ok" : "warn"}>
                    {k.buka === x.buka && k.tutup === x.tutup ? t.sesuai : t.beda}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="stack">
        <Head level={3} title={t.perpanjanganH} />
        {semua.length ? (
          <ul className="lms-ext">
            {semua.map((p) => (
              <li key={`${p.k.kursus}-${p.userid}`}>
                <span className="stack stack--sm">
                  <b>{p.nama ?? p.nim ?? p.userid}</b>
                  <span className="hint mono">{p.k.label}</span>
                </span>
                <span className="stack stack--sm">
                  <span>{p.sampai ? t.sampaiTgl(waktuPanjang(p.sampai, lang)) : ""}</span>
                  <span className="hint">{[p.alasan, p.oleh].filter(Boolean).join(" · ")}</span>
                </span>
                {boleh ? (
                  <IconButton
                    icon={TrashIcon}
                    label={t.cabut(p.nama ?? p.nim ?? String(p.userid))}
                    onClick={() => void cabut(p)}
                  />
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">{t.perpanjanganKosong}</p>
        )}
      </div>
      {boleh && (
        <div className="slr-acts">
          <button type="button" className="btn btn--primary" onClick={() => setExt(true)}>
            {t.perpanjang}
          </button>
          <button type="button" className="btn" onClick={() => setKunci(!terkunci)}>
            {terkunci ? t.bukaKunci : t.kunciKiriman}
          </button>
          <button type="button" className="btn" onClick={() => setUlang(true)}>
            {t.kirimUlang}
          </button>
        </div>
      )}
      <BatchDialog
        open={kunci !== null}
        onOpenChange={(v) => !v && setKunci(null)}
        lang={lang}
        title={kunci ? t.kunciJalan(x.nama) : t.bukaKunciJalan(x.nama)}
        kursus={x.kelas.map((k) => ({ id: k.kursus, label: k.label }))}
        jalan={(id) =>
          langkah("/api/lms/kunci", {
            kursus: id,
            tugas: x.kelas.find((k) => k.kursus === id)!.id,
            kunci: kunci === true,
          })
        }
        selesai={kunci ? t.kunciOk : t.bukaKunciOk}
        onDone={onChanged}
      />
      {ext && (
        <OrangDialog
          lang={lang}
          x={x}
          mode="perpanjang"
          onClose={() => setExt(false)}
          onDone={onChanged}
        />
      )}
      {ulang && (
        <OrangDialog
          lang={lang}
          x={x}
          mode="ulang"
          onClose={() => setUlang(false)}
          onDone={onChanged}
        />
      )}
    </section>
  );
}

interface OrangKelas {
  id: number;
  nama: string;
  nim: string | null;
  status: string;
}

/** Extend, or allow resubmitting, for one Praktikan of one class. */
function OrangDialog({
  lang,
  x,
  mode,
  onClose,
  onDone,
}: {
  lang: Lang;
  x: Tugas;
  mode: "perpanjang" | "ulang";
  onClose: () => void;
  onDone: () => void;
}) {
  const t = LS[lang];
  const [kursus, setKursus] = useState(String(x.kelas[0]?.kursus ?? ""));
  const k = x.kelas.find((c) => String(c.kursus) === kursus) ?? null;
  const orang = usePoll(
    () =>
      getJson<{ ok: boolean; orang?: OrangKelas[] }>(
        `/api/lms/kelas-isi?kursus=${kursus}&bagian=orang`,
      ),
    600_000,
    !!kursus,
    [],
    0,
    kursus,
  );
  const [cari, setCari] = useState("");
  const [user, setUser] = useState<OrangKelas | null>(null);
  const tutupWib = k?.tutup ? new Date(Date.parse(k.tutup) + 7 * 3_600_000) : null;
  const [tgl, setTgl] = useState(
    tutupWib ? new Date(tutupWib.getTime() + 2 * 86_400_000).toISOString().slice(0, 10) : "",
  );
  const [jam, setJam] = useState(tutupWib ? tutupWib.toISOString().slice(11, 16) : "18:00");
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);
  const daftar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (orang.data?.orang ?? [])
      .filter((o) => o.status === "terdaftar" || o.status === "luar")
      .filter((o) => !q || o.nama.toLowerCase().includes(q) || (o.nim ?? "").includes(q))
      .slice(0, 6);
  }, [orang.data, cari]);
  const kirim = async () => {
    if (!k || !user) return;
    setBusy(true);
    const r =
      mode === "perpanjang"
        ? await langkah("/api/lms/perpanjang", {
            tugas: k.id,
            kursus: k.kursus,
            userid: user.id,
            sampai: `${tgl}T${jam}:00+07:00`,
            alasan,
          })
        : await langkah("/api/lms/kirim-ulang", { tugas: k.id, kursus: k.kursus, userid: user.id });
    setBusy(false);
    window.Toast?.show(
      r.ok ? (mode === "perpanjang" ? t.perpanjangOk : t.kirimUlangOk) : galatTeks(r.kode, lang),
      r.ok ? "ok" : "warn",
    );
    if (r.ok) {
      onDone();
      onClose();
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={mode === "perpanjang" ? t.perpanjangH(x.nama) : t.kirimUlangH(x.nama)}
      description={mode === "perpanjang" ? t.perpanjangDesc : t.kirimUlangDesc}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.batal}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !user || (mode === "perpanjang" && !tgl)}
            onClick={() => void kirim()}
          >
            {mode === "perpanjang" ? t.perpanjang : t.kirimUlang}
          </button>
        </>
      }
    >
      <div className="stack">
        <Dropdown
          id="lms-orang-kelas"
          label={t.kelas}
          options={x.kelas.map((c) => ({ value: String(c.kursus), label: c.label }))}
          value={kursus}
          onChange={(v) => {
            setKursus(v);
            setUser(null);
          }}
        />
        <div className="field">
          <span className="field__label">{t.praktikan}</span>
          {user ? (
            <div className="lms-picked">
              <span className="stack stack--sm">
                <b>{user.nama}</b>
                <span className="hint mono">{user.nim ?? ""}</span>
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setUser(null)}
              >
                {t.pilihPraktikan}
              </button>
            </div>
          ) : (
            <>
              <label className="lms-search">
                <MagnifyingGlassIcon size={18} aria-hidden="true" />
                <input
                  className="field__input"
                  placeholder={t.cariPraktikan}
                  aria-label={t.cariPraktikan}
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                />
              </label>
              <ul className="lms-pick">
                {daftar.map((o) => (
                  <li key={o.id}>
                    <button type="button" onClick={() => setUser(o)}>
                      <b>{o.nama}</b>
                      <span className="hint mono">{o.nim ?? ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {mode === "perpanjang" && (
          <>
            <div className="field">
              <span className="field__label">{t.batasBaru}</span>
              <div className="lms-datetime">
                <DateField value={tgl} onChange={setTgl} label={t.tanggal} lang={lang} />
                <TimeField value={jam} onChange={setJam} label={t.jam} lang={lang} />
              </div>
            </div>
            <label className="field">
              <span className="field__label">{t.alasan}</span>
              <input
                className="field__input"
                value={alasan}
                maxLength={200}
                onChange={(e) => setAlasan(e.target.value)}
              />
              <span className="hint">{t.alasanHint}</span>
            </label>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Any assignment in every class: a wide two-column form, then a batch. */
function BuatDialog({
  lang,
  kursus,
  onClose,
  onDone,
}: {
  lang: Lang;
  kursus: KursusRingan[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = LS[lang];
  const [nama, setNama] = useState("");
  const [sasaran, setSasaran] = useState<Sasaran>("semua");
  const [tglBuka, setTglBuka] = useState("");
  const [jamBuka, setJamBuka] = useState("08:00");
  const [tglTutup, setTglTutup] = useState("");
  const [jamTutup, setJamTutup] = useState("23:30");
  const [hanyaPdf, setHanyaPdf] = useState(true);
  const [tampil, setTampil] = useState(true);
  const [teksId, setTeksId] = useState("");
  const [teksEn, setTeksEn] = useState("");
  const [jalan, setJalan] = useState(false);
  const tujuan = sasaranKursus(kursus, sasaran);
  const buka = tglBuka ? `${tglBuka}T${jamBuka}:00+07:00` : "";
  const tutup = tglTutup ? `${tglTutup}T${jamTutup}:00+07:00` : "";
  const siap =
    nama.trim() && buka && tutup && Date.parse(tutup) > Date.parse(buka) && tujuan.length;
  return (
    <>
      <Dialog
        open={!jalan}
        onOpenChange={(v) => !v && onClose()}
        title={t.formH}
        description={t.formDesc}
        size="xl"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {t.batal}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!siap}
              onClick={() => setJalan(true)}
            >
              {t.buatDi(tujuan.length)}
            </button>
          </>
        }
      >
        <div className="lms-form">
          <div className="lms-form__col">
            <label className="field">
              <span className="field__label">{t.nama}</span>
              <input
                className="field__input"
                value={nama}
                maxLength={120}
                onChange={(e) => setNama(e.target.value)}
              />
            </label>
            <ClassPick lang={lang} kursus={kursus} value={sasaran} onChange={setSasaran} />
            <div className="field">
              <span className="field__label">{t.dibuka}</span>
              <div className="lms-datetime">
                <DateField value={tglBuka} onChange={setTglBuka} label={t.tglBuka} lang={lang} />
                <TimeField value={jamBuka} onChange={setJamBuka} label={t.jamBuka} lang={lang} />
              </div>
            </div>
            <div className="field">
              <span className="field__label">{t.ditutup}</span>
              <div className="lms-datetime">
                <DateField
                  value={tglTutup}
                  onChange={setTglTutup}
                  label={t.tglTutup}
                  lang={lang}
                  min={tglBuka || undefined}
                />
                <TimeField value={jamTutup} onChange={setJamTutup} label={t.jamTutup} lang={lang} />
              </div>
            </div>
            <div className="lms-opts">
              <label className="slr-agree">
                <span className="stack stack--sm">
                  <b>{t.hanyaPdf}</b>
                  <span className="hint">{t.hanyaPdfHint}</span>
                </span>
                <Switch on={hanyaPdf} onChange={setHanyaPdf} label={t.hanyaPdf} />
              </label>
              <label className="slr-agree">
                <span className="stack stack--sm">
                  <b>{t.tampilkan}</b>
                  <span className="hint">{t.tampilkanHint}</span>
                </span>
                <Switch on={tampil} onChange={setTampil} label={t.tampilkan} />
              </label>
            </div>
          </div>
          <div className="lms-form__col lms-form__col--grow">
            <label className="field">
              <span className="field__label">{t.petunjukReg}</span>
              <textarea
                className="field__input"
                rows={4}
                value={teksId}
                onChange={(e) => setTeksId(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">{t.petunjukInt}</span>
              <textarea
                className="field__input"
                rows={4}
                value={teksEn}
                onChange={(e) => setTeksEn(e.target.value)}
              />
            </label>
            <div className="lms-prev">
              <span className="field__label">{t.akanDibuat}</span>
              <b>{t.akanDibuatIsi(nama.trim() || "…", tujuan.length)}</b>
              {buka && tutup && (
                <span className="hint">
                  {t.akanDibuatHint(waktuPanjang(buka, lang), waktuPanjang(tutup, lang))}
                </span>
              )}
            </div>
          </div>
        </div>
      </Dialog>
      <BatchDialog
        open={jalan}
        onOpenChange={(v) => {
          if (!v) {
            setJalan(false);
            onClose();
          }
        }}
        lang={lang}
        title={t.buatJalan(nama.trim())}
        kursus={tujuan}
        jalan={(id) =>
          langkah("/api/lms/tugas", {
            langkah: "buat",
            kursus: id,
            nama: nama.trim(),
            buka,
            tutup,
            teks: { id: teksId, en: teksEn || teksId },
            hanyaPdf,
            tampil,
          })
        }
        selesai={t.buatOk}
        onDone={onDone}
      />
    </>
  );
}
