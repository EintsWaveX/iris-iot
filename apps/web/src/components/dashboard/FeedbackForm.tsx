/**
 * Post-practicum feedback (Phase 8), in the journal's two sections: the
 * assistant who handled the student's group, and the lab. Each takes a
 * 1-5 face rating, a few quick-pick chips and an optional comment. It is
 * anonymous to every assistant (the API never returns the NIM), which the
 * form says plainly so students answer honestly.
 *
 * Phase 9 (mockup p-feedback): two cards, the Assistant card with our own
 * Dropdown of "Full Name (CODE)" in its head; the send button says what is
 * still missing.
 */
import { useState } from "react";
import { RatingPicker } from "../ui/Display";
import Dropdown from "../ui/Dropdown";
import { postJson, dict } from "../../lib/app";
import {
  CHIPS_ASISTEN,
  CHIPS_LAB,
  KOMENTAR_MAX,
  LABEL_CHIP,
  RATING_BUTUH_ALASAN,
  kurangAlasan,
} from "../../lib/umpan-balik";
import type { Lang } from "../../lib/kelas";

const T = dict({
  id: {
    siapa: "Asisten yang membantu kelompokmu",
    pilihDulu: "Pilih asisten",
    butuhAsisten: "Pilih asisten yang membantu kelompokmu.",
    asistenH: "Asisten",
    labH: "Lab",
    faces: ["Buruk", "Kurang", "Cukup", "Baik", "Hebat"] as [
      string,
      string,
      string,
      string,
      string,
    ],
    rateA: "Nilai asisten",
    rateL: "Nilai lab",
    komentar: "Komentar (boleh kosong)",
    komentarA: "Komentar untuk asisten",
    komentarL: "Komentar tentang lab",
    kirim: "Kirim Umpan Balik",
    pilihLab: "Pilih Penilaian Lab Dulu",
    pilihAsisten: "Pilih Penilaian Asisten Dulu",
    mengirim: "Mengirim…",
    butuh: "Pilih nilai untuk kedua bagian dulu.",
    terima: "Terima kasih. Umpan balikmu sudah terkirim.",
    sudah: "Kamu sudah mengirim umpan balik untuk sesi ini.",
    gagal: "Gagal mengirim. Coba lagi.",
    alasan:
      "Nilai rendah perlu alasan: pilih salah satu pilihan cepat atau tulis komentar singkat.",
    alasanHint: "Ceritakan apa yang kurang supaya bisa diperbaiki.",
  },
  en: {
    siapa: "The assistant who helped your group",
    pilihDulu: "Pick an assistant",
    butuhAsisten: "Pick the assistant who helped your group.",
    asistenH: "Assistant",
    labH: "Lab",
    faces: ["Poor", "Meh", "Okay", "Good", "Great"] as [string, string, string, string, string],
    rateA: "Rate the assistant",
    rateL: "Rate the lab",
    komentar: "Comment (optional)",
    komentarA: "Comment for the assistant",
    komentarL: "Comment about the lab",
    kirim: "Send Feedback",
    pilihLab: "Pick a Lab Rating First",
    pilihAsisten: "Pick an Assistant Rating First",
    mengirim: "Sending…",
    butuh: "Pick a rating for both sections first.",
    terima: "Thank you. Your feedback has been sent.",
    sudah: "You have already sent feedback for this session.",
    gagal: "Could not send. Try again.",
    alasan: "A low rating needs a reason: pick a quick option or write a short comment.",
    alasanHint: "Say what fell short so it can be fixed.",
  },
  zh: {
    siapa: "帮助你们组的助教",
    pilihDulu: "选择助教",
    butuhAsisten: "选择帮助你们组的助教。",
    asistenH: "助教",
    labH: "实验室",
    faces: ["差", "一般般", "还行", "好", "很棒"] as [string, string, string, string, string],
    rateA: "给助教打分",
    rateL: "给实验室打分",
    komentar: "留言（可选）",
    komentarA: "给助教的留言",
    komentarL: "关于实验室的留言",
    kirim: "发送反馈",
    pilihLab: "先给实验室打个分",
    pilihAsisten: "先给助教打个分",
    mengirim: "发送中…",
    butuh: "先给两个部分都打分。",
    terima: "谢谢。你的反馈已发送。",
    sudah: "你已经为这节课发过反馈了。",
    gagal: "发送失败，再试一次。",
    alasan: "低分需要理由：选一个快捷选项或写一句简短留言。",
    alasanHint: "说说哪里不够好，方便改进。",
  },
});

