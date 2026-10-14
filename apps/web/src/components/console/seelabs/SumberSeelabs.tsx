/** Penilaian › Sumber SeeLabs (Phase 14, mockup s14-sumber), for Pencipta,
 *  Admin and DEV: the robot's switch, which SeeLabs address the Pi uses, the
 *  Pi key Asisten seal their passwords to (a new one waits for approval),
 *  who is connected, the KLP pull and Input Jaga, and the job log. */
import { useState } from "react";
import { CellSignalHighIcon, CellSignalSlashIcon, KeyIcon } from "@phosphor-icons/react";
import { getJson, postJson } from "../../../lib/app";
import { usePoll } from "../../../lib/hooks";
import type { Lang } from "../../../lib/kelas";
import Confirm from "../../ui/Confirm";
import { Switch } from "../../ui/Controls";
import { kapanRobot } from "./SeelabsRobotCard";
import { sufiksSah } from "../../../lib/seelabs-robot";
import Sidik from "./Sidik";
import { RB } from "./robotStrings";
import "./robot.css";

interface Sumber {
  ok: boolean;
  nyala: boolean;
  alamat: "kampus" | "athena";
  sufiks: string;
  kunci: { serverId: number; sidik: string; oleh: string; pada: string } | null;
  kunciPi: {
    serverId: number;
    nama: string;
    sidik: string;
    protokol: number | null;
    jangkau: { ok: boolean; ms?: number; kode?: string } | null;
    pada: string | null;
  }[];
  akun: {
    nim: string;
    kode: string;
    nama: string;
    status: string | null;
    galat: string | null;
    bawaan: boolean | null;
    berhasil: string | null;
  }[];
  tarik: { pada: string | null; oleh: string | null } | null;
  log: {
    id: number;
    jenis: string;
    akun: string;
    kelompok: number | null;
    klp: string | null;
    status: string;
    galat: string | null;
    bukti: Record<string, unknown> | null;
    dibuat: string;
  }[];
}

const NADA: Record<string, string> = {
  aktif: "ok",
  menunggu_uji: "accent",
  ditolak: "danger",
  kunci_lain: "warn",
  selesai: "ok",
  diambil: "accent",
  antre: "accent",
  gagal: "danger",
  batal: "",
};

