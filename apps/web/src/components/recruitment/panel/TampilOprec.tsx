/**
 * Sembunyikan Oprec on Ringkasan (user, 2026-10-24): whether visitors,
 * Praktikan and candidates see recruitment at all, whatever the calendar
 * says. The Ketua and the full rights flip it, behind a confirmation; every
 * other Panitia member sees the state. POST visibility.
 */
import { useState } from "react";
import Dialog from "../../ui/Dialog";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost } from "../../../lib/recruitment/client";

const S: Record<
  Lang,
  {
    hidden: string;
    hiddenBody: string;
    shown: string;
    hide: string;
    show: string;
    hideTitle: string;
    hideBody: string;
    showTitle: string;
    showBody: string;
    cancel: string;
    fail: string;
  }
> = {
  id: {
    hidden: "Oprec Disembunyikan",
    hiddenBody:
      "Pengunjung, Praktikan dan pendaftar tidak melihat apa pun tentang Open Recruitment, walau kalender sudah membuka pendaftaran. Panitia tetap bisa menyiapkan semuanya di sini.",
    shown: "Oprec tampil di web dan mengikuti kalender.",
    hide: "Sembunyikan Oprec",
    show: "Tampilkan Oprec",
    hideTitle: "Sembunyikan Oprec?",
    hideBody:
      "Banner di Home, halaman pendaftaran dan semua akses pendaftar hilang untuk semua orang selain Asisten, sampai ditampilkan lagi.",
    showTitle: "Tampilkan Oprec?",
    showBody:
      "Open Recruitment kembali tampil untuk semua orang, dan pendaftaran mengikuti tanggal di kalender.",
    cancel: "Batal",
    fail: "Gagal menyimpan. Coba lagi, ya.",
  },
  en: {
    hidden: "Oprec Is Hidden",
    hiddenBody:
      "Visitors, Praktikan and applicants see nothing of Open Recruitment, even when the calendar opens registration. The Panitia can still prepare everything here.",
    shown: "Oprec shows on the web and follows the calendar.",
    hide: "Hide Oprec",
    show: "Show Oprec",
    hideTitle: "Hide Oprec?",
    hideBody:
      "The Home banner, the registration page and every applicant's access disappear for everyone but the Asisten, until it is shown again.",
    showTitle: "Show Oprec?",
    showBody: "Open Recruitment shows for everyone again, and registration follows the calendar.",
    cancel: "Cancel",
    fail: "Couldn't save. Please try again.",
  },
  zh: {
    hidden: "招新已隐藏",
    hiddenBody:
      "访客、学生和报名者看不到任何招新内容，即使日历已开放报名。招新委员会仍可在此准备一切。",
    shown: "招新正在网站上显示，并按日历进行。",
    hide: "隐藏招新",
    show: "显示招新",
    hideTitle: "隐藏招新？",
    hideBody: "首页横幅、报名页面及所有报名者的访问都会对助教以外的人消失，直到再次显示。",
    showTitle: "显示招新？",
    showBody: "招新将再次对所有人显示，报名按日历日期进行。",
    cancel: "取消",
    fail: "保存失败，请再试一次。",
  },
};

export default function TampilOprec({
  lang,
  hidden,
  canHide,
  onChanged,
}: {
  lang: Lang;
  hidden: boolean;
  canHide: boolean;
  onChanged: () => void;
}) {
  const t = S[lang];
  const [tanya, setTanya] = useState(false);
  const [busy, setBusy] = useState(false);

  async function ubah() {
    setBusy(true);
    const r = await recPost<{ ok: true; hidden: boolean }>("visibility", { hidden: !hidden });
    setBusy(false);
    if (isFail(r)) {
      window.Toast?.show(t.fail, "danger");
      return;
    }
    setTanya(false);
    onChanged();
  }

  const tombol = canHide && (
    <span>
      <button
        type="button"
        className={hidden ? "btn btn--primary btn--sm" : "btn btn--ghost btn--sm"}
        onClick={() => setTanya(true)}
      >
        {hidden ? t.show : t.hide}
      </button>
    </span>
  );

  return (
    <>
      {hidden ? (
        <div className="rec-note rec-note--warn" role="status">
          <b>{t.hidden}</b>
          <span>{t.hiddenBody}</span>
          {tombol}
        </div>
      ) : (
        <div className="row row--between" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="hint">{t.shown}</span>
          {tombol}
        </div>
      )}
      <Dialog
        open={tanya}
        onOpenChange={setTanya}
        title={hidden ? t.showTitle : t.hideTitle}
        description={hidden ? t.showBody : t.hideBody}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setTanya(false)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className={hidden ? "btn btn--primary" : "btn btn--danger"}
              disabled={busy}
              onClick={() => void ubah()}
            >
              {hidden ? t.show : t.hide}
            </button>
          </>
        }
      />
    </>
  );
}
