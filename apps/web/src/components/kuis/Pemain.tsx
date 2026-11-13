/**
 * The Praktikan's screens, made for a phone held in one hand: big colour
 * tiles to answer, a loud right/wrong result, and where you stand.
 */
import { useEffect, useRef, useState } from "react";
import type { LihatPemain } from "../../lib/kuis/engine";
import { warnaUntuk } from "../../lib/kuis/warna";
import type { MotionLevel } from "../recruitment/reveal/fx";
import { bunyi, rayakan } from "./fx";
import { Hitung } from "./Host";
import type { KuisTeks } from "./kuisStrings";
import { Angka, Avatar, Bentuk, Cincin, DaftarPapan, Pilihan, useDetikSisa } from "./parts";
import type { Aku, Kuis } from "./useKuis";

interface Props {
  v: LihatPemain;
  k: Kuis;
  aku: Aku;
  t: KuisTeks;
  m: MotionLevel;
}

function Lobi({ v, aku, t }: Pick<Props, "v" | "aku" | "t">) {
  return (
    <div className="kz__p-tengah">
      <div className="kz__p-avatar">
        <Avatar nim={aku.nim} nama={aku.nama} ukuran={112} />
      </div>
      <h2 className="kz__judul-besar">{t.kamuMasuk}</h2>
      <p className="kz__p-nama">{aku.nama}</p>
      <p className="kz__p-petunjuk">{t.lihatLayar}</p>
      <span className="kz__pil-kecil">{t.pemainN(v.jumlahPemain)}</span>
    </div>
  );
}

function Soal({ v, k, t }: Pick<Props, "v" | "k" | "t">) {
  const soal = v.soal!;
  const [lokal, setLokal] = useState<number | null>(null);
  const pilih = lokal ?? v.pilih;
  const sisa = useDetikSisa(v.akhir, v.sisa, k.sekarang, v.fase === "soal");
  const sisaMs = sisa === null ? null : sisa * 1000;

  // The server said no (too late, already answered): let the tiles come back if it was not an answer.
  const galatN = useRef(k.galat?.n ?? 0);
  useEffect(() => {
    if (k.galat && k.galat.n !== galatN.current) {
      galatN.current = k.galat.n;
      if (k.galat.kode !== "sudah-jawab") setLokal(null);
    }
  }, [k.galat]);

  const jawab = (i: number) => {
    if (pilih !== null) return;
    setLokal(i);
    bunyi("kunci");
    if (typeof navigator !== "undefined") navigator.vibrate?.(30);
    k.kirim({ t: "jawab", pilih: i });
  };

  if (pilih !== null) {
    const w = warnaUntuk(soal.pilihan.length, pilih);
    return (
      <div className="kz__p-tengah kz__p-terkunci">
        <div
          className="kz__p-pilihan-besar"
          style={{ ["--kz-bg" as string]: w.bg, ["--kz-ink" as string]: w.ink }}
        >
          <Bentuk bentuk={w.bentuk} size={46} />
          <span>{soal.pilihan[pilih]}</span>
        </div>
        <h2 className="kz__judul-sedang">{t.terkunci}</h2>
        <p className="kz__p-petunjuk">
          {t.tungguYangLain} <span className="kz__titik" aria-hidden="true" />
        </p>
        <span className="kz__pil-kecil" data-angka="1">
          {sisa ?? "·"}
        </span>
      </div>
    );
  }
  return (
    <div className="kz__p-soal">
      <header className="kz__kartu kz__p-soal-kepala">
        <div>
          <span className="kz__eyebrow">{t.soalKe(v.nomor, v.total)}</span>
          <h2>{soal.teks}</h2>
        </div>
        <Cincin
          totalMs={v.detik * 1000}
          sisaMs={sisaMs}
          dijeda={v.dijeda}
          detik={sisa}
          kunci={`${v.nomor}-${v.akhir ?? 0}`}
        />
      </header>
      <Pilihan soal={soal} t={t} ukuran="ponsel" onPilih={jawab} />
    </div>
  );
}

