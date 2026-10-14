/**
 * Penilaian › Praktikum (mockup a13-praktikum, cards reworked 2026-10-12):
 * every session this semester where I hold a group, newest first, with no
 * three week limit (that stays on the Home inbox). The four summary cards
 * are instruments and filters at once: sessions per module, groups sent as
 * a gauge, ready to send and not graded as segment meters; pressing one
 * shows only those sessions. Buka Tabel Nilai opens the familiar score
 * table in a drawer, where TP cells graded in Penilaian are read only.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ListChecksIcon } from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import Drawer from "../ui/Drawer";
import { CountUp, StateView } from "../ui/Display";
import { Arc, Cells } from "../shared/Instruments";
import "../shared/instruments.css";
import { getJson, href, tanggalPanjang, useMe } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { kelompokLabel, modulLabel } from "../../lib/labels";
import NilaiTable from "../console/NilaiTable";
import { S } from "../console/strings";
import { useAssignment, useNilaiLive } from "../console/data";
import { useSeelabs } from "../console/seelabs/data";
import type { AsistenRef } from "../console/types";
import "../console/console.css";
import { TPS } from "../tp/tpStrings";
import { modulStyle } from "../tp/shared";

interface GrupSesi {
  nomor: number;
  anggota: number;
  lengkap: number;
  status: "todo" | "ready" | "sent";
}
interface SesiNilai {
  sesiId: number;
  tanggal: string;
  slot: number | null;
  mulai: string;
  modul: number;
  kelas: string;
  jenis: string;
  berjalan: boolean;
  kelompok: GrupSesi[];
}

type Saring = "act" | "all" | "sent" | "ready" | "todo";

export default function PraktikumTab({ lang }: { lang: Lang }) {
  const t = TPS[lang];
  const poll = usePoll(
    () =>
      getJson<{ ok: boolean; sesi: SesiNilai[] }>("/api/tp/praktikum").then((d) =>
        d.ok ? d.sesi : null,
      ),
    120_000,
    true,
    ["nilai", "sesi", "tp"],
  );
  const [f, setF] = useState<Saring>("act");
  const [buka, setBuka] = useState<SesiNilai | null>(null);
  const list = poll.data;

  const hitung = useMemo(() => {
    const g = (list ?? []).flatMap((s) => s.kelompok);
    const perModul = [1, 2, 3, 4].map((m) => (list ?? []).filter((s) => s.modul === m).length);
    return {
      sesi: list?.length ?? 0,
      perModul,
      modul: perModul.filter(Boolean).length,
      grup: g.length,
      sent: g.filter((x) => x.status === "sent").length,
      ready: g.filter((x) => x.status === "ready").length,
      todo: g.filter((x) => x.status === "todo").length,
      kosong: g.reduce((a, x) => a + (x.status === "todo" ? x.anggota - x.lengkap : 0), 0),
    };
  }, [list]);

  if (!list) return <span className="skeleton" style={{ height: 420 }} />;
  const tampil = list.filter((s) => {
    const st = s.kelompok.map((x) => x.status);
    if (f === "all") return true;
    if (f === "act") return st.some((x) => x !== "sent");
    return st.includes(f);
  });
  const pilih = (v: Saring) => setF(f === v ? "act" : v);

  return (
    <div className="stack stack--lg">
      <div className="tptally">
        <Tally
          lang={lang}
          tone="--accent"
          n={hitung.sesi}
          label={t.kSesi}
          sub={t.kSesiSub(hitung.modul)}
          pressed={f === "all"}
          onClick={() => pilih("all")}
        >
          <span className="tptally__mods">
            {hitung.perModul.map((n, i) => (
              <span key={i} data-n={n} style={modulStyle(i + 1)} title={modulLabel(i + 1, lang)}>
                {modulLabel(i + 1, lang)} · {n}
              </span>
            ))}
          </span>
        </Tally>
        <Tally
          lang={lang}
          tone="--ok"
          n={hitung.sent}
          label={t.kTerkirim}
          sub={t.kTerkirimSub(hitung.sent, hitung.grup)}
          pressed={f === "sent"}
          onClick={() => pilih("sent")}
          gauge={
            <Arc
              v={hitung.grup ? Math.round((hitung.sent / hitung.grup) * 100) : 0}
              min={0}
              max={100}
              unit="%"
              label=""
              color="--ok"
            />
          }
        >
          <span className="tptally__bar" aria-hidden="true">
            <i style={{ width: `${pct(hitung.sent, hitung.grup)}%`, background: "var(--ok)" }} />
            <i
              style={{ width: `${pct(hitung.ready, hitung.grup)}%`, background: "var(--accent)" }}
            />
            <i style={{ width: `${pct(hitung.todo, hitung.grup)}%`, background: "var(--warn)" }} />
          </span>
        </Tally>
        <Tally
          lang={lang}
          tone="--accent"
          n={hitung.ready}
          label={t.kSiap}
          sub={t.kSiapSub}
          pressed={f === "ready"}
          onClick={() => pilih("ready")}
        >
          <Cells
            label={t.kSiap}
            a={hitung.ready}
            b={Math.max(1, hitung.ready + hitung.todo)}
            tone="--accent"
          />
        </Tally>
        <Tally
          lang={lang}
          tone="--warn"
          n={hitung.todo}
          label={t.kBelum}
          sub={t.kBelumSub(hitung.kosong)}
          pressed={f === "todo"}
          onClick={() => pilih("todo")}
        >
          <Cells label={t.kBelum} a={hitung.todo} b={Math.max(1, hitung.grup)} tone="--warn" />
        </Tally>
      </div>

      <div className="row row--between">
        <div className="seg" role="tablist" aria-label={t.saring} style={{ width: "auto" }}>
          {(
            [
              ["act", t.perluTindakan],
              ["all", t.semuaSesi],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={f === v}
              onClick={() => setF(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="hint">{t.praktikumHint}</span>
      </div>

      {list.length === 0 ? (
        <section className="panel">
          <StateView icon={<ListChecksIcon size={28} />} title={t.kosongPraktikum} />
        </section>
      ) : tampil.length === 0 ? (
        <section className="panel">
          <StateView icon={<ListChecksIcon size={28} />} title={t.kosongTindakan} tone="ok" />
        </section>
      ) : (
        <div className="stack">
          {tampil.map((s) => {
            const aksi = s.kelompok.some((x) => x.status !== "sent");
            return (
              <section key={s.sesiId} className="panel tpsess" style={modulStyle(s.modul)}>
                <div className="stack stack--sm grow">
                  <div className="row">
                    <Pill modul={s.modul}>{modulLabel(s.modul, lang)}</Pill>
                    <span className="hint">
                      {s.kelas === "internasional" ? t.internasional : t.reguler}
                      {s.slot ? ` · Slot ${s.slot}` : ""}
                      {s.jenis === "susulan" ? " · Susulan" : ""}
                    </span>
                    {s.berjalan && (
                      <Pill tone="ok">
                        <span className="dot dot--ok dot--pulse" aria-hidden="true" />
                        {t.berjalan}
                      </Pill>
                    )}
                  </div>
                  <b>{tanggalPanjang(s.tanggal, lang)}</b>
                </div>
                <div className="row tpsess__g">
                  {s.kelompok.map((g) => (
                    <span key={g.nomor} className="row" style={{ gap: 6 }}>
                      <Pill group={g.nomor}>{kelompokLabel(g.nomor, lang)}</Pill>
                      <Pill
                        tone={g.status === "sent" ? "ok" : g.status === "ready" ? "accent" : "warn"}
                      >
                        {t.gst[g.status]}
                        {g.status === "todo" ? ` · ${g.lengkap}/${g.anggota}` : ""}
                      </Pill>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className={`btn${aksi ? " btn--primary" : ""}`}
                  onClick={() => setBuka(s)}
                >
                  {t.bukaTabel}
                </button>
              </section>
            );
          })}
        </div>
      )}
      {buka && (
        <TabelDrawer lang={lang} s={buka} onClose={() => setBuka(null)} onChanged={poll.refresh} />
      )}
    </div>
  );
}

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);

function Tally({
  lang,
  tone,
  n,
  label,
  sub,
  pressed,
  onClick,
  gauge,
  children,
}: {
  lang: Lang;
  tone: string;
  n: number;
  label: string;
  sub: string;
  pressed: boolean;
  onClick: () => void;
  gauge?: ReactNode;
  children?: ReactNode;
}) {
  void lang;
  return (
    <button
      type="button"
      className="panel panel--tight sweep-hover tptally__c"
      aria-pressed={pressed}
      style={{ "--t": `var(${tone})` } as CSSProperties}
      onClick={onClick}
    >
      <span className="tptally__top">
        <span className="stack stack--sm">
          <span className="tptally__n">
            <CountUp value={n} />
          </span>
          <span className="tptally__l">{label}</span>
        </span>
        {gauge && <span style={{ width: 84 }}>{gauge}</span>}
      </span>
      <span className="tptally__vis">{children}</span>
      <span className="hint">{sub}</span>
    </button>
  );
}

function TabelDrawer({
  lang,
  s,
  onClose,
  onChanged,
}: {
  lang: Lang;
  s: SesiNilai;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = TPS[lang];
  const ct = S[lang];
  const me = useMe();
  const nilai = useNilaiLive(s.sesiId, me?.nim);
  const assign = useAssignment(s.sesiId);
  const seelabs = useSeelabs(s.sesiId);
  const asisten = useMemo(
    () => new Map<string, AsistenRef>((assign.data?.asisten ?? []).map((a) => [a.nim, a])),
    [assign.data],
  );
  return (
    <Drawer
      open
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          onChanged();
        }
      }}
      title={t.nilaiModul(modulLabel(s.modul, lang))}
      description={`${tanggalPanjang(s.tanggal, lang)}${s.slot ? ` · Slot ${s.slot}` : ""}`}
      storeKey="tp-tabel"
      minWidth={520}
      closeLabel={t.tutup}
      resizeLabel={t.tutup}
    >
      <div className="stack">
        <p className="hint">{t.tabelSama}</p>
        {me && (
          <NilaiTable
            t={ct}
            lang={lang}
            sesiId={s.sesiId}
            nilai={nilai}
            groups={[]}
            asisten={asisten}
            meNim={me.nim}
            seelabs={seelabs.data}
            onSeelabs={() => location.assign(href(lang, `/session?seelabs=${s.sesiId}`))}
            onSeelabsChanged={seelabs.refresh}
          />
        )}
        <a className="btn btn--ghost" href={href(lang, `/session?tabel=${s.sesiId}`)}>
          {ct.tableTitle}
        </a>
      </div>
    </Drawer>
  );
}
