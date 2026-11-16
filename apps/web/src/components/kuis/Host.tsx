/**
 * The Asisten's screens: the projector view and its controls. The host drives
 * the game; a spectating Asisten sees the same screens with the controls
 * swapped for "Take Over".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import type { LihatHost } from "../../lib/kuis/engine";
import {
  BATAS_DETIK,
  JUMLAH_BANK,
  JUMLAH_PER_TIPE,
  TIPE_SOAL,
  type PengaturanKuis,
} from "../../lib/kuis/types";
import type { MotionLevel } from "../recruitment/reveal/fx";
import Fade from "../ui/Fade";
import { rayakan, bunyi } from "./fx";
import type { KuisTeks } from "./kuisStrings";
import {
  Angka,
  Avatar,
  Cincin,
  DaftarPapan,
  Pilihan,
  Selimut,
  useDaftarKeluar,
  useDetikSisa,
} from "./parts";
import { nilaiTA } from "../../lib/kuis/ta";
import type { Aku, Kuis } from "./useKuis";

interface Props {
  v: LihatHost;
  k: Kuis;
  aku: Aku;
  t: KuisTeks;
  m: MotionLevel;
  kodeSesi?: string;
}

// ------------------------------------------------------------------ QR

function Qr({ teks, ukuran }: { teks: string; ukuran: number }) {
  const svg = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(teks);
    q.make();
    const n = q.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { n, d };
  }, [teks]);
  return (
    <svg
      className="kz__qr"
      viewBox={`0 0 ${svg.n + 4} ${svg.n + 4}`}
      width={ukuran}
      height={ukuran}
      shapeRendering="crispEdges"
      role="img"
      aria-label={teks}
    >
      <rect width="100%" height="100%" fill="#ffffff" rx="1.2" />
      <path d={svg.d} fill="#0b1020" />
    </svg>
  );
}

// ------------------------------------------------------------- controls

/** A button that needs a second press within 3 s (for ending the game early). */
function TombolYakin({
  label,
  yakin,
  tip,
  onJalan,
}: {
  label: string;
  yakin: string;
  tip: string;
  onJalan: () => void;
}) {
  const [siap, setSiap] = useState(false);
  useEffect(() => {
    if (!siap) return;
    const id = window.setTimeout(() => setSiap(false), 3000);
    return () => window.clearTimeout(id);
  }, [siap]);
  return (
    <button
      type="button"
      className="btn btn--ghost"
      data-tip={tip}
      data-yakin={siap ? "1" : undefined}
      onClick={() => (siap ? (setSiap(false), onJalan()) : setSiap(true))}
    >
      {siap ? yakin : label}
    </button>
  );
}

