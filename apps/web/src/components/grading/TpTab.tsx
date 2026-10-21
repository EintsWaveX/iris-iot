/**
 * Penilaian › Tugas Pendahuluan (mockup a13-grading): pick a module, see how
 * many handed in, then the groups by SeeLabs KLP for that module's practicum week,
 * each member with status, upload time or score. Kelompokku is the groups
 * I hold that week; Semua Kelompok is everyone's, read only for the others.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CaretRightIcon, DownloadSimpleIcon, UsersThreeIcon } from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import { PillGanti } from "../ui/PillGanti";
import Dropdown from "../ui/Dropdown";
import { JejakDialog, KumpulDialog } from "../tp/KumpulDialog";
import TabLine from "../ui/TabLine";
import IconButton from "../ui/IconButton";
import { ProgressRing, StateView } from "../ui/Display";
import Lalu from "../ui/Lalu";
import { MODUL_NAMA, getJson, href, tanggalPanjang, useDetik } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { kelompokLabel, modulLabel } from "../../lib/labels";
import { TP_MENUNGGU } from "../../lib/tp";
import { buatZip, simpanBlob } from "../../lib/zip";
import { TPS } from "../tp/tpStrings";
import {
  Countdown,
  StatusPill,
  grupStyle,
  hariJam,
  hariJamPendek,
  inisial,
  modulStyle,
  waktuPanjang,
} from "../tp/shared";
import type { AnggotaTp, DataKelompok, GrupDinilai, KelompokTp } from "./types";
import { PT } from "./pengaturanStrings";

type Saring = "all" | "todo" | "telat" | "belum";

export default function TpTab({
  lang,
  modul,
  setModul,
  data,
  onOpen,
  onFlip,
}: {
  lang: Lang;
  modul: number;
  setModul: (m: number) => void;
  data: DataKelompok | null;
  onOpen: (g: GrupDinilai, i: number) => void;
  /** Reads the groups again (the window opened or closed on the clock). */
  onFlip: () => void;
}) {
  const t = TPS[lang];
  const saringan = useRef<HTMLDivElement>(null);
  const [who, setWho] = useState<"mine" | "all">("mine");
  const [f, setF] = useState<Saring>("all");
  // All groups narrowed to a day, then one of its sessions (2026-10-15),
  // and a name or NIM.
  const [hari, setHari] = useState("semua");
  const [sesi, setSesi] = useState("semua");
  const [cari, setCari] = useState("");
  const [kumpul, setKumpul] = useState(false);
  const [jejak, setJejak] = useState(false);
  if (!data) return <span className="skeleton" style={{ height: 420 }} />;

  const mine = data.slot.flatMap((s) => s.kelompok.filter((g) => g.milikku).map((g) => ({ s, g })));
  const q = cari.trim().toLowerCase();
  const cocok = (a: AnggotaTp) =>
    (!q || a.nama.toLowerCase().includes(q) || a.nim.includes(q)) &&
    (f === "all" ||
      (f === "todo" && TP_MENUNGGU.includes(a.status)) ||
      (f === "telat" && a.status === "telat") ||
      (f === "belum" && (a.status === "belum" || a.status === "kosong")));
  // A filter or a search on: a group with nobody left in it goes.
  const menyaring = f !== "all" || !!q;
  const tampilGrup = (g: { anggota: AnggotaTp[] }) => !menyaring || g.anggota.some(cocok);
  const hariAda = [...new Set(data.slot.map((s) => s.hari))].sort((a, b) => a - b);
  const slotHari = data.slot.filter((s) => hari === "semua" || String(s.hari) === hari);
  const slotTampil = slotHari
    .filter((s) => sesi === "semua" || `${s.hari}-${s.slot}` === sesi)
    .map((s) => ({ s, gs: s.kelompok.filter(tampilGrup) }))
    .filter((x) => x.gs.length > 0);
  const mineTampil = mine.filter(({ g }) => tampilGrup(g));
  const tanpaTampil =
    data.tanpaKelompok.length > 0 &&
    hari === "semua" &&
    (!menyaring || data.tanpaKelompok.some(cocok));
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

      <TpKini
        key={modul}
        lang={lang}
        modul={modul}
        data={data}
        onFlip={onFlip}
        onJejak={() => setJejak(true)}
        onSesi={(s) => {
          // A session's row narrows the groups below to it.
          setWho("all");
          setHari(String(s.hari));
          setSesi(`${s.hari}-${s.slot}`);
          saringan.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <div className="panel tpfilter tpfilter--tp" ref={saringan}>
        <div className="tpfilter__top">
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
          <div className="row tpfilter__acts">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setKumpul(true)}
            >
              {t.siapaSaja}
              <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setJejak(true)}>
              {t.riwayatKumpul}
              <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="tpfilter__row">
          {who === "all" && (
            <div className="tpfilter__pick">
              <Dropdown
                id="tp-hari"
                label={t.saringHari}
                value={hari}
                onChange={(v) => {
                  setHari(v);
                  setSesi("semua");
                }}
                options={[
                  { value: "semua", label: t.semuaHari },
                  ...hariAda.map((h) => ({ value: String(h), label: t.hari[h] ?? String(h) })),
                ]}
              />
              <Dropdown
                id="tp-sesi"
                label={t.saringSesi}
                value={sesi}
                onChange={setSesi}
                options={[
                  { value: "semua", label: t.semuaSesiTp },
                  ...slotHari.map((s) => ({
                    value: `${s.hari}-${s.slot}`,
                    label: t.sesiPilihan(t.hari[s.hari] ?? "", s.slot),
                    note: tanggalPanjang(s.tanggal, lang),
                  })),
                ]}
              />
            </div>
          )}
          <label className="field tpfilter__cari">
            <span className="field__label">{t.cariPraktikan}</span>
            <input
              className="field__input"
              value={cari}
              inputMode="search"
              onChange={(e) => setCari(e.target.value)}
            />
          </label>
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
      </div>
      {kumpul && <KumpulDialog open onOpenChange={setKumpul} lang={lang} modul={modul} />}
      {jejak && <JejakDialog open onOpenChange={setJejak} lang={lang} modul={modul} />}

      {data.slot.length === 0 && data.tanpaKelompok.length === 0 ? (
        <section className="panel">
          <StateView icon={<UsersThreeIcon size={28} />} title={t.kosongRoster} />
        </section>
      ) : who === "mine" ? (
        mineTampil.length ? (
          <div className="tpgroups">
            {mineTampil.map(({ s, g }) => (
              <GroupCard
                key={`${s.hari}-${s.slot}-${g.nomor}`}
                lang={lang}
                modul={modul}
                g={g}
                info={slotInfo(s)}
                cocok={cocok}
                onOpen={onOpen}
                admin={!!data.bolehTanpaPemegang}
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
          {slotTampil.length === 0 && !tanpaTampil && (
            <section className="panel">
              <StateView icon={<UsersThreeIcon size={28} />} title={t.tidakAdaCocok} />
            </section>
          )}
          {slotTampil.map(({ s, gs }) => (
            <section key={`${s.hari}-${s.slot}`} className="tpslot">
              <h3 className="tpslot__h">{slotInfo(s)}</h3>
              <div className="tpgroups">
                {gs.map((g) => (
                  <GroupCard
                    key={g.nomor}
                    lang={lang}
                    modul={modul}
                    g={g}
                    info={null}
                    cocok={cocok}
                    onOpen={onOpen}
                    admin={!!data.bolehTanpaPemegang}
                  />
                ))}
              </div>
            </section>
          ))}
          {tanpaTampil && (
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
                  admin={!!data.bolehTanpaPemegang}
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

interface FeedJejak {
  ok: boolean;
  jejak: {
    id: number;
    nim: string;
    nama: string;
    kursus: string | null;
    jenis: string;
    dicatatPada: string;
  }[];
}

/**
 * The live card (2026-10-21, the LMS Ringkasan's on IRIS's own data): the
 * window's phase from the clock with the rainbow countdown, how many handed
 * in, each session's share, and the files coming in while it is open.
 */
function TpKini({
  lang,
  modul,
  data,
  onFlip,
  onJejak,
  onSesi,
}: {
  lang: Lang;
  modul: number;
  data: DataKelompok;
  onFlip: () => void;
  onJejak: () => void;
  onSesi: (s: DataKelompok["slot"][number]) => void;
}) {
  const t = TPS[lang];
  const x = data.modul.find((m) => m.modul === modul);
  const j = x?.jendela ?? null;
  // The phase from the clock, so the card turns the second the window opens
  // or closes; then the groups are read again, at most every 15 s in case
  // this clock and the server's disagree.
  const now = useDetik();
  const k = !j
    ? (x?.keadaan ?? null)
    : now < Date.parse(j.buka)
      ? "belum"
      : now < Date.parse(j.tutup)
        ? "buka"
        : "tutup";
  const dibaca = useRef(0);
  useEffect(() => {
    if (!j || k === x?.keadaan || Date.now() - dibaca.current < 15_000) return;
    dibaca.current = Date.now();
    onFlip();
  });
  const h = data.hitung;
  const pct = h.peserta ? Math.round((h.masuk / h.peserta) * 100) : 0;
  const belum = Math.max(0, h.peserta - h.masuk);
  const dihitung = k === "buka" || k === "tutup";
  // Each session of the module's week: its Praktikan, without the excluded.
  const sesi = data.slot
    .map((s) => {
      const a = s.kelompok.flatMap((g) => g.anggota).filter((y) => !y.kecuali);
      return { s, n: a.length, masuk: a.filter((y) => y.berkas > 0).length };
    })
    .filter((y) => y.n > 0);
  const lengkap = sesi.filter((y) => y.masuk >= y.n).length;
  return (
    <section className="panel panel--key tpkini" data-fase={k ?? "kosong"}>
      <div className="tpkini__main">
        {!j || !k ? (
          <>
            <span className="field__label">{t.kiniTanpa(modul)}</span>
            <span className="hint">{t.kiniTanpaHint}</span>
          </>
        ) : k === "belum" ? (
          <>
            <span className="field__label">{t.kiniBelum(modul)}</span>
            <Countdown to={j.buka} lang={lang} pelangi />
            <span className="hint">
              {t.sampai(waktuPanjang(j.buka, lang), waktuPanjang(j.tutup, lang))}
            </span>
          </>
        ) : k === "buka" ? (
          <>
            <span className="field__label tpkini__lbl">
              <span className="dot dot--ok dot--pulse" aria-hidden="true" />
              {t.kiniBuka(modul)}
            </span>
            <Countdown to={j.tutup} lang={lang} pelangi keTutup />
            <span className="hint">{waktuPanjang(j.tutup, lang)}</span>
          </>
        ) : (
          <>
            <span className="field__label">{t.kiniTutup(modul)}</span>
            <b className="tpkini__big">{belum ? t.belumKumpulN(belum) : t.semuaKumpul}</b>
            <span className="hint">
              {waktuPanjang(j.tutup, lang)}. {t.kumpulIrisHint}
            </span>
          </>
        )}
      </div>
      <div className="tpkini__side">
        <div className="stack stack--sm">
          <div className="row row--between">
            <span className="field__label">{t.kumpulIris}</span>
            <b className="mono tpkini__n">
              {h.masuk} / {h.peserta}
            </b>
          </div>
          <span className="meter meter--lg" style={{ "--meter": pct } as CSSProperties} />
          <span className="hint">{dihitung ? t.dariTerdaftar(pct) : t.mulaiDihitung}</span>
        </div>
        {/* Kelola TP › Pengaturan TP: who counts, the default window. */}
        <a className="btn" href={href(lang, "/tp#pengaturan")}>
          {t.tabPengaturan}
        </a>
      </div>
      {dihitung && sesi.length > 0 && (
        <div className="tpkini__row">
          <span className="row row--between">
            <span className="field__label">{t.perSesi}</span>
            <span className="hint">{t.sesiLengkap(lengkap, sesi.length)}</span>
          </span>
          <ul className="tpkini__sesi">
            {sesi.map(({ s, n, masuk }) => (
              <li key={`${s.hari}-${s.slot}`} data-penuh={masuk >= n ? "yes" : undefined}>
                <button type="button" data-tip={t.lihatSesi} onClick={() => onSesi(s)}>
                  <span className="tpkini__sesi-k">
                    <b>{t.sesiPilihan(t.hari[s.hari] ?? "", s.slot)}</b>
                    <span className="hint">{tanggalPanjang(s.tanggal, lang)}</span>
                  </span>
                  <span
                    className="meter"
                    style={{ "--meter": Math.round((masuk / n) * 100) } as CSSProperties}
                  />
                  <span className="mono tpkini__sesi-n">
                    {masuk} / {n}
                  </span>
                  <span className="hint tpkini__sesi-s">
                    {masuk >= n ? t.semuaKumpul : t.sisaN(n - masuk)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {k === "buka" && <BaruMasuk lang={lang} modul={modul} onJejak={onJejak} />}
    </section>
  );
}

/** The newest four files in, live on each upload; only those that came in
 *  since the card was drawn ease in. */
function BaruMasuk({ lang, modul, onJejak }: { lang: Lang; modul: number; onJejak: () => void }) {
  const t = TPS[lang];
  const poll = usePoll(
    () => getJson<FeedJejak>(`/api/tp/jejak?modul=${modul}&n=40`),
    60_000,
    true,
    ["tp"],
    0,
    modul,
  );
  // Each Praktikan once, at their newest file.
  const sudah = new Set<string>();
  const baru = (poll.data?.ok ? poll.data.jejak : [])
    .filter((y) => y.jenis !== "tarik" && !sudah.has(y.nim) && !!sudah.add(y.nim))
    .slice(0, 4);
  const dilihat = useRef<Set<number> | null>(null);
  const baruIni = dilihat.current
    ? new Set(baru.filter((y) => !dilihat.current!.has(y.id)).map((y) => y.id))
    : new Set<number>();
  useEffect(() => {
    if (!poll.data) return;
    dilihat.current = new Set([...(dilihat.current ?? []), ...baru.map((y) => y.id)]);
  });
  return (
    <div className="tpkini__row">
      <span className="row row--between">
        <span className="field__label">{t.baruMasuk}</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onJejak}>
          {t.riwayatLengkap}
          <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
        </button>
      </span>
      {!poll.data ? (
        <span className="skeleton" style={{ height: 58 }} />
      ) : baru.length ? (
        <ul className="tpkini__arr">
          {baru.map((y) => (
            <li key={y.id} data-baru={baruIni.has(y.id) ? "yes" : undefined}>
              <b>{y.nama}</b>
              <span className="hint">
                {[y.kursus, y.jenis === "ganti" ? t.gantiBerkas : ""].filter(Boolean).join(" · ")}
              </span>
              <span className="hint">
                <Lalu iso={y.dicatatPada} lang={lang} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="hint">{t.belumAdaMasuk}</span>
      )}
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
  admin,
}: {
  lang: Lang;
  modul: number;
  g: KelompokTp;
  info: string | null;
  cocok: (a: AnggotaTp) => boolean;
  onOpen: (g: GrupDinilai, i: number) => void;
  /** Grades a group with no Per Modul seat (Admin, Pencipta). */
  admin: boolean;
}) {
  const t = TPS[lang];
  const [unduh, setUnduh] = useState<string | null>(null);
  const ms = g.anggota.filter(cocok);
  const masuk = g.anggota.filter((a) => a.berkas > 0 || a.status === "kosong").length;
  const done = g.anggota.filter((a) => a.status === "nilai" || a.status === "kosong").length;
  const buka = (i: number) => onOpen(g, i);
  const pertama = Math.max(
    0,
    g.anggota.findIndex((a) => TP_MENUNGGU.includes(a.status)),
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
            {g.ganti && <PillGanti ganti={g.ganti} lang={lang} />}
            {!!g.nilaiLain?.length && (
              <Pill tone="warn" title={t.nilaiLainTip}>
                {t.nilaiLainPill(g.nilaiLain.join(", "))}
              </Pill>
            )}
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
                  {a.kecuali && <Pill>{PT[lang].pill}</Pill>}
                  <StatusPill s={a.status} lang={lang} />
                  {a.status === "nilai" && a.perpanjangan && <StatusPill s="panjang" lang={lang} />}
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
        {g.milikku || (!g.pemegang && admin) ? (
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
            {g.pemegang ? (
              <span className="hint row">
                {t.dipegang} <Pill mono>{g.pemegang.kode}</Pill>
              </span>
            ) : (
              <span className="hint">{t.tanpaPemegangAdmin}</span>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => buka(0)}>
              {t.lihat}
              <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </section>
  );
}
