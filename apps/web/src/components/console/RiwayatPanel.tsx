/**
 * Riwayat Praktikan (2026-10-06), under Persiapan › Akses Modul: which
 * modules' history the Praktikan who did them can read, and Selesaikan
 * Praktikum. A module's history opens once a later module is open, so the
 * first class of the week can't show its worked journal to the last; the
 * last module's opens only when a Kepala Divisi or Inti (the Jadwal right)
 * finalizes the semester's practicum, which opens all four. It can be undone.
 */
import { useEffect, useState } from "react";
import { CheckCircleIcon, ClockCountdownIcon, FlagCheckeredIcon } from "@phosphor-icons/react";
import Confirm from "../ui/Confirm";
import { dict, getJson, postJson, tanggalPanjang } from "../../lib/app";
import { modulLabel } from "../../lib/labels";
import { useDirektori } from "../../lib/people";
import { riwayatTerbuka } from "../../lib/riwayat";
import { useSiaran } from "../../lib/siaran";
import type { Lang } from "../../lib/kelas";
import TanpaHak, { useBolehJadwal } from "./prep/TanpaHak";

const T = dict({
  id: {
    title: "Riwayat Praktikan",
    sub: "Praktikan yang sudah praktikum bisa membuka lagi modulnya, hanya baca. Riwayat sebuah modul terbuka setelah modul berikutnya dibuka, supaya kelompok yang belum praktikum tidak melihatnya lebih dulu.",
    open: "Terbuka",
    waitNext: (m: string) => `Terbuka saat ${m} dibuka`,
    waitFinal: "Terbuka saat praktikum diselesaikan",
    finalTitle: "Selesaikan Praktikum",
    finalBody:
      "Untuk akhir semester, setelah kelas terakhir Modul 4: membuka riwayat keempat modul, termasuk Modul 4, untuk praktikan yang sudah praktikum.",
    finalBtn: "Selesaikan Praktikum",
    finalDone: (who: string, tgl: string) =>
      `Diselesaikan ${who}, ${tgl}. Riwayat keempat modul terbuka.`,
    undo: "Batalkan",
    confirmTitle: "Selesaikan praktikum semester ini?",
    confirmBody:
      "Riwayat keempat modul langsung terbuka untuk praktikan yang sudah praktikum. Pastikan tidak ada kelas Modul 4 yang belum berjalan. Bisa dibatalkan.",
    confirm: "Selesaikan",
    undoTitle: "Batalkan penyelesaian?",
    undoBody: "Riwayat Modul 4 tertutup lagi; modul lain mengikuti modul yang terbuka.",
    undoConfirm: "Batalkan Penyelesaian",
    done: "Praktikum diselesaikan. Riwayat keempat modul terbuka.",
    undone: "Penyelesaian dibatalkan.",
    fail: "Belum tersimpan. Coba lagi.",
  },
  en: {
    title: "Student History",
    sub: "Students who did a practicum can reopen its module, read only. A module's history opens once the next module opens, so groups who haven't done it can't see it first.",
    open: "Open",
    waitNext: (m: string) => `Opens when ${m} opens`,
    waitFinal: "Opens when the practicum is finished",
    finalTitle: "Finish the Practicum",
    finalBody:
      "For the end of the semester, after the last Module 4 class: opens all four modules' history, Module 4 included, to the students who did them.",
    finalBtn: "Finish the Practicum",
    finalDone: (who: string, tgl: string) =>
      `Finished by ${who}, ${tgl}. All four histories are open.`,
    undo: "Undo",
    confirmTitle: "Finish this semester's practicum?",
    confirmBody:
      "All four modules' history opens right away to the students who did them. Make sure no Module 4 class is still to come. It can be undone.",
    confirm: "Finish",
    undoTitle: "Undo the finish?",
    undoBody: "Module 4's history closes again; the others follow which modules are open.",
    undoConfirm: "Undo the Finish",
    done: "Practicum finished. All four histories are open.",
    undone: "Finish undone.",
    fail: "Not saved. Try again.",
  },
  zh: {
    title: "学员记录",
    sub: "上过实验课的学员可以再打开该模块，只能查看。一个模块的记录要等下一个模块开放后才开放，这样还没上课的小组不会先看到。",
    open: "已开放",
    waitNext: (m: string) => `${m}开放时开放`,
    waitFinal: "实验课结束时开放",
    finalTitle: "结束实验课",
    finalBody:
      "学期结束、模块 4 最后一节课之后使用：为上过课的学员开放全部四个模块的记录，包括模块 4。",
    finalBtn: "结束实验课",
    finalDone: (who: string, tgl: string) => `由 ${who} 于 ${tgl} 结束。四个模块的记录都已开放。`,
    undo: "撤销",
    confirmTitle: "结束本学期的实验课？",
    confirmBody:
      "四个模块的记录会立刻向上过课的学员开放。请确认没有还没上的模块 4 课程。可以撤销。",
    confirm: "结束",
    undoTitle: "撤销结束？",
    undoBody: "模块 4 的记录会重新关闭；其他模块按开放的模块决定。",
    undoConfirm: "撤销结束",
    done: "实验课已结束。四个模块的记录都已开放。",
    undone: "已撤销结束。",
    fail: "没有保存。再试一次。",
  },
});

