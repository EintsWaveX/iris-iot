/**
 * LMS › Sambungan (Phase 15; Penilaian's Sumber LMS until then, mockup
 * a13-lms): everything about the connection lives here, so nobody opens
 * the LMS unless something breaks. Every Asisten reads it; connecting,
 * testing, disconnecting and the default window are the Pencipta's and
 * Admins'. The connection (an app token, kept encrypted, shown by
 * its last four characters only), the practicum classes and which TP
 * assignments IRIS found by name, the semester's default window, and the
 * sync history. Since 2026-10-13 IRIS also makes, matches and deletes the
 * TP assignments there itself (a TP column's header opens KelolaDialog),
 * and Peserta TP says who counts.
 */
import { useEffect, useState } from "react";
import {
  ArrowSquareOutIcon,
  CheckIcon,
  CloudSlashIcon,
  PlugsConnectedIcon,
  PlugsIcon,
  ShieldCheckIcon,
  WarningIcon,
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
import { waktuPanjang } from "../tp/shared";
import type { InfoSinkron } from "./types";
import {
  KelolaDialog,
  PesertaPanel,
  keadaanTugas,
  type KelolaInfo,
  type KursusKelola,
  type PesertaInfo,
} from "./LmsKelola";
import { LK } from "./lmsKelolaStrings";
import { RiwayatPanel, SilangPanel, type SilangInfo } from "./LmsRingkas";
import { BacaSaja } from "../lms/LmsPage";

type KursusInfo = KursusKelola;
interface LmsInfo {
  ok: boolean;
  kode?: string;
  bolehSambung: boolean;
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
  kelola: KelolaInfo;
  peserta: PesertaInfo;
  logTotal: number;
  silang: SilangInfo;
}

export default function LmsTab({
  lang,
  kelolaAwal,
  onKelolaDibuka,
}: {
  lang: Lang;
  /** A module whose assignments to open straight away (from the TP tab). */
  kelolaAwal?: number | null;
  onKelolaDibuka?: () => void;
}) {
  const t = TPS[lang];
  const tk = LK[lang];
  const [kelola, setKelola] = useState<number | null>(null);
  const poll = usePoll(
    () => getJson<LmsInfo>("/api/tp/lms-info").then((d) => (d.ok ? d : null)),
    120_000,
    true,
    ["tp"],
  );
  const d = poll.data;
  useEffect(() => {
    if (!d || !kelolaAwal) return;
    setKelola(kelolaAwal);
    onKelolaDibuka?.();
  }, [d, kelolaAwal, onKelolaDibuka]);
  const [sambung, setSambung] = useState(false);
  const [putus, setPutus] = useState(false);
  const [bawaan, setBawaan] = useState(false);
  const [uji, setUji] = useState(false);
  if (!d) return <span className="skeleton" style={{ height: 420 }} />;

  // Per class: the LMS's students who aren't registered Praktikan.
  const luarOf = new Map(d.silang.perKelas.map((k) => [k.label, k.luar]));
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
          d.bolehSambung ? (
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => setSambung(true)}
            >
              {t.sambungLms}
            </button>
          ) : undefined
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
        <div>
          <dt>{tk.pengelola}</dt>
          <dd>{d.kelola.siap ? tk.kelolaTersambung : tk.kelolaBelum}</dd>
        </div>
      </dl>
      <div className="tpbtns" hidden={!d.bolehSambung || undefined}>
        {ditolak ? (
          <button type="button" className="btn btn--danger" onClick={() => setSambung(true)}>
            {t.sambungUlang}
          </button>
        ) : (
          <>
            <button type="button" className="btn" disabled={uji} onClick={() => void ujiKoneksi()}>
              {t.ujiKoneksi}
            </button>
            <button type="button" className="btn" onClick={() => setSambung(true)}>
              {t.sambungUlang}
            </button>
            <button type="button" className="btn btn--danger-soft" onClick={() => setPutus(true)}>
              {t.putuskan}
            </button>
          </>
        )}
      </div>
    </section>
  );

  return (
    <div className="stack stack--lg">
      <BacaSaja lang={lang} boleh={d.kelola.boleh} />
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
                      <th className="num" title={tk.luarHint}>
                        {tk.kLuar}
                      </th>
                      {[1, 2, 3, 4].map((m) => (
                        <th key={m} className="num">
                          {/* Kelola opens for the lms right only; others read the marks. */}
                          {d.kelola.boleh ? (
                            <button
                              type="button"
                              className="tpkel__th"
                              title={tk.kelolaBuka(m)}
                              aria-label={tk.kelolaBuka(m)}
                              onClick={() => setKelola(m)}
                            >
                              TP {m}
                            </button>
                          ) : (
                            `TP ${m}`
                          )}
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
                        <td
                          className="num mono tpluar"
                          data-ada={luarOf.get(k.label) ? "ya" : undefined}
                        >
                          {d.silang.adaData ? (luarOf.get(k.label) ?? 0) : "…"}
                        </td>
                        {[1, 2, 3, 4].map((m) => {
                          const ada = k.tugas[String(m)];
                          const st = keadaanTugas(ada, d.kelola.jendela[String(m)] ?? null);
                          // Found, but its dates aren't the IRIS window's: a softer mark.
                          const label = !ada
                            ? t.tidakDitemukan
                            : st === "beda" && d.kelola.jendela[String(m)]
                              ? `${t.ditemukan}: ${ada.nama} · ${tk.st.beda}`
                              : `${t.ditemukan}: ${ada.nama}`;
                          const tanda = {
                            className: "tpcheck",
                            "data-s": !ada
                              ? "miss"
                              : st === "beda" && d.kelola.jendela[String(m)]
                                ? "beda"
                                : "ok",
                            title: label,
                            "aria-label": `${k.label}, TP ${m}: ${label}`,
                          };
                          const ikon = ada ? (
                            <CheckIcon size={14} aria-hidden="true" />
                          ) : (
                            <WarningIcon size={14} aria-hidden="true" />
                          );
                          return (
                            <td key={m} className="num">
                              {d.kelola.boleh ? (
                                <button type="button" {...tanda} onClick={() => setKelola(m)}>
                                  {ikon}
                                </button>
                              ) : (
                                <span {...tanda} role="img">
                                  {ikon}
                                </span>
                              )}
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
            <dl className="tpkolom">
              <div>
                <dt className="mono">{t.praktikan}</dt>
                <dd>{tk.kolomPraktikan}</dd>
              </div>
              <div>
                <dt className="mono tpluar" data-ada="ya">
                  {tk.kLuar}
                </dt>
                <dd>{tk.kolomLuar}</dd>
              </div>
            </dl>
            <p className="hint">{t.kelasLmsFoot}</p>
          </section>
        </div>
        <div className="stack stack--lg tplms__kanan">
          <PesertaPanel
            lang={lang}
            peserta={d.peserta}
            boleh={d.kelola.boleh}
            onDone={poll.refresh}
          />
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
            {d.bolehSambung && (
              <div className="panel__actions">
                <button type="button" className="btn" onClick={() => setBawaan(true)}>
                  {t.ubahBawaan}
                </button>
              </div>
            )}
          </section>
          <SilangPanel lang={lang} silang={d.silang} />
        </div>
      </div>
      <RiwayatPanel lang={lang} log={d.log} total={d.logTotal} />
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
      <KelolaDialog
        open={kelola !== null}
        onOpenChange={(v) => !v && setKelola(null)}
        lang={lang}
        modul={kelola ?? 1}
        kursus={d.kursus}
        kelola={d.kelola}
        onDone={poll.refresh}
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
              <p className="hint">{LK[lang].sambungKunci}</p>
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