function BilahAksi({
  v,
  k,
  aku,
  t,
  ta,
  setTa,
}: Pick<Props, "v" | "k" | "aku" | "t"> & { ta: boolean; setTa: (b: boolean) => void }) {
  if (aku.peran === "penonton") {
    return (
      <div className="kz__aksi kz__aksi--info">
        <p>{t.menonton(aku.hostNama)}</p>
        <button
          type="button"
          className="btn btn--primary"
          data-tip={t.tip.ambilAlih}
          onClick={() => k.kirim({ t: "ambil-alih" })}
        >
          {t.ambilAlih}
        </button>
      </div>
    );
  }
  const f = v.fase;
  const adaOnline = v.jumlahOnline > 0;
  const utama =
    f === "lobi"
      ? {
          label: t.mulaiSoalN(v.pengaturan.jumlah),
          tip: t.tip.mulai,
          jalan: () => k.kirim({ t: "mulai" }),
          mati: !adaOnline,
        }
      : f === "buka" || f === "papan"
        ? { label: t.lanjut, tip: t.tip.lanjut, jalan: () => k.kirim({ t: "lanjut" }), mati: false }
        : f === "podium" && !ta
          ? { label: t.lihatTA, tip: t.tip.lihatTA, jalan: () => setTa(true), mati: false }
          : f === "podium"
            ? {
                label: t.mainLagi,
                tip: t.tip.mainLagi,
                jalan: () => k.kirim({ t: "main-lagi" }),
                mati: false,
              }
            : null;
  const berjalan = f === "hitung" || f === "soal";

  // Space is the host's "next", so the projector never needs a mouse.
  const ref = useRef(utama);
  ref.current = utama;
  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "BUTTON" || el.tagName === "INPUT" || el.isContentEditable)) return;
      if (ref.current && !ref.current.mati) {
        e.preventDefault();
        ref.current.jalan();
      }
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, []);

  return (
    <div className="kz__aksi">
      <div className="kz__aksi-kiri">
        {f === "podium" && ta && (
          <button
            type="button"
            className="btn btn--secondary"
            data-tip={t.tip.kembaliSkor}
            onClick={() => setTa(false)}
          >
            {t.kembaliSkor}
          </button>
        )}
        {f !== "lobi" && f !== "podium" && (
          <TombolYakin
            label={t.selesaikan}
            yakin={`${t.selesaikan}?`}
            tip={t.tip.selesaikan}
            onJalan={() => k.kirim({ t: "akhiri" })}
          />
        )}
      </div>
      <div className="kz__aksi-kanan">
        {berjalan && (
          <>
            <button
              type="button"
              className="btn btn--secondary"
              data-tip={v.dijeda ? t.tip.lanjutkan : t.tip.jeda}
              onClick={() => k.kirim({ t: v.dijeda ? "teruskan" : "jeda" })}
            >
              {v.dijeda ? t.lanjutkan : t.jeda}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              data-tip={t.tip.lewati}
              onClick={() => k.kirim({ t: "lanjut" })}
              disabled={v.dijeda}
            >
              {t.lewati}
            </button>
          </>
        )}
        {utama && (
          <button
            type="button"
            className="btn btn--primary btn--lg"
            data-tip={utama.tip}
            onClick={utama.jalan}
            disabled={utama.mati}
          >
            {utama.label}
          </button>
        )}
      </div>
      {f === "lobi" && !adaOnline && <p className="kz__aksi-petunjuk">{t.perluPemain}</p>}
    </div>
  );
}

// --------------------------------------------------------------- lobby

