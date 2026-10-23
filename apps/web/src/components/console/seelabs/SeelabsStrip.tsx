/** The SeeLabs strip under a sent group (Phase 14, mockup s14-kirim): where
 *  the robot's save stands, Antre, Diproses, Disimpan, Terverifikasi, or why
 *  it stopped, with Coba Lagi and the Token Khusus field. Every group of the
 *  page shares one poll of the session's robot jobs. */
import { useState } from "react";
import { WarningIcon } from "@phosphor-icons/react";
import { getJson, jamMenit, pageLang, postJson } from "../../../lib/app";
import { usePollBersama } from "../../../lib/hooks";
import { RB } from "./robotStrings";
import "./robot.css";

export interface TugasRobot {
  id: number;
  jenis: string;
  kelompok: number | null;
  klp: string | null;
  status: "antre" | "diambil" | "selesai" | "gagal" | "batal";
  percobaan: number;
  galat: string | null;
  rinci?: string | null;
  jalanPada: string;
}

/** The newest job of each KLP for one group, oldest KLP first. */
export function tugasKelompok(semua: TugasRobot[], nomor: number): TugasRobot[] {
  const per = new Map<string, TugasRobot>();
  for (const t of semua)
    if (
      t.jenis === "nilai" &&
      t.kelompok === nomor &&
      t.status !== "batal" &&
      !per.has(t.klp ?? "")
    )
      per.set(t.klp ?? "", t);
  return [...per.values()].sort((a, b) => Number(a.klp) - Number(b.klp));
}

export function useRobotSesi(sesiId: number | null) {
  return usePollBersama(
    `robot-sesi-${sesiId}`,
    () =>
      getJson<{ ok: boolean; nyala: boolean; tugas: TugasRobot[] }>(
        `/api/session/robot?sesiId=${sesiId}`,
      ),
    60_000,
    sesiId !== null,
    ["seelabs"],
  );
}

const LANGKAH = (t: TugasRobot) => (t.status === "selesai" ? 4 : t.status === "diambil" ? 1 : 0);

export default function SeelabsStrip({ sesiId, nomor }: { sesiId: number; nomor: number }) {
  const lang = pageLang();
  const r = RB[lang];
  const { data, refresh } = useRobotSesi(sesiId);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const jobs = data?.ok ? tugasKelompok(data.tugas, nomor) : [];
  if (!jobs.length) return null;

  // The slowest KLP sets the strip; a failure anywhere shows first.
  const gagal = jobs.find((j) => j.status === "gagal");
  const langkah = Math.min(...jobs.map(LANGKAH));
  const tunggu = jobs.find((j) => j.status === "antre" && j.galat);

  async function kirim(aksi: "ulang" | "token", id: number) {
    setBusy(true);
    const res = await postJson<{ ok: boolean }>("/api/session/robot", {
      aksi,
      tugasId: id,
      ...(aksi === "token" ? { token: token.trim() } : {}),
    }).catch(() => ({ ok: false }));
    setBusy(false);
    window.Toast?.show(res.ok ? r.queued : r.failed, res.ok ? "ok" : "danger");
    if (res.ok) setToken("");
    refresh();
  }

  const label = gagal ? r.job.gagal : langkah >= 4 ? r.job.selesai : r.steps[Math.min(langkah, 3)];
  return (
    <div className="slr-strip" role="status">
      <div className="slr-strip__top">
        <span className="field__label">{r.strip}</span>
        <b className="grow">
          {label}
          {jobs.length > 1 && (
            <span className="hint"> · KLP {jobs.map((j) => j.klp).join(", ")}</span>
          )}
        </b>
      </div>
      <ol className="slr-prog" aria-label={label}>
        {r.steps.map((s, i) => (
          <li
            key={s}
            data-s={
              langkah >= 4 || i < langkah
                ? "done"
                : i === langkah
                  ? gagal
                    ? "fail"
                    : "now"
                  : "todo"
            }
          >
            <i />
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {tunggu && !gagal && (
        <span className="hint">
          {r.err[tunggu.galat!] ?? ""} {r.retryAt(jamMenit(tunggu.jalanPada, lang))}
        </span>
      )}
      {gagal && (
        <>
          <div className="banner banner--danger slr-note">
            <WarningIcon size={20} aria-hidden="true" />
            <span>
              {r.err[gagal.galat ?? "bentuk_berubah"] ?? r.failed}
              {gagal.galat === "seelabs_menolak" && gagal.rinci ? ` "${gagal.rinci}"` : ""}
            </span>
          </div>
          {gagal.galat === "butuh_token" || gagal.galat === "token_salah" ? (
            <form
              className="slr-token"
              onSubmit={(e) => {
                e.preventDefault();
                void kirim("token", gagal.id);
              }}
            >
              <label className="field">
                <span className="field__label">{r.tokenLabel}</span>
                <input
                  className="field__input mono"
                  value={token}
                  placeholder={r.tokenPh}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={busy || token.trim().length < 3}
              >
                {r.tokenSend}
              </button>
              {/* The list changes without a token when the schedule is fixed. */}
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy}
                onClick={() => void kirim("ulang", gagal.id)}
              >
                {r.tryAgain}
              </button>
            </form>
          ) : gagal.galat !== "ditolak" && gagal.galat !== "segel_rusak" ? (
            <div className="slr-acts">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy}
                onClick={() => void kirim("ulang", gagal.id)}
              >
                {r.tryAgain}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
