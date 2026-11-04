/**
 * The Oprec switch in the panel header (the mockup's amber "Oprec
 * Disembunyikan" pill, user 2026-10-24): whether visitors, Praktikan and
 * candidates see recruitment at all, whatever the calendar says. The pill is
 * the state; its popover explains it and, for the Ketua and the full rights,
 * flips it behind a confirmation. Every other Panitia member sees the state.
 * POST visibility.
 */
import { useState } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import { CaretDownIcon, EyeIcon, EyeSlashIcon, RocketLaunchIcon } from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost } from "../../../lib/recruitment/client";

const S: Record<
  Lang,
  {
    hidden: string;
    hiddenBody: string;
    shown: string;
    shownPill: string;
    shownTitle: string;
    hiddenTitle: string;
    shownHint: string;
    hideAgain: string;
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
      "Pengunjung, Praktikan dan pendaftar belum melihat apa pun tentang Open Recruitment. Panitia tetap bisa menyiapkan semuanya di sini.",
    shown: "Oprec tampil di web dan mengikuti kalender.",
    shownPill: "Oprec Tampil",
    shownTitle: "Oprec Sedang Tampil",
    hiddenTitle: "Oprec Disembunyikan",
    shownHint: "Pengunjung, Praktikan dan pendaftar melihat Open Recruitment sesuai kalender.",
    hideAgain: "Sembunyikan Lagi",
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
      "Visitors, Praktikan and applicants see nothing about Open Recruitment yet. Panitia can still prepare everything here.",
    shown: "Oprec shows on the web and follows the calendar.",
    shownPill: "Oprec Visible",
    shownTitle: "Oprec Is Visible",
    hiddenTitle: "Oprec Is Hidden",
    shownHint: "Visitors, Praktikan and applicants see Open Recruitment as the calendar says.",
    hideAgain: "Hide Again",
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
    hiddenBody: "访客、学生和报名者暂时看不到任何招新内容。招新委员会仍可在此准备一切。",
    shown: "招新正在网站上显示，并按日历进行。",
    shownPill: "招新已显示",
    shownTitle: "招新正在显示",
    hiddenTitle: "招新已隐藏",
    shownHint: "访客、学生和报名者按日历看到招新内容。",
    hideAgain: "再次隐藏",
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

  const [pop, setPop] = useState(false);
  const Ikon = hidden ? EyeSlashIcon : EyeIcon;
  const tombol = canHide && (
    <button
      type="button"
      className={hidden ? "btn btn--primary btn--block" : "btn btn--inverse btn--block"}
      onClick={() => {
        setPop(false);
        setTanya(true);
      }}
    >
      {hidden ? (
        <RocketLaunchIcon size={18} aria-hidden="true" />
      ) : (
        <EyeSlashIcon size={18} aria-hidden="true" />
      )}
      <span className="btn__label">{hidden ? t.show : t.hideAgain}</span>
    </button>
  );

  return (
    <>
      <RadixPopover.Root open={pop} onOpenChange={setPop}>
        <RadixPopover.Trigger asChild>
          <button type="button" className="rec-oprec" data-on={hidden ? "no" : "yes"}>
            <span className="rec-oprec__dot" />
            <Ikon size={18} aria-hidden="true" />
            <span>{hidden ? t.hidden : t.shownPill}</span>
            <CaretDownIcon size={16} aria-hidden="true" />
          </button>
        </RadixPopover.Trigger>
        <RadixPopover.Portal>
          <RadixPopover.Content
            className="popover__panel rec-oprec__pop"
            aria-label={hidden ? t.hiddenTitle : t.shownTitle}
            align="end"
            sideOffset={10}
            collisionPadding={12}
          >
            <div className="stack stack--sm">
              <b>{hidden ? t.hiddenTitle : t.shownTitle}</b>
              <span className="hint">{hidden ? t.hiddenBody : t.shownHint}</span>
              {tombol}
            </div>
          </RadixPopover.Content>
        </RadixPopover.Portal>
      </RadixPopover.Root>
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
