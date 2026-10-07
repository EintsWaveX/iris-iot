/**
 * Module 4's sixth step, Perburuan (ruled 2026-10-04). The hunt runs on the
 * Pi's offline hotspot, so the group's one laptop hands phones over with two
 * QR codes, shown one at a time so a camera can't catch the wrong one: first
 * the Wi-Fi, then the hunt's address (each member types their own NIM on
 * the phone). Locked until the hunt session runs on the Pi; shows who in the
 * group has joined while it runs, then the result.
 */
import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import {
  ArrowRightIcon,
  CopyIcon,
  FlagCheckeredIcon,
  PulseIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { getJson, KELOMPOK_NAMA } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { usePoll } from "../../lib/hooks";
import { kelompokLabel } from "../../lib/labels";
import type { KeadaanHunt, Penghargaan, PeristiwaRingkas } from "../../lib/perburuan";
import { salinTeks } from "../console/seelabs/data";
import { StateView } from "../ui/Display";
import IconButton from "../ui/IconButton";
import Pill from "../ui/Pill";
import SegmentedControl from "../ui/SegmentedControl";
import { H } from "./huntStrings";
import "./hunt.css";

export interface PerburuanData {
  ok: boolean;
  aktif: boolean;
  keadaan?: KeadaanHunt;
  piTerhubung?: boolean;
  terdaftar?: boolean;
  url?: string;
  lan?: boolean;
  wifi?: { ssid: string; sandi: string | null; qr: string } | null;
  berjalan?: number;
  jumlahKelompok?: number;
  kelompok?: {
    nomor: number;
    status: string | null;
    heat: string | null;
    rank: number | null;
    durasi: number | null;
    klaimKe: number | null;
    anggota: { nama: string; aku: boolean; peran: string | null; hadir: boolean }[];
  };
  penghargaan?: Penghargaan[];
  peristiwa?: PeristiwaRingkas[];
}

/** The step's data while Module 4 runs: fetched again whenever the Pi's
 *  hunt summary changes (buru, 2026-10-07), with a slow poll behind it. */
export function usePerburuan(enabled: boolean, wakilNomor?: number) {
  const url = `/api/session/perburuan${wakilNomor ? `?kelompok=${wakilNomor}` : ""}`;
  return usePoll(() => getJson<PerburuanData>(url), 30_000, enabled, ["sesi", "buru"]);
}

function Qr({ text, label, size = 220 }: { text: string; label: string; size?: number }) {
  const svg = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { n, d };
  }, [text]);
  return (
    <div className="qrbox" role="img" aria-label={label}>
      <svg
        viewBox={`0 0 ${svg.n + 4} ${svg.n + 4}`}
        width={size}
        height={size}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <rect width="100%" height="100%" fill="#fff" />
        <path d={svg.d} fill="#0b0e17" />
      </svg>
    </div>
  );
}

const menitDetik = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function HuntStep({
  lang,
  data,
  asisten,
}: {
  lang: Lang;
  data: PerburuanData | null;
  asisten: boolean;
}) {
  const t = H[lang];
  if (!data?.aktif || !data.kelompok) return null;
  const k = data.kelompok;
  const keadaan = data.keadaan ?? "tunggu";

  if (keadaan === "tunggu") {
    return (
      <div className="modlock">
        <StateView
          icon={<FlagCheckeredIcon size={28} />}
          title={t.waitTitle}
          body={data.piTerhubung ? t.waitBody : `${t.waitBody} ${t.waitNoPi}`}
          actions={
            <button
              type="button"
              className="btn"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("iris:go-step", { detail: "live" }))
              }
            >
              <PulseIcon size={18} aria-hidden="true" />
              {t.toLive}
            </button>
          }
        />
      </div>
    );
  }

  if (keadaan === "selesai") {
    const found = k.status === "menang";
    return (
      <div className="stack hunt-done">
        <div className="hunt-stats">
          <div className="stat">
            <span className="stat__value">{k.durasi != null ? menitDetik(k.durasi) : "·"}</span>
            <span className="stat__label">{t.statTime}</span>
          </div>
          <div className="stat">
            <span className="stat__value">
              {found && k.rank ? k.rank : "·"}
              <span className="faint"> / {data.jumlahKelompok || "·"}</span>
            </span>
            <span className="stat__label">{t.statRank}</span>
          </div>
          <div className="stat">
            <span className="stat__value">{k.klaimKe ?? 0}</span>
            <span className="stat__label">{t.statClaims}</span>
          </div>
          <div className="stat">
            <span className="stat__value">{found ? t.found : t.notFound}</span>
            <span className="stat__label">{t.statResult}</span>
          </div>
        </div>
        <History lang={lang} peristiwa={data.peristiwa ?? []} />
        <section className="panel">
          <h2 className="panel__title">{t.awardsTitle}</h2>
          {data.penghargaan?.length ? (
            <div className="row hunt-awards">
              {data.penghargaan.map((a) => (
                <Pill
                  key={a.kunci + (a.posisi ?? "")}
                  tone={a.kunci === "podium" ? "warn" : undefined}
                  lg
                >
                  {a.kunci === "podium" ? t.award.podium(a.posisi ?? 1) : t.award[a.kunci]}
                </Pill>
              ))}
            </div>
          ) : (
            <p className="hint">{t.noAwards}</p>
          )}
        </section>
      </div>
    );
  }

  const masuk = k.anggota.filter((a) => a.hadir).length;
  return (
    <div className="huntjoin">
      <JoinCard lang={lang} data={data} asisten={asisten} />
      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">{t.teamTitle}</h2>
          <Pill tone={masuk === k.anggota.length && masuk > 0 ? "ok" : "warn"}>
            {t.inCount(masuk, k.anggota.length)}
          </Pill>
        </div>
        <div className="row hunt-team__tags">
          <Pill group={k.nomor}>
            {kelompokLabel(k.nomor, lang)} · {KELOMPOK_NAMA[k.nomor] ?? ""}
          </Pill>
          {keadaan === "main" && k.heat && t.heat[k.heat] && (
            <Pill tone="warn">{t.heat[k.heat]}</Pill>
          )}
        </div>
        <ul className="hunt-team">
          {k.anggota.map((a) => (
            <li key={a.nama} className="hunt-team__row">
              <span className={`hunt-team__dot${a.hadir ? " is-on" : ""}`} aria-hidden="true" />
              <span className="grow">
                {a.nama}
                {a.aku && <span className="hint"> ({t.you})</span>}
              </span>
              <span className="hint">
                {a.hadir || a.peran
                  ? a.peran
                    ? t.peran[a.peran as keyof typeof t.peran]
                    : ""
                  : t.notIn}
              </span>
            </li>
          ))}
        </ul>
        <span className="hint">
          {keadaan === "main" ? t.playing(menitDetik(data.berjalan ?? 0)) : t.phoneDead}
        </span>
      </section>
    </div>
  );
}

