/** The Account page's SeeLabs robot card (Phase 14, mockup s14-akun): connect
 *  my own SeeLabs account once, so Kirim Nilai also saves to SeeLabs. The
 *  password is sealed in this browser to the robot PC's key (seelabs-segel.ts)
 *  and only that seal leaves the page. The Laboran's default password (NIM
 *  followed by 1715) is the starting choice; an Asisten who changed theirs
 *  types it instead. */
import { useEffect, useState, type ReactNode } from "react";
import {
  CellSignalSlashIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  KeyIcon,
  LockKeyIcon,
  ProhibitIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { getJson, jamMenit, postJson, tanggalPanjang } from "../../../lib/app";
import { usePoll } from "../../../lib/hooks";
import Sidik from "./Sidik";
import { sandiBawaanSeelabs, segelSandi, sidikKunci } from "../../../lib/seelabs-segel";
import type { Lang } from "../../../lib/kelas";
import Dialog from "../../ui/Dialog";
import Confirm from "../../ui/Confirm";
import Disclose from "../../ui/Disclose";
import PasswordField from "../../ui/PasswordField";
import { Checkbox, Switch } from "../../ui/Controls";
import { RB, type RobotStrings } from "./robotStrings";
import "./robot.css";

interface TugasRingkas {
  id: number;
  jenis: string;
  status: string;
  galat: string | null;
  jalanPada: string;
  selesai: string | null;
}

interface Saya {
  ok: boolean;
  nyala: boolean;
  kunci: { sidik: string; serverId: number } | null;
  pengguna: string;
  akses: {
    status: "menunggu_uji" | "aktif" | "ditolak" | "kunci_lain";
    bawaan: boolean;
    galat: string | null;
    kunciSama: boolean;
    diujiPada: string | null;
    berhasilPada: string | null;
  } | null;
  tugas: TugasRingkas[];
}

type Tone = "ok" | "warn" | "danger" | "accent" | undefined;

/** "Selasa, 13 Oktober 2026 · 14:05" for a moment, in Jakarta's calendar. */
export function kapanRobot(iso: string, lang: Lang): string {
  const hari = new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  return `${tanggalPanjang(hari, lang)} · ${jamMenit(iso, lang)}`;
}

function Head({
  tone,
  title,
  desc,
  aside,
}: {
  tone?: Tone;
  title: string;
  desc?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="slr-head" data-tone={tone}>
      <div className="slr-head__t">
        <h2 className="panel__title">{title}</h2>
        {desc && <span className="hint">{desc}</span>}
      </div>
      {aside && <div className="slr-head__aside">{aside}</div>}
    </div>
  );
}

export function Rights({ t, rows }: { t: RobotStrings; rows?: [boolean, string][] }) {
  return (
    <ul className="slr-rights">
      {(rows ?? t.rights).map(([ok, x]) => (
        <li key={x} data-on={ok ? "yes" : "no"}>
          {ok ? (
            <CheckCircleIcon size={20} aria-hidden="true" />
          ) : (
            <ProhibitIcon size={20} aria-hidden="true" />
          )}
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

function ConnectDialog({
  lang,
  nim,
  pengguna,
  pc,
  again,
  onClose,
}: {
  lang: Lang;
  nim: string;
  pengguna: string;
  pc: number;
  again: boolean;
  onClose: () => void;
}) {
  const t = RB[lang];
  const [bawaan, setBawaan] = useState(true);
  const [pw, setPw] = useState("");
  const [agree, setAgree] = useState(false);
  const [kunci, setKunci] = useState<{
    spki: string;
    sidik: string;
    lokal: string;
    sufiks: string;
  } | null>(null);
  const [tahap, setTahap] = useState<"form" | "kunci" | "tunggu" | "selesai" | "gagal">("form");
  const [tugasId, setTugasId] = useState<number | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  // The approved key, and its fingerprint worked out here from the key itself.
  useEffect(() => {
    let hidup = true;
    void getJson<{ ok: boolean; spki?: string; sidik?: string; sufiks?: string }>(
      "/api/session/robot?kunci=1",
    ).then(async (d) => {
      if (!hidup || !d.ok || !d.spki || !d.sidik) return;
      setKunci({
        spki: d.spki,
        sidik: d.sidik,
        lokal: await sidikKunci(d.spki),
        sufiks: d.sufiks ?? "",
      });
    });
    return () => {
      hidup = false;
    };
  }, []);

  // Waiting on the PC's sign-in test: the job's own row says how it went.
  const poll = usePoll(() => getJson<Saya>("/api/session/robot"), 60_000, tahap === "tunggu", [
    "seelabs",
  ]);
  useEffect(() => {
    const j = poll.data?.tugas.find((x) => x.id === tugasId);
    if (!j) return;
    if (j.status === "selesai") setTahap("selesai");
    else if (j.status === "gagal" || (j.status === "antre" && j.galat)) {
      setGalat(j.galat);
      if (j.status === "gagal" || j.galat !== "tak_terjangkau") setTahap("gagal");
    }
  }, [poll.data, tugasId]);

  const sufiks = kunci?.sufiks ?? "";
  const sandi = bawaan ? sandiBawaanSeelabs(nim, sufiks) : pw;
  const sibuk = tahap === "kunci" || tahap === "tunggu";
  const kunciBeda = !!kunci && kunci.lokal !== kunci.sidik;

  async function hubungkan() {
    if (!kunci) return;
    setTahap("kunci");
    setGalat(null);
    try {
      const { segel, sidik } = await segelSandi(kunci.spki, kunci.sidik, nim, sandi);
      const r = await postJson<{ ok: boolean; kode?: string; tugas?: number }>(
        "/api/session/robot",
        {
          aksi: "hubung",
          segel,
          sidik,
          bawaan,
        },
      );
      if (!r.ok || !r.tugas) throw new Error(r.kode ?? "gagal");
      setPw("");
      setTugasId(r.tugas);
      setTahap("tunggu");
    } catch (e) {
      setTahap("form");
      window.Toast?.show(
        (e as Error).message === "kunci_berubah" ? t.keyMismatch : t.failed,
        "danger",
      );
    }
  }

  const selesai = tahap === "selesai";
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !sibuk && onClose()}
      title={again ? t.dlgTitleAgain : t.dlgTitle}
      lang={lang}
      actions={
        selesai || tahap === "gagal" ? (
          <button type="button" className="btn btn--primary" onClick={onClose}>
            {selesai ? t.done : t.close}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={sibuk}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={sibuk || !agree || !sandi || !kunci || kunciBeda}
              onClick={() => void hubungkan()}
            >
              {t.lockConnect}
            </button>
          </>
        )
      }
    >
      {selesai ? (
        <div className="stack slr-done">
          <CheckCircleIcon size={48} weight="duotone" color="var(--ok)" aria-hidden="true" />
          <h3 className="panel__title">{t.doneTitle}</h3>
          <p className="lede">{t.doneBody}</p>
        </div>
      ) : tahap === "gagal" ? (
        <div className="banner banner--danger slr-note" role="alert">
          <LockKeyIcon size={20} aria-hidden="true" />
          <span>{t.err[galat ?? "bentuk_berubah"] ?? t.failed}</span>
        </div>
      ) : (
        <div className="stack">
          <label className="field">
            <span className="field__label">{t.dlgAccount}</span>
            <input className="field__input mono" value={pengguna} readOnly />
            <span className="hint">{t.dlgAccountHint}</span>
          </label>
          <div className="slr-agree">
            <span className="stack stack--sm">
              <span>{t.useDefault(sufiks)}</span>
              <span className="hint">{t.useDefaultHint}</span>
            </span>
            <Switch
              on={bawaan}
              onChange={setBawaan}
              label={t.useDefault(sufiks)}
              disabled={sibuk}
            />
          </div>
          {!bawaan && (
            <PasswordField
              label={t.dlgPw}
              value={pw}
              onChange={setPw}
              autoComplete="current-password"
              hint={t.dlgPwHint}
              lang={lang}
            />
          )}
          <div className="banner slr-note slr-seal">
            <ShieldCheckIcon size={20} aria-hidden="true" />
            <span className="stack stack--sm">
              <span>{t.seal}</span>
              {kunci && (
                <span className="hint">
                  {t.sealFp(`#${pc}`)}{" "}
                  <b>
                    <Sidik nilai={kunci.lokal} />
                  </b>
                </span>
              )}
            </span>
          </div>
          {kunciBeda && (
            <div className="banner banner--danger slr-note" role="alert">
              <KeyIcon size={20} aria-hidden="true" />
              <span>{t.keyMismatch}</span>
            </div>
          )}
          <Disclose head={t.rightsHead}>
            <Rights t={t} />
          </Disclose>
          <div className="slr-agree slr-agree--check">
            <Checkbox checked={agree} onChange={setAgree} label={t.agree} disabled={sibuk} />
          </div>
          {sibuk && (
            <p className="hint slr-wait" role="status">
              <span className="dot dot--ok dot--pulse" />
              {tahap === "kunci"
                ? t.locking
                : galat === "tak_terjangkau"
                  ? t.err.tak_terjangkau
                  : t.waiting}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function SeelabsRobotCard({ lang, nim }: { lang: Lang; nim: string }) {
  const t = RB[lang];
  const { data, refresh } = usePoll(() => getJson<Saya>("/api/session/robot"), 60_000, true, [
    "seelabs",
  ]);
  const [dlg, setDlg] = useState<null | "baru" | "ulang">(null);
  const [putus, setPutus] = useState(false);
  if (!data?.ok) return null;

  const a = data.akses;
  const uji = data.tugas.find((x) => x.jenis === "uji");
  // A test queued or running: the button says so until the PC Server answers.
  const ujiJalan = !!uji && (uji.status === "antre" || uji.status === "diambil");
  const takJangkau = !!a && a.status === "menunggu_uji" && uji?.galat === "tak_terjangkau";
  const kunciLain = !!a && (a.status === "kunci_lain" || (!!data.kunci && !a.kunciSama));
  const v = !a
    ? "none"
    : kunciLain
      ? "key"
      : a.status === "ditolak"
        ? "denied"
        : takJangkau
          ? "reach"
          : a.status === "menunggu_uji"
            ? "wait"
            : "ok";

  const tombolPutus = (
    <button type="button" className="btn btn--danger-soft" onClick={() => setPutus(true)}>
      {v === "wait" ? t.cancelTest : t.disconnect}
    </button>
  );
  const badge = (tone: string, label: string) => (
    <span className={`pill${tone ? ` pill--${tone}` : ""}`}>{label}</span>
  );

  let head: ReactNode;
  let body: ReactNode = null;
  let acts: ReactNode;
  let tone: Tone;
  if (v === "none") {
    head = <Head title={t.noneTitle} desc={t.noneDesc} aside={badge("", t.st.none)} />;
    body = (
      <>
        <Rights t={t} rows={t.rights.slice(0, 4)} />
        <span className="hint">{data.kunci ? t.optional : t.noKey}</span>
      </>
    );
    acts = (
      <button
        type="button"
        className="btn btn--primary btn--lg"
        disabled={!data.kunci || !data.nyala}
        onClick={() => setDlg("baru")}
      >
        {t.connect}
      </button>
    );
  } else if (v === "wait" || v === "reach") {
    tone = v === "reach" ? "warn" : "accent";
    head = (
      <Head
        tone={tone}
        title={v === "reach" ? t.reachTitle : t.waitTitle}
        desc={v === "reach" ? t.reachDesc : t.waitDesc}
        aside={badge(v === "reach" ? "warn" : "accent", t.st.menunggu_uji)}
      />
    );
    acts = tombolPutus;
  } else if (v === "denied" || v === "key") {
    tone = v === "denied" ? "danger" : "warn";
    head = (
      <Head
        tone={tone}
        title={v === "denied" ? t.deniedTitle : t.keyTitle}
        desc={v === "denied" ? t.deniedDesc : t.keyDesc}
        aside={badge(tone, v === "denied" ? t.st.ditolak : t.st.kunci_lain)}
      />
    );
    body = (
      <div className="banner banner--warn slr-note">
        <CellSignalSlashIcon size={20} aria-hidden="true" />
        <span>{t.untilBack}</span>
      </div>
    );
    acts = (
      <>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setDlg("ulang")}
          disabled={!data.kunci}
        >
          {t.enterAgain}
        </button>
        {tombolPutus}
      </>
    );
  } else {
    tone = "ok";
    head = <Head tone="ok" title={t.okTitle} desc={t.okDesc} aside={badge("ok", t.st.aktif)} />;
    body = (
      <dl className="slr-facts">
        <div>
          <dt>{t.fAccount}</dt>
          <dd className="mono">{data.pengguna}</dd>
        </div>
        <div>
          <dt>{t.fPassword}</dt>
          <dd>{a!.bawaan ? t.fPwDefault : t.fPwOwn}</dd>
        </div>
        <div>
          <dt>{t.fTested}</dt>
          <dd>{a!.diujiPada ? kapanRobot(a!.diujiPada, lang) : t.never}</dd>
        </div>
        <div>
          <dt>{t.fLast}</dt>
          <dd>{a!.berhasilPada ? kapanRobot(a!.berhasilPada, lang) : t.never}</dd>
        </div>
      </dl>
    );
    acts = (
      <>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={ujiJalan}
          aria-busy={ujiJalan || undefined}
          onClick={async () => {
            const r = await postJson<{ ok: boolean }>("/api/session/robot", { aksi: "uji" }).catch(
              () => ({ ok: false }),
            );
            window.Toast?.show(r.ok ? t.queued : t.failed, r.ok ? "ok" : "danger");
            refresh();
          }}
        >
          {ujiJalan && (
            <CircleNotchIcon size={16} weight="bold" className="ctl-spin" aria-hidden="true" />
          )}
          {ujiJalan ? t.testing : t.testAgain}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => setDlg("ulang")}>
          {t.changePw}
        </button>
        {tombolPutus}
      </>
    );
  }

  return (
    <section
      className="panel slr-card"
      data-tone={tone === "accent" ? undefined : tone}
      aria-label={t.cardTitle}
    >
      {head}
      {!data.nyala && (
        <div className="banner banner--warn slr-note">
          <ProhibitIcon size={20} aria-hidden="true" />
          <span>{t.robotOff}</span>
        </div>
      )}
      {body}
      <div className="slr-acts">{acts}</div>
      {dlg && (
        <ConnectDialog
          lang={lang}
          nim={nim}
          pengguna={data.pengguna}
          pc={data.kunci?.serverId ?? 0}
          again={dlg === "ulang"}
          onClose={() => {
            setDlg(null);
            refresh();
          }}
        />
      )}
      <Confirm
        open={putus}
        onOpenChange={setPutus}
        title={t.cutTitle}
        body={t.cutBody}
        confirmLabel={t.disconnect}
        lang={lang}
        onConfirm={async () => {
          const r = await postJson<{ ok: boolean }>("/api/session/robot", { aksi: "putus" }).catch(
            () => ({ ok: false }),
          );
          if (!r.ok) {
            window.Toast?.show(t.failed, "danger");
            return false;
          }
          window.Toast?.show(t.cutDone, "ok");
          refresh();
        }}
      />
    </section>
  );
}