function Chips({
  keys,
  value,
  onChange,
  lang,
}: {
  keys: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  lang: Lang;
}) {
  return (
    <div className="fbform__chips">
      {keys.map((k) => {
        const on = value.includes(k);
        return (
          <button
            key={k}
            type="button"
            className="fbform__chip"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
          >
            {LABEL_CHIP[k]?.[lang] ?? k}
          </button>
        );
      })}
    </div>
  );
}

export default function FeedbackForm({
  lang,
  sesiId,
  asisten,
  pilihan,
  onDone,
}: {
  lang: Lang;
  /** The practicum this feedback is about (any ended one they attended). */
  sesiId: number;
  /** The group's assigned assistant, preselected when there is one. */
  asisten: { kode: string; nama: string } | null;
  /** Who the student may credit instead (the session's assistants). */
  pilihan: { kode: string; nama: string }[];
  onDone: () => void;
}) {
  const t = T[lang];
  const [kode, setKode] = useState<string>(asisten?.kode ?? "");
  const opsi = [...(asisten ? [asisten] : []), ...pilihan.filter((p) => p.kode !== asisten?.kode)];
  const [ra, setRa] = useState(0);
  const [rl, setRl] = useState(0);
  const [ca, setCa] = useState<string[]>([]);
  const [cl, setCl] = useState<string[]>([]);
  const [ka, setKa] = useState("");
  const [kl, setKl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function kirim() {
    if (!kode) {
      setErr(t.butuhAsisten);
      return;
    }
    if (!ra || !rl) {
      setErr(t.butuh);
      return;
    }
    if (kurangAlasan(ra, ca, ka) || kurangAlasan(rl, cl, kl)) {
      setErr(t.alasan);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const d = await postJson<{ ok: boolean; kode?: string }>("/api/session/feedback", {
        sesiId,
        asistenKode: kode,
        ratingAsisten: ra,
        ratingLab: rl,
        chipsAsisten: ca,
        chipsLab: cl,
        komentarAsisten: ka,
        komentarLab: kl,
      });
      if (d.ok || d.kode === "sudah_dikirim") {
        window.Toast?.show(d.ok ? t.terima : t.sudah, "ok");
        onDone();
      } else setErr(d.kode === "butuh_alasan" ? t.alasan : t.gagal);
    } catch {
      setErr(t.gagal);
    } finally {
      setBusy(false);
    }
  }

  const label = busy ? t.mengirim : !ra ? t.pilihAsisten : !rl ? t.pilihLab : t.kirim;

  return (
    <form
      className="fbform"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void kirim();
      }}
    >
      <section className="panel fbform__sec">
        <div className="panel__head">
          <h2 className="panel__title">{t.asistenH}</h2>
          <div className="fbform__who">
            <Dropdown
              id={`fb-asisten-${sesiId}`}
              label={t.siapa}
              hideLabel
              value={kode}
              onChange={setKode}
              options={[
                ...(kode ? [] : [{ value: "", label: t.pilihDulu, disabled: true }]),
                ...opsi.map((o) => ({ value: o.kode, label: o.nama, chip: o.kode.toUpperCase() })),
              ]}
            />
          </div>
        </div>
        <RatingPicker value={ra} onChange={setRa} labels={t.faces} groupLabel={t.rateA} />
        <Chips keys={CHIPS_ASISTEN} value={ca} onChange={setCa} lang={lang} />
        <label className="fbform__area">
          {ra > 0 && ra <= RATING_BUTUH_ALASAN && <span className="hint">{t.alasanHint}</span>}
          <textarea
            rows={3}
            maxLength={KOMENTAR_MAX}
            value={ka}
            placeholder={t.komentar}
            aria-label={t.komentarA}
            onChange={(e) => setKa(e.target.value)}
          />
        </label>
      </section>

      <section className="panel fbform__sec">
        <h2 className="panel__title">{t.labH}</h2>
        <RatingPicker value={rl} onChange={setRl} labels={t.faces} groupLabel={t.rateL} />
        <Chips keys={CHIPS_LAB} value={cl} onChange={setCl} lang={lang} />
        <label className="fbform__area">
          {rl > 0 && rl <= RATING_BUTUH_ALASAN && <span className="hint">{t.alasanHint}</span>}
          <textarea
            rows={3}
            maxLength={KOMENTAR_MAX}
            value={kl}
            placeholder={t.komentar}
            aria-label={t.komentarL}
            onChange={(e) => setKl(e.target.value)}
          />
        </label>
      </section>

      {err && (
        <p className="fbform__err" role="alert">
          {err}
        </p>
      )}
      <button
        type="submit"
        className="btn btn--primary btn--lg fbform__send"
        disabled={busy || !ra || !rl}
      >
        {label}
      </button>
    </form>
  );
}
