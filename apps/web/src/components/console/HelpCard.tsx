/**
 * "Butuh Bantuan Hari Ini", since Phase 10 rows of the Konsol inbox (Phase 9 Stage 4, mockup
 * c-home HelpCard), from GET /api/session/penugasan:
 *
 * - today's slots with an excused Asisten or an open group: Saya Bantu
 *   sends a Sukarela offer; the slot's Asisten or a Manager confirms. My
 *   offer shows as waiting, accepted (with the SeeLabs Input Jaga reminder)
 *   or declined;
 * - requests to me (someone asked me to cover a group): Terima or Tolak;
 * - offers waiting for me to confirm, on a slot I teach (or any slot with
 *   the Schedule right): Terima or Tolak.
 *
 * Nothing shows when there is nothing to do.
 */
import { useState } from "react";
import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import { dict, getJson, postJson, tanggalPanjang } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import { SLOT_MULAI } from "../../lib/jadwal";
import { hariLabel, kelasLabel, kelompokLabel, slotLabel } from "../../lib/labels";
import type { Kelas, Lang } from "../../lib/kelas";
import type { TugasInfo } from "../../lib/penugasan-minggu";

const B = dict({
  id: {
    title: "Butuh Bantuan Hari Ini",
    volunteer: "Sukarela",
    slotLine: (hari: string, slot: number, kelas: string) => `${hari} · Slot ${slot} · ${kelas}`,
    izin: (who: string) => `${who} izin, belum ada pengganti.`,
    short: (n: number) =>
      n === 1 ? "1 kelompok belum punya asisten." : `${n} kelompok belum punya asisten.`,
    help: "Saya Bantu",
    pending: "Menunggu konfirmasi dari asisten slot atau Pengelola",
    accepted: (shift: number) =>
      `Kamu ikut mengajar sebagai Sukarela. Centang Shift ${shift} di SeeLabs Input Jaga.`,
    declined: (who: string) => `${who} menolak tawaranmu.`,
    withdraw: "Batalkan",
    withdrawn: "Tawaran dibatalkan.",
    askTitle: "Bantu Slot Ini?",
    askBullets: (shift: number) => [
      "Asisten slot ini atau Pengelola mengonfirmasi dulu.",
      "Setelah dikonfirmasi, kamu bisa dipasangkan ke kelompok dan menilai.",
      "Bayarannya sama: satu kelompok yang kamu nilai satu satuan.",
      `Di SeeLabs, centang Shift ${shift} di Input Jaga atau minta token, supaya kelompoknya muncul.`,
    ],
    send: "Kirim Tawaran",
    sent: "Tawaran terkirim ke asisten slot dan Pengelola.",
    cancel: "Batal",
    reqTitle: "Permintaan untukmu",
    reqLine: (who: string, g: string, when: string) =>
      `${who} memintamu menggantikan ${g} · ${when}`,
    offerLine: (who: string) => `${who} menawarkan bantuan`,
    accept: "Terima",
    decline: "Tolak",
    acceptedToast: "Diterima. Jadwal hari ini ikut berubah.",
    declinedToast: "Ditolak.",
    hint: "Sukarela dicatat dan dibayar sama seperti asisten tetap: hadir, pasangan kelompok, nilai, dan Audit.",
    fail: "Tidak bisa sekarang. Coba lagi.",
  },
  en: {
    title: "Help Needed Today",
    volunteer: "Volunteer",
    slotLine: (hari: string, slot: number, kelas: string) => `${hari} · Slot ${slot} · ${kelas}`,
    izin: (who: string) => `${who} is excused, no cover yet.`,
    short: (n: number) =>
      n === 1 ? "1 group has no assistant." : `${n} groups have no assistant.`,
    help: "I'll Help",
    pending: "Waiting for the slot's assistant or a Manager to confirm",
    accepted: (shift: number) =>
      `You're teaching as a Volunteer. Tick Shift ${shift} in SeeLabs Input Jaga.`,
    declined: (who: string) => `${who} declined your offer.`,
    withdraw: "Withdraw",
    withdrawn: "Offer withdrawn.",
    askTitle: "Help in This Slot?",
    askBullets: (shift: number) => [
      "The slot's assistant or a Manager confirms first.",
      "Once confirmed, you can be paired with a group and score it.",
      "Same pay: each group you score is one unit.",
      `In SeeLabs, tick Shift ${shift} in Input Jaga or ask for a token, so the groups show up.`,
    ],
    send: "Send the Offer",
    sent: "Offer sent to the slot's assistants and the Managers.",
    cancel: "Cancel",
    reqTitle: "Requests for you",
    reqLine: (who: string, g: string, when: string) => `${who} asks you to cover ${g} · ${when}`,
    offerLine: (who: string) => `${who} offers to help`,
    accept: "Accept",
    decline: "Decline",
    acceptedToast: "Accepted. Today's schedule follows.",
    declinedToast: "Declined.",
    hint: "Volunteers are recorded and paid like regular assistants: attendance, group pairing, scores and Audit.",
    fail: "Not possible right now. Try again.",
  },
  zh: {
    title: "今天需要帮忙",
    volunteer: "志愿",
    slotLine: (hari: string, slot: number, kelas: string) => `${hari} · 第 ${slot} 节 · ${kelas}`,
    izin: (who: string) => `${who} 请假，还没有人代课。`,
    short: (n: number) => `${n} 个组还没有助教。`,
    help: "我来帮忙",
    pending: "等这个时段的助教或主管确认",
    accepted: (shift: number) =>
      `你以志愿身份上课。在 SeeLabs 的 Input Jaga 里勾上 Shift ${shift}。`,
    declined: (who: string) => `${who} 拒绝了你的请求。`,
    withdraw: "撤回",
    withdrawn: "已撤回。",
    askTitle: "来这个时段帮忙？",
    askBullets: (shift: number) => [
      "先由这个时段的助教或主管确认。",
      "确认后，你可以被分到小组并打分。",
      "报酬一样：你打分的每个组算一个单位。",
      `在 SeeLabs 的 Input Jaga 里勾上 Shift ${shift}，或者申请口令，这样组才会出现。`,
    ],
    send: "发送请求",
    sent: "已发给这个时段的助教和主管。",
    cancel: "取消",
    reqTitle: "给你的请求",
    reqLine: (who: string, g: string, when: string) => `${who} 请你代课${g} · ${when}`,
    offerLine: (who: string) => `${who} 想来帮忙`,
    accept: "接受",
    decline: "拒绝",
    acceptedToast: "已接受。今天的课表跟着更新。",
    declinedToast: "已拒绝。",
    hint: "志愿助教和固定助教一样记录和计酬：出勤、小组配对、分数和审计。",
    fail: "现在不行。再试一次。",
  },
});