interface Final {
  semester: string;
  pada: string;
  oleh: string | null;
}

export default function RiwayatPanel({ lang }: { lang: Lang }) {
  const t = T[lang];
  const dir = useDirektori();
  const boleh = useBolehJadwal();
  const [data, setData] = useState<{ final: Final | null; terbuka: number[] } | null>(null);
  const [ask, setAsk] = useState<"final" | "batal" | null>(null);

  const load = () =>
    getJson<{ ok: boolean; final: Final | null; terbuka: number[] }>("/api/session/final")
      .then((d) => d.ok && setData({ final: d.final, terbuka: d.terbuka }))
      .catch(() => {});
  useEffect(() => void load(), []);
  useSiaran(["akses"], load);

  const riwayat = data ? riwayatTerbuka(data.terbuka, !!data.final) : [];

  async function kirim(aktif: boolean) {
    const r = await postJson<{ ok: boolean }>("/api/session/final", { aktif }).catch(() => ({
      ok: false,
    }));
    if (!r.ok) {
      window.Toast?.show(t.fail, "danger");
      return false;
    }
    window.Toast?.show(aktif ? t.done : t.undone, "ok");
    await load();
  }

  return (
    <section className="panel panel--solo riwayat">
      <div className="panel__head">
        <div className="stack stack--sm">
          <h2 className="panel__title">{t.title}</h2>
          <p className="panel__sub">{t.sub}</p>
        </div>
      </div>
      {!data ? (
        <span className="skeleton" style={{ height: 120 }} />
      ) : (
        <>
          <ul className="riwayat__list">
            {[1, 2, 3, 4].map((m) => {
              const buka = riwayat.includes(m);
              return (
                <li key={m} className="riwayat__row" data-open={buka ? "yes" : undefined}>
                  <span className="riwayat__mod">{modulLabel(m, lang)}</span>
                  <span className="riwayat__st">
                    {buka ? (
                      <CheckCircleIcon size={18} aria-hidden="true" />
                    ) : (
                      <ClockCountdownIcon size={18} aria-hidden="true" />
                    )}
                    {buka ? t.open : m >= 4 ? t.waitFinal : t.waitNext(modulLabel(m + 1, lang))}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="riwayat__final">
            <FlagCheckeredIcon size={22} aria-hidden="true" />
            <div className="stack stack--sm grow">
              <b>{t.finalTitle}</b>
              <span className="hint">
                {data.final
                  ? t.finalDone(
                      data.final.oleh ? dir.nama(data.final.oleh) : "?",
                      tanggalPanjang(data.final.pada.slice(0, 10), lang),
                    )
                  : t.finalBody}
              </span>
            </div>
            {boleh &&
              (data.final ? (
                <button type="button" className="btn btn--ghost" onClick={() => setAsk("batal")}>
                  {t.undo}
                </button>
              ) : (
                <button type="button" className="btn btn--primary" onClick={() => setAsk("final")}>
                  {t.finalBtn}
                </button>
              ))}
          </div>
          {!boleh && <TanpaHak lang={lang} />}
        </>
      )}
      <Confirm
        open={ask !== null}
        onOpenChange={(o) => !o && setAsk(null)}
        title={ask === "batal" ? t.undoTitle : t.confirmTitle}
        body={ask === "batal" ? t.undoBody : t.confirmBody}
        confirmLabel={ask === "batal" ? t.undoConfirm : t.confirm}
        tone={ask === "batal" ? "danger" : "primary"}
        lang={lang}
        onConfirm={() => kirim(ask !== "batal")}
      />
    </section>
  );
}
