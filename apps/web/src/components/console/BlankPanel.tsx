/**
 * The group inspector's Blank tab (mockup c12-run): every blank of the
 * running module for one group, file by file, with the group's answer in
 * its line, its status and wrong tries, who filled it and when, a waiting
 * hint request, and the hints already sent. Petunjuk (Jawab on a request)
 * writes a hint that shows under the blank's line on the group's Code page;
 * the arrow opens that blank there, as the group sees it.
 *
 * Keys stay hidden until Tampilkan Kunci, the projector rule. The filters
 * jump straight to what needs an Asisten: not right, stuck (two or more
 * wrong tries) and asked.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowSquareOutIcon, HandIcon, SparkleIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Pill from "../ui/Pill";
import SegmentedControl from "../ui/SegmentedControl";
import { Switch } from "../ui/Controls";
import { getJson, href, jamMenit, postJson } from "../../lib/app";
import { dengar } from "../../lib/siaran";
import type { Lang } from "../../lib/kelas";
import { BL } from "./blankStrings";
import "./blank-panel.css";

interface Blank {
  nomor: number;
  baris: number;
  kode: string;
  petunjuk: string;
  kunci: string;
  juga: string[];
  kenapa: string;
  bantuan: string;
  isi: string;
  benar: boolean;
  percobaan: number;
  salah: number;
  oleh: string | null;
  pada: string | null;
}

interface Minta {
  id: number;
  berkas: string;
  nomor: number;
  catatan: string;
  diminta: string | null;
  oleh: string | null;
  teks: string | null;
  dari: string | null;
  dijawab: string | null;
}

interface Data {
  ok: boolean;
  kode?: string;
  modul: number;
  berkas: { slug: string; path: string; blank: Blank[] }[];
  minta: Minta[];
}

type Saring = "semua" | "belum" | "macet" | "minta";

const TOKEN = /_{4,}/;
const POLL_MS = 30_000;

export interface BlankRingkas {
  benar: number;
  total: number;
  minta: number;
}

export default function BlankPanel({
  lang,
  kelompok,
  nomor,
  onRingkas,
  kunciOn,
  onKunci,
  fokus,
}: {
  lang: Lang;
  kelompok: number;
  nomor: number;
  onRingkas?: (r: BlankRingkas) => void;
  /** Phase 10: Show the Keys shared with the Blank Matrix and Ada Masalah?. */
  kunciOn?: boolean;
  onKunci?: (v: boolean) => void;
  /** Phase 10: one blank to bring into view ("m3.slug.4"), from the
   *  matrix, the feed or the counters. */
  fokus?: string | null;
}) {
  const t = BL[lang];
  const [data, setData] = useState<Data | null>(null);
  const [gagal, setGagal] = useState(false);
  const [kunciSendiri, setKunciSendiri] = useState(false);
  const kunci = kunciOn ?? kunciSendiri;
  const setKunci = onKunci ?? setKunciSendiri;
  const [saring, setSaring] = useState<Saring>("semua");
  const [tulis, setTulis] = useState<{ slug: string; b: Blank; minta?: Minta } | null>(null);
  const hidup = useRef(true);
  // A blank picked elsewhere: show every blank, then bring it into view.
  useEffect(() => {
    if (!fokus || !data) return;
    setSaring("semua");
    requestAnimationFrame(() =>
      document
        .querySelector(`.brow[data-soal="${fokus}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }, [fokus, !!data]);

  async function muat() {
    try {
      const d = await getJson<Data>(`/api/modul/blank?kelompok=${kelompok}&lang=${lang}`);
      if (!hidup.current) return;
      setData(d);
      setGagal(!d.ok && d.kode !== "tidak_ada_sesi");
    } catch {
      if (hidup.current) setGagal(true);
    }
  }

  useEffect(() => {
    hidup.current = true;
    setData(null);
    void muat();
    const id = window.setInterval(() => void muat(), POLL_MS);
    const lepas = dengar(["jawaban", "petunjuk", "kode"], () => void muat());
    return () => {
      hidup.current = false;
      window.clearInterval(id);
      lepas();
    };
  }, [kelompok, lang]);

  const semua = useMemo(
    () => (data?.ok ? data.berkas.flatMap((f) => f.blank.map((b) => ({ f, b }))) : []),
    [data],
  );
  const tunggu = (slug: string, n: number) =>
    data?.minta.find((m) => m.berkas === slug && m.nomor === n && !m.teks && m.diminta);
  const terkirim = (slug: string, n: number) =>
    data?.minta.filter((m) => m.berkas === slug && m.nomor === n && m.teks) ?? [];
  const cocok = (k: Saring, slug: string, b: Blank) =>
    k === "semua" ||
    (k === "belum" && !b.benar) ||
    (k === "macet" && !b.benar && b.salah >= 2) ||
    (k === "minta" && !!tunggu(slug, b.nomor));
  const hitung = (k: Saring) => semua.filter(({ f, b }) => cocok(k, f.slug, b)).length;

  useEffect(() => {
    if (!data?.ok || !onRingkas) return;
    onRingkas({
      benar: semua.filter(({ b }) => b.benar).length,
      total: semua.length,
      minta: hitung("minta"),
    });
  }, [data]);

  if (!data) return <p className="hint">{gagal ? t.fail : t.loading}</p>;
  if (!data.ok) return <p className="hint">{gagal ? t.fail : t.noSession}</p>;

  async function kirim(teks: string) {
    if (!tulis) return false;
    try {
      const r = await postJson<{ ok: boolean }>("/api/modul/petunjuk", {
        kelompok,
        soal: `m${data!.modul}.${tulis.slug}.${tulis.b.nomor}`,
        teks,
        minta: tulis.minta?.id ?? null,
      });
      if (!r.ok) throw new Error();
      window.Toast?.show(t.sentOk(nomor), "ok");
      void muat();
      return true;
    } catch {
      window.Toast?.show(t.sendFail, "danger");
      return false;
    }
  }

  return (
    <div className="bpanel">
      <label className="bpanel__keys">
        <Switch on={kunci} onChange={setKunci} label={t.showKeys} />
        <span className="stack stack--sm">
          <b>{t.showKeys}</b>
          <span className="hint">{t.keysNote}</span>
        </span>
      </label>

      <SegmentedControl
        fill
        value={saring}
        onValueChange={(v) => setSaring(v as Saring)}
        aria-label={t.filter}
        options={[
          { value: "semua", label: t.all(hitung("semua")) },
          { value: "belum", label: t.open(hitung("belum")) },
          { value: "macet", label: t.stuck(hitung("macet")) },
          { value: "minta", label: t.asked(hitung("minta")) },
        ]}
      />

      {hitung(saring) === 0 && <p className="hint">{t.none}</p>}

      {data.berkas.map((f) => {
        const rows = f.blank.filter((b) => cocok(saring, f.slug, b));
        if (rows.length === 0) return null;
        return (
          <section key={f.slug} className="bpanel__file">
            <h4 className="bpanel__path mono">{f.path}</h4>
            <ol className="bpanel__list">
              {rows.map((b) => {
                const w = tunggu(f.slug, b.nomor);
                const st = b.benar ? "ok" : b.salah > 0 ? "bad" : b.isi ? "bad" : "empty";
                const isi = kunci ? b.kunci : b.isi || "____";
                const [pre, post] = b.kode.split(TOKEN);
                const soal = `m${data.modul}.${f.slug}.${b.nomor}`;
                return (
                  <li
                    key={b.nomor}
                    className="brow"
                    data-st={st}
                    data-ask={w ? "yes" : undefined}
                    data-focus={fokus === soal ? "yes" : undefined}
                    data-soal={soal}
                  >
                    <span className="brow__n mono">({b.nomor})</span>
                    <div className="brow__body">
                      <code className="brow__code mono">
                        {(pre ?? "").trim()}
                        <mark data-st={kunci ? "key" : st}>{isi}</mark>
                        {post ?? ""}
                      </code>
                      <div className="brow__meta">
                        {b.benar ? (
                          <Pill tone="ok">{t.right}</Pill>
                        ) : b.salah > 0 ? (
                          <Pill tone="warn">{t.wrong(b.salah)}</Pill>
                        ) : (
                          <Pill>{t.empty}</Pill>
                        )}
                        {b.oleh && b.pada && (
                          <span className="hint">{t.who(b.oleh, jamMenit(b.pada))}</span>
                        )}
                        <span className="hint">{t.line(b.baris)}</span>
                      </div>
                      {w && (
                        <p className="brow__ask">
                          <HandIcon size={16} aria-hidden="true" />
                          <span>
                            <b>{w.oleh ?? ""}</b> {t.asking(jamMenit(w.diminta!), w.catatan)}
                          </span>
                        </p>
                      )}
                      {terkirim(f.slug, b.nomor).map((m) => (
                        <p key={m.id} className="brow__sent">
                          <SparkleIcon size={16} aria-hidden="true" />
                          <span>
                            <b>{t.sent(m.dari ?? "", m.dijawab ? jamMenit(m.dijawab) : "")}</b>{" "}
                            {m.teks}
                          </span>
                        </p>
                      ))}
                    </div>
                    <div className="brow__acts">
                      {!b.benar && (
                        <button
                          type="button"
                          className={w ? "btn btn--sm btn--primary" : "btn btn--sm"}
                          onClick={() => setTulis({ slug: f.slug, b, minta: w })}
                        >
                          <SparkleIcon size={16} aria-hidden="true" />
                          {w ? t.answer : t.hint}
                        </button>
                      )}
                      <a
                        className="btn btn--sm btn--icon"
                        href={href(
                          lang,
                          `/modules/${data.modul}?lihat=${nomor}&step=code&blank=${f.slug}.${b.nomor}`,
                        )}
                        aria-label={t.openCode(b.nomor)}
                        title={t.openCode(b.nomor)}
                      >
                        <ArrowSquareOutIcon size={18} aria-hidden="true" />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      {tulis && (
        <HintDialog
          lang={lang}
          nomor={nomor}
          tulis={tulis}
          onClose={() => setTulis(null)}
          onSend={kirim}
        />
      )}
    </div>
  );
}

function HintDialog({
  lang,
  nomor,
  tulis,
  onClose,
  onSend,
}: {
  lang: Lang;
  nomor: number;
  tulis: { slug: string; b: Blank; minta?: Minta };
  onClose: () => void;
  onSend: (teks: string) => Promise<boolean>;
}) {
  const t = BL[lang];
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const { b } = tulis;
  // A hint that spells out the key gives the blank away.
  const bocor =
    b.kunci.length > 1 &&
    teks.toLowerCase().replace(/\s+/g, "").includes(b.kunci.toLowerCase().replace(/\s+/g, ""));

  async function kirim() {
    setSibuk(true);
    const ok = await onSend(teks.trim());
    setSibuk(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.dlgTitle(nomor, b.nomor)}
      description={t.dlgDesc}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={sibuk || !teks.trim() || bocor}
            onClick={() => void kirim()}
          >
            <SparkleIcon size={18} aria-hidden="true" />
            {t.send}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <span className="field__label">{t.dlgLine}</span>
          <code className="brow__code mono">{b.kode}</code>
          <span className="hint">{b.petunjuk}</span>
        </div>
        {tulis.minta && (
          <p className="brow__ask">
            <HandIcon size={16} aria-hidden="true" />
            <span>
              <b>{tulis.minta.oleh ?? ""}</b>{" "}
              {t.asking(jamMenit(tulis.minta.diminta!), tulis.minta.catatan)}
            </span>
          </p>
        )}
        {b.bantuan && (
          <div className="field">
            <span className="field__label">{t.dlgModule}</span>
            <span className="hint">{b.bantuan}</span>
          </div>
        )}
        <label className="field">
          <span className="field__label">{t.dlgText}</span>
          <textarea
            className="field__input field__textarea"
            rows={3}
            maxLength={400}
            placeholder={t.dlgPh}
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
          />
          {bocor && <span className="field__hint field__hint--error">{t.dlgKeyWarn}</span>}
        </label>
      </div>
    </Dialog>
  );
}
