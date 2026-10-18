/**
 * Akun › Hak Saya: the signed-in Asisten's own rights in plain words, where
 * each comes from (Inti, the division, the DEV badge, the Kepala position or
 * an Admin's override), and every change an Admin made to them.
 */
import { useEffect, useState } from "react";
import Pill from "../ui/Pill";
import { dict, getJson, jamMenit, tanggalPanjang, type Me } from "../../lib/app";
import { HAK, asalHak, perubahanHak, type AsalHak, type HakKey, type UbahHak } from "../../lib/hak";
import type { Lang } from "../../lib/kelas";
import { useDirektori } from "../../lib/people";
import { useSiaran } from "../../lib/siaran";

const T = dict({
  id: {
    judul: "Hak Saya",
    sub: "Apa yang bisa kamu ubah di IRIS, dan dari mana hak itu datang.",
    nama: {
      own: "Slot Sendiri",
      pair: "Pasangan",
      jadwal: "Jadwal",
      server: "Kendali Server",
      full: "Server Lengkap",
      tim: "Tim",
      kode: "Kode Jurnal",
      lms: "LMS",
      hadir: "Kehadiran",
      audit: "Audit",
    } as Record<HakKey, string>,
    isi: {
      own: "Memulai dan mengakhiri slotmu sendiri, menilai kelompokmu, menulis laporan",
      pair: "Memulai slot mana pun, mengganti asisten kelompok saat sesi, membuat Susulan",
      jadwal: "Jadwal, Akses Modul, Ringkasan Modul, Presentasi, Skema, Buat Soal TP, Mode TOT",
      server: "Layanan, perintah, mulai ulang, diagnosis",
      full: "Tampilan Lengkap, Pengaturan, hasil perintah, Sumber SeeLabs, Sambungan LMS",
      tim: "Orang, jabatan, hak, pembayaran",
      kode: "Berkas kode jurnal dan celahnya",
      lms: "Mengubah LMS: tugas TP, Isi Kelas, pengumuman, kalender, nilai",
      hadir: "Kehadiran dan potongan Rp semua orang, tindakan PJ di semua slot",
      audit: "Tab Audit, riwayat dan hak orang lain, riwayat perubahan nilai",
    } as Record<HakKey, string>,
    ya: "Ya",
    tidak: "Tidak",
    slotmu: "Slotmu",
    asal: {
      inti: "dari Inti",
      pencipta: "dari lencana Pencipta",
      kepala: "dari jabatan Kepala",
      divisi: (d: string) => `dari Divisi ${d}`,
      dev: "dari lencana DEV",
      admin: "diberi Admin",
    },
    minta: "Butuh hak lain? Minta ke Admin. Setiap perubahan hakmu tercatat di bawah.",
    riwayat: "Riwayat Hak",
    kosong: "Hakmu belum pernah diubah Admin.",
    ubah: (hak: string, jadi: boolean | null, oleh: string) =>
      jadi === null
        ? `${hak} kembali ke bawaan oleh ${oleh}`
        : jadi
          ? `${hak} diberi oleh ${oleh}`
          : `${hak} dicabut oleh ${oleh}`,
  },
  en: {
    judul: "My Rights",
    sub: "What you can change in IRIS, and where each right comes from.",
    nama: {
      own: "Own Slot",
      pair: "Pairing",
      jadwal: "Schedule",
      server: "Server Control",
      full: "Full Server",
      tim: "Team",
      kode: "Journal Code",
      lms: "LMS",
      hadir: "Attendance",
      audit: "Audit",
    },
    isi: {
      own: "Start and end your own slot, score your groups, write reports",
      pair: "Start any slot, change a group's Asisten in a session, make a Susulan",
      jadwal: "Schedule, Module Access, Module Brief, Slides, Schematics, TP Questions, Mode TOT",
      server: "Services, commands, restarts, diagnosis",
      full: "Full view, Settings, command output, SeeLabs Source, LMS Connection",
      tim: "People, positions, rights, payments",
      kode: "The journal code files and their blanks",
      lms: "Change the LMS: TP assignments, class content, announcements, calendar, grades",
      hadir: "Everyone's attendance and Rp cuts, the PJ's actions on every slot",
      audit: "The Audit tab, other people's trails and rights, the score change log",
    },
    ya: "Yes",
    tidak: "No",
    slotmu: "Your Slot",
    asal: {
      inti: "from Inti",
      pencipta: "from the Pencipta badge",
      kepala: "from the Head position",
      divisi: (d: string) => `from the ${d} division`,
      dev: "from the DEV badge",
      admin: "given by an Admin",
    },
    minta: "Need another right? Ask an Admin. Every change to your rights is listed below.",
    riwayat: "Rights Trail",
    kosong: "No Admin has changed your rights yet.",
    ubah: (hak: string, jadi: boolean | null, oleh: string) =>
      jadi === null
        ? `${hak} back to the default, by ${oleh}`
        : jadi
          ? `${hak} given by ${oleh}`
          : `${hak} taken away by ${oleh}`,
  },
  zh: {
    judul: "我的权限",
    sub: "你在 IRIS 中可以修改什么，以及每项权限的来源。",
    nama: {
      own: "自己的时段",
      pair: "搭配",
      jadwal: "课表",
      server: "服务器控制",
      full: "完整服务器",
      tim: "团队",
      kode: "实验报告代码",
      lms: "LMS",
      hadir: "出勤",
      audit: "Audit",
    },
    isi: {
      own: "开始和结束自己的时段，给自己的组打分，写报告",
      pair: "开始任何时段，上课时更换组的助教，安排 Susulan",
      jadwal: "课表、模块权限、模块概要、幻灯片、电路图、预习题目、TOT 模式",
      server: "服务、命令、重启、诊断",
      full: "完整视图、设置、命令输出、SeeLabs 来源、LMS 连接",
      tim: "人员、职位、权限、付款",
      kode: "实验报告代码文件及其填空",
      lms: "修改 LMS：TP 作业、课程内容、公告、日历、成绩",
      hadir: "所有人的出勤和 Rp 扣款，在所有时段执行 PJ 操作",
      audit: "Audit 标签、他人的记录和权限、成绩修改记录",
    },
    ya: "是",
    tidak: "否",
    slotmu: "你的时段",
    asal: {
      inti: "来自 Inti",
      pencipta: "来自创建者徽章",
      kepala: "来自主管职位",
      divisi: (d: string) => `来自 ${d} 部门`,
      dev: "来自 DEV 徽章",
      admin: "由管理员授予",
    },
    minta: "需要其他权限？请向管理员申请。你的权限每次变更都列在下面。",
    riwayat: "权限记录",
    kosong: "管理员还没有修改过你的权限。",
    ubah: (hak: string, jadi: boolean | null, oleh: string) =>
      jadi === null
        ? `${hak} 由 ${oleh} 恢复为默认`
        : jadi
          ? `${hak} 由 ${oleh} 授予`
          : `${hak} 被 ${oleh} 取消`,
  },
});