interface SlotBantu {
  jadwalId: number;
  hari: number;
  slot: number;
  kelas: Kelas;
  tanggal: string;
  kosong: number[];
  izin: { kode: string; nim: string; status: string }[];
  saya: "diminta" | "diterima" | "ditolak" | null;
  oleh: string | null;
}
type Konteks = { jadwalId: number; hari: number; slot: number; tanggal: string };
interface Penugasan {
  hariIni: string;
  bantu: SlotBantu[];
  permintaan: (TugasInfo & Konteks)[];
  tawaran: (TugasInfo & Konteks)[];
  milikku: (TugasInfo & Konteks)[];
}

/** The offers and requests, polled once for the whole Konsol home. */
export function useBantuan() {
  return usePoll(
    () =>
      getJson<{ ok: boolean } & Penugasan>("/api/session/penugasan").then((d) => (d.ok ? d : null)),
    60_000,
    true,
    ["jadwal", "tim"],
  );
}

export function jumlahBantuan(d: Penugasan | null | undefined): number {
  return d ? d.bantu.length + d.permintaan.length + d.tawaran.length : 0;
}

/**
 * Phase 10 (c11-home): the same help as rows of the Konsol inbox,
 * "Menunggumu": requests to me, offers to confirm, then slots short of an
 * Asisten. Each keeps its own buttons and the ask dialog.
 */