function Hasil({ v, t, m }: Pick<Props, "v" | "t" | "m">) {
  const h = v.hasil!;
  const soal = v.soal!;
  const jenis = h.pilih === null ? "kosong" : h.benar ? "benar" : "salah";
  useEffect(() => {
    bunyi(jenis === "benar" ? "benar" : jenis === "salah" ? "salah" : "habis");
    if (jenis === "benar") void rayakan(m, false);
    if (jenis !== "benar" && typeof navigator !== "undefined") navigator.vibrate?.([60, 40, 60]);
  }, [jenis, m]);
  const s = v.saya;
  const w = warnaUntuk(soal.pilihan.length, h.benarIndeks);
  return (
    <div className="kz__p-hasil" data-hasil={jenis}>
      <div className="kz__p-hasil-atas">
        <span className="kz__p-ikon" aria-hidden="true">
          {jenis === "benar" ? (
            <svg viewBox="0 0 24 24" width="64" height="64">
              <path
                d="M4 12.5l5 5L20 6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : jenis === "salah" ? (
            <svg viewBox="0 0 24 24" width="64" height="64">
              <path
                d="M5 5l14 14M19 5L5 19"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.4"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="64" height="64">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.8" />
              <path
                d="M12 7v5.5l3.5 2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
            </svg>
          )}
        </span>
        <h2 className="kz__judul-besar">
          {jenis === "benar" ? t.benar : jenis === "salah" ? t.salah : t.waktuHabis}
        </h2>
        {jenis === "benar" && (
          <>
            <b className="kz__p-poin">
              +<Angka nilai={h.poin + h.bonus} m={m} awal={0} />
            </b>
            {h.bonus > 0 && (
              <span className="kz__pil-kecil">{`🔥 ${t.streakN(s?.streak ?? 0)} · +${h.bonus}`}</span>
            )}
          </>
        )}
        {s && (
          <span className="kz__p-rank">
            {t.peringkatN(s.peringkat, v.jumlahPemain)}
            {s.naik !== 0 && (
              <i data-arah={s.naik > 0 ? "naik" : "turun"}>
                {s.naik > 0 ? "▲" : "▼"} {Math.abs(s.naik)}
              </i>
            )}
          </span>
        )}
      </div>
      <aside className="kz__kartu kz__p-penjelasan">
        <span className="kz__eyebrow">{t.jawabanBenar}</span>
        <div
          className="kz__p-benar"
          style={{ ["--kz-bg" as string]: w.bg, ["--kz-ink" as string]: w.ink }}
        >
          <Bentuk bentuk={w.bentuk} size={22} />
          <b>{soal.pilihan[h.benarIndeks]}</b>
        </div>
        <p>{h.penjelasan}</p>
      </aside>
    </div>
  );
}

function Papan({ v, t, m, aku }: Pick<Props, "v" | "t" | "m" | "aku">) {
  const s = v.saya;
  return (
    <div className="kz__p-papan">
      {s && (
        <div className="kz__kartu kz__p-saya">
          <span className="kz__label">{t.papanTitle}</span>
          <b className="kz__p-rank-besar">
            #<Angka nilai={s.peringkat} m={m} />
          </b>
          <span>
            <Angka nilai={s.skor} m={m} /> {t.skor}
          </span>
          {s.naik !== 0 && (
            <i className="kz__p-delta" data-arah={s.naik > 0 ? "naik" : "turun"}>
              {s.naik > 0 ? `▲ ${t.naikN(s.naik)}` : `▼ ${t.turunN(-s.naik)}`}
            </i>
          )}
        </div>
      )}
      <DaftarPapan baris={v.papan} m={m} t={t} saya={aku.nim} maks={5} />
      {s && s.peringkat > 5 && (
        <>
          <span className="kz__p-titik" aria-hidden="true">
            ⋮
          </span>
          <DaftarPapan baris={[s]} m={m} t={t} saya={aku.nim} maks={1} />
        </>
      )}
    </div>
  );
}

function Podium({ v, t, m, aku }: Pick<Props, "v" | "t" | "m" | "aku">) {
  const s = v.saya;
  const juara = !!s && s.peringkat <= 3;
  useEffect(() => {
    bunyi(juara ? "juara" : "masuk");
    if (juara) void rayakan(m, true);
  }, [juara, m]);
  return (
    <div className="kz__p-tengah">
      <h2 className="kz__judul-besar">{s && juara ? t.juaraN(s.peringkat) : t.podiumTitle}</h2>
      {s && (
        <>
          <b className="kz__p-rank-besar">
            #<Angka nilai={s.peringkat} m={m} awal={0} />
          </b>
          <span className="kz__p-poin-akhir">
            <Angka nilai={s.skor} m={m} awal={0} durasi={1.4} /> {t.skor}
          </span>
        </>
      )}
      <DaftarPapan baris={v.papan} m={m} t={t} saya={aku.nim} maks={3} />
    </div>
  );
}

export default function PemainLayar(p: Props) {
  const { v, k, t, m, aku } = p;
  const sisaHitung = useDetikSisa(v.akhir, v.sisa, k.sekarang, v.fase === "hitung");
  const lalu = useRef<number | null>(null);
  useEffect(() => {
    if (v.fase !== "hitung" || sisaHitung === null || sisaHitung === lalu.current) return;
    lalu.current = sisaHitung;
    bunyi(sisaHitung > 0 ? "tik" : "go");
  }, [v.fase, sisaHitung]);

  return (
    <>
      <div className="kz__p-bar">
        <Avatar nim={aku.nim} nama={aku.nama} ukuran={30} />
        <b>{aku.nama}</b>
        {v.saya && (
          <span className="kz__pil-kecil">
            <Angka nilai={v.saya.skor} m={m} durasi={0.6} /> {t.skor}
          </span>
        )}
      </div>
      <main
        className="kz__tubuh kz__tubuh--p"
        data-fase={v.fase}
        key={`${v.fase}-${v.nomor}`}
        data-anim={m === "reduce" ? undefined : "1"}
      >
        {v.fase === "lobi" && <Lobi v={v} aku={aku} t={t} />}
        {v.fase === "hitung" && <Hitung detik={sisaHitung} siap={t.siap} />}
        {v.fase === "soal" && v.soal && <Soal v={v} k={k} t={t} />}
        {v.fase === "buka" && v.soal && v.hasil && <Hasil v={v} t={t} m={m} />}
        {v.fase === "papan" && <Papan v={v} t={t} m={m} aku={aku} />}
        {v.fase === "podium" && <Podium v={v} t={t} m={m} aku={aku} />}
      </main>
    </>
  );
}
