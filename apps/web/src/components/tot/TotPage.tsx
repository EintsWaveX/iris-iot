/**
 * /tot (2026-10-12): Mode TOT with full control, its own page and nav chip
 * instead of a tab at the end of Persiapan.
 *
 * - The Switch: on and off, with who switched it and since when.
 * - TOT Session: start one (module, length) while TOT is on; while it runs,
 *   its clock, Open the Console, Add 15 Minutes, End, and each group's
 *   progress with Clear to let a group practise again.
 * - Participants: which divisions take part (one group each, in the order
 *   picked) and how many of each division's ten dummies; while TOT is on
 *   and nothing runs, the roster follows at once.
 * - TOT Praktikan Accounts: every dummy with its sign-in, a filter, copy
 *   the NIM on click, sign one or everyone out.
 * - TOT History: each finished TOT session with its numbers, its report,
 *   and Delete (one or all).
 *
 * Every Asisten reads the page; acting needs the Jadwal right (Pengelola,
 * Admin). The API refuses the rest (api/_lib/tot.ts).
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowCounterClockwiseIcon,
  ChalkboardTeacherIcon,
  CheckIcon,
  CopyIcon,
  EraserIcon,
  LockSimpleIcon,
  PlayIcon,
  ShieldWarningIcon,
  SignOutIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import Confirm from "../ui/Confirm";
import Pill from "../ui/Pill";
import IconButton from "../ui/IconButton";
import SegmentedControl from "../ui/SegmentedControl";
import { StateView } from "../ui/Display";
import { Stepper, Switch } from "../ui/Controls";
import StartCheck, { type BelumSiap } from "../console/StartCheck";
import {
  getJson,
  href,
  jamMenit,
  menitBerjalan,
  postJson,
  tanggalPanjang,
  useMe,
  useTick,
} from "../../lib/app";
import { SESI_CAP_MENIT, SESI_MIN_MENIT } from "../../lib/jadwal";
import { menitLabel, modulLabel } from "../../lib/labels";
import { useSiaran } from "../../lib/siaran";
import { DIVISI, type Divisi } from "../../lib/hak";
import { TOT_PER_KELOMPOK, type AturTot } from "../../lib/tot";
import { TOT_BERUBAH } from "../shell/TotNotice";
import { openSignIn } from "../../lib/signin";
import { pesan, S } from "../console/strings";
import type { Lang } from "../../lib/kelas";
import { T, type Tx } from "./totStrings";
import "../console/console.css";
import "../console/day.css";
import "../console/run.css";
import "./tot.css";

interface Akun {
  nim: string;
  nama: string;
  divisi: Divisi;
  urut: number;
  ikut: boolean;
  masukPada: string | null;
  masuk: boolean;
}

interface Berjalan {
  id: number;
  modul: number;
  mulaiPada: string;
  durasiMenit: number;
  kelompok: { id: number; nomor: number; benar: number; tangkap: number }[];
}

interface Lalu {
  id: number;
  modul: number;
  tanggal: string;
  mulai: string;
  status: string;
  mulaiPada: string | null;
  selesaiPada: string | null;
  jumlahKelompok: number;
  benar: number;
  tangkap: number;
  hadir: number;
}

interface Data {
  aktif: boolean;
  sejak: string | null;
  olehKode: string | null;
  jumlah: number;
  riwayat: number;
  atur: AturTot;
  akun: Akun[];
  berjalan: Berjalan | null;
  lalu: Lalu[];
}

const DURASI_CEPAT = [60, 90, 120, 150];

export default function TotPage({ lang }: { lang: Lang }) {
  const k = T[lang];
  const me = useMe();
  const isAsisten = me?.role === "asisten";
  const boleh = me?.hak?.jadwal === true;
  const [d, setD] = useState<Data | null>(null);
  const [gagal, setGagal] = useState(false);
  // Whether any session (a real one too) is running: the switch and the
  // participants wait for it.
  const [adaSesi, setAdaSesi] = useState(false);

  const load = useCallback(() => {
    if (!isAsisten) return;
    getJson<{ ok: boolean } & Data>("/api/session/tot?detail=1")
      .then((x) => {
        setGagal(!x.ok);
        if (x.ok) setD(x);
      })
      .catch(() => setGagal(true));
    getJson<{ ok: boolean; sesi: unknown }>("/api/session/current")
      .then((x) => x.ok && setAdaSesi(!!x.sesi))
      .catch(() => {});
  }, [isAsisten]);
  useEffect(load, [load]);
  useSiaran(["tot", "sesi", "roster", "jawaban", "tangkapan"], load, isAsisten);

  /** Sends one action; a refusal is told, success reloads and says `ok`. */
  async function kirim(body: Record<string, unknown>, ok?: string): Promise<boolean> {
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/tot", body).catch(
      () => ({ ok: false, kode: "gagal" }) as { ok: boolean; kode?: string },
    );
    if (!r.ok) {
      window.Toast?.show(k.errors[r.kode ?? ""] ?? k.fail, "danger");
      return false;
    }
    if (ok) window.Toast?.show(ok, "ok");
    window.dispatchEvent(new Event(TOT_BERUBAH));
    load();
    return true;
  }

  if (me === undefined || (isAsisten && !d && !gagal)) {
    return (
      <div className="totp" aria-busy="true">
        <span className="skeleton" style={{ height: 88 }} />
        <div className="totp__top">
          <span className="skeleton" style={{ height: 320 }} />
          <span className="skeleton" style={{ height: 320 }} />
        </div>
      </div>
    );
  }
  if (!isAsisten) {
    const t = S[lang];
    return (
      <StateView
        icon={<ShieldWarningIcon size={28} />}
        title={t.forbidden}
        body={t.forbiddenBody}
        tone="warn"
        actions={
          me === null ? (
            <button type="button" className="btn btn--primary" onClick={() => openSignIn()}>
              {t.signIn}
            </button>
          ) : undefined
        }
      />
    );
  }
  if (!d) return <StateView icon={<ShieldWarningIcon size={28} />} title={k.fail} tone="warn" />;

  return (
    <div className="totp">
      <header className="totp__head">
        <div className="page-header__heading">
          <span className="page-header__eyebrow">{k.eyebrow}</span>
          <h1 className="page-header__title">
            {k.title}
            <span className={`pill${d.aktif ? " pill--warn" : ""}`}>{d.aktif ? k.on : k.off}</span>
          </h1>
          <p className="hint">{k.lede}</p>
        </div>
      </header>

      {!boleh && (
        <div className="banner banner--lock" role="note">
          <LockSimpleIcon size={20} aria-hidden="true" />
          <span>{k.readOnly}</span>
        </div>
      )}

      <div className="totp__top">
        <Saklar k={k} lang={lang} d={d} boleh={boleh} adaSesi={adaSesi} kirim={kirim} />
        <SesiTot
          k={k}
          lang={lang}
          d={d}
          boleh={boleh}
          adaSesi={adaSesi}
          kirim={kirim}
          onUbah={load}
        />
      </div>

      <Peserta k={k} d={d} boleh={boleh} adaSesi={adaSesi} kirim={kirim} />
      <AkunTot k={k} lang={lang} d={d} boleh={boleh} kirim={kirim} />
      <Riwayat k={k} lang={lang} d={d} boleh={boleh} kirim={kirim} />
    </div>
  );
}

