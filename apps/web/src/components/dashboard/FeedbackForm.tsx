/**
 * Post-practicum feedback (Phase 8), in the journal's two sections: the
 * assistant who handled the student's group, and the lab. Each takes a
 * 1-5 face rating, a few quick-pick chips and an optional comment. It is
 * anonymous to every assistant (the API never returns the NIM), which the
 * form says plainly so students answer honestly.
 */
import { useState } from "react";
import { Check, Lock, Send } from "lucide-react";
import { RatingPicker } from "../ui/Display";
import { postJson } from "../../lib/app";
import { CHIPS_ASISTEN, CHIPS_LAB, KOMENTAR_MAX, LABEL_CHIP } from "../../lib/umpan-balik";
import type { Lang } from "../../lib/kelas";

const T = {
  id: {
    anon: "Anonim. Asisten tidak pernah melihat nama atau NIM kamu.",
    asisten: (k: string) => `Asisten kelompokmu: ${k}`,
    asistenH: "Asisten",
    labH: "Lab",
    faces: ["Buruk", "Kurang", "Cukup", "Baik", "Luar biasa"] as [
      string,
      string,
      string,
      string,
      string,
    ],
    rateA: "Nilai asisten",
    rateL: "Nilai lab",
    komentar: "Komentar (boleh kosong)",
    kirim: "Kirim umpan balik",
    mengirim: "Mengirim…",
    butuh: "Pilih nilai untuk kedua bagian dulu.",
    terima: "Terima kasih. Umpan balikmu sudah terkirim.",
    sudah: "Kamu sudah mengirim umpan balik untuk sesi ini.",
    gagal: "Gagal mengirim. Coba lagi.",
    tanpaAsisten: "Kelompokmu belum punya asisten tercatat. Tanyakan ke asisten di ruangan.",
  },
  en: {
    anon: "Anonymous. Assistants never see your name or student ID.",
    asisten: (k: string) => `Your group's assistant: ${k}`,
    asistenH: "Assistant",
    labH: "Lab",
    faces: ["Poor", "Fair", "Okay", "Good", "Excellent"] as [
      string,
      string,
      string,
      string,
      string,
    ],
    rateA: "Rate the assistant",
    rateL: "Rate the lab",
    komentar: "Comment (optional)",
    kirim: "Send feedback",
    mengirim: "Sending…",
    butuh: "Pick a rating for both sections first.",
    terima: "Thank you. Your feedback has been sent.",
    sudah: "You have already sent feedback for this session.",
    gagal: "Could not send. Try again.",
    tanpaAsisten: "Your group has no assistant on record yet. Ask the assistant in the room.",
  },
};

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
            {on && <Check size={14} aria-hidden="true" />}
            {LABEL_CHIP[k]?.[lang] ?? k}
          </button>
        );
      })}
    </div>
  );
}

export default function FeedbackForm({
  lang,
  asisten,
  onDone,
}: {
  lang: Lang;
  asisten: { nim: string; kode: string } | null;
  onDone: () => void;
}) {
  const t = T[lang];
  const [ra, setRa] = useState(0);
  const [rl, setRl] = useState(0);
  const [ca, setCa] = useState<string[]>([]);
  const [cl, setCl] = useState<string[]>([]);
  const [ka, setKa] = useState("");
  const [kl, setKl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function kirim() {
    if (!asisten) return;
    if (!ra || !rl) {
      setErr(t.butuh);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const d = await postJson<{ ok: boolean; kode?: string }>("/api/session/feedback", {
        asistenNim: asisten.nim,
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
      } else setErr(t.gagal);
    } catch {
      setErr(t.gagal);
    } finally {
      setBusy(false);
    }
  }

  if (!asisten) return <p className="hint">{t.tanpaAsisten}</p>;

  return (
    <form
      className="fbform"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void kirim();
      }}
    >
      <p className="fbform__anon">
        <Lock size={15} aria-hidden="true" />
        {t.anon}
      </p>

      <section className="fbform__sec">
        <div className="fbform__head">
          <h3>{t.asistenH}</h3>
          <span className="pill pill--mono">{t.asisten(asisten.kode)}</span>
        </div>
        <RatingPicker value={ra} onChange={setRa} labels={t.faces} groupLabel={t.rateA} />
        <Chips keys={CHIPS_ASISTEN} value={ca} onChange={setCa} lang={lang} />
        <label className="fbform__area">
          <span className="hint">{t.komentar}</span>
          <textarea
            rows={2}
            maxLength={KOMENTAR_MAX}
            value={ka}
            onChange={(e) => setKa(e.target.value)}
          />
        </label>
      </section>

      <section className="fbform__sec">
        <div className="fbform__head">
          <h3>{t.labH}</h3>
        </div>
        <RatingPicker value={rl} onChange={setRl} labels={t.faces} groupLabel={t.rateL} />
        <Chips keys={CHIPS_LAB} value={cl} onChange={setCl} lang={lang} />
        <label className="fbform__area">
          <span className="hint">{t.komentar}</span>
          <textarea
            rows={2}
            maxLength={KOMENTAR_MAX}
            value={kl}
            onChange={(e) => setKl(e.target.value)}
          />
        </label>
      </section>

      {err && (
        <p className="fbform__err" role="alert">
          {err}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--lg fbform__send" disabled={busy}>
        <Send size={18} aria-hidden="true" />
        {busy ? t.mengirim : t.kirim}
      </button>
    </form>
  );
}
