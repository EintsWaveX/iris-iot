/**
 * LMS › Materi: each module's LMS section gets its name and a link to the
 * module page in IRIS, placed in every class at once. Links, not files,
 * so IRIS's access rules keep working and there's one copy to update.
 */
import { useState, type CSSProperties } from "react";
import Pill from "../ui/Pill";
import { getJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { LS } from "./lmsStrings";
import { BatchDialog, Head, galatTeks, langkah } from "./lmsShared";
import { BacaSaja, type TabLms } from "./LmsPage";

interface DataMateri {
  ok: boolean;
  kode?: string;
  modul: { modul: number; nama: string; bagian: string; tautan: string; url: string; di: number }[];
  kelasJumlah: number;
  boleh: boolean;
  kelola: boolean;
}

export default function MateriTab({ lang }: { lang: Lang; ke: (v: TabLms) => void }) {
  const t = LS[lang];
  const poll = usePoll(() => getJson<DataMateri>("/api/lms/materi"), 300_000, true, ["lms"]);
  const d = poll.data;
  const [jalan, setJalan] = useState<number | null>(null);
  const [kursus, setKursus] = useState<{ id: number; label: string }[]>([]);
  if (!d) return <span className="skeleton" style={{ height: 420 }} />;
  if (!d.ok) return <p className="banner banner--warn">{galatTeks(d.kode, lang)}</p>;
  const pasang = async (m: number) => {
    const r = await getJson<{ ok: boolean; perKursus?: { id: number; label: string }[] }>(
      "/api/lms/ringkas",
    ).catch(() => null);
    setKursus(r?.perKursus ?? []);
    setJalan(m);
  };
  return (
    <div className="stack stack--lg">
      <BacaSaja lang={lang} boleh={d.boleh} />
      <div className="tpnote">
        <span>{t.materiNote}</span>
      </div>
      <div className="lms-mods">
        {d.modul.map((m) => {
          const semua = m.di === d.kelasJumlah && m.di > 0;
          return (
            <section
              key={m.modul}
              className="panel slr-card"
              style={{ "--m": `var(--mod-${m.modul})` } as CSSProperties}
            >
              <Head
                title={
                  <span className="stack stack--sm">
                    <Pill modul={m.modul}>{t.modul(m.modul)}</Pill>
                    <span>{m.nama}</span>
                  </span>
                }
                aside={
                  <Pill tone={semua ? "ok" : undefined}>
                    {m.di ? t.diKelas(m.di, d.kelasJumlah) : t.belum}
                  </Pill>
                }
              />
              <ul className="lms-mat">
                <li>{t.namaBagian(m.bagian)}</li>
                <li>
                  {t.tautan(m.tautan)}
                  <a
                    className="hint mono lms-mat__url"
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {m.url.replace(/^https:\/\//, "")}
                  </a>
                </li>
              </ul>
              {d.boleh && d.kelola && (
                <div className="slr-acts">
                  <button
                    type="button"
                    className={semua ? "btn" : "btn btn--primary"}
                    onClick={() => void pasang(m.modul)}
                  >
                    {semua ? t.samakan : t.pasangDi(d.kelasJumlah)}
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <BatchDialog
        open={jalan !== null}
        onOpenChange={(v) => !v && setJalan(null)}
        lang={lang}
        title={t.materiJalan(jalan ?? 1)}
        kursus={kursus}
        jalan={(id) => langkah("/api/lms/materi", { modul: jalan, kursus: id })}
        selesai={t.materiOk}
        onDone={poll.refresh}
      />
    </div>
  );
}
