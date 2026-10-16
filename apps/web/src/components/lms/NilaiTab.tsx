/**
 * LMS › Nilai: IRIS's TP scores against the LMS gradebook, per module.
 * A score is ready once the Praktikan's TP is complete and their group's
 * scores went out (Kirim Nilai); it then goes into the TP Modul
 * assignment with the per-question breakdown as feedback. Practicum
 * scores stay with SeeLabs.
 */
import { useState } from "react";
import Pill from "../ui/Pill";
import SegmentedControl from "../ui/SegmentedControl";
import { Switch } from "../ui/Controls";
import { getJson, postJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { poinNomor } from "../../lib/tp";
import { LS } from "./lmsStrings";
import { BatchDialog, Facts, Head, galatTeks, langkah } from "./lmsShared";
import { BacaSaja, type TabLms } from "./LmsPage";

interface DataNilai {
  ok: boolean;
  kode?: string;
  modul: number;
  galat: string | null;
  perKursus: {
    id: number;
    label: string;
    ada: boolean;
    praktikan: number;
    siap: number;
    sama: number;
    beda: number;
    belum: number;
  }[];
  jumlah: { siap: number; sama: number; beda: number; belum: number };
  contoh: { total: number; baris: { nomor: number; skor: number }[] } | null;
  otomatis: boolean;
  boleh: boolean;
}

export default function NilaiTab({ lang }: { lang: Lang; ke: (v: TabLms) => void }) {
  const t = LS[lang];
  const [m, setM] = useState(1);
  const poll = usePoll(
    () => getJson<DataNilai>(`/api/lms/nilai?modul=${m}`),
    300_000,
    true,
    ["lms", "tp", "nilai"],
    0,
    m,
  );
  const d = poll.data;
  const [auto, setAuto] = useState<boolean | null>(null);
  const [jalan, setJalan] = useState(false);
  const fmt = (n: number) =>
    n.toLocaleString(lang === "en" ? "en-GB" : "id-ID", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const tabs = (
    <SegmentedControl
      aria-label={t.modul(m)}
      fill
      value={String(m)}
      onValueChange={(v) => setM(Number(v))}
      options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: t.modul(n) }))}
    />
  );
  if (!d)
    return (
      <div className="stack stack--lg">
        {tabs}
        <span className="skeleton" style={{ height: 420 }} />
      </div>
    );
  if (!d.ok)
    return (
      <div className="stack stack--lg">
        {tabs}
        <p className="banner banner--warn">{galatTeks(d.kode, lang)}</p>
      </div>
    );
  const otomatis = auto ?? d.otomatis;
  const kirimN = d.jumlah.beda + d.jumlah.belum;
  const kelasKirim = d.perKursus.filter((k) => k.ada && k.beda + k.belum > 0);
  const setOto = async (v: boolean) => {
    setAuto(v);
    const r = await postJson<{ ok: boolean }>("/api/lms/otomatis", {
      kunci: "nilai",
      nyala: v,
    }).catch(() => ({ ok: false }));
    if (!r.ok) setAuto(!v);
    poll.refresh();
  };
  const ada = d.jumlah.siap > 0;
  return (
    <div className="stack stack--lg">
      <BacaSaja lang={lang} boleh={d.boleh} />
      {tabs}
      {d.galat && <p className="banner banner--warn">{galatTeks(d.galat, lang)}</p>}
      <div className="lms-two">
        <section className="panel slr-card">
          <Head
            title={t.nilaiH}
            desc={t.nilaiHint}
            aside={
              !ada ? (
                <Pill>{t.belumAdaNilai}</Pill>
              ) : kirimN ? (
                <Pill tone="warn">{t.nBeda(kirimN)}</Pill>
              ) : (
                <Pill tone="ok">{t.nSama}</Pill>
              )
            }
          />
          <Facts
            items={[
              [t.siapKirim, d.jumlah.siap],
              [t.diLms, d.jumlah.sama],
              [t.nBedaKol, d.jumlah.beda],
              [t.belumDiLms, d.jumlah.belum],
            ]}
          />
          <label className="slr-agree">
            <span className="stack stack--sm">
              <b>{t.otoNilai}</b>
              <span className="hint">{t.otoNilaiHint}</span>
            </span>
            <Switch
              on={otomatis}
              onChange={(v) => void setOto(v)}
              label={t.otoNilai}
              disabled={!d.boleh}
            />
          </label>
          {d.boleh && (
            <div className="slr-acts">
              <button
                type="button"
                className="btn btn--primary"
                disabled={!kirimN}
                onClick={() => setJalan(true)}
              >
                {d.jumlah.sama && kirimN ? t.kirimBeda(kirimN) : t.kirimSemua}
              </button>
            </div>
          )}
        </section>
        <section className="panel slr-card">
          <Head title={t.dilihatH} aside={d.contoh ? undefined : <Pill>{t.contohLabel}</Pill>} />
          {(() => {
            // Before any score has gone out, a sample shows the shape.
            // An even NIM's six numbers.
            const c = d.contoh ?? {
              total: 89,
              baris: [
                [1, 18],
                [2, 13],
                [4, 15],
                [6, 12],
                [8, 14],
                [10, 17],
              ].map(([nomor, skor]) => ({ nomor, skor })),
            };
            return (
              <div className="lms-fb" data-contoh={d.contoh ? undefined : "yes"}>
                <div className="row row--between">
                  <b>TP Modul {d.modul}</b>
                  <b className="num">
                    {fmt(c.total)} / {fmt(100)}
                  </b>
                </div>
                <span className="hint">{t.umpanBalik}</span>
                <pre className="mono">
                  {c.baris.map((x) => `${x.nomor}. ${x.skor}/${poinNomor(x.nomor)}`).join("\n")}
                  {`\n${t.dinilaiIris}`}
                </pre>
              </div>
            );
          })()}
          {!d.contoh && <p className="hint">{t.contohKosong}</p>}
          <p className="hint lms-foot">{t.seelabsTetap}</p>
        </section>
      </div>
      <section className="panel slr-card">
        <Head title={t.perKelas} />
        <div className="tpscroll">
          <table className="tptable">
            <thead>
              <tr>
                <th>{t.kelas}</th>
                <th className="num">{t.nPraktikan}</th>
                <th className="num">{t.siapKirim}</th>
                <th className="num">{t.diLms}</th>
                <th className="num">{t.nBedaKol}</th>
                <th>{t.nKeadaan}</th>
              </tr>
            </thead>
            <tbody>
              {d.perKursus.map((k) => (
                <tr key={k.id}>
                  <td>
                    <b className="mono">{k.label}</b>
                  </td>
                  <td className="num mono">{k.praktikan}</td>
                  <td className="num mono">{k.siap}</td>
                  <td className="num mono">{k.sama}</td>
                  <td className="num mono" data-warn={k.beda + k.belum ? "yes" : undefined}>
                    {k.beda + k.belum}
                  </td>
                  <td>
                    {!k.ada ? (
                      <Pill>{t.tanpaTugas}</Pill>
                    ) : !k.siap ? (
                      <Pill>{t.menungguKirim}</Pill>
                    ) : k.beda + k.belum ? (
                      <Pill tone="warn">{t.diubahSetelah}</Pill>
                    ) : (
                      <Pill tone="ok">{t.nSama}</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <BatchDialog
        open={jalan}
        onOpenChange={setJalan}
        lang={lang}
        title={t.nilaiJalan}
        kursus={kelasKirim}
        jalan={(id) => langkah("/api/lms/nilai", { modul: m, kursus: id })}
        selesai={t.nilaiOk}
        onDone={poll.refresh}
      />
    </div>
  );
}
