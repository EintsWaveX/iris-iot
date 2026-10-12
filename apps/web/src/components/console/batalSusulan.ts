/**
 * Cancelling a Praktikum Susulan draft (2026-10-12): at once, without a
 * question, for a draft made with the wrong date, time or module. The toast
 * carries Urungkan for the wrong pick. Mulai Sesi's susulan form and
 * Persiapan › Roster share it (POST /api/session/susulan, aksi batal and
 * pulihkan; a draft that has started can't be cancelled here).
 */
import { dict, postJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";

export const BS = dict({
  id: {
    cancel: "Batalkan Susulan",
    done: (when: string) => `Susulan ${when} dibatalkan.`,
    undo: "Urungkan",
    undone: "Susulan dipulihkan.",
    fail: "Gagal membatalkan susulan. Coba lagi.",
    undoFail: "Susulan tidak bisa dipulihkan lagi. Buat draf yang baru.",
  },
  en: {
    cancel: "Cancel the Makeup",
    done: (when: string) => `The makeup on ${when} is cancelled.`,
    undo: "Undo",
    undone: "The makeup is back.",
    fail: "Couldn't cancel the makeup. Try again.",
    undoFail: "The makeup can't be brought back now. Make a new draft.",
  },
  zh: {
    cancel: "取消补课",
    done: (when: string) => `${when} 的补课已取消。`,
    undo: "撤销",
    undone: "补课已恢复。",
    fail: "取消补课失败。再试一次。",
    undoFail: "补课无法恢复了。请新建一个草稿。",
  },
});

const kirim = (aksi: "batal" | "pulihkan", id: number) =>
  postJson<{ ok: boolean }>("/api/session/susulan", { aksi, id }).catch(() => ({ ok: false }));

/** Cancels draft `id`; `after(false)` once it is gone, `after(true)` if the
 *  toast's Urungkan brought it back. */
export async function batalSusulan(
  id: number,
  when: string,
  lang: Lang,
  after: (pulih: boolean) => void,
): Promise<void> {
  const t = BS[lang];
  if (!(await kirim("batal", id)).ok) {
    window.Toast?.show(t.fail, "danger");
    return;
  }
  after(false);
  window.Toast?.show(t.done(when), "ok", {
    action: {
      label: t.undo,
      onClick: () =>
        void kirim("pulihkan", id).then((r) => {
          window.Toast?.show(r.ok ? t.undone : t.undoFail, r.ok ? "ok" : "danger");
          if (r.ok) after(true);
        }),
    },
  });
}