/** The hand-off card: one step, one QR on screen at a time. */
function JoinCard({ lang, data, asisten }: { lang: Lang; data: PerburuanData; asisten: boolean }) {
  const t = H[lang];
  const url = data.url ?? "";
  const wifi = !data.lan ? (data.wifi ?? null) : null;
  // The LAN mode has nothing to scan for the network, so it starts on 2.
  const [step, setStep] = useState<"1" | "2">(wifi ? "1" : "2");
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.joinTitle}</h2>
        <Pill tone="ok">{t.open}</Pill>
      </div>
      <p className="panel__sub">{t.joinLede}</p>
      {!data.terdaftar && (
        <div className="banner banner--warn">
          <WarningIcon aria-hidden="true" />
          <span>{t.notListed}</span>
        </div>
      )}
      <SegmentedControl
        fill
        value={step}
        onValueChange={(v) => setStep(v as "1" | "2")}
        aria-label={t.joinTitle}
        options={[
          { value: "1", label: t.stepWifi },
          { value: "2", label: t.stepHunt },
        ]}
      />
      {step === "1" ? (
        <div className="huntjoin__one">
          {data.lan ? (
            <div className="stack stack--sm huntjoin__text">
              <b>{t.lanTitle}</b>
              <span className="hint">{t.lanHint}</span>
            </div>
          ) : wifi ? (
            <>
              <Qr text={wifi.qr} label={t.wifiQr(wifi.ssid)} />
              <div className="stack stack--sm huntjoin__text">
                <b>{t.wifiTitle(wifi.ssid)}</b>
                <span className="hint">
                  {wifi.sandi ? (
                    <>
                      {t.wifiHint(wifi.ssid)} <span className="mono">{wifi.sandi}</span>.
                    </>
                  ) : (
                    t.wifiHintOpen(wifi.ssid)
                  )}
                </span>
                <span className="hint">{t.wifiNoNet}</span>
              </div>
            </>
          ) : (
            <div className="stack stack--sm huntjoin__text">
              <b>{t.wifiTitle("IRIS-IOT")}</b>
              <span className="hint">{t.wifiUnknown}</span>
            </div>
          )}
          <button type="button" className="btn btn--primary" onClick={() => setStep("2")}>
            {t.next}
            <ArrowRightIcon aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="huntjoin__one">
          <Qr text={url} label={t.huntQr} />
          <div className="stack stack--sm huntjoin__text">
            <b>{t.huntTitle}</b>
            <span className="hint">{asisten ? t.huntHintAsisten : t.huntHint}</span>
          </div>
          <div className="huntjoin__url">
            <span className="mono">{url}</span>
            <IconButton
              icon={CopyIcon}
              label={t.copy}
              sm
              onClick={async () => {
                const ok = await salinTeks(url);
                window.Toast?.show(ok ? t.copied : t.copyFail, ok ? "ok" : "warn");
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function History({ lang, peristiwa }: { lang: Lang; peristiwa: PeristiwaRingkas[] }) {
  const t = H[lang];
  const teks = (e: PeristiwaRingkas) =>
    e.kind === "zona"
      ? t.ev.zona(t.heat[e.heat ?? ""] ?? e.heat ?? "")
      : e.kind === "tolak"
        ? t.ev.tolak(e.alasan ?? "")
        : (t.ev[e.kind as "klaim"] ?? e.kind);
  return (
    <section className="panel">
      <h2 className="panel__title">{t.historyTitle}</h2>
      {peristiwa.length ? (
        <ul className="hunt-history">
          {peristiwa.map((e) => (
            <li key={`${e.at}-${e.kind}`} className="hunt-history__row">
              <span className="mono hint">{e.at.slice(0, 8)}</span>
              <span>{teks(e)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{t.noHistory}</p>
      )}
    </section>
  );
}