type Kirim = (body: Record<string, unknown>, ok?: string) => Promise<boolean>;

/* ------------------------------------------------------------ the switch */

function Saklar({
  k,
  lang,
  d,
  boleh,
  adaSesi,
  kirim,
}: {
  k: Tx;
  lang: Lang;
  d: Data;
  boleh: boolean;
  adaSesi: boolean;
  kirim: Kirim;
}) {
  const [ask, setAsk] = useState<boolean | null>(null);
  const sejak = d.sejak ? `${tanggalPanjang(d.sejak.slice(0, 10), lang)} ${jamMenit(d.sejak)}` : "";
  return (
    <section className="panel totp__card" data-on={d.aktif ? "yes" : "no"}>
      <div className="panel__head">
        <h2 className="panel__title">{k.swTitle}</h2>
      </div>
      <div className="totp__switch">
        <ChalkboardTeacherIcon size={36} aria-hidden="true" />
        <div className="stack stack--sm grow">
          <b className="totp__state">{d.aktif ? k.on : k.off}</b>
          {d.aktif && d.sejak && <span className="hint">{k.since(sejak, d.olehKode)}</span>}
        </div>
        <Switch
          on={d.aktif}
          onChange={(v) => setAsk(v)}
          label={k.sw}
          disabled={!boleh || adaSesi}
        />
      </div>
      <p>{k.intro}</p>
      <p className="hint">{k.keep}</p>
      {boleh && adaSesi && <p className="hint">{k.running}</p>}
      <Confirm
        open={ask !== null}
        onOpenChange={(o) => !o && setAsk(null)}
        title={ask ? k.onTitle : k.offTitle}
        body={ask ? k.onBody : k.offBody}
        confirmLabel={ask ? k.onOk : k.offOk}
        cancelLabel={k.cancel}
        tone={ask ? "danger" : "primary"}
        lang={lang}
        onConfirm={() => kirim({ aktif: !!ask }, ask ? k.turnedOn : k.turnedOff)}
      />
    </section>
  );
}

