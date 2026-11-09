/**
 * Hak Akses (user, 2026-11-09): who holds which recruitment right, under the
 * Panitia board. One switch opens every right to every active Asisten; the
 * matrix sets, per right, which roles hold it (the seven divisions and an
 * Asisten with no seat). Everyone on the Panitia can read it; only the Ketua
 * and the Pencipta can change it (the server checks again). The switch saves
 * at once behind a confirmation, the matrix saves with Simpan.
 * GET rights-config, POST rights-save | rights-reset.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowCounterClockwiseIcon, LockSimpleIcon } from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import { Checkbox, Switch } from "../../ui/Controls";
import Skeleton from "../../ui/Skeleton";
import { dict } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost, useRecHak } from "../../../lib/recruitment/client";
import { PERAN, type HakConfig, type Peran } from "../../../lib/recruitment/rights";
import { RIGHTS_KEYS, type RecRights } from "../../../lib/recruitment/types";
import { PN } from "./panelStrings";

const T = dict({
  id: {
    title: "Hak Akses",
    lead: "Atur siapa yang boleh melakukan apa di Oprec. Hanya Ketua dan Pencipta yang bisa mengubahnya.",
    viewOnly: "Kamu hanya bisa melihat. Ketua atau Pencipta yang mengubahnya.",
    all: "Semua Asisten dapat semua akses",
    allHint:
      "Kalau menyala, setiap Asisten aktif boleh melakukan semuanya di Oprec, punya kursi atau tidak. Tabel di bawah tetap tersimpan, tapi tidak dipakai selama ini menyala.",
    allOnTitle: "Nyalakan akses penuh untuk semua Asisten?",
    allOnBody:
      "Mulai sekarang setiap Asisten aktif bisa melakukan semua hal di Oprec, termasuk mengatur kursi Panitia dan kursi Ketua. Kamu bisa mematikannya lagi kapan saja.",
    allOffTitle: "Matikan akses penuh?",
    allOffBody: "Hak setiap orang kembali mengikuti tabel di bawah.",
    allOn: "Nyalakan",
    allOff: "Matikan",
    ignored: "Tabel ini tidak dipakai selama akses penuh menyala.",
    feature: "Fitur",
    noSeat: "Tanpa kursi",
    custom: "Sudah diubah dari bawaan",
    isDefault: "Masih memakai bawaan",
    save: "Simpan",
    discard: "Batalkan",
    reset: "Kembalikan ke Bawaan",
    resetTitle: "Kembalikan ke bawaan?",
    resetBody: "Tabel hak kembali seperti aslinya dan akses penuh dimatikan.",
    cancel: "Batal",
    saved: "Hak akses tersimpan.",
    fail: "Belum bisa menyimpan. Coba lagi.",
    noRight: "Hanya Ketua dan Pencipta yang bisa mengubah ini.",
    unsaved: "Ada perubahan yang belum disimpan.",
    rights: {
      calendar: "Atur kalender",
      board: "Atur kursi Panitia",
      seatKetua: "Atur kursi Ketua",
      candidates: "Lihat daftar kandidat",
      documents: "Baca berkas dan kontak kandidat",
      approve: "Setujui atau minta perbaikan berkas",
      bank: "Bank Soal dan jawaban mentah",
      plotting: "Atur ruang dan slot (Plotting)",
      plotPengawas: "Atur pengawas tiap malam tes",
      cuttingPropose: "Usulkan Lolos atau Gagal",
      cuttingLock: "Kunci dan buka kunci Cutting",
      attendance: "Catat kehadiran (QR dan manual)",
      kitLoans: "Pinjaman kit ESP32",
      accept: "Penerimaan (Jadikan Asisten)",
    } as Record<keyof RecRights, string>,
    cell: (f: string, r: string) => `${f} untuk ${r}`,
  },
  en: {
    title: "Access Rights",
    lead: "Choose who may do what in Oprec. Only the Ketua and the Pencipta can change it.",
    viewOnly: "You can only look. The Ketua or the Pencipta changes it.",
    all: "Every Asisten gets full access",
    allHint:
      "When on, every active Asisten may do everything in Oprec, seated or not. The table below stays saved, but isn't used while this is on.",
    allOnTitle: "Turn on full access for every Asisten?",
    allOnBody:
      "From now on every active Asisten can do everything in Oprec, including seating the Panitia and the Ketua. You can turn it off again any time.",
    allOffTitle: "Turn off full access?",
    allOffBody: "Everyone's rights go back to following the table below.",
    allOn: "Turn On",
    allOff: "Turn Off",
    ignored: "This table isn't used while full access is on.",
    feature: "Feature",
    noSeat: "No seat",
    custom: "Changed from the default",
    isDefault: "Still the default",
    save: "Save",
    discard: "Discard",
    reset: "Reset to Default",
    resetTitle: "Reset to the default?",
    resetBody: "The table goes back to the original and full access is turned off.",
    cancel: "Cancel",
    saved: "Access rights saved.",
    fail: "Couldn't save. Please try again.",
    noRight: "Only the Ketua and the Pencipta can change this.",
    unsaved: "You have changes that aren't saved yet.",
    rights: {
      calendar: "Edit the calendar",
      board: "Seat the Panitia",
      seatKetua: "Seat the Ketua",
      candidates: "See the candidate list",
      documents: "Read Berkas and candidate contacts",
      approve: "Approve or send back documents",
      bank: "Question bank and raw answers",
      plotting: "Plot rooms and slots (Plotting)",
      plotPengawas: "Plot pengawas for each test night",
      cuttingPropose: "Propose Lolos or Gagal",
      cuttingLock: "Lock and unlock Cutting",
      attendance: "Mark attendance (QR and manual)",
      kitLoans: "ESP32 kit loans",
      accept: "Penerimaan (Jadikan Asisten)",
    } as Record<keyof RecRights, string>,
    cell: (f: string, r: string) => `${f} for ${r}`,
  },
  zh: {
    title: "访问权限",
    lead: "设置谁可以在招新中做什么。只有 Ketua 和 Pencipta 可以修改。",
    viewOnly: "你只能查看。由 Ketua 或 Pencipta 修改。",
    all: "所有助教拥有全部权限",
    allHint:
      "开启后，每位在职助教都可以在招新中做任何事，无论是否有职位。下方表格会保留，但开启期间不起作用。",
    allOnTitle: "为所有助教开启全部权限？",
    allOnBody:
      "从现在起，每位在职助教都能在招新中做任何事，包括安排委员会和 Ketua 的职位。你可以随时再关闭。",
    allOffTitle: "关闭全部权限？",
    allOffBody: "每个人的权限将重新按下方表格执行。",
    allOn: "开启",
    allOff: "关闭",
    ignored: "全部权限开启期间，此表不起作用。",
    feature: "功能",
    noSeat: "无职位",
    custom: "已修改默认设置",
    isDefault: "仍为默认设置",
    save: "保存",
    discard: "放弃",
    reset: "恢复默认",
    resetTitle: "恢复默认设置？",
    resetBody: "表格恢复原样，并关闭全部权限。",
    cancel: "取消",
    saved: "访问权限已保存。",
    fail: "暂时无法保存，请再试一次。",
    noRight: "只有 Ketua 和 Pencipta 可以修改。",
    unsaved: "有尚未保存的修改。",
    rights: {
      calendar: "编辑日历",
      board: "安排招新委员会",
      seatKetua: "安排 Ketua 职位",
      candidates: "查看候选人名单",
      documents: "查看材料和候选人联系方式",
      approve: "通过或退回材料",
      bank: "题库和原始答案",
      plotting: "安排考场和时段 (Plotting)",
      plotPengawas: "安排每晚考试的监考",
      cuttingPropose: "提议通过或淘汰",
      cuttingLock: "锁定和解锁 Cutting",
      attendance: "记录出勤（二维码和手动）",
      kitLoans: "ESP32 套件借用",
      accept: "录取 (成为助教)",
    } as Record<keyof RecRights, string>,
    cell: (f: string, r: string) => `${r}：${f}`,
  },
});

const sama = (a: HakConfig, b: HakConfig) =>
  a.semua === b.semua &&
  RIGHTS_KEYS.every(
    (k) =>
      a.peran[k].length === b.peran[k].length && a.peran[k].every((p) => b.peran[k].includes(p)),
  );

export default function HakAkses({ lang }: { lang: Lang }) {
  const t = T[lang];
  const nama = PN[lang].division;
  const hak = useRecHak(true);
  const data = hak.data;
  const [draf, setDraf] = useState<HakConfig | null>(null);
  const [tanya, setTanya] = useState<"nyala" | "mati" | "reset" | null>(null);
  const [sibuk, setSibuk] = useState(false);

  // The draft follows the server until the person starts editing the matrix.
  useEffect(() => setDraf(null), [data?.config]);
  const kotor = useMemo(() => !!draf && !!data && !sama(draf, data.config), [draf, data]);
  const aktif = draf ?? data?.config ?? null;

  if (!data || !aktif) return <Skeleton height={220} />;
  const bisa = data.canManage;

  function ubahSel(k: keyof RecRights, p: Peran, v: boolean) {
    const dasar = draf ?? data!.config;
    const daftar = v ? [...dasar.peran[k], p] : dasar.peran[k].filter((x) => x !== p);
    setDraf({ ...dasar, peran: { ...dasar.peran, [k]: [...new Set(daftar)] } });
  }

  async function simpan(config: HakConfig) {
    setSibuk(true);
    const r = await recPost<{ ok: true }>("rights-save", {
      semua: config.semua,
      peran: config.peran,
    });
    setSibuk(false);
    if (isFail(r)) {
      window.Toast?.show(r.kode === "tanpa_hak" ? t.noRight : t.fail, "danger");
      return false;
    }
    window.Toast?.show(t.saved, "ok");
    setDraf(null);
    hak.refresh();
    return true;
  }

  async function setelSemua() {
    // The switch keeps the saved table as it is; unsaved edits wait for Simpan.
    const ok = await simpan({ ...data!.config, semua: tanya === "nyala" });
    if (ok) setTanya(null);
  }

  async function kembalikan() {
    setSibuk(true);
    const r = await recPost<{ ok: true }>("rights-reset");
    setSibuk(false);
    if (isFail(r)) {
      window.Toast?.show(r.kode === "tanpa_hak" ? t.noRight : t.fail, "danger");
      return;
    }
    window.Toast?.show(t.saved, "ok");
    setTanya(null);
    setDraf(null);
    hak.refresh();
  }

  return (
    <section className="panel rec-hak" aria-labelledby="rec-hak-t">
      <div className="panel__head">
        <h2 className="panel__title" id="rec-hak-t">
          {t.title}
        </h2>
        <span className="hint">{data.custom ? t.custom : t.isDefault}</span>
      </div>
      <p className="hint">{bisa ? t.lead : t.viewOnly}</p>

      <div className="rec-hak__all">
        <Switch
          on={data.config.semua}
          onChange={(v) => setTanya(v ? "nyala" : "mati")}
          label={t.all}
          showLabel
          disabled={!bisa || sibuk}
        />
        <span className="hint">{t.allHint}</span>
      </div>

      <div className="rec-hak__scroll" data-off={data.config.semua ? "yes" : undefined}>
        <table className="rec-hak__table">
          <thead>
            <tr>
              <th scope="col" className="rec-hak__feat">
                {t.feature}
              </th>
              {PERAN.map((p) => (
                <th scope="col" key={p}>
                  {p === "tanpa" ? t.noSeat : nama[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RIGHTS_KEYS.map((k) => (
              <tr key={k}>
                <th scope="row" className="rec-hak__feat">
                  {t.rights[k]}
                </th>
                {PERAN.map((p) => (
                  <td key={p}>
                    <Checkbox
                      checked={aktif.peran[k].includes(p)}
                      onChange={(v) => ubahSel(k, p, v)}
                      label=""
                      ariaLabel={t.cell(t.rights[k], p === "tanpa" ? t.noSeat : nama[p])}
                      disabled={!bisa || sibuk}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.config.semua && <p className="hint">{t.ignored}</p>}

      {bisa ? (
        <div className="rec-hak__bar">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={sibuk || (!data.custom && !kotor)}
            onClick={() => setTanya("reset")}
          >
            <ArrowCounterClockwiseIcon size={18} aria-hidden="true" />
            <span className="btn__label">{t.reset}</span>
          </button>
          <span className="rec-hak__gap" />
          {kotor && <span className="hint">{t.unsaved}</span>}
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!kotor || sibuk}
            onClick={() => setDraf(null)}
          >
            <span className="btn__label">{t.discard}</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!kotor || sibuk}
            onClick={() => void simpan(draf!)}
          >
            <span className="btn__label">{t.save}</span>
          </button>
        </div>
      ) : (
        <p className="hint rec-hak__lock">
          <LockSimpleIcon size={16} aria-hidden="true" /> {t.noRight}
        </p>
      )}

      <Dialog
        open={tanya === "nyala" || tanya === "mati"}
        onOpenChange={(o) => !o && setTanya(null)}
        title={tanya === "nyala" ? t.allOnTitle : t.allOffTitle}
        description={tanya === "nyala" ? t.allOnBody : t.allOffBody}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setTanya(null)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className={tanya === "nyala" ? "btn btn--danger" : "btn btn--primary"}
              disabled={sibuk}
              onClick={() => void setelSemua()}
            >
              {tanya === "nyala" ? t.allOn : t.allOff}
            </button>
          </>
        }
      />
      <Dialog
        open={tanya === "reset"}
        onOpenChange={(o) => !o && setTanya(null)}
        title={t.resetTitle}
        description={t.resetBody}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setTanya(null)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={sibuk}
              onClick={() => void kembalikan()}
            >
              {t.reset}
            </button>
          </>
        }
      />
    </section>
  );
}