interface Jejak {
  pada: string;
  aktorNim: string;
  aksi: string;
  detail: string | null;
}

/** A timestamp's date in the lab's timezone, written out in full. */
const tgl = (ts: string, lang: Lang) =>
  tanggalPanjang(new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }), lang);

export default function HakSaya({ lang, me }: { lang: Lang; me: Me }) {
  const t = T[lang];
  const dir = useDirektori();
  const [ubah, setUbah] = useState<UbahHak[] | null>(null);

  const muat = () => {
    void getJson<{ ok: boolean; jejak?: Jejak[] }>(
      `/api/session/tim?nim=${encodeURIComponent(me.nim)}`,
    )
      .then((d) => setUbah(perubahanHak(d.jejak ?? [])))
      .catch(() => setUbah([]));
  };
  useEffect(muat, [me.nim]);
  useSiaran(["tim"], muat);

  const orang = { tier: me.tier ?? "asisten", badges: me.badges ?? [], divisi: me.kodeDivisi };
  const asalTeks = (a: AsalHak | null) =>
    a === null ? "" : a === "divisi" ? t.asal.divisi(me.kodeDivisi ?? "") : t.asal[a];

  return (
    <section className="panel hak-saya">
      <div className="panel__head">
        <h2 className="panel__title">{t.judul}</h2>
        <span className="hint">{t.sub}</span>
      </div>
      <ul className="hak-saya__list">
        {HAK.map((k) => {
          const v = me.hak?.[k] ?? false;
          const asal = asalTeks(asalHak(orang, k, v));
          return (
            <li key={k} className="hak-saya__row" data-on={v ? "yes" : "no"}>
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <b>{t.nama[k]}</b>
                <span className="hint">{t.isi[k]}</span>
              </span>
              <span className="hak-saya__v">
                <Pill tone={v ? "ok" : undefined}>
                  {v === "own" ? t.slotmu : v ? t.ya : t.tidak}
                </Pill>
                {asal && <span className="hint">{asal}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="hint">{t.minta}</p>
      <h3 className="label-caps">{t.riwayat}</h3>
      {ubah === null ? (
        <span className="skeleton" style={{ height: 44 }} />
      ) : ubah.length === 0 ? (
        <span className="hint">{t.kosong}</span>
      ) : (
        <ul className="hak-saya__trail">
          {ubah.map((u) => (
            <li key={`${u.pada}${u.key}`}>
              <span className="mono hint">
                {tgl(u.pada, lang)} {jamMenit(u.pada, lang)}
              </span>
              <span>{t.ubah(t.nama[u.key], u.jadi, dir.nama(u.oleh))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
