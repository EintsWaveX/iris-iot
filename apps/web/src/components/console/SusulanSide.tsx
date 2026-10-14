/**
 * The right half of the Konsol's launch card while Susulan is on. A saved
 * draft shows its roster at a glance (each group and its Praktikan); a new
 * susulan shows the other saved drafts to pick from, or the three steps
 * when there are none.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Nil from "../ui/Nil";
import { dict, getJson, namaKelompok, tanggalPanjang } from "../../lib/app";
import { modulLabel } from "../../lib/labels";
import { useSiaran } from "../../lib/siaran";
import type { Lang } from "../../lib/kelas";

export interface DrafSusulan {
  id: number;
  tanggal: string;
  mulai: string;
  modul: number;
  jumlahKelompok: number;
  praktikan: number;
}

interface RosterGet {
  ok: boolean;
  jumlahKelompok: number;
  kelompok: { nomor: number; aktif: boolean; klp: string | null }[];
  anggota: { nim: string; nama: string; nomor: number }[];
}

const T = dict({
  id: {
    roster: "Roster Susulan",
    rosterSub: (n: number, k: number) => `${n} praktikan dalam ${k} kelompok`,
    loading: "Memuat roster…",
    drafts: "Susulan Tersimpan",
    draftsSub: "Pilih salah satu untuk memulainya, atau buat yang baru di kiri.",
    pick: "Pilih",
    steps: "Cara Membuat Susulan",
    step: [
      "Pilih tanggal dan jam mulai di kiri.",
      "Tekan Buat dan Isi Roster, lalu masukkan praktikannya di Persiapan.",
      "Kembali ke sini, pilih susulannya, lalu mulai.",
    ],
  },
  en: {
    roster: "Makeup Roster",
    rosterSub: (n: number, k: number) => `${n} Praktikan in ${k} groups`,
    loading: "Loading the roster…",
    drafts: "Saved Makeup Sessions",
    draftsSub: "Pick one to start it, or make a new one on the left.",
    pick: "Pick",
    steps: "How to Make a Makeup Session",
    step: [
      "Choose the date and start time on the left.",
      "Press Create and Fill the Roster, then add the Praktikan in Preparation.",
      "Come back here, pick the makeup session and start it.",
    ],
  },
  zh: {
    roster: "补课名单",
    rosterSub: (n: number, k: number) => `${k} 个小组共 ${n} 名学生`,
    loading: "正在加载名单…",
    drafts: "已保存的补课",
    draftsSub: "选一个开始，或在左边新建。",
    pick: "选择",
    steps: "如何安排补课",
    step: [
      "在左边选择日期和开始时间。",
      "点创建并填写名单，然后在准备里加入学生。",
      "回到这里，选中补课并开始。",
    ],
  },
});

export default function SusulanSide({
  lang,
  draf,
  drafts,
  onPick,
}: {
  lang: Lang;
  draf: DrafSusulan | null;
  drafts: DrafSusulan[];
  onPick: (id: number) => void;
}) {
  const t = T[lang];
  const [roster, setRoster] = useState<RosterGet | null>(null);

  const muat = (id: number) =>
    getJson<RosterGet>(`/api/session/rosterslot?sesiId=${id}`)
      .then((d) => d.ok && setRoster(d))
      .catch(() => {});
  useEffect(() => {
    setRoster(null);
    if (draf) void muat(draf.id);
  }, [draf?.id]);
  useSiaran(["roster"], () => draf && void muat(draf.id), draf !== null);

  // A saved draft: its roster, group by group
  if (draf) {
    return (
      <div className="sside">
        <div className="stack stack--sm">
          <b>{t.roster}</b>
          <span className="hint">
            {tanggalPanjang(draf.tanggal, lang)} · {draf.mulai} · {modulLabel(draf.modul, lang)}
            {" · "}
            {t.rosterSub(draf.praktikan, draf.jumlahKelompok)}
          </span>
        </div>
        {roster === null ? (
          <span className="hint">{t.loading}</span>
        ) : (
          <ul className="sside__groups">
            {Array.from({ length: roster.jumlahKelompok }, (_, i) => i + 1).map((n) => {
              const orang = roster.anggota.filter((a) => a.nomor === n);
              return (
                <li
                  key={n}
                  className="sside__group"
                  style={{ "--g": `var(--group-${n})` } as CSSProperties}
                >
                  <b>{namaKelompok(n)}</b>
                  {orang.length ? (
                    <span className="sside__names">{orang.map((a) => a.nama).join(", ")}</span>
                  ) : (
                    <Nil lang={lang} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // A new susulan: the other saved drafts, or how it works
  if (drafts.length) {
    return (
      <div className="sside">
        <div className="stack stack--sm">
          <b>{t.drafts}</b>
          <span className="hint">{t.draftsSub}</span>
        </div>
        <ul className="sside__drafts">
          {drafts.map((x) => (
            <li key={x.id}>
              <button type="button" className="sside__draft" onClick={() => onPick(x.id)}>
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <b>
                    {tanggalPanjang(x.tanggal, lang)} · {x.mulai}
                  </b>
                  <span className="hint">
                    {modulLabel(x.modul, lang)} · {t.rosterSub(x.praktikan, x.jumlahKelompok)}
                  </span>
                </span>
                <span className="sside__pick">{t.pick}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="sside">
      <b>{t.steps}</b>
      <ol className="sside__steps">
        {t.step.map((s, i) => (
          <li key={s}>
            <span className="num">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