export default function SumberSeelabs({ lang }: { lang: Lang }) {
  const t = RB[lang];
  const { data, refresh } = usePoll(
    () => getJson<Sumber>("/api/session/robot?sumber=1"),
    60_000,
    true,
    ["seelabs", "server"],
  );
  const [setujui, setSetujui] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sufiks, setSufiks] = useState<string | null>(null);
  if (!data) return <span className="skeleton" style={{ height: 420 }} />;
  if (!data.ok) return null;

  async function kirim(isi: Record<string, unknown>, ok = t.queued) {
    setBusy(true);
    const r = await postJson<{ ok: boolean }>("/api/session/robot", isi).catch(() => ({
      ok: false,
    }));
    setBusy(false);
    window.Toast?.show(r.ok ? ok : t.failed, r.ok ? "ok" : "danger");
    refresh();
    return r.ok;
  }

  const kodeDari = new Map(data.akun.map((a) => [a.nim, a.kode]));
  // The suffix field shows the saved value until someone types.
  const nilaiSufiks = sufiks ?? data.sufiks;
  const piRobot = data.kunci
    ? data.kunciPi.find((k) => k.serverId === data.kunci!.serverId)
    : undefined;
  const baru = data.kunciPi.filter((k) => k.sidik !== data.kunci?.sidik);
  const jangkau = piRobot?.jangkau;
  const pill = (nada: string | undefined, isi: string) => (
    <span className={`pill${nada ? ` pill--${nada}` : ""}`}>{isi}</span>
  );

  return (
    <div className="slr-sumber">
      <section className="panel slr-card slr-wide">
        <div className="slr-head" data-tone={data.nyala ? "ok" : "warn"}>
          <div className="slr-head__t">
            <h2 className="panel__title">{t.srcTitle}</h2>
            <span className="hint">{t.srcDesc}</span>
          </div>
          <div className="slr-head__aside">
            <label className="slr-switch">
              <span>{t.srcSwitch}</span>
              <Switch
                on={data.nyala}
                label={t.srcSwitch}
                disabled={busy}
                onChange={(v) =>
                  void kirim({ aksi: "robot", nyala: v }, v ? t.st.aktif : t.robotOff)
                }
              />
            </label>
          </div>
        </div>
        <span className="hint">{t.srcSwitchHint}</span>
        <dl className="slr-facts">
          <div>
            <dt>{t.srcKey}</dt>
            <dd>{data.kunci ? <Sidik nilai={data.kunci.sidik} /> : t.srcKeyNone}</dd>
          </div>
          <div>
            <dt>Orange Pi</dt>
            <dd>{piRobot ? `#${piRobot.serverId} ${piRobot.nama}` : t.never}</dd>
          </div>
          <div>
            <dt>{t.srcReach}</dt>
            <dd>
              {jangkau ? (
                jangkau.ok ? (
                  <span className="slr-switch">
                    <CellSignalHighIcon size={18} color="var(--ok)" aria-hidden="true" />
                    {t.reachOk(jangkau.ms ?? 0)}
                  </span>
                ) : (
                  <span className="slr-switch">
                    <CellSignalSlashIcon size={18} color="var(--warn)" aria-hidden="true" />
                    {t.reachNo}
                  </span>
                )
              ) : (
                t.never
              )}
            </dd>
          </div>
          <div>
            <dt>
              {data.kunci
                ? t.srcKeyApproved(kodeDari.get(data.kunci.oleh) ?? data.kunci.oleh)
                : t.srcKeyApprovedNone}
            </dt>
            <dd>{data.kunci ? kapanRobot(data.kunci.pada, lang) : t.never}</dd>
          </div>
        </dl>
        {jangkau && !jangkau.ok && (
          <div className="banner banner--warn slr-note">
            <CellSignalSlashIcon size={20} aria-hidden="true" />
            <span>{t.err.tak_terjangkau}</span>
          </div>
        )}
        {baru.map((k) => (
          <div key={k.serverId} className="slr-item" data-tone="warn">
            <span className="slr-head__ic">
              <KeyIcon size={20} aria-hidden="true" />
            </span>
            <span className="slr-item__t">
              <b>{t.srcKeyNew(`#${k.serverId} ${k.nama}`)}</b>
              <Sidik nilai={k.sidik} className="hint" />
            </span>
            <span className="slr-item__end">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={busy || (k.protokol ?? 0) < 6}
                onClick={() => setSetujui(k.sidik)}
              >
                {t.srcKeyApprove}
              </button>
            </span>
          </div>
        ))}
        <div className="field">
          <span className="field__label">{t.srcAddr}</span>
          <div className="slr-seg" role="radiogroup" aria-label={t.srcAddr}>
            {(["kampus", "athena"] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={data.alamat === a}
                className={`btn ${data.alamat === a ? "btn--primary" : "btn--secondary"}`}
                disabled={busy}
                onClick={() =>
                  data.alamat !== a && void kirim({ aksi: "alamat", alamat: a }, t.addr[a])
                }
              >
                {t.addr[a]}
              </button>
            ))}
          </div>
        </div>
        <form
          className="slr-suffix"
          onSubmit={(e) => {
            e.preventDefault();
            if (sufiksSah(nilaiSufiks) && nilaiSufiks !== data.sufiks)
              void kirim({ aksi: "sufiks", sufiks: nilaiSufiks }, t.srcSuffixSaved).then(
                (ok) => ok && setSufiks(null),
              );
          }}
        >
          <label className="field">
            <span className="field__label">{t.srcSuffix}</span>
            <input
              className="field__input mono"
              value={nilaiSufiks}
              maxLength={16}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!sufiksSah(nilaiSufiks) || undefined}
              onChange={(e) => setSufiks(e.target.value.trim())}
            />
          </label>
          <button
            type="submit"
            className="btn btn--secondary"
            disabled={busy || !sufiksSah(nilaiSufiks) || nilaiSufiks === data.sufiks}
          >
            {t.srcSuffixSave}
          </button>
          <span className="hint">
            {sufiksSah(nilaiSufiks) ? t.srcSuffixHint(nilaiSufiks) : t.srcSuffixBad}
          </span>
        </form>
        <div className="slr-acts">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy || !data.kunci}
            onClick={() => void kirim({ aksi: "kelompok" })}
          >
            {t.srcPull}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy || !data.kunci}
            onClick={() => void kirim({ aksi: "jaga" })}
          >
            {t.srcJaga}
          </button>
        </div>
        {data.tarik?.pada && (
          <span className="hint">
            {t.srcPullLast(
              kapanRobot(data.tarik.pada, lang),
              kodeDari.get(data.tarik.oleh ?? "") ?? data.tarik.oleh ?? "",
            )}
          </span>
        )}
      </section>

      <section className="panel slr-card">
        <h2 className="panel__title">{t.srcAccounts}</h2>
        <ul className="slr-items">
          {data.akun.map((a) => (
            <li
              key={a.nim}
              className="slr-item"
              data-tone={
                a.status === "ditolak" ? "danger" : a.status === "kunci_lain" ? "warn" : undefined
              }
            >
              <span className="pill pill--mono">{a.kode}</span>
              <span className="slr-item__t">
                <b>{a.nama}</b>
                {a.galat && <span className="hint">{t.err[a.galat] ?? a.galat}</span>}
              </span>
              <span className="slr-item__end">
                {pill(NADA[a.status ?? ""], t.st[a.status ?? "none"])}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel slr-card">
        <h2 className="panel__title">{t.srcLog}</h2>
        {data.log.length === 0 ? (
          <span className="hint">{t.srcEmpty}</span>
        ) : (
          <ul className="slr-items">
            {data.log.map((j) => (
              <li
                key={j.id}
                className="slr-item"
                data-tone={j.status === "gagal" ? "danger" : undefined}
              >
                <span className="pill pill--mono">{kodeDari.get(j.akun) ?? "?"}</span>
                <span className="slr-item__t">
                  <b>
                    {t.kind[j.jenis] ?? j.jenis}
                    {j.klp && j.jenis === "nilai" ? ` · KLP ${j.klp}` : ""}
                  </b>
                  <span className="hint">
                    {kapanRobot(j.dibuat, lang)}
                    {j.galat ? ` · ${t.err[j.galat] ?? j.galat}` : ""}
                  </span>
                </span>
                <span className="slr-item__end">
                  {pill(NADA[j.status], t.job[j.status] ?? j.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Confirm
        open={setujui !== null}
        onOpenChange={(o) => !o && setSetujui(null)}
        title={t.srcKeyApprove}
        body={t.srcKeyApproveBody}
        confirmLabel={t.srcKeyApprove}
        tone="primary"
        lang={lang}
        onConfirm={async () => {
          const ok = await kirim({ aksi: "kunci", setujui }, t.done);
          if (ok) setSetujui(null);
          return ok;
        }}
      />
    </div>
  );
}
