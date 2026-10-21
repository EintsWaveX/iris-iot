/**
 * The group inspector's Blank tab (mockup c12-run): every blank of the
 * running module for one group, file by file, with the group's answer in
 * its line, its status and wrong tries, and who filled it and when. The
 * arrow opens that blank on the group's Code page, as the group sees it.
 * The Asisten and the group talk in the room, so nothing is sent from here.
 *
 * Keys stay hidden until Tampilkan Kunci, the projector rule. The filters
 * jump straight to what needs an Asisten: not right, and stuck (two or more
 * wrong tries).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import SegmentedControl from "../ui/SegmentedControl";
import { Switch } from "../ui/Controls";
import { getJson, href, jamMenit, useSessionNow } from "../../lib/app";
import { dengar } from "../../lib/siaran";
import { useAliranAtauTopik } from "../../lib/aliran-ruang";
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
  bantuanKe: number;
  isi: string;
  benar: boolean;
  percobaan: number;
  salah: number;
  oleh: string | null;
  pada: string | null;
}

interface Data {
  ok: boolean;
  kode?: string;
  modul: number;
  berkas: { slug: string; path: string; blank: Blank[] }[];
}

type Saring = "semua" | "belum" | "macet";

const TOKEN = /_{4,}/;

export interface BlankRingkas {
  benar: number;
  total: number;
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
    // A new code version from Kode Jurnal; the group's checks and hints
    // come through the session room below.
    const lepas = dengar(["kode"], () => void muat());
    return () => {
      hidup.current = false;
      lepas();
    };
  }, [kelompok, lang]);
  const sesiNow = useSessionNow();
  useAliranAtauTopik(
    { ruang: "sesi", sesiId: sesiNow.data?.id ?? null },
    ["jawaban"],
    ["jawaban"],
    () => void muat(),
    true,
    kelompok,
  );

  const semua = useMemo(
    () => (data?.ok ? data.berkas.flatMap((f) => f.blank.map((b) => ({ f, b }))) : []),
    [data],
  );
  const cocok = (k: Saring, b: Blank) =>
    k === "semua" || (k === "belum" && !b.benar) || (k === "macet" && !b.benar && b.salah >= 2);
  const hitung = (k: Saring) => semua.filter(({ b }) => cocok(k, b)).length;

  useEffect(() => {
    if (!data?.ok || !onRingkas) return;
    onRingkas({
      benar: semua.filter(({ b }) => b.benar).length,
      total: semua.length,
    });
  }, [data]);

  if (!data) return <p className="hint">{gagal ? t.fail : t.loading}</p>;
  if (!data.ok) return <p className="hint">{gagal ? t.fail : t.noSession}</p>;

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
        ]}
      />

      {hitung(saring) === 0 && <p className="hint">{t.none}</p>}

      {data.berkas.map((f) => {
        const rows = f.blank.filter((b) => cocok(saring, b));
        if (rows.length === 0) return null;
        return (
          <section key={f.slug} className="bpanel__file">
            <h4 className="bpanel__path mono">{f.path}</h4>
            <ol className="bpanel__list">
              {rows.map((b) => {
                const st = b.benar ? "ok" : b.salah > 0 ? "bad" : b.isi ? "bad" : "empty";
                const isi = kunci ? b.kunci : b.isi || "____";
                const [pre, post] = b.kode.split(TOKEN);
                const soal = `m${data.modul}.${f.slug}.${b.nomor}`;
                return (
                  <li
                    key={b.nomor}
                    className="brow"
                    data-st={st}
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
                    </div>
                    <div className="brow__acts">
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
    </div>
  );
}
