/**
 * Penilaian › Tugas Pendahuluan (mockup a13-grading): pick a module, see the
 * LMS sync, then the groups by SeeLabs KLP for that module's practicum week,
 * each member with status, upload time or score. Kelompokku is the groups
 * I hold that week; Semua Kelompok is everyone's, read only for the others.
 */
import { useState, type CSSProperties } from "react";
import {
  CaretRightIcon,
  CloudCheckIcon,
  CloudSlashIcon,
  DownloadSimpleIcon,
  PlugsIcon,
  UsersThreeIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import TabLine from "../ui/TabLine";
import IconButton from "../ui/IconButton";
import { ProgressRing, StateView } from "../ui/Display";
import { MODUL_NAMA, postJson, tanggalPanjang } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { kelompokLabel, modulLabel } from "../../lib/labels";
import { buatZip, simpanBlob } from "../../lib/zip";
import { TPS } from "../tp/tpStrings";
import {
  StatusPill,
  grupStyle,
  hariJam,
  hariJamPendek,
  inisial,
  modulStyle,
  waktuPanjang,
} from "../tp/shared";
import type { AnggotaTp, DataKelompok, GrupDinilai, KelompokTp } from "./types";
import { LK } from "./lmsKelolaStrings";

type Saring = "all" | "todo" | "telat" | "belum";

export default function TpTab({
  lang,
  modul,
  setModul,
  data,
  refresh,
  onOpen,
  onLms,
}: {
  lang: Lang;
  modul: number;
  setModul: (m: number) => void;
  data: DataKelompok | null;
  refresh: () => void;
  onOpen: (g: GrupDinilai, i: number) => void;
  /** Sumber LMS; with a module, its assignments' dialog open. */
  onLms: (modul?: number) => void;
}) {
  const t = TPS[lang];
  const [who, setWho] = useState<"mine" | "all">("mine");
  const [f, setF] = useState<Saring>("all");
  if (!data) return <span className="skeleton" style={{ height: 420 }} />;

  const mine = data.slot.flatMap((s) => s.kelompok.filter((g) => g.milikku).map((g) => ({ s, g })));
  const cocok = (a: AnggotaTp) =>
    f === "all" ||
    (f === "todo" && (a.status === "masuk" || a.status === "telat")) ||
    (f === "telat" && a.status === "telat") ||
    (f === "belum" && (a.status === "belum" || a.status === "kosong"));
  const slotInfo = (s: DataKelompok["slot"][number]) =>
    t.slotInfo(t.hari[s.hari] ?? "", s.slot, tanggalPanjang(s.tanggal, lang));

  return (
    <div className="stack stack--lg">
      <div className="modpick tpmodpick" role="radiogroup" aria-label={t.pilihModul}>
        {data.modul.map((x) => {
          const sel = x.modul === modul;
          const teks =
            sel && x.keadaan === "tutup"
              ? data.hitung.masuk === 0
                ? t.belumAdaKiriman
                : data.hitung.dinilai >= data.hitung.peserta
                  ? t.semuaDinilai
                  : t.perluDinilai(data.hitung.masuk - data.hitung.dinilai)
              : x.keadaan === "buka" && x.jendela
                ? t.bukaTutup(hariJam(x.jendela.tutup, lang))
                : x.keadaan === "belum" && x.jendela
                  ? t.belumDibukaPada(hariJam(x.jendela.buka, lang))
                  : x.keadaan === "tutup"
                    ? t.keadaan.tutup
                    : t.tanpaJendela;
          return (
            <button
              key={x.modul}
              type="button"
              role="radio"
              aria-checked={sel}
              className="modpick__b"
              style={modulStyle(x.modul)}
              onClick={() => setModul(x.modul)}
            >
              <span className="row">
                <Pill modul={x.modul}>{modulLabel(x.modul, lang)}</Pill>
              </span>
              <span className="row">
                <span
                  className={`dot ${x.keadaan === "buka" ? "dot--ok dot--pulse" : x.keadaan === "tutup" ? "dot--warn" : "dot--off"}`}
                  aria-hidden="true"
                />
                <span className="hint">{teks}</span>
              </span>
            </button>
          );
        })}
      </div>

      <ModulHead lang={lang} modul={modul} data={data} />

      <SyncStrip lang={lang} modul={modul} data={data} refresh={refresh} onLms={onLms} />

      <div className="tpfilter">
        <TabLine
          seg
          value={who}
          onChange={setWho}
          label={t.kelompokLabel}
          tabs={[
            { v: "mine", label: t.kelompokku, n: mine.length || undefined },
            { v: "all", label: t.semuaKelompok },
          ]}
        />
        <div className="row tpfilter__chips" role="group" aria-label={t.saring}>
          {(
            [
              ["all", t.fSemua],
              ["todo", t.fPerlu],
              ["telat", t.fTelat],
              ["belum", t.fBelum],
            ] as const
          ).map(([v, l]) => (
            <Pill key={v} pressed={f === v} onClick={() => setF(v)}>
              {l}
            </Pill>
          ))}
        </div>
      </div>

      {data.slot.length === 0 && data.tanpaKelompok.length === 0 ? (
        <section className="panel">
          <StateView icon={<UsersThreeIcon size={28} />} title={t.kosongRoster} />
        </section>
      ) : who === "mine" ? (
        mine.length ? (
          <div className="tpgroups">
            {mine.map(({ s, g }) => (
              <GroupCard
                key={`${s.hari}-${s.slot}-${g.nomor}`}
                lang={lang}
                modul={modul}
                g={g}
                info={slotInfo(s)}
                cocok={cocok}
                onOpen={onOpen}
              />
            ))}
          </div>
        ) : (
          <section className="panel">
            <StateView
              icon={<UsersThreeIcon size={28} />}
              title={t.kosongKelompokku}
              actions={
                <button type="button" className="btn" onClick={() => setWho("all")}>
                  {t.lihatSemua}
                </button>
              }
            />
          </section>
        )
      ) : (
        <div className="stack stack--lg">
          {data.slot.map((s) => (
            <section key={`${s.hari}-${s.slot}`} className="tpslot">
              <h3 className="tpslot__h">{slotInfo(s)}</h3>
              <div className="tpgroups">
                {s.kelompok.map((g) => (
                  <GroupCard
                    key={g.nomor}
                    lang={lang}
                    modul={modul}
                    g={g}
                    info={null}
                    cocok={cocok}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </section>
          ))}
          {data.tanpaKelompok.length > 0 && (
            <section className="tpslot">
              <h3 className="tpslot__h">{t.tanpaKelompokH}</h3>
              <p className="hint">{t.tanpaKelompokHint}</p>
              <div className="tpgroups">
                <GroupCard
                  lang={lang}
                  modul={modul}
                  g={{
                    nomor: 0,
                    klp: null,
                    pemegang: null,
                    milikku: false,
                    anggota: data.tanpaKelompok,
                  }}
                  info={null}
                  cocok={cocok}
                  onOpen={onOpen}
                />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** The picked module itself: its window and its counts, so a switch shows. */
function ModulHead({ lang, modul, data }: { lang: Lang; modul: number; data: DataKelompok }) {
  const t = TPS[lang];
  const x = data.modul.find((m) => m.modul === modul);
  const h = data.hitung;
  return (
    <section className="panel tpmodhead" style={modulStyle(modul)} aria-live="polite">
      <div className="stack stack--sm grow">
        <span className="row">
          <Pill modul={modul}>{modulLabel(modul, lang)}</Pill>
          <span className="hint">{x?.keadaan ? t.keadaan[x.keadaan] : t.tanpaJendela}</span>
        </span>
        <h2 className="panel__title">
          {t.tpModul(modul)} · {MODUL_NAMA[modul]}
        </h2>
        <span className="hint">
          {t.jendela}:{" "}
          {x?.jendela
            ? t.sampai(waktuPanjang(x.jendela.buka, lang), waktuPanjang(x.jendela.tutup, lang))
            : t.tanpaJendela}
        </span>
      </div>
      <dl className="tpmodhead__n">
        <div>
          <dt>{t.peserta}</dt>
          <dd className="mono">{h.peserta}</dd>
        </div>
        <div>
          <dt>{t.status.masuk}</dt>
          <dd className="mono">{h.masuk}</dd>
        </div>
        <div>
          <dt>{t.status.nilai}</dt>
          <dd className="mono">{h.dinilai}</dd>
        </div>
      </dl>
    </section>
  );
}

function SyncStrip({
  lang,
  modul,
  data,
  refresh,
  onLms,
}: {
  lang: Lang;
  modul: number;
  data: DataKelompok;
  refresh: () => void;
  onLms: (modul?: number) => void;
}) {
  const t = TPS[lang];
  const [busy, setBusy] = useState(false);
  const s = data.sinkron;
  const run = async () => {
    setBusy(true);
    const r = await postJson<{ ok: boolean; kode?: string; baru: number; diperbarui: number }>(
      "/api/tp/sinkron",
      // a press reads the courses again, so a TP assignment made a minute ago is found
      { modul, paksa: true },
    ).catch(() => ({ ok: false, kode: "", baru: 0, diperbarui: 0 }));
    setBusy(false);
    window.Toast?.show(r.ok ? t.sinkronHasil(r.baru, r.diperbarui) : t.gagal, r.ok ? "ok" : "warn");
    refresh();
  };
  if (!s.tersambung)
    return (
      <section className="panel tpsync" data-tone="warn">
        <PlugsIcon size={28} aria-hidden="true" />
        <div className="stack stack--sm grow">
          <b>{t.sinkronBelum}</b>
          <span className="hint">{t.sinkronBelumHint}</span>
        </div>
        {data.bolehLms && (
          <button type="button" className="btn btn--primary" onClick={() => onLms()}>
            {t.sambungLms}
          </button>
        )}
      </section>
    );
  if (s.hasil === "gagal" && s.galat)
    return (
      <section className="panel tpsync" data-tone="danger">
        <CloudSlashIcon size={28} aria-hidden="true" />
        <div className="stack stack--sm grow">
          <b>{t.sinkronGagal(s.galat)}</b>
          <span className="hint">
            {t.sinkronGagalHint(waktuPanjang(s.galatSejak ?? s.terakhir ?? "", lang))}
          </span>
        </div>
        {data.bolehLms ? (
          <button type="button" className="btn btn--danger" onClick={() => onLms()}>
            {t.sambungUlang}
          </button>
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => void run()}>
            {busy ? t.menyinkron : t.sinkronSekarang}
          </button>
        )}
      </section>
    );
  const hilang = data.hilang[0];
  const pct = data.hitung.peserta ? Math.round((data.hitung.masuk / data.hitung.peserta) * 100) : 0;
  return (
    <div className="stack">
      {hilang && (
        <section className="panel tpsync" data-tone="warn">
          <WarningIcon size={28} aria-hidden="true" />
          <div className="stack stack--sm grow">
            <b>{t.hilangH(modul, data.hilang.map((h) => h.label).join(", "))}</b>
            <span className="hint">
              {t.hilangBody(
                data.hilang.reduce((a, h) => a + h.peserta, 0),
                modul,
              )}
            </span>
          </div>
          {data.bolehKelola ? (
            <button type="button" className="btn btn--primary" onClick={() => onLms(modul)}>
              {LK[lang].buat(data.hilang.length)}
            </button>
          ) : (
            data.bolehLms && (
              <button type="button" className="btn" onClick={() => onLms()}>
                {t.lihatLms}
              </button>
            )
          )}
        </section>
      )}
      <section className="panel tpsync" data-tone="ok">
        <CloudCheckIcon size={28} aria-hidden="true" />
        <div className="stack stack--sm grow">
          <b>{t.sinkronOk}</b>
          <span className="hint">
            {t.sinkronOkHint(s.terakhir ? waktuPanjang(s.terakhir, lang) : t.belumSinkron)}
          </span>
        </div>
        <div className="tpsync__count">
          <b className="mono">
            {data.hitung.masuk} / {data.hitung.peserta}
          </b>
          <span className="meter" style={{ "--meter": pct } as CSSProperties} />
          <span className="hint">{t.praktikanTerkumpul}</span>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={() => void run()}>
          {busy ? t.menyinkron : t.sinkronSekarang}
        </button>
      </section>
    </div>
  );
}

function GroupCard({
  lang,
  modul,
  g,
  info,
  cocok,
  onOpen,
}: {
  lang: Lang;
  modul: number;
  g: KelompokTp;
  info: string | null;
  cocok: (a: AnggotaTp) => boolean;
  onOpen: (g: GrupDinilai, i: number) => void;
}) {
  const t = TPS[lang];
  const [unduh, setUnduh] = useState<string | null>(null);
  const ms = g.anggota.filter(cocok);
  const masuk = g.anggota.filter((a) => a.berkas > 0 || a.status === "kosong").length;
  const done = g.anggota.filter((a) => a.status === "nilai" || a.status === "kosong").length;
  const buka = (i: number) => onOpen(g, i);
  const pertama = Math.max(
    0,
    g.anggota.findIndex((a) => a.status === "masuk" || a.status === "telat"),
  );
  const unduhSemua = async () => {
    const ada = g.anggota.filter((a) => a.kirimanId && a.berkas > 0);
    const isi: { nama: string; isi: Uint8Array<ArrayBuffer> }[] = [];
    let k = 0;
    for (const a of ada) {
      for (let i = 0; i < a.berkas; i++) {
        setUnduh(t.mengunduh(++k, ada.length));
        const r = await fetch(`/api/tp/berkas?id=${a.kirimanId}&i=${i}&unduh=1`).catch(() => null);
        if (!r?.ok) continue;
        const cd = r.headers.get("content-disposition") ?? "";
        const m = cd.match(/filename\*=UTF-8''([^;]+)/);
        const nama = m ? decodeURIComponent(m[1]) : `${a.nim}.pdf`;
        isi.push({ nama: `${a.nim} ${nama}`, isi: new Uint8Array(await r.arrayBuffer()) });
      }
    }
    setUnduh(null);
    if (!isi.length) return window.Toast?.show(t.berkasGagal, "warn");
    simpanBlob(
      buatZip(isi),
      `TP${modul}_${g.nomor ? `K${g.nomor}` : "lain"}${g.klp ? `_KLP${g.klp}` : ""}.zip`,
    );
  };
  return (
    <section
      className="panel tpgroup"
      style={grupStyle(g.nomor || 1)}
      data-mine={g.milikku ? "yes" : "no"}
    >
      <div className="tpgroup__head">
        <div className="stack stack--sm">
          <div className="row">
            {g.nomor ? (
              <Pill group={g.nomor}>{kelompokLabel(g.nomor, lang)}</Pill>
            ) : (
              <Pill>{t.tanpaKelompokH}</Pill>
            )}
            {g.klp && <Pill mono>KLP {g.klp}</Pill>}
          </div>
          {info && <span className="hint">{info}</span>}
        </div>
        <div className="tpgroup__ring">
          <ProgressRing
            value={done}
            max={Math.max(1, masuk)}
            label={`${done}/${masuk}`}
            color={`var(--group-${((Math.max(1, g.nomor) - 1) % 10) + 1})`}
          />
          <span className="hint">{t.dinilai}</span>
        </div>
      </div>
      <div className="stack stack--sm">
        {ms.length ? (
          ms.map((a) => {
            const i = g.anggota.indexOf(a);
            return (
              <button key={a.nim} type="button" className="tpmem" onClick={() => buka(i)}>
                <span className="tpmem__av" aria-hidden="true">
                  {inisial(a.nama)}
                </span>
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <b className="tpmem__n">{a.nama}</b>
                  <span className="hint mono">
                    {a.nim} · {t.sasaran[Number(a.nim.slice(-1)) % 2 === 0 ? "genap" : "ganjil"]}
                  </span>
                </span>
                <span className="tpmem__st">
                  {a.kecuali && <Pill>{LK[lang].pill}</Pill>}
                  <StatusPill s={a.status} lang={lang} />
                  {a.status === "nilai" && a.total != null ? (
                    <b className="mono tpmem__t">{a.total}</b>
                  ) : a.dikirimPada ? (
                    <span className="hint">{hariJamPendek(a.dikirimPada, lang)}</span>
                  ) : null}
                </span>
                <CaretRightIcon size={16} aria-hidden="true" />
              </button>
            );
          })
        ) : (
          <p className="hint">{t.tidakCocok}</p>
        )}
      </div>
      <div className="tpgroup__foot">
        {g.milikku || !g.pemegang ? (
          <>
            <button type="button" className="btn btn--primary" onClick={() => buka(pertama)}>
              {t.nilaiKelompok}
            </button>
            <IconButton
              icon={DownloadSimpleIcon}
              label={t.unduhSemua}
              tip={unduh ?? undefined}
              disabled={!!unduh || !g.anggota.some((a) => a.berkas > 0)}
              onClick={() => void unduhSemua()}
            />
          </>
        ) : (
          <>
            <span className="hint row">
              {t.dipegang} <Pill mono>{g.pemegang.kode}</Pill>
            </span>
            <button type="button" className="btn btn--ghost" onClick={() => buka(0)}>
              {t.lihat}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