export default function HelpRows({
  lang,
  nama,
  poll,
  onChanged,
  tags,
}: {
  lang: Lang;
  /** "Full Name (CODE)" for a NIM. */
  nama: (nim: string | null) => string;
  poll: ReturnType<typeof useBantuan>;
  onChanged: () => void;
  tags: { bantu: string; minta: string; tawar: string };
}) {
  const t = B[lang];
  const [ask, setAsk] = useState<SlotBantu | null>(null);
  const [busy, setBusy] = useState(false);
  const d = poll.data;
  if (!d || jumlahBantuan(d) === 0) return null;
  const when = (x: Konteks) =>
    `${tanggalPanjang(x.tanggal, lang)} · ${slotLabel(x.slot, lang)} · ${SLOT_MULAI[x.slot]}`;

  async function kirim(body: Record<string, unknown>, ok?: string) {
    setBusy(true);
    try {
      const r = await postJson<{ ok: boolean }>("/api/session/penugasan", body);
      if (!r.ok) throw new Error();
      if (ok) window.Toast?.show(ok, "ok");
      poll.refresh();
      onChanged();
      return true;
    } catch {
      window.Toast?.show(t.fail, "danger");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const answer = (aksi: "jawab" | "konfirmasi", id: number) => (
    <span className="todo10__acts">
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={busy}
        onClick={() => void kirim({ aksi, id, terima: true }, t.acceptedToast)}
      >
        {t.accept}
      </button>
      <button
        type="button"
        className="btn btn--sm"
        disabled={busy}
        onClick={() => void kirim({ aksi, id, terima: false }, t.declinedToast)}
      >
        {t.decline}
      </button>
    </span>
  );

  return (
    <>
      {d.permintaan.map((x) => (
        <li key={`p${x.id}`} className="elog__row todo10__row">
          <span className="elog__tag mono" data-tone="violet">
            {tags.minta}
          </span>
          <span className="elog__text">
            {t.reqLine(nama(x.dimintaOleh), kelompokLabel(x.kelompokNomor ?? 1, lang), when(x))}
          </span>
          {answer("jawab", x.id)}
        </li>
      ))}
      {d.tawaran.map((x) => (
        <li key={`t${x.id}`} className="elog__row todo10__row">
          <span className="elog__tag mono" data-tone="violet">
            {tags.tawar}
          </span>
          <span className="elog__text">
            {t.offerLine(nama(x.nim))} · {when(x)}
          </span>
          {answer("konfirmasi", x.id)}
        </li>
      ))}
      {d.bantu.map((r) => {
        const mine = d.milikku.find((m) => m.jadwalId === r.jadwalId);
        return (
          <li key={`b${r.jadwalId}`} className="elog__row todo10__row">
            <span className="elog__tag mono" data-tone="violet">
              {tags.bantu}
            </span>
            <span className="elog__text">
              {t.slotLine(hariLabel(r.hari, lang), r.slot, kelasLabel(r.kelas, lang))} ·{" "}
              {SLOT_MULAI[r.slot]}.{" "}
              {r.izin.length
                ? t.izin(r.izin.map((x) => nama(x.nim)).join(", "))
                : t.short(r.kosong.length)}
              {r.saya === "diminta" && <span className="todo10__st">{t.pending}</span>}
              {r.saya === "diterima" && (
                <span className="todo10__st">
                  <CheckCircleIcon size={14} aria-hidden="true" /> {t.accepted(r.slot)}
                </span>
              )}
              {r.saya === "ditolak" && (
                <span className="todo10__st" style={{ color: "var(--danger)" }}>
                  <XCircleIcon size={14} aria-hidden="true" /> {t.declined(nama(r.oleh))}
                </span>
              )}
            </span>
            {r.saya === "diminta" && mine ? (
              <span className="todo10__acts">
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={busy}
                  onClick={() => void kirim({ aksi: "batal", id: mine.id }, t.withdrawn)}
                >
                  {t.withdraw}
                </button>
              </span>
            ) : r.saya === null ? (
              <span className="todo10__acts">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => setAsk(r)}
                >
                  {t.help}
                </button>
              </span>
            ) : null}
          </li>
        );
      })}
      <Dialog
        open={!!ask}
        onOpenChange={(o) => !o && setAsk(null)}
        title={t.askTitle}
        description={
          ask
            ? `${hariLabel(ask.hari, lang)} · ${slotLabel(ask.slot, lang)} · ${SLOT_MULAI[ask.slot]}`
            : undefined
        }
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setAsk(null)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={async () => {
                if (ask && (await kirim({ aksi: "bantu", jadwalId: ask.jadwalId }, t.sent)))
                  setAsk(null);
              }}
            >
              {t.send}
            </button>
          </>
        }
      >
        {ask && (
          <ul className="helpbullets">
            {t.askBullets(ask.slot).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
