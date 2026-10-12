/**
 * Penilaian › Sumber LMS (mockup a13-lms), for the Pencipta and Admins:
 * everything about the LMS lives here, so nobody opens the LMS unless
 * something breaks. The connection (an app token, kept encrypted, shown by
 * its last four characters only), the practicum classes and which TP
 * assignments IRIS found by name, the semester's default window, and the
 * sync history.
 */
import { useState } from "react";
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CheckIcon,
  CloudSlashIcon,
  PencilSimpleIcon,
  PlugsConnectedIcon,
  PlugsIcon,
  ShieldCheckIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Confirm from "../ui/Confirm";
import Dropdown from "../ui/Dropdown";
import { StateView } from "../ui/Display";
import { TimeField } from "../ui/Controls";
import { getJson, postJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import type { PolaJendela } from "../../lib/tp";
import { TPS } from "../tp/tpStrings";
import { jam, waktuPanjang } from "../tp/shared";
import type { InfoSinkron } from "./types";

interface KursusInfo {
  id: number;
  nama: string;
  label: string;
  kelas: string;
  peserta: number;
  tugas: Record<string, { id: number; cmid: number; nama: string } | null>;
}
interface LmsInfo {
  ok: boolean;
  kode?: string;
  token: {
    akhir: string;
    akun: { userid: number; nama: string; username: string };
    pada: string;
    oleh: { kode: string; nama: string } | null;
  } | null;
  kursus: KursusInfo[];
  kelasPada: string | null;
  pola: PolaJendela;
  sinkron: InfoSinkron;
  log: {
    id: number;
    mulai: string;
    oleh: string;
    hasil: "ok" | "gagal";
    baru: number;
    diperbarui: number;
    durasiMs: number;
    galat: string | null;
  }[];
  alamatMasuk: string;
  lmsUrl: string;
}

export default function LmsTab({ lang }: { lang: Lang }) {
  const t = TPS[lang];
  const poll = usePoll(
    () => getJson<LmsInfo>("/api/tp/lms-info").then((d) => (d.ok ? d : null)),
    120_000,
    true,
    ["tp"],
  );
  const d = poll.data;
  const [sambung, setSambung] = useState(false);
  const [putus, setPutus] = useState(false);
  const [bawaan, setBawaan] = useState(false);
  const [uji, setUji] = useState(false);
  if (!d) return <span className="skeleton" style={{ height: 420 }} />;

  const ditolak =
    d.sinkron.hasil === "gagal" &&
    (d.sinkron.galat === "token_ditolak" || d.sinkron.galat === "token_rusak");
  const ujiKoneksi = async () => {
    setUji(true);
    const r = await postJson<{ ok: boolean; ms?: number; kursus?: number; kode?: string }>(
      "/api/tp/lms",
      {
        aksi: "uji",
      },
    ).catch(
      () =>
        ({ ok: false, kode: "lms_tak_terjangkau" }) as {
          ok: boolean;
          kode?: string;
          ms?: number;
          kursus?: number;
        },
    );
    setUji(false);
    if (r.ok)
      window.Toast?.show(
        t.ujiOk(
          r.kursus ?? 0,
          ((r.ms ?? 0) / 1000).toLocaleString(lang === "en" ? "en-GB" : "id-ID", {
            maximumFractionDigits: 1,
          }),
        ),
        "ok",
      );
    else window.Toast?.show(t.hasilGagal(r.kode ?? ""), "warn");
  };

  const con = !d.token ? (
    <section className="panel panel--raised tpcon">
      <StateView
        icon={<PlugsIcon size={28} />}
        title={t.lmsBelumH}
        body={t.lmsBelumBody}
        actions={
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => setSambung(true)}
          >
            <PlugsConnectedIcon size={20} aria-hidden="true" />
            {t.sambungLms}
          </button>
        }
      />
    </section>
  ) : (
    <section className="panel panel--raised tpcon" data-tone={ditolak ? "danger" : "ok"}>
      <div className="row row--nowrap">
        {ditolak ? (
          <CloudSlashIcon size={32} aria-hidden="true" />
        ) : (
          <PlugsConnectedIcon size={32} aria-hidden="true" />
        )}
        <div className="stack stack--sm">
          <h2 className="tpcon__h">{ditolak ? t.lmsDitolak : t.lmsTersambung}</h2>
          <span className="hint">
            {ditolak
              ? t.lmsDitolakBody(
                  waktuPanjang(d.sinkron.galatSejak ?? d.sinkron.terakhir ?? d.token.pada, lang),
                )
              : t.lmsTokenInfo}
          </span>
        </div>
      </div>
      <dl className="tpdl">
        <div>
          <dt>{t.akun}</dt>
          <dd>
            {d.token.akun.nama} <span className="hint mono">({d.token.akun.username})</span>
          </dd>
        </div>
        <div>
          <dt>{t.token}</dt>
          <dd className="mono">•••• {d.token.akhir}</dd>
        </div>
        <div>
          <dt>{t.disambungkan}</dt>
          <dd>
            {d.token.oleh ? `${d.token.oleh.nama} (${d.token.oleh.kode}) · ` : ""}
            {waktuPanjang(d.token.pada, lang)}
          </dd>
        </div>
      </dl>
      <div className="tpbtns">
        {ditolak ? (
          <button type="button" className="btn btn--danger" onClick={() => setSambung(true)}>
            <PlugsConnectedIcon size={18} aria-hidden="true" />
            {t.sambungUlang}
          </button>
        ) : (
          <>
            <button type="button" className="btn" disabled={uji} onClick={() => void ujiKoneksi()}>
              <CheckCircleIcon size={18} aria-hidden="true" />
              {t.ujiKoneksi}
            </button>
            <button type="button" className="btn" onClick={() => setSambung(true)}>
              <PlugsConnectedIcon size={18} aria-hidden="true" />
              {t.sambungUlang}
            </button>
            <button type="button" className="btn btn--danger-soft" onClick={() => setPutus(true)}>
              <XIcon size={18} aria-hidden="true" />
              {t.putuskan}
            </button>
          </>
        )}
      </div>
    </section>
  );

  const oleh = (o: string) =>
    o === "pi"
      ? t.olehPi
      : o === "halaman"
        ? t.olehHalaman
        : o.startsWith("manual:")
          ? t.olehManual(o.slice(7))
          : o;

  return (
    <div className="tplms__grid">
      <div className="stack stack--lg">
        {con}
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">{t.kelasLms}</h2>
            <span className="hint">{t.kelasLmsHint}</span>
          </div>
          {d.kursus.length ? (
            <div className="tpscroll">
              <table className="tptable">
                <thead>
                  <tr>
                    <th>{t.kelas}</th>
                    <th className="num">{t.praktikan}</th>
                    {[1, 2, 3, 4].map((m) => (
                      <th key={m} className="num">
                        TP {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.kursus.map((k) => (
                    <tr key={k.id}>
                      <td>
                        <a
                          href={`${d.lmsUrl}/course/view.php?id=${k.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={k.nama}
                        >
                          <b className="mono">{k.label}</b>
                        </a>
                      </td>
                      <td className="num mono">{k.peserta}</td>
                      {[1, 2, 3, 4].map((m) => {
                        const ada = k.tugas[String(m)];
                        return (
                          <td key={m} className="num">
                            <span
                              className="tpcheck"
                              data-s={ada ? "ok" : "miss"}
                              title={ada ? `${t.ditemukan}: ${ada.nama}` : t.tidakDitemukan}
                            >
                              {ada ? (
                                <CheckIcon size={14} aria-label={t.ditemukan} />
                              ) : (
                                <WarningIcon size={14} aria-label={t.tidakDitemukan} />
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="hint">{t.belumAdaKelas}</p>
          )}
          <p className="hint">{t.kelasLmsFoot}</p>
        </section>
      </div>
      <div className="stack stack--lg">
        <section className="panel">
          <h2 className="panel__title">{t.jadwalAmbil}</h2>
          <dl className="tpdl tpdl--one">
            <div>
              <dt>{t.jendelaBawaan}</dt>
              <dd>
                {t.polaTeks(
                  t.hari[d.pola.hariBuka],
                  d.pola.jamBuka,
                  t.hari[d.pola.hariTutup],
                  d.pola.jamTutup,
                )}
              </dd>
            </div>
            <div>
              <dt>{t.selamaJendela}</dt>
              <dd>{t.selamaJendelaIsi}</dd>
            </div>
            <div>
              <dt>{t.sapuanAkhir}</dt>
              <dd>{t.sapuanAkhirIsi}</dd>
            </div>
          </dl>
          <div className="panel__actions">
            <button type="button" className="btn" onClick={() => setBawaan(true)}>
              <PencilSimpleIcon size={18} aria-hidden="true" />
              {t.ubahBawaan}
            </button>
          </div>
        </section>
        <section className="panel">
          <h2 className="panel__title">{t.riwayat}</h2>
          {d.log.length ? (
            <ul className="tplog">
              {d.log.map((r) => (
                <li key={r.id} data-tone={r.hasil === "gagal" ? "danger" : "ok"}>
                  <span className="mono">{jam(r.mulai)}</span>
                  <span className="grow stack" style={{ gap: 0 }}>
                    <b>
                      {r.hasil === "gagal"
                        ? t.hasilGagal(r.galat ?? "")
                        : t.hasilBerkas(r.baru, r.diperbarui)}
                    </b>
                    <span className="hint">
                      {oleh(r.oleh)} · {(r.durasiMs / 1000).toFixed(1)} s ·{" "}
                      {waktuPanjang(r.mulai, lang).split(" · ")[0]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">{t.riwayatKosong}</p>
          )}
        </section>
      </div>
      <SambungDialog
        open={sambung}
        onOpenChange={setSambung}
        lang={lang}
        alamat={d.alamatMasuk}
        onDone={poll.refresh}
      />
      <Confirm
        open={putus}
        onOpenChange={setPutus}
        title={t.putusJudul}
        body={t.putusBody}
        confirmLabel={t.putuskan}
        cancelLabel={t.batal}
        lang={lang}
        onConfirm={async () => {
          const r = await postJson<{ ok: boolean }>("/api/tp/lms", { aksi: "putus" }).catch(() => ({
            ok: false,
          }));
          window.Toast?.show(r.ok ? t.putusOk : t.gagal, r.ok ? "ok" : "warn");
          poll.refresh();
        }}
      />
      <BawaanDialog
        open={bawaan}
        onOpenChange={setBawaan}
        lang={lang}
        pola={d.pola}
        onDone={poll.refresh}
      />
    </div>
  );
}

function SambungDialog({
  open,
  onOpenChange,
  lang,
  alamat,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  alamat: string;
  onDone: () => void;
}) {
  const t = TPS[lang];
  const [tempel, setTempel] = useState("");
  const [busy, setBusy] = useState(false);
  const kirim = async () => {
    setBusy(true);
    type Jawab = { ok: boolean; kode?: string; rinci?: string; kursus?: number };
    const r = await postJson<Jawab>("/api/tp/lms", {
      aksi: "sambung",
      tempel,
    }).catch((): Jawab => ({ ok: false, kode: "lms_tak_terjangkau" }));
    setBusy(false);
    if (!r.ok)
      return window.Toast?.show(
        `${t.hasilGagal(r.kode ?? "")}${r.rinci ? ` (${r.rinci})` : ""}`,
        "warn",
      );
    window.Toast?.show(t.tersambungOk(r.kursus ?? 0), "ok");
    setTempel("");
    onOpenChange(false);
    onDone();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.sambungJudul}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.batal}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !tempel.trim()}
            onClick={() => void kirim()}
          >
            <PlugsConnectedIcon size={18} aria-hidden="true" />
            {busy ? t.menyambung : t.sambungkan}
          </button>
        </>
      }
    >
      <div className="stack">
        <ol className="tpsteps">
          <li>
            <span>1</span>
            <div className="stack stack--sm">
              <p>{t.sambung1}</p>
              <a className="btn" href={alamat} target="_blank" rel="noopener noreferrer">
                {t.bukaLms}
                <ArrowSquareOutIcon size={18} aria-hidden="true" />
              </a>
            </div>
          </li>
          <li>
            <span>2</span>
            <p>{t.sambung2}</p>
          </li>
          <li>
            <span>3</span>
            <p>{t.sambung3}</p>
          </li>
        </ol>
        <label className="field">
          <span className="field__label">{t.tempel}</span>
          <input
            className="field__input tptempel"
            value={tempel}
            placeholder={t.tempelPh}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setTempel(e.target.value)}
          />
        </label>
        <div className="banner">
          <ShieldCheckIcon size={20} aria-hidden="true" />
          <span>{t.sambungSaran}</span>
        </div>
      </div>
    </Dialog>
  );
}

function BawaanDialog({
  open,
  onOpenChange,
  lang,
  pola,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  pola: PolaJendela;
  onDone: () => void;
}) {
  const t = TPS[lang];
  const [p, setP] = useState(pola);
  const hari = [1, 2, 3, 4, 5, 6, 7].map((h) => ({ value: String(h), label: t.hari[h] }));
  const kirim = async () => {
    const r = await postJson<{ ok: boolean }>("/api/tp/jendela", { pola: p }).catch(() => ({
      ok: false,
    }));
    window.Toast?.show(r.ok ? t.bawaanDisimpan : t.gagal, r.ok ? "ok" : "warn");
    if (r.ok) {
      onOpenChange(false);
      onDone();
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setP(pola);
        onOpenChange(v);
      }}
      title={t.bawaanJudul}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.batal}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void kirim()}>
            {t.simpan}
          </button>
        </>
      }
    >
      <div className="tpwinform">
        <div className="field">
          <span className="field__label">{t.dibuka}</span>
          <div className="tpwinform__row">
            <Dropdown
              id="tp-hari-buka"
              label={t.hariBuka}
              hideLabel
              options={hari}
              value={String(p.hariBuka)}
              onChange={(v) => setP({ ...p, hariBuka: Number(v) })}
            />
            <TimeField
              value={p.jamBuka}
              onChange={(v) => setP({ ...p, jamBuka: v })}
              label={t.jamBuka}
              lang={lang}
            />
          </div>
        </div>
        <div className="field">
          <span className="field__label">{t.ditutup}</span>
          <div className="tpwinform__row">
            <Dropdown
              id="tp-hari-tutup"
              label={t.hariTutup}
              hideLabel
              options={hari}
              value={String(p.hariTutup)}
              onChange={(v) => setP({ ...p, hariTutup: Number(v) })}
            />
            <TimeField
              value={p.jamTutup}
              onChange={(v) => setP({ ...p, jamTutup: v })}
              label={t.jamTutup}
              lang={lang}
            />
          </div>
        </div>
        <p className="hint">{t.bawaanHint}</p>
      </div>
    </Dialog>
  );
}
