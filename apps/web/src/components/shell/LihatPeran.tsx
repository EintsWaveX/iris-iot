/**
 * Lihat sebagai Peran (lib/lihat-peran.ts): the account menu's picker of the
 * eight presets, and the bar under the nav while a preview runs.
 */
import { useEffect, useRef, useState } from "react";
import Dialog from "../ui/Dialog";
import { dict, type Me } from "../../lib/app";
import { PRESET_PERAN, type PresetPeran } from "../../lib/hak";
import type { Lang } from "../../lib/kelas";
import { mulaiLihatPeran, selesaiLihatPeran } from "../../lib/lihat-peran";
import "./LihatPeran.css";

export const LP = dict({
  id: {
    baris: "Lihat sebagai Peran",
    judul: "Lihat sebagai Peran",
    desc: "Pratinjau hanya untuk melihat. Kembali kapan saja dari bilah di atas.",
    peran: "Peran",
    batal: "Batal",
    lihat: "Lihat",
    nama: {
      anggota: "Anggota",
      aso: "ASO",
      ads: "ADS",
      arm: "ARM",
      kepala: "Kepala",
      "kepala-arm": "Kepala ARM",
      dev: "DEV",
      admin: "Admin",
    } as Record<PresetPeran, string>,
    ket: {
      anggota: "Anggota ADC, ARD atau AER",
      aso: "Anggota ASO",
      ads: "Anggota ADS",
      arm: "Anggota ARM",
      kepala: "Kepala Divisi selain ARM",
      "kepala-arm": "Kepala Divisi ARM",
      dev: "Anggota dengan lencana DEV",
      admin: "Inti: Koordinator, Wakil, Sekretaris, Bendahara",
    } as Record<PresetPeran, string>,
    bar: "Melihat sebagai",
    barHint: "Hanya melihat, tidak ada yang tersimpan.",
    kembali: "Kembali",
    wilayah: "Pratinjau peran",
  },
  en: {
    baris: "View as a Role",
    judul: "View as a Role",
    desc: "The preview is view only. Go back any time from the bar on top.",
    peran: "Role",
    batal: "Cancel",
    lihat: "View",
    nama: {
      anggota: "Member",
      aso: "ASO",
      ads: "ADS",
      arm: "ARM",
      kepala: "Head",
      "kepala-arm": "ARM Head",
      dev: "DEV",
      admin: "Admin",
    },
    ket: {
      anggota: "A member of ADC, ARD or AER",
      aso: "An ASO member",
      ads: "An ADS member",
      arm: "An ARM member",
      kepala: "A Division Head other than ARM",
      "kepala-arm": "The ARM Division Head",
      dev: "A member with the DEV badge",
      admin: "Inti: Coordinator, Deputy, Secretary, Treasurer",
    },
    bar: "Viewing as",
    barHint: "View only, nothing is saved.",
    kembali: "Back",
    wilayah: "Role preview",
  },
  zh: {
    baris: "以角色身份查看",
    judul: "以角色身份查看",
    desc: "预览只能查看。随时可以从顶部横条返回。",
    peran: "角色",
    batal: "取消",
    lihat: "查看",
    nama: {
      anggota: "成员",
      aso: "ASO",
      ads: "ADS",
      arm: "ARM",
      kepala: "主管",
      "kepala-arm": "ARM 主管",
      dev: "DEV",
      admin: "管理员",
    },
    ket: {
      anggota: "ADC、ARD 或 AER 的成员",
      aso: "ASO 成员",
      ads: "ADS 成员",
      arm: "ARM 成员",
      kepala: "ARM 以外的部门主管",
      "kepala-arm": "ARM 部门主管",
      dev: "持有 DEV 徽章的成员",
      admin: "Inti：协调人、副协调人、秘书、财务",
    },
    bar: "正在以此身份查看：",
    barHint: "只能查看，不会保存任何内容。",
    kembali: "返回",
    wilayah: "角色预览",
  },
});

/** The picker: one card per preset, then Lihat starts the preview. */
export function LihatPeranDialog({
  lang,
  open,
  onOpenChange,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = LP[lang];
  const [pilih, setPilih] = useState<PresetPeran>("anggota");
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.judul}
      description={t.desc}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.batal}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => mulaiLihatPeran(pilih)}>
            {t.lihat}
          </button>
        </>
      }
    >
      <div className="lperan" role="radiogroup" aria-label={t.peran}>
        {PRESET_PERAN.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            className="lperan__o"
            aria-checked={p === pilih}
            onClick={() => setPilih(p)}
          >
            <b>{t.nama[p]}</b>
            <span className="hint">{t.ket[p]}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/** The bar under the nav on every page while a preview runs. */
export function LihatPeranBar({ lang, me }: { lang: Lang; me: Me }) {
  const t = LP[lang];
  // The page alerts and the Asisten mini bar stick under this bar, not over it.
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = barRef.current;
    const root = document.documentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      root.style.setProperty("--lperan-h", `${el.offsetHeight}px`);
      root.style.setProperty("--minibar-h", `${el.offsetHeight}px`);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--lperan-h", "0px");
      root.style.setProperty("--minibar-h", "0px");
    };
  }, [!!me.lihatPeran]);
  if (!me.lihatPeran) return null;
  return (
    <div ref={barRef} className="lperan-bar" role="region" aria-label={t.wilayah}>
      <span>
        {t.bar} <b>{t.nama[me.lihatPeran]}</b>. {t.barHint}
      </span>
      <button type="button" className="btn btn--sm" onClick={() => selesaiLihatPeran()}>
        {t.kembali}
      </button>
    </div>
  );
}
