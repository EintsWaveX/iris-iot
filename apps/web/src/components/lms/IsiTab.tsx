/**
 * LMS › Isi Kelas (Phase 16): the class page in the LMS, edited from IRIS.
 * All eleven classes share one layout, so the page reads them together and
 * marks what a class lacks (X/11); a change goes to every class in the
 * picked group, one class at a time, read back after each. The LMS only
 * hands out each module's document and TP (ruling 3), so IRIS makes the
 * module sections (link, handbook PDF, the TP moved in) and otherwise only
 * renames, moves, shows, hides and deletes. The campus K3 sections are
 * locked per visit; show and hide always work.
 */
import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsClockwiseIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import Dialog from "../ui/Dialog";
import Confirm from "../ui/Confirm";
import Dropdown from "../ui/Dropdown";
import IconButton from "../ui/IconButton";
import { Checkbox, Switch } from "../ui/Controls";
import { getJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { LS } from "./lmsStrings";
import { IS } from "./isiStrings";
import { BatchDialog, galatTeks, langkah, type JawabLangkah, type KursusRingan } from "./lmsShared";
import { BacaSaja, type TabLms } from "./LmsPage";

/* ================================================================ data */

interface Nama2 {
  id?: string;
  en?: string;
}
interface Hitung {
  ada: number;
  kurang: string[];
  sembunyi: number;
}
interface Isi extends Hitung {
  kunci: string;
  jenis: string;
  peran: "tautan" | "pdf" | "tp" | null;
  nama: Nama2;
  url?: string;
}
interface Bagian extends Hitung {
  kunci: string;
  asal: "kampus" | "iris";
  modul: number | null;
  nomor: number;
  nama: Nama2;
  isi: Isi[];
}
interface Modul {
  modul: number;
  nama: string;
  bagian: number;
  tautan: number;
  pdf: number;
  tp: number;
  tpLuar: number;
  pdfBasi: number;
  tautanBasi: number;
}
interface DataIsi {
  ok: boolean;
  kode?: string;
  kelas: KursusRingan[];
  semuaKelas: KursusRingan[];
  gagalBaca: string[];
  bagian: Bagian[];
  modul: Modul[];
  boleh: boolean;
  kelola: boolean;
}

/** One body per step; a class runs them in turn and stops at a failure. */
type Langkah = Record<string, unknown>;
interface Jalan {
  judul: string;
  selesai: string;
  langkah: Langkah[];
}

const MODUL_LANGKAH = ["bagian", "tautan", "pdf", "tp"] as const;

/* ========================================================== the tab */

export default function IsiTab({ lang, ke }: { lang: Lang; ke: (v: TabLms) => void }) {
  const t = IS[lang];
  const tl = LS[lang];
  // A class opened from Kelas's drawer (?kelas=), else all of them.
  const [sasaran, setSasaran] = useState(() => {
    if (typeof location === "undefined") return "semua";
    const k = new URLSearchParams(location.search).get("kelas");
    return k && /^\d+$/.test(k) ? k : "semua";
  });
  const poll = usePoll(
    () => getJson<DataIsi>(`/api/lms/isi?sasaran=${encodeURIComponent(sasaran)}`),
    300_000,
    true,
    ["lms"],
    0,
    sasaran,
  );
  const [kunci, setKunci] = useState(true);
  const [atur, setAtur] = useState(false);
  const [buka, setBuka] = useState<
    null | { k: "buat" } | { k: "isi"; b: string; i: string } | { k: "bagian"; b: string }
  >(null);
  const [run, setRun] = useState<Jalan | null>(null);
  const d = poll.data;

  if (!d) return <span className="skeleton" style={{ height: 520 }} />;
  if (!d.ok) return <p className="banner banner--warn">{galatTeks(d.kode, lang)}</p>;

  const n = d.kelas.length;
  const ubah = d.boleh && d.kelola;
  const semuaInter = d.kelas.every((k) => k.kelas === "inter");
  const nama = (x: Nama2) => (semuaInter ? (x.en ?? x.id) : (x.id ?? x.en)) ?? "";
  const terkunci = (b: Bagian) => b.asal === "kampus" && kunci;
  const adaModul = d.bagian.some((b) => b.asal === "iris");
  const adaKampus = d.bagian.some((b) => b.asal === "kampus");
  const sasaranTeks =
    sasaran === "semua"
      ? t.kelasN(n)
      : n === 1
        ? d.kelas[0].label
        : `${sasaran === "inter" ? t.inter : t.reguler} (${t.kelasN(n)})`;
  const jalan = (judul: string, selesai: string, langkahs: Langkah[]) =>
    setRun({ judul, selesai, langkah: langkahs });
  const modulLangkah = (m: number): Langkah[] =>
    MODUL_LANGKAH.map((l) => ({ langkah: l, modul: m }));

  const opsi = [
    { value: "semua", label: t.semua(d.semuaKelas.length) },
    { value: "reguler", label: t.reguler },
    { value: "inter", label: t.inter },
    ...d.semuaKelas.map((k) => ({
      value: String(k.id),
      label: k.label,
      chip: k.kelas === "inter" ? "INT" : undefined,
    })),
  ];

  // Arrange: within a section, or across to the next unlocked one.
  const geser = (bi: number, ii: number, arah: -1 | 1) => {
    const b = d.bagian[bi];
    const x = b.isi[ii];
    const j = ii + arah;
    if (j >= 0 && j < b.isi.length) {
      const [yang, sebelum] = arah < 0 ? [x, b.isi[j]] : [b.isi[j], x];
      return jalan(t.jalanPindah(nama(yang.nama)), t.okPindah, [
        {
          langkah: "pindah",
          bagian: b.kunci,
          isi: yang.kunci,
          ke: b.kunci,
          sebelum: sebelum.kunci,
        },
      ]);
    }
    const tujuan = d.bagian[bi + arah];
    if (!tujuan || terkunci(tujuan)) return;
    jalan(t.jalanPindah(nama(x.nama)), t.okPindah, [
      {
        langkah: "pindah",
        bagian: b.kunci,
        isi: x.kunci,
        ke: tujuan.kunci,
        ...(arah > 0 && tujuan.isi[0] ? { sebelum: tujuan.isi[0].kunci } : {}),
      },
    ]);
  };

  const Ada = ({ h }: { h: Hitung }) =>
    n < 2 ? (
      <span className="isi-ada" />
    ) : h.ada === n ? (
      <span className="isi-ada hint">
        {h.ada}/{n}
      </span>
    ) : (
      <span className="isi-ada isi-ada--beda" title={t.tidakAdaDi(h.kurang.join(", "))}>
        {h.ada}/{n}
      </span>
    );

  return (
    <div className="stack stack--lg">
      <BacaSaja lang={lang} boleh={d.boleh} />
      {d.boleh && !d.kelola && <p className="banner banner--warn">{tl.perluKunci}</p>}

      <section className="panel isi-bar">
        <div className="isi-bar__pick">
          <Dropdown
            id="isi-sasaran"
            label={t.yangDiubah}
            options={opsi}
            value={sasaran}
            onChange={(v) => {
              setSasaran(v);
              setAtur(false);
              const u = new URL(location.href);
              if (u.searchParams.has("kelas")) {
                u.searchParams.delete("kelas");
                history.replaceState(history.state, "", u.pathname + u.search + u.hash);
              }
            }}
          />
        </div>
        <span className="hint isi-bar__hint">
          {sasaran === "semua"
            ? t.semuaHint
            : n === 1
              ? t.satuHint(d.kelas[0].label)
              : t.kelompokHint(n)}
        </span>
        <div className="isi-bar__acts">
          <button type="button" className="btn btn--ghost" onClick={poll.refresh}>
            {t.bacaUlang}
            <ArrowsClockwiseIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
          </button>
          {ubah && (
            <>
              <button
                type="button"
                className="btn"
                aria-pressed={atur}
                onClick={() => setAtur(!atur)}
              >
                {atur ? t.selesaiAtur : t.aturUrutan}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setBuka({ k: "buat" })}
              >
                {t.buatBagian}
              </button>
            </>
          )}
        </div>
      </section>

      {d.gagalBaca.length > 0 && (
        <p className="banner banner--warn">{t.gagalBaca(d.gagalBaca.join(", "))}</p>
      )}

      {!adaModul && ubah && (
        <div className="banner isi-saran">
          <span className="stack stack--sm">
            <b>{t.belumModulH}</b>
            <span>{t.belumModul}</span>
          </span>
          <button type="button" className="btn btn--primary" onClick={() => setBuka({ k: "buat" })}>
            {t.buatBagian}
          </button>
        </div>
      )}

      {adaKampus && ubah && (
        <div className="banner isi-kunci" data-open={kunci ? undefined : "yes"}>
          <span className="stack stack--sm">
            <b>{kunci ? t.kunciH : t.bukaH}</b>
            <span>{kunci ? t.kunciBody : t.bukaBody}</span>
          </span>
          <button
            type="button"
            className={kunci ? "btn" : "btn btn--primary"}
            onClick={() => setKunci(!kunci)}
          >
            {kunci ? t.bukaKunci : t.kunciLagi}
          </button>
        </div>
      )}

      <div className="isi-main">
        <nav className="isi-peta panel" aria-label={t.petaLabel}>
          <span className="field__label">{t.nBagian(d.bagian.length)}</span>
          <ol>
            {d.bagian.map((b) => (
              <li key={b.kunci} data-asal={b.asal}>
                <a
                  href={`#isi-${b.kunci}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById(`isi-${b.kunci}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <span className="isi-no">{b.nomor}</span>
                  <span className="isi-peta__n">{nama(b.nama)}</span>
                  <span className="hint">{b.isi.length}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="stack stack--lg isi-list">
          {d.bagian.map((b, bi) => {
            const m = b.modul ? d.modul.find((x) => x.modul === b.modul) : undefined;
            const kurangModul = !!m && (m.bagian < n || m.tautan < n || m.pdf < n || m.tpLuar > 0);
            return (
              <section
                key={b.kunci}
                id={`isi-${b.kunci}`}
                className="panel isi-bag"
                data-asal={b.asal}
              >
                <div className="isi-bag__head">
                  <div className="stack stack--sm" style={{ minWidth: 0 }}>
                    <span className="eyebrow">
                      {t.bagianN(b.nomor)} · {b.asal === "kampus" ? t.kampus : t.dariIris}
                    </span>
                    <h3 className="isi-bag__t">{nama(b.nama)}</h3>
                    {b.sembunyi > 0 && (
                      <span className="hint">
                        {b.sembunyi === b.ada ? t.tersembunyi : t.tersembunyiSebagian(b.sembunyi)}
                      </span>
                    )}
                  </div>
                  <div className="isi-bag__acts">
                    <Ada h={b} />
                    {ubah &&
                      (terkunci(b) ? (
                        <Pill>{t.terkunci}</Pill>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => setBuka({ k: "bagian", b: b.kunci })}
                        >
                          {t.ubahBagian}
                          <CaretRightIcon
                            size={16}
                            weight="bold"
                            className="btn__go"
                            aria-hidden="true"
                          />
                        </button>
                      ))}
                  </div>
                </div>

                {m && (
                  <div className="isi-cek">
                    <Pill tone={m.tautan === n && !m.tautanBasi ? "ok" : "warn"}>
                      {t.cekTautan} {m.tautan}/{n}
                    </Pill>
                    <Pill tone={m.pdf === n && !m.pdfBasi ? "ok" : "warn"}>
                      {t.cekPdf} {m.pdf}/{n}
                    </Pill>
                    <Pill tone={m.tp === n ? "ok" : m.tp || m.tpLuar ? "warn" : undefined}>
                      {m.tp || m.tpLuar ? `${t.cekTp} ${m.tp}/${n}` : t.tpBelum}
                    </Pill>
                    {(m.tpLuar > 0 || m.pdfBasi > 0 || m.tautanBasi > 0) && (
                      <span className="hint">
                        {[
                          m.tpLuar ? t.tpLuar(m.tpLuar) : "",
                          m.tautanBasi ? t.tautanBasi(m.tautanBasi) : "",
                          m.pdfBasi ? t.pdfBasi(m.pdfBasi) : "",
                        ]
                          .filter(Boolean)
                          .join(". ")}
                      </span>
                    )}
                    {ubah && (kurangModul || m.pdfBasi > 0 || m.tautanBasi > 0) && (
                      <span className="isi-cek__acts">
                        {m.tautanBasi > 0 && (
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() =>
                              jalan(t.tautanJalan(m.modul), t.tautanOk, [
                                { langkah: "ganti-tautan", modul: m.modul },
                              ])
                            }
                          >
                            {t.perbaruiTautan}
                          </button>
                        )}
                        {m.pdfBasi > 0 && (
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() =>
                              jalan(t.gantiJalan(m.modul), t.gantiOk, [
                                { langkah: "ganti-pdf", modul: m.modul },
                              ])
                            }
                          >
                            {t.gantiPdf}
                          </button>
                        )}
                        {kurangModul && (
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            onClick={() =>
                              jalan(t.lengkapiJalan(m.modul), t.buatOk, modulLangkah(m.modul))
                            }
                          >
                            {t.lengkapi}
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                )}

                {b.isi.length ? (
                  <ul className="isi-items">
                    {b.isi.map((x, ii) => {
                      const tampil = x.sembunyi === 0;
                      const bisaAtur = atur && !terkunci(b);
                      return (
                        <li
                          key={x.kunci}
                          data-tampil={tampil ? "yes" : "no"}
                          data-atur={atur ? "yes" : undefined}
                        >
                          {atur && (
                            <span className="isi-urut">
                              {bisaAtur && (
                                <>
                                  <IconButton
                                    sm
                                    icon={ArrowUpIcon}
                                    label={t.naik}
                                    onClick={() => geser(bi, ii, -1)}
                                  />
                                  <IconButton
                                    sm
                                    icon={ArrowDownIcon}
                                    label={t.turun}
                                    onClick={() => geser(bi, ii, 1)}
                                  />
                                </>
                              )}
                            </span>
                          )}
                          <span className="isi-jenis" data-j={x.jenis}>
                            {t.jenis[x.jenis] ?? x.jenis}
                          </span>
                          <span className="isi-items__n">
                            <b>{nama(x.nama)}</b>
                            {x.url && (
                              <span className="hint mono">{x.url.replace(/^https?:\/\//, "")}</span>
                            )}
                            {x.sembunyi > 0 && (
                              <span className="hint">
                                {x.sembunyi === x.ada
                                  ? t.tersembunyi
                                  : t.tersembunyiSebagian(x.sembunyi)}
                              </span>
                            )}
                          </span>
                          <Ada h={x} />
                          {!atur && ubah && (
                            <Switch
                              on={tampil}
                              label={t.tampilkan(nama(x.nama))}
                              onChange={(v) =>
                                jalan(
                                  v ? t.jalanTampil(nama(x.nama)) : t.jalanSembunyi(nama(x.nama)),
                                  v ? t.okTampil : t.okSembunyi,
                                  [{ langkah: "tampil", bagian: b.kunci, isi: x.kunci, tampil: v }],
                                )
                              }
                            />
                          )}
                          {!atur && ubah && (
                            <span className="isi-ubah">
                              {x.jenis === "assign" ? (
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm"
                                  onClick={() => ke("tugas")}
                                >
                                  {t.diTugas}
                                  <CaretRightIcon
                                    size={16}
                                    weight="bold"
                                    className="btn__go"
                                    aria-hidden="true"
                                  />
                                </button>
                              ) : (
                                !terkunci(b) && (
                                  <button
                                    type="button"
                                    className="btn btn--ghost btn--sm"
                                    onClick={() => setBuka({ k: "isi", b: b.kunci, i: x.kunci })}
                                  >
                                    {t.ubah}
                                    <CaretRightIcon
                                      size={16}
                                      weight="bold"
                                      className="btn__go"
                                      aria-hidden="true"
                                    />
                                  </button>
                                )
                              )}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="hint isi-kosong">{t.kosong}</p>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {buka?.k === "buat" && (
        <BuatBagian
          lang={lang}
          d={d}
          sasaranTeks={sasaranTeks}
          onClose={() => setBuka(null)}
          onRun={(ms) => {
            setBuka(null);
            jalan(t.buatJalan(ms), t.buatOk, ms.flatMap(modulLangkah));
          }}
        />
      )}
      {buka?.k === "isi" &&
        (() => {
          const b = d.bagian.find((x) => x.kunci === buka.b);
          const x = b?.isi.find((y) => y.kunci === buka.i);
          return b && x ? (
            <UbahIsi
              lang={lang}
              d={d}
              b={b}
              x={x}
              nama={nama}
              terkunci={terkunci}
              sasaranTeks={sasaranTeks}
              onClose={() => setBuka(null)}
              onRun={(j) => {
                setBuka(null);
                setRun(j);
              }}
            />
          ) : null;
        })()}
      {buka?.k === "bagian" &&
        (() => {
          const b = d.bagian.find((x) => x.kunci === buka.b);
          return b ? (
            <UbahBagian
              lang={lang}
              d={d}
              b={b}
              nama={nama}
              sasaranTeks={sasaranTeks}
              onClose={() => setBuka(null)}
              onRun={(j) => {
                setBuka(null);
                setRun(j);
              }}
            />
          ) : null;
        })()}

      <BatchDialog
        open={run !== null}
        onOpenChange={(v) => !v && setRun(null)}
        lang={lang}
        title={run?.judul ?? ""}
        kursus={d.kelas}
        jalan={async (id) => {
          let akhir: JawabLangkah = { ok: true, cocok: true };
          for (const l of run?.langkah ?? []) {
            const r = await langkah("/api/lms/isi", { ...l, kursus: id, bukaKunci: !kunci });
            if (!r.ok) return r;
            if (r.cocok === false) akhir = r;
          }
          return akhir;
        }}
        selesai={run?.selesai ?? ""}
        onDone={poll.refresh}
      />
    </div>
  );
}

/* ================================================ Buat Bagian Modul */

function BuatBagian({
  lang,
  d,
  sasaranTeks,
  onClose,
  onRun,
}: {
  lang: Lang;
  d: DataIsi;
  sasaranTeks: string;
  onClose: () => void;
  onRun: (ms: number[]) => void;
}) {
  const t = IS[lang];
  const n = d.kelas.length;
  const lengkap = (m: Modul) => m.bagian === n && m.tautan === n && m.pdf === n && !m.tpLuar;
  const [pilih, setPilih] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(d.modul.map((m) => [m.modul, !lengkap(m)])),
  );
  const dipilih = d.modul.filter((m) => pilih[m.modul] && !lengkap(m)).map((m) => m.modul);
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t.buatJudul}
      description={t.buatDesc(sasaranTeks)}
      size="lg"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.batal}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!dipilih.length}
            onClick={() => onRun(dipilih)}
          >
            {dipilih.length ? t.buatDi(dipilih.length, n) : t.pilihModul}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="hint">{t.buatNote}</p>
        <div className="isi-mods">
          {d.modul.map((m) => (
            <div key={m.modul} className="isi-mods__i" data-ada={lengkap(m) ? "yes" : undefined}>
              <Checkbox
                checked={lengkap(m) || !!pilih[m.modul]}
                disabled={lengkap(m)}
                onChange={(v) => setPilih({ ...pilih, [m.modul]: v })}
                label={t.modulNama(m.modul, m.nama)}
                hint={
                  lengkap(m)
                    ? undefined
                    : [
                        `${t.cekTautan} ${m.tautan}/${n}`,
                        `${t.cekPdf} ${m.pdf}/${n}`,
                        m.tp || m.tpLuar ? `${t.cekTp} ${m.tp}/${n}` : t.tpBelum,
                      ].join(" · ")
                }
              />
              {lengkap(m) && <Pill tone="ok">{t.sudahAda}</Pill>}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

/* ======================================================== editing */

/** Two name fields when both class languages are in the picked group. */
function NamaDua({
  lang,
  d,
  label,
  nilai,
  onChange,
  bagian,
}: {
  lang: Lang;
  d: DataIsi;
  label?: string;
  nilai: Nama2;
  onChange: (v: Nama2) => void;
  bagian?: boolean;
}) {
  const t = IS[lang];
  const pakaiId = d.kelas.some((k) => k.kelas === "reguler");
  const pakaiEn = d.kelas.some((k) => k.kelas === "inter");
  const dua = pakaiId && pakaiEn;
  const f = (kunci: "id" | "en", teks: string) => (
    <label className="field">
      <span className="field__label">{teks}</span>
      <input
        className="field__input"
        value={nilai[kunci] ?? ""}
        maxLength={255}
        onChange={(e) => onChange({ ...nilai, [kunci]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="isi-dua" data-dua={dua ? "yes" : undefined}>
      {pakaiId && f("id", dua ? (bagian ? t.namaBagReg : t.namaReg) : (label ?? t.nama))}
      {pakaiEn && f("en", dua ? (bagian ? t.namaBagInt : t.namaInt) : (label ?? t.nama))}
    </div>
  );
}

const namaBerubah = (a: Nama2, b: Nama2) =>
  (a.id ?? "").trim() !== (b.id ?? "").trim() || (a.en ?? "").trim() !== (b.en ?? "").trim();

function UbahIsi({
  lang,
  d,
  b,
  x,
  nama,
  terkunci,
  sasaranTeks,
  onClose,
  onRun,
}: {
  lang: Lang;
  d: DataIsi;
  b: Bagian;
  x: Isi;
  nama: (v: Nama2) => string;
  terkunci: (b: Bagian) => boolean;
  sasaranTeks: string;
  onClose: () => void;
  onRun: (j: Jalan) => void;
}) {
  const t = IS[lang];
  const n = d.kelas.length;
  const jenis = t.jenis[x.jenis] ?? x.jenis;
  const penuh = ["url", "resource", "label", "page"].includes(x.jenis);
  const [nm, setNm] = useState<Nama2>(x.nama);
  const [ke, setKe] = useState(b.kunci);
  const [tampil, setTampil] = useState(x.sembunyi === 0);
  const [hapus, setHapus] = useState(false);
  const tujuan = d.bagian.filter((y) => y.kunci === b.kunci || !terkunci(y));
  const simpan = () => {
    const l: Langkah[] = [];
    // Show first, then move, then rename: each finds the item by its key.
    if (tampil !== (x.sembunyi === 0))
      l.push({ langkah: "tampil", bagian: b.kunci, isi: x.kunci, tampil });
    if (ke !== b.kunci) l.push({ langkah: "pindah", bagian: b.kunci, isi: x.kunci, ke });
    if (!x.peran && namaBerubah(nm, x.nama))
      l.push({ langkah: "nama", bagian: ke, isi: x.kunci, nama: nm });
    if (!l.length) return onClose();
    onRun({ judul: t.jalanSimpan(nama(x.nama)), selesai: t.okSimpan, langkah: l });
  };
  return (
    <>
      <Dialog
        open={!hapus}
        onOpenChange={(v) => !v && onClose()}
        title={t.ubahJudul(jenis)}
        description={t.ubahDesc(sasaranTeks)}
        size="lg"
        lang={lang}
        foot="12"
        actions={
          <>
            <button type="button" className="btn btn--primary" onClick={simpan}>
              {n > 1 ? t.simpanDi(n) : t.simpan}
            </button>
            <button type="button" className="btn btn--danger-soft" onClick={() => setHapus(true)}>
              {t.hapus}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {t.batal}
            </button>
          </>
        }
      >
        <div className="stack">
          {!penuh && <p className="banner">{t.hanyaNama(jenis)}</p>}
          {x.peran ? (
            <div className="stack stack--sm">
              <b>{nama(x.nama)}</b>
              <span className="hint">{t.namaIris}</span>
            </div>
          ) : (
            <NamaDua lang={lang} d={d} nilai={nm} onChange={setNm} />
          )}
          {x.url && <p className="hint mono isi-url">{x.url}</p>}
          <Dropdown
            id="isi-pindah"
            label={t.pindahKeLabel}
            options={tujuan.map((y) => ({ value: y.kunci, label: `${y.nomor} · ${nama(y.nama)}` }))}
            value={ke}
            onChange={setKe}
          />
          <div className="isi-switch">
            <b>{t.tampilMhs}</b>
            <Switch on={tampil} onChange={setTampil} label={t.tampilMhs} />
          </div>
        </div>
      </Dialog>
      <Confirm
        open={hapus}
        onOpenChange={(v) => !v && setHapus(false)}
        title={t.hapusIsiJudul(nama(x.nama))}
        body={
          ["quiz", "customcert"].includes(x.jenis)
            ? t.hapusNilaiBody(sasaranTeks)
            : t.hapusIsiBody(sasaranTeks)
        }
        confirmLabel={n > 1 ? t.hapusDari(n) : t.hapus}
        cancelLabel={t.batal}
        lang={lang}
        onConfirm={() =>
          onRun({
            judul: t.jalanHapus(nama(x.nama)),
            selesai: t.okHapus,
            langkah: [{ langkah: "hapus", bagian: b.kunci, isi: x.kunci }],
          })
        }
      />
    </>
  );
}

function UbahBagian({
  lang,
  d,
  b,
  nama,
  sasaranTeks,
  onClose,
  onRun,
}: {
  lang: Lang;
  d: DataIsi;
  b: Bagian;
  nama: (v: Nama2) => string;
  sasaranTeks: string;
  onClose: () => void;
  onRun: (j: Jalan) => void;
}) {
  const t = IS[lang];
  const n = d.kelas.length;
  const [nm, setNm] = useState<Nama2>(b.nama);
  const [tampil, setTampil] = useState(b.sembunyi === 0);
  const [hapus, setHapus] = useState(false);
  const kosong = b.isi.length === 0;
  const simpan = () => {
    const l: Langkah[] = [];
    if (tampil !== (b.sembunyi === 0)) l.push({ langkah: "tampil", bagian: b.kunci, tampil });
    if (b.asal === "kampus" && namaBerubah(nm, b.nama))
      l.push({ langkah: "nama", bagian: b.kunci, nama: nm });
    if (!l.length) return onClose();
    onRun({ judul: t.jalanSimpan(nama(b.nama)), selesai: t.okSimpan, langkah: l });
  };
  return (
    <>
      <Dialog
        open={!hapus}
        onOpenChange={(v) => !v && onClose()}
        title={t.ubahBagian}
        description={`${t.bagianN(b.nomor)}, ${sasaranTeks}.`}
        lang={lang}
        foot="12"
        actions={
          <>
            <button type="button" className="btn btn--primary" onClick={simpan}>
              {n > 1 ? t.simpanDi(n) : t.simpan}
            </button>
            <button
              type="button"
              className="btn btn--danger-soft"
              disabled={!kosong}
              title={kosong ? undefined : t.kosongkanDulu}
              onClick={() => setHapus(true)}
            >
              {t.hapus}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {t.batal}
            </button>
          </>
        }
      >
        <div className="stack">
          {b.asal === "iris" ? (
            <div className="stack stack--sm">
              <b>{nama(b.nama)}</b>
              <span className="hint">{t.bagianIrisNama}</span>
            </div>
          ) : (
            <NamaDua lang={lang} d={d} label={t.namaBag} nilai={nm} onChange={setNm} bagian />
          )}
          <div className="isi-switch">
            <span className="stack stack--sm">
              <b>{t.tampilBag}</b>
              <span className="hint">{t.tampilBagHint}</span>
            </span>
            <Switch on={tampil} onChange={setTampil} label={t.tampilBag} />
          </div>
          {!kosong && <p className="hint">{t.hanyaKosong}</p>}
        </div>
      </Dialog>
      <Confirm
        open={hapus}
        onOpenChange={(v) => !v && setHapus(false)}
        title={t.hapusBagJudul(nama(b.nama))}
        body={t.hapusBagBody(sasaranTeks)}
        confirmLabel={n > 1 ? t.hapusDari(n) : t.hapus}
        cancelLabel={t.batal}
        lang={lang}
        onConfirm={() =>
          onRun({
            judul: t.jalanHapus(nama(b.nama)),
            selesai: t.okHapus,
            langkah: [{ langkah: "hapus", bagian: b.kunci }],
          })
        }
      />
    </>
  );
}