function Chips<T extends string | number>({
  nilai,
  pilihan,
  onPilih,
  label,
  jalan = true,
}: {
  nilai: T;
  pilihan: { v: T; label: string; mati?: boolean }[];
  onPilih: (v: T) => void;
  label: string;
  jalan?: boolean;
}) {
  return (
    <div className="kz__chips" role="group" aria-label={label}>
      {pilihan.map((p) => (
        <button
          key={String(p.v)}
          type="button"
          className="kz__chip"
          aria-pressed={nilai === p.v}
          disabled={!jalan || p.mati}
          onClick={() => onPilih(p.v)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Lobi({ v, k, aku, t, kodeSesi }: Props) {
  const atur = (p: Partial<PengaturanKuis>) => k.kirim({ t: "atur", ...p });
  const bisa = aku.peran === "host";
  const maks = v.pengaturan.sumber === "semua" ? JUMLAH_BANK : JUMLAH_PER_TIPE;
  const url = typeof location === "undefined" ? "" : location.origin + "/";
  const alamat = typeof location === "undefined" ? "" : location.host;
  const jumlahOpsi = [5, 10, 15, 25].filter((n) => n <= maks);
  if (!jumlahOpsi.includes(maks)) jumlahOpsi.push(maks);
  const dinding = useDaftarKeluar(v.pemain, (p) => p.nim);

  return (
    <div className="kz__lobi">
      <section className="kz__kartu kz__gabung">
        <h2 className="kz__judul-besar">{t.gabung}</h2>
        <div className="kz__gabung-isi">
          {url && <Qr teks={url} ukuran={190} />}
          <div className="kz__gabung-info">
            <span className="kz__label">{t.bukaDi}</span>
            <b className="kz__alamat">{alamat}</b>
            {kodeSesi && (
              <>
                <span className="kz__label">{t.kodeSesi}</span>
                <b className="kz__kode">{kodeSesi}</b>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="kz__kartu kz__dinding">
        <header>
          <h3>{t.pemainN(v.jumlahPemain)}</h3>
        </header>
        {v.pemain.length === 0 ? (
          <p className="kz__kosong">{t.belumAda}</p>
        ) : (
          <ul className="kz__dinding-isi">
            {dinding.map(({ item: p, keluar }) => (
              <li
                key={p.nim}
                data-online={p.online ? "1" : "0"}
                data-keluar={keluar ? "1" : undefined}
                className="kz__pemain-chip"
              >
                <Avatar nim={p.nim} nama={p.nama} ukuran={34} />
                <span>{p.nama}</span>
                {bisa && !keluar && (
                  <button
                    type="button"
                    className="kz__x"
                    aria-label={`${t.keluarkan} ${p.nama}`}
                    onClick={() => k.kirim({ t: "tendang", nim: p.nim })}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="kz__kartu kz__atur">
        <div className="kz__baris">
          <span className="kz__label">{t.soalDari}</span>
          <Chips
            label={t.soalDari}
            nilai={v.pengaturan.sumber}
            jalan={bisa}
            onPilih={(s) =>
              atur({
                sumber: s,
                jumlah: Math.min(
                  v.pengaturan.jumlah,
                  s === "semua" ? JUMLAH_BANK : JUMLAH_PER_TIPE,
                ),
              })
            }
            pilihan={[
              { v: "semua" as const, label: t.semuaTipe },
              ...TIPE_SOAL.map((x) => ({ v: x, label: x })),
            ]}
          />
        </div>
        <div className="kz__baris">
          <span className="kz__label">{t.jumlahSoal}</span>
          <Chips
            label={t.jumlahSoal}
            nilai={v.pengaturan.jumlah}
            jalan={bisa}
            onPilih={(n) => atur({ jumlah: n })}
            pilihan={jumlahOpsi.map((n) => ({ v: n, label: String(n) }))}
          />
        </div>
        <div className="kz__baris">
          <span className="kz__label">{t.waktuSoal}</span>
          <Chips
            label={t.waktuSoal}
            nilai={v.pengaturan.detik}
            jalan={bisa}
            onPilih={(n) => atur({ detik: n })}
            pilihan={[10, 15, 20, 30, 45, BATAS_DETIK.max].map((n) => ({ v: n, label: String(n) }))}
          />
        </div>
        <div className="kz__baris">
          <span className="kz__label" id="kz-acak">
            {t.acak}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={v.pengaturan.acak}
            aria-labelledby="kz-acak"
            className="kz__saklar"
            disabled={!bisa}
            onClick={() => atur({ acak: !v.pengaturan.acak })}
          >
            <i />
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------- 3, 2, 1

export function Hitung({ detik, siap }: { detik: number | null; siap: string }) {
  return (
    <div className="kz__hitung">
      <span className="kz__hitung-siap">{siap}</span>
      <b
        key={detik ?? "x"}
        className="kz__hitung-angka"
        data-go={detik && detik > 0 ? undefined : "1"}
      >
        {detik && detik > 0 ? detik : "GO!"}
      </b>
    </div>
  );
}

// ------------------------------------------------------------ question

function Soal({ v, k, t }: Props) {
  const sisa = useDetikSisa(
    v.akhir,
    v.sisa !== null ? v.sisa : null,
    k.sekarang,
    v.fase === "soal",
  );
  const soal = v.soal!;
  const total = v.pengaturan.detik * 1000;
  const sisaMs = sisa === null ? null : sisa * 1000;
  const persen = v.jumlahOnline > 0 ? Math.min(1, v.terjawab / v.jumlahOnline) : 0;

  const lalu = useRef<number | null>(null);
  useEffect(() => {
    if (sisa !== null && sisa <= 5 && sisa > 0 && sisa !== lalu.current && !v.dijeda) bunyi("tik");
    lalu.current = sisa;
  }, [sisa, v.dijeda]);

  return (
    <div className="kz__soal" data-u="besar">
      <header className="kz__kartu kz__soal-kepala">
        <div className="kz__soal-teks">
          <span className="kz__eyebrow">
            {t.soalKe(v.nomor, v.total)} · {soal.tipe}
            {soal.pilihan.length === 2 ? ` · ${t.tipeBenarSalah}` : ""}
          </span>
          <h2>{soal.teks}</h2>
        </div>
        <Cincin
          totalMs={total}
          sisaMs={sisaMs}
          dijeda={v.dijeda}
          detik={sisa}
          kunci={`${v.nomor}-${v.akhir ?? 0}`}
        />
      </header>
      <Pilihan soal={soal} t={t} ukuran="besar" />
      <div className="kz__terjawab" aria-live="polite">
        <div className="kz__terjawab-bar">
          <i style={{ transform: `scaleX(${persen})` }} />
        </div>
        <span>{t.terjawabN(v.terjawab, v.jumlahOnline)}</span>
      </div>
      <Selimut tampil={v.dijeda} kelas="kz__jeda" role="status">
        {t.jeda}
      </Selimut>
    </div>
  );
}

function Buka({ v, t }: Pick<Props, "v" | "t">) {
  const soal = v.soal!;
  const b = v.buka!;
  const totalJawab = b.sebaran.reduce((a, x) => a + x, 0);
  return (
    <div className="kz__soal kz__soal--buka" data-u="besar">
      <header className="kz__kartu kz__soal-kepala">
        <div className="kz__soal-teks">
          <span className="kz__eyebrow">{t.soalKe(v.nomor, v.total)}</span>
          <h2>{soal.teks}</h2>
        </div>
      </header>
      <Pilihan
        soal={soal}
        t={t}
        ukuran="besar"
        benar={b.benar}
        sebaran={b.sebaran}
        totalJawab={Math.max(1, totalJawab)}
      />
      <aside className="kz__kartu kz__penjelasan">
        <span className="kz__eyebrow">{t.penjelasan}</span>
        <p>{b.penjelasan}</p>
        {b.kosong > 0 && (
          <small>
            {t.tidakJawab}: {b.kosong}
          </small>
        )}
      </aside>
    </div>
  );
}

// --------------------------------------------------------- leaderboard

function Papan({ v, t, m }: Pick<Props, "v" | "t" | "m">) {
  const g = v.kelompok.slice(0, 6);
  const puncak = Math.max(1, ...g.map((x) => x.rata));
  return (
    <div className="kz__papan-layar">
      <section className="kz__kartu kz__papan-kartu">
        <h2 className="kz__judul-besar">{t.papanTitle}</h2>
        <DaftarPapan baris={v.papan} m={m} t={t} maks={5} />
      </section>
      {g.length > 0 && (
        <section className="kz__kartu kz__kelompok">
          <h3>{t.kelompokTitle}</h3>
          <ul>
            {g.map((x, i) => (
              <li key={x.kelompok} style={{ ["--i" as string]: i }}>
                <span>{t.rataKelompok(x.kelompok)}</span>
                <i style={{ transform: `scaleX(${x.rata / puncak})` }} />
                <b>
                  <Angka nilai={x.rata} m={m} />
                </b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// -------------------------------------------------------------- podium

function Podium({ v, t, m, ta }: Pick<Props, "v" | "t" | "m"> & { ta: boolean }) {
  useEffect(() => {
    bunyi("juara");
    void rayakan(m, true);
  }, [m]);
  const top = v.papan.slice(0, 3);
  const urutan = [top[1], top[0], top[2]];
  // The next button swaps the podium for each player's final TA score; the swap fades like every other screen.
  return (
    <Fade k={ta ? "ta" : "skor"} className="kz__podium-ganti">
      {ta ? (
        <NilaiTA v={v} t={t} m={m} />
      ) : (
        <PodiumSkor v={v} t={t} m={m} top={top} urutan={urutan} />
      )}
    </Fade>
  );
}

function PodiumSkor({
  v,
  t,
  m,
  top,
  urutan,
}: Pick<Props, "v" | "t" | "m"> & {
  top: LihatHost["papan"];
  urutan: (LihatHost["papan"][number] | undefined)[];
}) {
  return (
    <div className="kz__podium-layar">
      <h2 className="kz__judul-besar">{t.podiumTitle}</h2>
      <div className="kz__podium" data-n={top.length}>
        {urutan.map((b, i) =>
          b ? (
            <div key={b.nim} className="kz__podium-kolom" data-rank={b.peringkat}>
              <div className="kz__podium-orang">
                {b.peringkat === 1 && (
                  <svg
                    className="kz__mahkota"
                    viewBox="0 0 32 24"
                    width="44"
                    height="34"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 20 L5 6 L12 13 L16 2 L20 13 L27 6 L30 20 Z"
                      fill="#f5b544"
                      stroke="#8a5a00"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                <Avatar nim={b.nim} nama={b.nama} ukuran={b.peringkat === 1 ? 64 : 50} />
                <b>{b.nama}</b>
                {b.kelompok !== null && <small>{t.rataKelompok(b.kelompok)}</small>}
              </div>
              <div className="kz__podium-balok" style={{ ["--urut" as string]: i }}>
                <span>{b.peringkat}</span>
                <b>
                  <Angka nilai={b.skor} m={m} durasi={1.6} awal={0} /> <small>{t.skor}</small>
                </b>
              </div>
            </div>
          ) : (
            <div key={`kosong-${i}`} className="kz__podium-kolom kz__podium-kolom--kosong" />
          ),
        )}
      </div>
      {v.papan.length > 3 && (
        <div className="kz__podium-sisa">
          <DaftarPapan baris={v.papan.slice(3)} m={m} t={t} maks={v.papan.length} />
        </div>
      )}
    </div>
  );
}

/** Everyone's final TA score, 0 to 100, from their total points (see lib/kuis/ta.ts). */
function NilaiTA({ v, t, m }: Pick<Props, "v" | "t" | "m">) {
  return (
    <div className="kz__podium-layar kz__ta">
      <h2 className="kz__judul-besar">{t.taTitle}</h2>
      <p className="kz__ta-rumus">{t.taRumus(v.total)}</p>
      <ol className="kz__ta-daftar">
        {v.papan.map((b) => (
          <li key={b.nim} data-top={b.peringkat <= 3 ? b.peringkat : undefined}>
            <span className="kz__papan-rank">{b.peringkat}</span>
            <Avatar nim={b.nim} nama={b.nama} />
            <span className="kz__papan-nama">
              <b>{b.nama}</b>
              {b.kelompok !== null && <small>{t.rataKelompok(b.kelompok)}</small>}
            </span>
            <span className="kz__ta-poin mono">
              {b.skor.toLocaleString()} <small>{t.skor}</small>
            </span>
            <b className="kz__ta-nilai" aria-label={`${t.taNilai} ${nilaiTA(b.skor, v.total)}`}>
              <Angka nilai={nilaiTA(b.skor, v.total)} m={m} durasi={1.1} awal={0} />
            </b>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------ the host

export default function HostLayar(p: Props) {
  const { v, k, t, m } = p;
  const sisaHitung = useDetikSisa(v.akhir, v.sisa, k.sekarang, v.fase === "hitung");
  const lalu = useRef<number | null>(null);
  const [ta, setTa] = useState(false);
  useEffect(() => {
    if (v.fase !== "podium") setTa(false);
  }, [v.fase]);
  useEffect(() => {
    if (v.fase !== "hitung" || sisaHitung === null || sisaHitung === lalu.current) return;
    lalu.current = sisaHitung;
    bunyi(sisaHitung > 0 ? "tik" : "go");
  }, [v.fase, sisaHitung]);

  // Each phase fades out and the next fades in (Fade holds the old one 120 ms); the frame and the bar stay put.
  return (
    <>
      <main className="kz__tubuh" data-fase={v.fase}>
        <Fade k={`${v.fase}-${v.nomor}`} className="kz__tahap">
          {v.fase === "lobi" && <Lobi {...p} />}
          {v.fase === "hitung" && <Hitung detik={sisaHitung} siap={t.siap} />}
          {v.fase === "soal" && v.soal && <Soal {...p} />}
          {v.fase === "buka" && v.soal && v.buka && <Buka v={v} t={t} />}
          {v.fase === "papan" && <Papan v={v} t={t} m={m} />}
          {v.fase === "podium" && <Podium v={v} t={t} m={m} ta={ta} />}
        </Fade>
      </main>
      <Fade k={v.fase} className="kz__aksi-wrap">
        <BilahAksi v={v} k={k} aku={p.aku} t={t} ta={ta} setTa={setTa} />
      </Fade>
    </>
  );
}