/* ----------------------------------------------------------- the session */

function SesiTot({
  k,
  lang,
  d,
  boleh,
  adaSesi,
  kirim,
  onUbah,
}: {
  k: Tx;
  lang: Lang;
  d: Data;
  boleh: boolean;
  adaSesi: boolean;
  kirim: Kirim;
  onUbah: () => void;
}) {
  const t = S[lang];
  const now = useTick(15_000);
  const [modul, setModul] = useState(1);
  const [durasi, setDurasi] = useState(120);
  const [busy, setBusy] = useState(false);
  const [belum, setBelum] = useState<BelumSiap | null>(null);
  const [akhiri, setAkhiri] = useState(false);
  const [kosong, setKosong] = useState<number | null>(null);
  const b = d.berjalan;

  async function mulai(paksa?: string) {
    setBusy(true);
    try {
      const r = await postJson<{
        ok: boolean;
        kode?: string;
        apDiantre?: boolean | null;
        cek?: BelumSiap["cek"];
        serverId?: number | null;
      }>("/api/session", { jenis: "tot", modul, durasiMenit: durasi, butuhAp: modul === 4, paksa });
      if (r.kode === "belum_siap" && r.cek) {
        setBelum({ cek: r.cek, serverId: r.serverId ?? null });
        return;
      }
      setBelum(null);
      if (!r.ok) {
        window.Toast?.show(pesan(t, r.kode), "danger");
        return;
      }
      window.Toast?.show(k.started, "ok");
      if (r.apDiantre === false) window.Toast?.show(t.apNotQueued, "warn", { duration: 12_000 });
      location.assign(href(lang, "/session"));
    } catch {
      window.Toast?.show(k.fail, "danger");
    } finally {
      setBusy(false);
    }
  }

  async function tambah() {
    if (!b) return;
    const r = await postJson<{ ok: boolean; kode?: string; durasiMenit?: number }>(
      "/api/session/durasi",
      { menit: Math.min(SESI_CAP_MENIT, b.durasiMenit + 15) },
    ).catch(() => ({ ok: false }) as { ok: boolean; kode?: string; durasiMenit?: number });
    if (!r.ok) return window.Toast?.show(pesan(t, r.kode), "danger");
    window.Toast?.show(k.extended(r.durasiMenit ?? b.durasiMenit), "ok");
    onUbah();
  }

  let isi;
  if (b) {
    const lewat = menitBerjalan(b.mulaiPada, now);
    const sisa = Math.max(0, Math.round(b.durasiMenit - lewat));
    isi = (
      <>
        <div className="totp__run">
          <span className="dot dot--ok dot--pulse" aria-hidden="true" />
          <span className="stack stack--sm grow">
            <b>{k.runningSince(modulLabel(b.modul, lang), jamMenit(b.mulaiPada))}</b>
            <span className="hint">{k.left(sisa)}</span>
          </span>
          <Pill modul={b.modul}>{modulLabel(b.modul, lang)}</Pill>
        </div>
        <span className="label-caps">{k.progress}</span>
        <ul className="totp__groups">
          {b.kelompok.map((g) => (
            <li key={g.id} style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}>
              <span className="assign__num">{g.nomor}</span>
              <span className="stack grow" style={{ gap: 0 }}>
                <b>{k.groupOf(g.nomor, d.atur.divisi[g.nomor - 1] ?? "")}</b>
                <span className="hint">
                  {k.benar(g.benar)} · {k.tangkap(g.tangkap)}
                </span>
              </span>
              {boleh && (
                <IconButton
                  icon={EraserIcon}
                  label={`${k.reset} · ${k.groupOf(g.nomor, "")}`}
                  tip={k.reset}
                  sm
                  disabled={!g.benar && !g.tangkap}
                  onClick={() => setKosong(g.nomor)}
                />
              )}
            </li>
          ))}
        </ul>
        <div className="panel__actions totp__acts">
          <a className="btn btn--inverse btn--lg" href={href(lang, "/session")}>
            {k.openKonsol}
          </a>
          {boleh && (
            <button
              type="button"
              className="btn"
              disabled={b.durasiMenit >= SESI_CAP_MENIT}
              onClick={() => void tambah()}
            >
              {k.extend}
            </button>
          )}
          {boleh && (
            <button type="button" className="btn btn--danger-soft" onClick={() => setAkhiri(true)}>
              {k.end}
            </button>
          )}
        </div>
      </>
    );
  } else if (!d.aktif) {
    isi = <p className="hint">{k.sesiOff}</p>;
  } else if (adaSesi) {
    isi = <p className="hint">{k.otherRunning}</p>;
  } else {
    isi = (
      <>
        <p className="hint">{k.startHint(d.atur.divisi.length)}</p>
        <div className="field">
          <span className="field__label">{k.module}</span>
          <div className="modpick" role="radiogroup" aria-label={k.module}>
            {[1, 2, 3, 4].map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modul === m}
                className="modpick__b"
                style={{ "--m": `var(--mod-${m})` } as CSSProperties}
                disabled={!boleh}
                onClick={() => setModul(m)}
              >
                <span className="modpick__top">
                  <Pill modul={m}>{modulLabel(m, lang)}</Pill>
                </span>
                <b>{t.modulNama(m)}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field__label">{k.length}</span>
          <div className="startcard__len">
            <Stepper
              value={durasi}
              onChange={setDurasi}
              min={SESI_MIN_MENIT}
              max={SESI_CAP_MENIT}
              step={15}
              label={k.length}
              fmt={(v) => menitLabel(v, lang)}
              lessLabel={k.shorter}
              moreLabel={k.longer}
            />
            {DURASI_CEPAT.map((v) => (
              <button
                key={v}
                type="button"
                className="chipbtn"
                aria-pressed={durasi === v}
                aria-label={menitLabel(v, lang)}
                disabled={!boleh}
                onClick={() => setDurasi(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="panel__actions">
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            disabled={busy || !boleh}
            data-loading={busy ? "yes" : undefined}
            onClick={() => void mulai()}
          >
            <PlayIcon size={20} weight="fill" aria-hidden="true" />
            <span className="btn__label">{k.start(modulLabel(modul, lang))}</span>
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="panel totp__card">
      <div className="panel__head">
        <h2 className="panel__title">{k.sesiTitle}</h2>
      </div>
      {isi}
      <Confirm
        open={akhiri}
        onOpenChange={setAkhiri}
        title={k.endTitle}
        body={k.endBody}
        confirmLabel={k.end}
        cancelLabel={k.cancel}
        tone="danger"
        lang={lang}
        onConfirm={async () => {
          const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/end", {}).catch(
            () => ({ ok: false }) as { ok: boolean; kode?: string },
          );
          if (!r.ok) {
            window.Toast?.show(pesan(t, r.kode), "danger");
            return false;
          }
          window.Toast?.show(k.ended, "ok");
          onUbah();
        }}
      />
      <Confirm
        open={kosong !== null}
        onOpenChange={(o) => !o && setKosong(null)}
        title={k.resetTitle(kosong ?? 0)}
        body={k.resetBody}
        confirmLabel={k.reset}
        cancelLabel={k.cancel}
        tone="danger"
        lang={lang}
        onConfirm={() => kirim({ resetKelompok: kosong }, k.resetDone(kosong ?? 0))}
      />
      <StartCheck
        data={belum}
        modul={modul}
        tot
        lang={lang}
        busy={busy}
        onClose={() => setBelum(null)}
        onRecheck={() => void mulai()}
        onForce={(alasan) => void mulai(alasan)}
      />
    </section>
  );
}

/* --------------------------------------------------------- participants */

function Peserta({
  k,
  d,
  boleh,
  adaSesi,
  kirim,
}: {
  k: Tx;
  d: Data;
  boleh: boolean;
  adaSesi: boolean;
  kirim: Kirim;
}) {
  const [divisi, setDivisi] = useState<Divisi[]>(d.atur.divisi);
  const [per, setPer] = useState(d.atur.perKelompok);
  const [busy, setBusy] = useState(false);
  const simpanan = `${d.atur.divisi.join()}|${d.atur.perKelompok}`;
  // A save elsewhere (another Asisten, a live update) resets the form.
  useEffect(() => {
    setDivisi(d.atur.divisi);
    setPer(d.atur.perKelompok);
  }, [simpanan]);
  const berubah = `${divisi.join()}|${per}` !== simpanan;
  const kunci = !boleh || adaSesi;
  const flip = (x: Divisi) =>
    setDivisi((v) => (v.includes(x) ? v.filter((y) => y !== x) : [...v, x]));

  return (
    <section className="panel totp__card">
      <div className="panel__head">
        <div className="stack stack--sm">
          <h2 className="panel__title">{k.pesertaTitle}</h2>
          <p className="panel__sub">{k.pesertaHint}</p>
        </div>
        <span className="pill">{k.ringkas(divisi.length, divisi.length * per)}</span>
      </div>
      <div className="totp__atur">
        <div className="field">
          <span className="field__label">{k.divisi}</span>
          <div className="totp__div" role="group" aria-label={k.divisi}>
            {DIVISI.map((x) => {
              const i = divisi.indexOf(x);
              return (
                <button
                  key={x}
                  type="button"
                  className="chipbtn totp__divb"
                  aria-pressed={i >= 0}
                  disabled={kunci}
                  onClick={() => flip(x)}
                >
                  {i >= 0 ? (
                    <span className="totp__divn" aria-hidden="true">
                      {i + 1}
                    </span>
                  ) : (
                    <span className="totp__divn totp__divn--off" aria-hidden="true" />
                  )}
                  {x}
                </button>
              );
            })}
          </div>
        </div>
        <div className="field">
          <span className="field__label">{k.perKelompok}</span>
          <Stepper
            value={per}
            onChange={setPer}
            min={1}
            max={TOT_PER_KELOMPOK}
            label={k.perKelompok}
            lessLabel={k.fewer}
            moreLabel={k.more}
          />
        </div>
      </div>
      {divisi.length > 0 && (
        <ol className="totp__plan">
          {divisi.map((x, i) => (
            <li key={x} style={{ "--g": `var(--group-${i + 1})` } as CSSProperties}>
              <span className="assign__num">{i + 1}</span>
              <span>
                <b>{x}</b>{" "}
                <span className="hint mono">
                  {DIVISI.indexOf(x) + 1}00000 … {DIVISI.indexOf(x) + 1}0000{per - 1}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {!divisi.length && <p className="hint">{k.needOne}</p>}
      {boleh && adaSesi && <p className="hint">{k.aturRunning}</p>}
      {boleh && (
        <div className="panel__actions totp__acts">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!berubah || busy}
            onClick={() => {
              setDivisi(d.atur.divisi);
              setPer(d.atur.perKelompok);
            }}
          >
            <ArrowCounterClockwiseIcon size={16} weight="bold" aria-hidden="true" />
            {k.resetAtur}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!berubah || busy || kunci || !divisi.length}
            onClick={async () => {
              setBusy(true);
              await kirim(
                { atur: { divisi, perKelompok: per } },
                d.aktif ? k.aturSavedLive : k.aturSaved,
              );
              setBusy(false);
            }}
          >
            {k.saveAtur}
          </button>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- accounts */

function AkunTot({
  k,
  lang,
  d,
  boleh,
  kirim,
}: {
  k: Tx;
  lang: Lang;
  d: Data;
  boleh: boolean;
  kirim: Kirim;
}) {
  const [f, setF] = useState<"all" | "in" | "ikut">("ikut");
  const [semua, setSemua] = useState(false);
  const [salin, setSalin] = useState<string | null>(null);
  const nMasuk = d.akun.filter((a) => a.masuk).length;
  const grup = useMemo(() => {
    const lihat = d.akun.filter((a) => (f === "in" ? a.masuk : f === "ikut" ? a.ikut : true));
    return DIVISI.map((x) => ({ x, rows: lihat.filter((a) => a.divisi === x) })).filter(
      (g) => g.rows.length,
    );
  }, [d.akun, f]);

  function copy(nim: string) {
    void navigator.clipboard?.writeText(nim).then(
      () => {
        setSalin(nim);
        window.Toast?.show(k.copied(nim), "ok");
        setTimeout(() => setSalin((s) => (s === nim ? null : s)), 1600);
      },
      () => {},
    );
  }

  return (
    <section className="panel totp__card">
      <div className="panel__head">
        <div className="stack stack--sm">
          <h2 className="panel__title">{k.akunTitle}</h2>
          <p className="panel__sub">{k.akunHint}</p>
        </div>
        {boleh && (
          <button
            type="button"
            className="btn btn--danger-soft"
            disabled={!nMasuk}
            onClick={() => setSemua(true)}
          >
            {k.keluarkanAll}
          </button>
        )}
      </div>
      <SegmentedControl
        aria-label={k.akunTitle}
        value={f}
        onValueChange={(v) => setF(v as typeof f)}
        fill
        options={[
          { value: "ikut", label: k.fIkut },
          { value: "in", label: `${k.fIn} · ${nMasuk}` },
          { value: "all", label: k.fAll },
        ]}
      />
      {f === "in" && !nMasuk && <p className="hint">{k.noneIn}</p>}
      <div className="totp__akun">
        {grup.map(({ x, rows }) => {
          const n = d.atur.divisi.indexOf(x) + 1;
          return (
            <div
              key={x}
              className="totp__grp"
              style={n ? ({ "--g": `var(--group-${n})` } as CSSProperties) : undefined}
            >
              <div className="totp__grph">
                {n > 0 && <span className="assign__num">{n}</span>}
                <b>{x}</b>
              </div>
              <ul>
                {rows.map((a) => (
                  <li key={a.nim} className="totp__acc" data-in={a.masuk ? "yes" : undefined}>
                    <span
                      className="lights__lamp"
                      data-tone={a.masuk ? "ok" : "none"}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      className="totp__nim mono"
                      onClick={() => copy(a.nim)}
                      aria-label={k.copyNim(a.nim)}
                      title={k.copyNim(a.nim)}
                    >
                      {a.nim}
                      {salin === a.nim ? (
                        <CheckIcon size={14} aria-hidden="true" />
                      ) : (
                        <CopyIcon size={14} aria-hidden="true" />
                      )}
                    </button>
                    <span className="stack grow" style={{ gap: 0, minWidth: 0 }}>
                      <span className="truncate">{a.nama}</span>
                      <span className="hint">
                        {!a.ikut
                          ? k.tidakIkut
                          : a.masuk && a.masukPada
                            ? k.masuk(jamMenit(a.masukPada, lang))
                            : k.belum}
                      </span>
                    </span>
                    {boleh && a.masuk && (
                      <IconButton
                        icon={SignOutIcon}
                        label={`${k.keluarkan} ${a.nim}`}
                        tip={k.keluarkan}
                        sm
                        kind="danger"
                        onClick={() => void kirim({ keluarkan: a.nim }, k.keluarDone(a.nim))}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <Confirm
        open={semua}
        onOpenChange={setSemua}
        title={k.keluarTitle}
        body={k.keluarBody}
        confirmLabel={k.keluarkanAll}
        cancelLabel={k.cancel}
        tone="danger"
        lang={lang}
        onConfirm={() => kirim({ keluarkan: "semua" }, k.keluarAllDone)}
      />
    </section>
  );
}

/* -------------------------------------------------------------- history */

function Riwayat({
  k,
  lang,
  d,
  boleh,
  kirim,
}: {
  k: Tx;
  lang: Lang;
  d: Data;
  boleh: boolean;
  kirim: Kirim;
}) {
  const [hapus, setHapus] = useState<number | "semua" | null>(null);
  return (
    <section className="panel totp__card">
      <div className="panel__head">
        <h2 className="panel__title">{k.lalTitle}</h2>
        {boleh && d.lalu.length > 0 && (
          <button type="button" className="btn btn--danger-soft" onClick={() => setHapus("semua")}>
            {k.hapusAll}
          </button>
        )}
      </div>
      {!d.lalu.length ? (
        <p className="hint">{k.lalNone}</p>
      ) : (
        <ul className="totp__lalu">
          {d.lalu.map((x) => (
            <li key={x.id} style={{ "--m": `var(--mod-${x.modul})` } as CSSProperties}>
              <Pill modul={x.modul}>{modulLabel(x.modul, lang)}</Pill>
              <span className="stack grow" style={{ gap: 0, minWidth: 0 }}>
                <b>
                  {tanggalPanjang(x.tanggal, lang)} · {x.mulai}
                  {x.status === "batal" && <span className="pill pill--warn">{k.batal}</span>}
                </b>
                <span className="hint">
                  {k.lalGroups(x.jumlahKelompok)} · {k.lalRow(x.hadir, x.benar, x.tangkap)}
                </span>
              </span>
              <a className="btn btn--sm" href={`${href(lang, "/reports")}?sesi=${x.id}`}>
                {k.report}
              </a>
              {boleh && (
                <IconButton
                  icon={TrashIcon}
                  label={`${k.hapus} · ${tanggalPanjang(x.tanggal, lang)}`}
                  tip={k.hapus}
                  sm
                  kind="danger"
                  onClick={() => setHapus(x.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <Confirm
        open={hapus !== null}
        onOpenChange={(o) => !o && setHapus(null)}
        title={hapus === "semua" ? k.hapusAllTitle : k.hapusTitle}
        body={hapus === "semua" ? k.hapusAllBody(d.lalu.length) : k.hapusBody}
        confirmLabel={hapus === "semua" ? k.hapusAll : k.hapus}
        cancelLabel={k.cancel}
        tone="danger"
        lang={lang}
        onConfirm={() =>
          kirim(
            hapus === "semua" ? { hapusRiwayat: true } : { hapusSesi: hapus },
            k.hapusDone(hapus === "semua" ? d.lalu.length : 1),
          )
        }
      />
    </section>
  );
}
