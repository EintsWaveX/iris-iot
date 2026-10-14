/**
 * The Konsol Pi tab (Phase 9 Stage 9, mockup v-console; rooms since
 * 2026-10-05): ask (target, reason, password again), wait for the Pencipta,
 * the Inti or a DEV (they themselves open at once), then a terminal or a
 * screen of the Pi through the relay, and a summary when it closes.
 * Someone else's open console can be joined (at once for those three, else
 * asked for); inside, one person controls and the rest watch, and anyone
 * can ask the controller for control (the prompt sits inside the pane, so
 * it shows in full screen too). Requests waiting for me, consoles opened
 * without approval, and requests to join show on top with their answers.
 * A running session blocks opening unless forced with a reason.
 *
 * The data comes from ServerDetail's poll of GET ?aksi=konsol, so the head's
 * banner and this tab read the same state.
 *
 * Phase 10 (mockup s12-server): the tab sits on the page's 12 column grid.
 * Before a console opens the body takes 8 columns beside who gets told and
 * the recent consoles; an open terminal or screen keeps the full width.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CircleNotchIcon,
  ClockCountdownIcon,
  DesktopIcon,
  EyeIcon,
  HandIcon,
  HourglassHighIcon,
  LockKeyIcon,
  MonitorIcon,
  PaperPlaneTiltIcon,
  PowerIcon,
  ShieldCheckIcon,
  SignInIcon,
  StarFourIcon,
  TerminalWindowIcon,
  UsersIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import Disclose from "../../ui/Disclose";
import Fade from "../../ui/Fade";
import PersonBadges from "../../ui/PersonBadges";
import TierBadge from "../../ui/TierBadge";
import PasswordField from "../../ui/PasswordField";
import { StateView } from "../../ui/Display";
import { href, tanggalPanjang, useTick } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { DIAM_MENIT, KONSOL_BUKA, type KonsolTarget } from "../../../lib/konsol";
import { hariLabel, menitLabel, modulLabel, nil, slotLabel } from "../../../lib/labels";
import { jamWib, tanggalWib } from "../../reports/data";
import Layar, { type LayarApi } from "./Layar";
import { useFullscreenEl } from "../../ui/fullscreen";
import Terminal, { type TermApi } from "./Terminal";
import {
  aksiKonsol,
  nomorKonsol,
  sisaMenit,
  TERBUKA,
  useSambung,
  type KonsolData,
  type KonsolRow,
  type PesertaRow,
  type Ruang,
} from "./data";
import { K, pesanK, type KStrings } from "./strings";
import { S12 } from "../server12Strings";
import { waktuPendek } from "../data";
import "./konsol.css";

const TARGET_IKON = { terminal: TerminalWindowIcon, ":0": MonitorIcon, ":1": DesktopIcon };

function targetLabel(t: KStrings, x: KonsolTarget) {
  return x === "terminal" ? t.terminal : x === ":0" ? t.screen0 : t.screen1;
}

function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="kv">
      {rows.map(([a, b]) => (
        <span key={a} className="kv__row">
          <span className="label-caps">{a}</span>
          <span>{b}</span>
        </span>
      ))}
    </div>
  );
}

function sesiTeks(s: NonNullable<KonsolData["sesi"]>, lang: Lang) {
  const d = new Date(`${s.tanggal}T00:00:00+07:00`).getUTCDay();
  const hari = hariLabel(d === 0 ? 7 : d, lang);
  return `${hari}${s.slot ? ` ${slotLabel(s.slot, lang)}` : ""}, ${modulLabel(s.modul, lang)}`;
}

export default function KonsolPi({
  lang,
  serverId,
  serverNama,
  data,
  dibaca,
  refresh,
  badges,
  admin,
  onOverview,
}: {
  lang: Lang;
  serverId: number;
  serverNama: string;
  data: KonsolData | null;
  dibaca: number;
  refresh: () => void;
  /** My badges and whether I'm Inti, for the Ask card's corner. */
  badges: string[];
  admin: boolean;
  onOverview: () => void;
}) {
  const t = K[lang];
  const now = useTick(1_000);
  // "Ask Again" after a closed console shows the form instead of the summary.
  const [lagi, setLagi] = useState(false);
  // Left a console I joined (the page shows the Join card again).
  const [keluar, setKeluar] = useState<number | null>(null);

  if (!data) {
    return <span className="skeleton" style={{ height: 320 }} aria-busy="true" />;
  }
  const bebas = data.istimewa ?? data.dev;
  const mine = data.milikku ?? null;
  const open = mine && TERBUKA.includes(mine.status) ? mine : null;
  const ended = mine && !open && !lagi ? mine : null;
  const untuk = data.untukku ?? [];
  const gabung = data.gabungUntukku ?? [];
  const aktifLain = !open && data.aktif && data.aktif.oleh !== mine?.oleh ? data.aktif : null;
  const peran = data.saya?.peran ?? null;
  const ikut = aktifLain && peran === "peserta" && keluar !== aktifLain.id ? aktifLain : null;
  const tunggu = aktifLain && peran === "diminta" ? aktifLain : null;
  const bisaGabung = aktifLain && !ikut && !tunggu ? aktifLain : null;
  // Someone else's request is still waiting (one console per Pi).
  const antre = !open && !aktifLain ? (untuk.find((r) => r.status === "diminta") ?? null) : null;
  const sendiri = !ikut && !tunggu && !bisaGabung && !antre;
  const ord = !mine || lagi ? 0 : mine.status === "diminta" ? 1 : open ? 2 : 3;
  const steps = bebas ? t.stepsPencipta : t.steps;
  const sisa = sisaMenit(open ?? ikut, dibaca, now);

  let body: ReactNode;
  let kunci: string;
  if (open && open.status === "diminta") {
    kunci = "wait";
    body = <Wait t={t} row={open} data={data} refresh={refresh} />;
  } else if (open) {
    kunci = "open";
    body = (
      <Open
        key={open.id}
        t={t}
        lang={lang}
        row={open}
        pemilik
        serverNama={serverNama}
        refresh={refresh}
        keberatan={(data.keberatan ?? []).filter((k) => k.konsolId === open.id)}
      />
    );
  } else if (ikut) {
    kunci = "ikut";
    body = (
      <Open
        key={`ikut-${ikut.id}`}
        t={t}
        lang={lang}
        row={ikut}
        pemilik={false}
        serverNama={serverNama}
        refresh={refresh}
        keberatan={(data.keberatan ?? []).filter((k) => k.konsolId === ikut.id)}
      />
    );
  } else if (tunggu) {
    kunci = "tunggu";
    body = <JoinWait t={t} row={tunggu} refresh={refresh} />;
  } else if (bisaGabung) {
    kunci = "gabung";
    body = (
      <Join
        t={t}
        lang={lang}
        row={bisaGabung}
        bebas={bebas}
        ditolak={peran === "ditolak"}
        refresh={() => {
          setKeluar(null);
          refresh();
        }}
      />
    );
  } else if (antre && !ended) {
    kunci = "busy";
    body = (
      <section className="panel panel--solo">
        <StateView
          icon={<UsersIcon size={28} />}
          title={t.busyTitle}
          body={t.busyBody(antre.olehNama)}
        />
      </section>
    );
  } else if (ended) {
    kunci = "done";
    body = <Done t={t} lang={lang} row={ended} onAgain={() => setLagi(true)} />;
  } else {
    kunci = "ask";
    body = (
      <Ask
        t={t}
        lang={lang}
        data={data}
        serverId={serverId}
        bebas={bebas}
        badges={badges}
        admin={admin}
        refresh={() => {
          setLagi(false);
          refresh();
        }}
        onOverview={onOverview}
      />
    );
  }

  const lebar = kunci === "open" || kunci === "ikut";

  return (
    <div className="s12grid s12pk pk">
      {untuk.map((r) =>
        r.status === "diminta" ? (
          <Approve key={r.id} t={t} lang={lang} row={r} serverNama={serverNama} refresh={refresh} />
        ) : (
          <Notice key={r.id} t={t} lang={lang} row={r} serverNama={serverNama} refresh={refresh} />
        ),
      )}
      {gabung.map((p) => (
        <JoinApprove key={`g${p.id}`} t={t} lang={lang} p={p} refresh={refresh} />
      ))}
      <div className="pkhead s12span12">
        {sendiri && (
          <ol className="pksteps" aria-label={t.stepsLabel}>
            {steps.map((s, i) => (
              <li
                key={s}
                data-on={i <= ord ? "yes" : "no"}
                aria-current={i === ord ? "step" : undefined}
              >
                <span className="num">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        )}
        {open && open.status !== "diminta" && sisa !== null && (
          <EndButton t={t} lang={lang} row={open} sisa={sisa} refresh={refresh} />
        )}
        {ikut && sisa !== null && (
          <span className="pkhead__live">
            <span className="pkhead__left">
              <span className="dot dot--ok dot--pulse" aria-hidden="true" />
              <b className="num">{t.left(sisa)}</b>
            </span>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setKeluar(ikut.id)}
            >
              {t.leave}
            </button>
          </span>
        )}
      </div>
      <Disclose className="panel pksec s12span12" head={<b>{t.safeTitle}</b>}>
        <ul className="helplist">
          {t.safe.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Disclose>
      {!data.siap && (
        <div className="banner banner--warn s12span12" role="status">
          <WarningIcon size={20} aria-hidden="true" />
          <span>{t.notReady}</span>
        </div>
      )}
      <div className="s12span12">
        <Fade k={kunci}>{body}</Fade>
      </div>
      {!lebar && <KonsolSide t={t} lang={lang} data={data} />}
    </div>
  );
}

/* --------------------------------------------------------------- join */

/** Someone else's console is open: who is in it, and Join (or Ask to Join
 *  with a reason, for anyone but the Pencipta, the Inti and DEV). */
function Join({
  t,
  lang,
  row,
  bebas,
  ditolak,
  refresh,
}: {
  t: KStrings;
  lang: Lang;
  row: KonsolRow & { peserta?: PesertaRow[] };
  bebas: boolean;
  ditolak: boolean;
  refresh: () => void;
}) {
  const [alasan, setAlasan] = useState("");
  const [sandi, setSandi] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const siap = sandi.length > 0 && (bebas || alasan.trim().length >= 5);
  async function kirim() {
    setBusy(true);
    setErr(null);
    const r = await aksiKonsol("konsol_gabung", { id: row.id, alasan: alasan.trim(), sandi });
    setBusy(false);
    setSandi("");
    if (!r.ok) {
      setErr(pesanK(t, r.kode));
      return;
    }
    window.Toast?.show(r.masuk ? t.joinIn : t.joinSent, "ok");
    refresh();
  }
  const peserta = row.peserta ?? [];
  return (
    <section className="panel panel--solo pkask">
      <div className="panel__head">
        <h2 className="panel__title">{t.joinTitle}</h2>
        <span className="pill pill--ok">
          <span className="dot dot--ok dot--pulse" aria-hidden="true" />
          {targetLabel(t, row.target)}
        </span>
      </div>
      <p>{t.joinBody(row.olehNama, targetLabel(t, row.target))}</p>
      <KV
        rows={[
          [t.owner, row.olehNama],
          [t.reason, row.alasan],
          [t.inRoom, peserta.length ? peserta.map((p) => p.nama).join(", ") : "-"],
          [
            t.opened,
            `${tanggalPanjang(tanggalWib(row.mulai ?? row.dimintaPada), lang)} · ${jamWib(row.mulai ?? row.dimintaPada)}`,
          ],
        ]}
      />
      {ditolak && (
        <div className="banner banner--warn" role="status">
          <WarningIcon size={20} aria-hidden="true" />
          <span>{t.joinDeclined}</span>
        </div>
      )}
      {!bebas && (
        <label className="field">
          <span className="field__label">{t.reason}</span>
          <input
            className="field__input"
            value={alasan}
            maxLength={500}
            placeholder={t.joinReasonPh}
            onChange={(e) => setAlasan(e.target.value)}
          />
        </label>
      )}
      <PasswordField
        label={t.password}
        value={sandi}
        onChange={setSandi}
        autoComplete="current-password"
        hint={t.passwordHint}
        lang={lang}
      />
      <div className="tabstops">
        <div className="tabstops__row">
          {bebas ? (
            <StarFourIcon size={20} aria-hidden="true" />
          ) : (
            <UsersIcon size={20} aria-hidden="true" />
          )}
          <span>{bebas ? t.joinRuleBebas : t.joinRuleAsk}</span>
        </div>
      </div>
      {err && (
        <p className="field__error" role="alert">
          {err}
        </p>
      )}
      <div className="panel__actions">
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          disabled={!siap || busy}
          onClick={() => void kirim()}
        >
          {busy ? (
            <CircleNotchIcon size={18} className="ctl-spin" aria-hidden="true" />
          ) : (
            <SignInIcon size={18} aria-hidden="true" />
          )}
          {bebas ? t.joinNow : t.joinAsk}
        </button>
      </div>
    </section>
  );
}

function JoinWait({ t, row, refresh }: { t: KStrings; row: KonsolRow; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel panel--solo">
      <StateView
        icon={<HourglassHighIcon size={28} />}
        title={t.joinWaitTitle}
        body={t.joinWaitBody(row.olehNama)}
        actions={
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await aksiKonsol("konsol_gabung_batal", { id: row.id });
              setBusy(false);
              if (!r.ok) window.Toast?.show(pesanK(t, r.kode), "danger");
              refresh();
            }}
          >
            {t.cancel}
          </button>
        }
      />
    </section>
  );
}

/** A request to join a console I own (or, for the Pencipta, the Inti and
 *  DEV, any console). */
function JoinApprove({
  t,
  lang,
  p,
  refresh,
}: {
  t: KStrings;
  lang: Lang;
  p: PesertaRow & { target: KonsolTarget; pemilikNama: string };
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function jawab(setuju: boolean) {
    setBusy(true);
    const r = await aksiKonsol("konsol_gabung_jawab", { pesertaId: p.id, setuju });
    setBusy(false);
    if (!r.ok) window.Toast?.show(pesanK(t, r.kode), "danger");
    else window.Toast?.show(setuju ? t.joinOk(p.nama) : t.joinNo(p.nama), "ok");
    refresh();
  }
  return (
    <section className="panel panel--solo panel--key pkreq">
      <div className="panel__head">
        <h2 className="panel__title">{t.joinReqTitle}</h2>
        <span className="pill pill--warn">{t.needsYou}</span>
      </div>
      <p className="hint">{t.joinReqBody(p.nama)}</p>
      <KV
        rows={[
          [t.who, p.nama],
          [t.what, `${targetLabel(t, p.target)} · ${p.pemilikNama}`],
          [t.reason, p.alasan ?? nil(lang)],
          [
            t.asked,
            `${tanggalPanjang(tanggalWib(p.dimintaPada), lang)} · ${jamWib(p.dimintaPada)}`,
          ],
        ]}
      />
      <div className="panel__actions pkact">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => void jawab(false)}
        >
          {t.decline}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => void jawab(true)}
        >
          {t.approve}
        </button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- ask */

function Ask({
  t,
  lang,
  data,
  serverId,
  bebas,
  badges,
  admin,
  refresh,
  onOverview,
}: {
  t: KStrings;
  lang: Lang;
  data: KonsolData;
  serverId: number;
  /** Opens without an approver (the Pencipta, the Inti, DEV). */
  bebas: boolean;
  badges: string[];
  admin: boolean;
  refresh: () => void;
  onOverview: () => void;
}) {
  const [target, setTarget] = useState<KonsolTarget>("terminal");
  const [alasan, setAlasan] = useState("");
  const [sandi, setSandi] = useState("");
  const [paksa, setPaksa] = useState("");
  const [paksaOk, setPaksaOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sesi = data.sesi ?? null;

  if (sesi && !paksaOk) {
    return (
      <section className="panel panel--solo pkask">
        <div className="wininfo" data-tone="future">
          <span className="wininfo__ic">
            <LockKeyIcon size={26} aria-hidden="true" />
          </span>
          <div className="stack stack--sm">
            <b className="h3">{t.blockedTitle}</b>
            <span>{t.blockedBody(sesiTeks(sesi, lang))}</span>
            <span className="hint">{t.blockedHint}</span>
          </div>
        </div>
        <label className="field">
          <span className="field__label">{t.forceWhy}</span>
          <input
            className="field__input"
            value={paksa}
            placeholder={t.forcePh}
            maxLength={500}
            onChange={(e) => setPaksa(e.target.value)}
          />
        </label>
        <div className="panel__actions pkact">
          <button type="button" className="btn btn--ghost" onClick={onOverview}>
            {t.wait}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={paksa.trim().length < 5}
            onClick={() => setPaksaOk(true)}
          >
            {t.openAnyway}
          </button>
        </div>
      </section>
    );
  }

  async function kirim() {
    setBusy(true);
    setErr(null);
    const r = await aksiKonsol("konsol_minta", {
      serverId,
      target,
      alasan: alasan.trim(),
      sandi,
      paksa: sesi ? paksa.trim() : undefined,
    });
    setBusy(false);
    setSandi("");
    if (!r.ok) {
      if (r.kode === "ada_sesi") setPaksaOk(false);
      setErr(pesanK(t, r.kode));
      return;
    }
    window.Toast?.show(bebas ? t.sentPencipta : t.sent, "ok");
    refresh();
  }

  const rules: [typeof UsersIcon, string][] = [
    bebas ? [StarFourIcon, t.rulePencipta] : [UsersIcon, t.ruleApprove],
    [ClockCountdownIcon, t.ruleIdle],
    [LockKeyIcon, t.ruleSession],
  ];
  const siap = alasan.trim().length >= 5 && sandi.length > 0 && data.siap;

  return (
    <section className="panel panel--solo pkask">
      <div className="panel__head">
        <h2 className="panel__title">{t.askTitle}</h2>
        <span className="panel__badges">
          <PersonBadges badges={badges} lang={lang} sm />
          {admin && <TierBadge tier="admin" lang={lang} />}
        </span>
      </div>
      {sesi && (
        <div className="banner banner--warn">
          <WarningIcon size={20} aria-hidden="true" />
          <span>{t.forcing(paksa.trim())}</span>
        </div>
      )}
      <div className="field">
        <span className="field__label">{t.what}</span>
        <div className="seg seg--big" role="radiogroup" aria-label={t.what}>
          {KONSOL_BUKA.map((x) => {
            const Ic = TARGET_IKON[x];
            // The Pi said it has no screen to show (no desktop, no x11vnc).
            const tidak = x === ":0" && !!data.layar && data.layar !== "siap" ? data.layar : null;
            return (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={target === x}
                disabled={!!tidak}
                onClick={() => setTarget(x)}
              >
                <Ic size={18} aria-hidden="true" />
                <span className="konsol-pick">
                  {t.pick[x][0]}
                  <small>({tidak ? t.layarNo[tidak] : t.pick[x][1]})</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <label className="field">
        <span className="field__label">{t.reason}</span>
        <textarea
          className="field__input field__textarea"
          rows={3}
          maxLength={500}
          value={alasan}
          placeholder={t.reasonPh}
          onChange={(e) => setAlasan(e.target.value)}
        />
        <span className="field__hint">{t.reasonHint}</span>
      </label>
      <PasswordField
        label={t.password}
        value={sandi}
        onChange={setSandi}
        autoComplete="current-password"
        hint={t.passwordHint}
        lang={lang}
      />
      <div className="tabstops">
        {rules.map(([Ic, s]) => (
          <div key={s} className="tabstops__row">
            <Ic size={20} aria-hidden="true" />
            <span>{s}</span>
          </div>
        ))}
      </div>
      {err && (
        <p className="field__error" role="alert">
          {err}
        </p>
      )}
      <div className="panel__actions">
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          disabled={!siap || busy}
          onClick={() => void kirim()}
        >
          {busy ? (
            <CircleNotchIcon size={18} className="ctl-spin" aria-hidden="true" />
          ) : bebas ? (
            <TerminalWindowIcon size={18} aria-hidden="true" />
          ) : (
            <PaperPlaneTiltIcon size={18} aria-hidden="true" />
          )}
          {bebas ? t.openNow : t.send}
        </button>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- wait */

function Wait({
  t,
  row,
  data,
  refresh,
}: {
  t: KStrings;
  row: KonsolRow;
  data: KonsolData;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel panel--solo">
      <StateView
        icon={<HourglassHighIcon size={28} />}
        title={t.waitTitle}
        body={t.waitBody}
        actions={
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await aksiKonsol("konsol_batal", { id: row.id });
              setBusy(false);
              if (!r.ok) window.Toast?.show(pesanK(t, r.kode), "danger");
              refresh();
            }}
          >
            {t.cancel}
          </button>
        }
      />
      {!!data.pemeriksa?.length && (
        <div className="tabstops tabstops--3">
          {data.pemeriksa.map((p) => (
            <div key={p.nama} className="tabstops__row">
              <span className="acode">{p.kode ?? "?"}</span>
              <span>{p.nama}</span>
              <span className="pill">{t.notified}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------- approve, notice */

function Approve({
  t,
  lang,
  row,
  serverNama,
  refresh,
}: {
  t: KStrings;
  lang: Lang;
  row: KonsolRow;
  serverNama: string;
  refresh: () => void;
}) {
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  async function jawab(setuju: boolean) {
    setBusy(true);
    const r = await aksiKonsol(setuju ? "konsol_setujui" : "konsol_tolak", {
      id: row.id,
      catatan: catatan.trim(),
    });
    setBusy(false);
    if (!r.ok) window.Toast?.show(pesanK(t, r.kode), "danger");
    else window.Toast?.show(setuju ? t.approved(row.olehNama) : t.declined(row.olehNama), "ok");
    refresh();
  }
  return (
    <section className="panel panel--solo panel--key pkreq">
      <div className="panel__head">
        <h2 className="panel__title">{t.reqTitle}</h2>
        <span className="pill pill--warn">{t.needsYou}</span>
      </div>
      <KV
        rows={[
          [t.who, row.olehNama],
          [t.what, `${targetLabel(t, row.target)} · ${serverNama}`],
          [t.reason, row.alasan],
          [
            t.asked,
            `${tanggalPanjang(tanggalWib(row.dimintaPada), lang)} · ${jamWib(row.dimintaPada)}`,
          ],
          ...(row.paksa ? ([[t.forcedTag, row.paksa.alasan ?? ""]] as [string, string][]) : []),
        ]}
      />
      <label className="field">
        <span className="field__label">{t.note}</span>
        <input
          className="field__input"
          value={catatan}
          maxLength={500}
          onChange={(e) => setCatatan(e.target.value)}
        />
      </label>
      <div className="panel__actions pkact">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => void jawab(false)}
        >
          {t.decline}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => void jawab(true)}
        >
          {t.approve}
        </button>
      </div>
    </section>
  );
}

function Notice({
  t,
  lang,
  row,
  serverNama,
  refresh,
}: {
  t: KStrings;
  lang: Lang;
  row: KonsolRow;
  serverNama: string;
  refresh: () => void;
}) {
  const [dlg, setDlg] = useState<"tanya" | "tolak" | null>(null);
  const [teks, setTeks] = useState("");
  const [busy, setBusy] = useState(false);
  async function kirim(jenis: "oke" | "tanya" | "tolak") {
    setBusy(true);
    const r = await aksiKonsol("konsol_keberatan", { id: row.id, jenis, teks: teks.trim() });
    setBusy(false);
    if (!r.ok) {
      window.Toast?.show(pesanK(t, r.kode), "danger");
      return;
    }
    setDlg(null);
    setTeks("");
    window.Toast?.show(jenis === "oke" ? t.okayed : jenis === "tanya" ? t.asked2 : t.cutDone, "ok");
    refresh();
  }
  return (
    <section className="panel panel--solo panel--key pkreq">
      <div className="panel__head">
        <h2 className="panel__title">{t.noticeTitle}</h2>
        <span className="pill pill--violet">{t.noNeed}</span>
      </div>
      <p className="hint">{t.noticeBody}</p>
      <KV
        rows={[
          [t.who, row.olehNama],
          [t.what, `${targetLabel(t, row.target)} · ${serverNama}`],
          [t.reason, row.alasan],
          [
            t.opened,
            `${tanggalPanjang(tanggalWib(row.mulai ?? row.dimintaPada), lang)} · ${jamWib(row.mulai ?? row.dimintaPada)}`,
          ],
        ]}
      />
      <div className="panel__actions pkact pkact--3">
        <button
          type="button"
          className="btn btn--danger-soft"
          disabled={busy}
          onClick={() => setDlg("tolak")}
        >
          {t.reject}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => setDlg("tanya")}>
          {t.ask}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => void kirim("oke")}
        >
          {t.okay}
        </button>
      </div>
      <Dialog
        open={dlg !== null}
        onOpenChange={(o) => !o && setDlg(null)}
        title={dlg === "tanya" ? t.askTitleD : t.rejectTitleD}
        description={dlg === "tanya" ? t.askDesc : t.rejectDesc}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDlg(null)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className={dlg === "tanya" ? "btn btn--primary" : "btn btn--danger"}
              disabled={busy || teks.trim().length < 5}
              onClick={() => dlg && void kirim(dlg)}
            >
              {dlg === "tanya" ? (
                <PaperPlaneTiltIcon size={18} aria-hidden="true" />
              ) : (
                <PowerIcon size={18} aria-hidden="true" />
              )}
              {dlg === "tanya" ? t.sendQ : t.rejectCut}
            </button>
          </>
        }
      >
        <label className="field">
          <span className="field__label">{dlg === "tanya" ? t.question : t.rejectWhy}</span>
          <textarea
            className="field__input field__textarea"
            rows={3}
            maxLength={500}
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
          />
        </label>
      </Dialog>
    </section>
  );
}

/* --------------------------------------------------------------- open */

function EndButton({
  t,
  lang,
  row,
  sisa,
  refresh,
}: {
  t: KStrings;
  lang: Lang;
  row: KonsolRow;
  sisa: number;
  refresh: () => void;
}) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <span className="pkhead__live">
      <span className="pkhead__left">
        <span className="dot dot--ok dot--pulse" aria-hidden="true" />
        <b className="num">{t.left(sisa)}</b>
      </span>
      <button type="button" className="btn btn--sm btn--danger-soft" onClick={() => setAsk(true)}>
        {t.end}
      </button>
      <Dialog
        open={ask}
        onOpenChange={setAsk}
        title={t.endTitle}
        description={t.endBody}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setAsk(false)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await aksiKonsol("konsol_putus", { id: row.id, alasan: "diakhiri" });
                setBusy(false);
                setAsk(false);
                if (!r.ok) window.Toast?.show(pesanK(t, r.kode), "danger");
                refresh();
              }}
            >
              {t.end}
            </button>
          </>
        }
      />
    </span>
  );
}

function Open({
  t,
  lang,
  row,
  pemilik,
  serverNama,
  refresh,
  keberatan,
}: {
  t: KStrings;
  lang: Lang;
  row: KonsolRow;
  /** I asked for this console (else I joined it). */
  pemilik: boolean;
  serverNama: string;
  refresh: () => void;
  keberatan: NonNullable<KonsolData["keberatan"]>;
}) {
  const now = useTick(1_000);
  const term = useRef<TermApi | null>(null);
  const layar = useRef<LayarApi | null>(null);
  const pane = useRef<HTMLDivElement | null>(null);
  const terakhir = useRef(Date.now());
  // Output that arrives before xterm.js has loaded waits here.
  const tunda = useRef<ArrayBuffer[]>([]);
  // RFB bytes that arrive after a ready frame but before noVNC has mounted
  // wait here; anything before the ready frame belongs to an earlier x11vnc
  // connection and is dropped.
  const tundaLayar = useRef<ArrayBuffer[]>([]);
  const siapLayar = useRef(false);
  const [sandi, setSandi] = useState<string | undefined>();
  const [kendaliLayar, setKendaliLayar] = useState(false);
  // A short note shown inside the pane, so it is seen in full screen too.
  const [kabar, setKabar] = useState<{ teks: string; sampai: number } | null>(null);
  const terminal = row.target === "terminal";
  const ketik = () => (terakhir.current = Date.now());
  const umumkan = (teks: string, tone: "ok" | "warn" = "ok") => {
    setKabar({ teks, sampai: Date.now() + 4_000 });
    if (!document.fullscreenElement) window.Toast?.show(teks, tone);
  };

  const { keadaan, sambung, kirim, ws, ruang, kontrol } = useSambung({
    id: row.id,
    onData: (d) => {
      if (!terminal) {
        if (layar.current) layar.current.terima(d);
        else if (siapLayar.current) tundaLayar.current.push(d);
      } else if (term.current) term.current.tulis(d);
      else tunda.current.push(d);
    },
    onSiap: (o) => {
      ketik();
      if (terminal) {
        term.current?.ukur();
        term.current?.fokus();
      } else {
        // A new x11vnc connection: its bytes wait for the new noVNC, never
        // for the one being replaced.
        layar.current = null;
        tundaLayar.current = [];
        siapLayar.current = true;
        setSandi(typeof o.sandi === "string" ? o.sandi : undefined);
        setKendaliLayar(o.kendali === true);
      }
    },
    onTutup: (why) => {
      // The relay closed the room (idle, the cap, cut off). The owner closes
      // the row now rather than wait for the Pi's report; the others only
      // read it again.
      if (pemilik)
        void aksiKonsol("konsol_putus", { id: row.id, alasan: why || "diam" }).then(refresh);
      else refresh();
    },
    onDitolak: () => umumkan(t.ctlDeclined, "warn"),
  });

  useEffect(() => {
    if (keadaan.k !== "siap") {
      siapLayar.current = false;
      tundaLayar.current = [];
    }
  }, [keadaan.k]);

  const pegang = !!ruang && ruang.pengendali === ruang.aku;
  const namaDari = (id: number | null) => ruang?.orang.find((o) => o.id === id)?.nama ?? "";
  const nimDari = (id: number | null) => ruang?.orang.find((o) => o.id === id)?.nim ?? "";

  // Control moved: say so, and the new controller's terminal sends its size.
  const pengendaliLama = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (!ruang) return;
    const lama = pengendaliLama.current;
    pengendaliLama.current = ruang.pengendali;
    if (lama === undefined || lama === ruang.pengendali) return;
    if (pegang) {
      umumkan(t.ctlYours);
      if (terminal) {
        term.current?.ukur();
        term.current?.fokus();
      }
    } else if (ruang.pengendali !== null) umumkan(t.ctlMoved(namaDari(ruang.pengendali)));
  }, [ruang?.pengendali]);

  useEffect(() => {
    if (!kabar) return;
    const h = setTimeout(() => setKabar(null), Math.max(0, kabar.sampai - Date.now()));
    return () => clearTimeout(h);
  }, [kabar]);

  const sayaMinta = !!ruang && ruang.minta.includes(ruang.aku);
  const peminta = pegang && ruang ? (ruang.minta[0] ?? null) : null;

  function beri(id: number) {
    kontrol(`beri:${id}`);
    const ke = nimDari(id);
    if (ke) void aksiKonsol("konsol_kendali", { id: row.id, ke });
  }

  // Idle: a warning at 9 minutes without input, closed at 10. Only the one
  // in control is timed; the others are only watching.
  const diam = (now - terakhir.current) / 1000;
  const batas = DIAM_MENIT * 60;
  const peringatan = keadaan.k === "siap" && pegang && diam >= batas - 60;
  const tutupDiam = useRef(false);
  useEffect(() => {
    if (!pegang) terakhir.current = Date.now();
  }, [pegang]);
  useEffect(() => {
    if (keadaan.k === "siap" && pegang && diam >= batas && !tutupDiam.current) {
      tutupDiam.current = true;
      void aksiKonsol("konsol_putus", { id: row.id, alasan: "diam" }).then(refresh);
    }
  }, [diam, batas, keadaan.k, pegang, row.id, refresh]);

  // The pane's full screen button toggles (2026-10-06: inside full screen
  // it did nothing, so only the Esc key got out). While full screen and in
  // control, the keyboard is locked to the page where the browser allows
  // it, so Esc and Alt+Tab reach the Pi; holding Esc still leaves.
  const fsEl = useFullscreenEl();
  const full = !!fsEl && fsEl === pane.current;
  const penuh = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void pane.current?.requestFullscreen?.();
  };
  useEffect(() => {
    const kb = (
      navigator as Navigator & { keyboard?: { lock?: () => Promise<void>; unlock?: () => void } }
    ).keyboard;
    if (!full || !pegang || !kb?.lock) return;
    kb.lock().catch(() => {});
    return () => kb.unlock?.();
  }, [full, pegang]);

  // The status layer (connecting, dropped) starts under the pane's toolbar,
  // so the screen and control badges and the full screen button stay
  // readable and clickable while it shows (2026-10-09).
  useEffect(() => {
    const el = pane.current;
    const box = el?.querySelector<HTMLElement>(".vnc__frame, .term__xterm");
    if (!el || !box) return;
    const ukur = () =>
      el.style.setProperty(
        "--pk-bar",
        `${Math.max(0, box.getBoundingClientRect().top - el.getBoundingClientRect().top)}px`,
      );
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, [terminal, full]);

  const overlay = (() => {
    if (keadaan.k === "siap") return null;
    if (keadaan.k === "tiket")
      return (
        <Status icon={<CircleNotchIcon size={26} className="ctl-spin" />} text={t.connTicket} />
      );
    if (keadaan.k === "pi") {
      const lambat = now - keadaan.sejak > 45_000;
      return (
        <Status
          icon={<CircleNotchIcon size={26} className="ctl-spin" />}
          text={lambat ? t.connSlow : t.connPi}
          action={
            lambat ? (
              <button type="button" className="btn btn--sm" onClick={() => void sambung(true)}>
                {t.callPi}
              </button>
            ) : null
          }
        />
      );
    }
    if (keadaan.k === "galat") {
      return (
        <Status
          icon={<WarningIcon size={26} />}
          text={t.galat[keadaan.kode] ?? (t.codes[keadaan.kode] || t.galatLain)}
          action={
            <button type="button" className="btn btn--sm" onClick={() => void sambung(false)}>
              {t.reconnect}
            </button>
          }
        />
      );
    }
    return (
      <Status
        icon={<WarningIcon size={26} />}
        text={keadaan.kode === 4000 ? t.replaced : t.lost}
        action={
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => void sambung(keadaan.kode === 4001)}
          >
            {keadaan.kode === 4001 ? t.callPi : t.reconnect}
          </button>
        }
      />
    );
  })();

  return (
    <div className="stack">
      {keberatan.length > 0 && (
        <section className="panel pknotes">
          <span className="label-caps">{t.notes}</span>
          {keberatan.map((k) => (
            <p key={`${k.olehNama}-${k.pada}`}>
              <b>{k.olehNama}</b>{" "}
              {k.jenis === "oke" ? t.nOke : k.jenis === "tanya" ? t.nTanya : t.nTolak}
              {k.teks ? `: ${k.teks}` : ""}
            </p>
          ))}
        </section>
      )}
      {peringatan && (
        <div className="pkwarn" role="alert">
          <ClockCountdownIcon size={20} aria-hidden="true" />
          <span className="grow">{t.idle(Math.max(0, Math.ceil(batas - diam)))}</span>
          <button
            type="button"
            className="btn btn--sm btn--inverse"
            onClick={() => {
              ketik();
              kirim(JSON.stringify({ t: "hidup" }));
              window.Toast?.show(t.kept, "ok");
            }}
          >
            {t.stillHere}
          </button>
          <i style={{ width: `${(Math.max(0, batas - diam) / 60) * 100}%` }} />
        </div>
      )}
      {ruang && (
        <RuangBar
          t={t}
          ruang={ruang}
          pegang={pegang}
          sayaMinta={sayaMinta}
          onMinta={() => {
            kontrol("minta");
            umumkan(t.askedControl);
          }}
          onBatal={() => kontrol("batal")}
        />
      )}
      <div className="pkpane" ref={pane}>
        {terminal ? (
          <Terminal
            t={t}
            host={serverNama}
            kirim={kirim}
            onKetik={ketik}
            apiRef={term}
            bisaKetik={pegang}
            onFull={penuh}
            full={full}
            onSiap={() => {
              for (const d of tunda.current.splice(0)) term.current?.tulis(d);
              term.current?.ukur();
            }}
          />
        ) : (
          <Layar
            t={t}
            lang={lang}
            target={row.target}
            ws={keadaan.k === "siap" ? ws.current : null}
            sandi={sandi}
            kendali={kendaliLayar && pegang}
            kirim={kirim}
            onGerak={ketik}
            onFull={penuh}
            full={full}
            onKabar={(teks) => umumkan(teks)}
            apiRef={layar}
            tunda={tundaLayar}
          />
        )}
        {overlay && <div className="pkpane__over">{overlay}</div>}
        {peminta !== null && (
          <div className="pkctl" role="alertdialog" aria-label={t.ctlReq(namaDari(peminta))}>
            <b>{t.ctlReq(namaDari(peminta))}</b>
            <span className="hint">{t.ctlReqBody}</span>
            <span className="row pkctl__act">
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => kontrol(`tolak:${peminta}`)}
              >
                {t.keep}
              </button>
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={() => beri(peminta)}
              >
                {t.give}
              </button>
            </span>
          </div>
        )}
        {kabar && (
          <div className="pkkabar" role="status">
            {kabar.teks}
          </div>
        )}
      </div>
    </div>
  );
}

/** Who is in the console, who controls it, and Ask for Control. */
function RuangBar({
  t,
  ruang,
  pegang,
  sayaMinta,
  onMinta,
  onBatal,
}: {
  t: KStrings;
  ruang: Ruang;
  pegang: boolean;
  sayaMinta: boolean;
  onMinta: () => void;
  onBatal: () => void;
}) {
  return (
    <div className="pkroom">
      <span className="label-caps">{t.people}</span>
      <span className="pkroom__people">
        {ruang.orang.map((o) => (
          <span
            key={o.id}
            className={`pill${o.id === ruang.pengendali ? " pill--accent" : ""}`}
            title={o.id === ruang.pengendali ? t.controls : t.watching}
          >
            {o.id === ruang.pengendali ? (
              <HandIcon size={14} aria-hidden="true" />
            ) : (
              <EyeIcon size={14} aria-hidden="true" />
            )}
            {o.nama}
            {o.id === ruang.aku ? ` (${t.you})` : ""}
            {o.pemilik ? ` · ${t.owner}` : ""}
          </span>
        ))}
        {!ruang.pi && <span className="pill pill--warn">{t.waitingPi}</span>}
      </span>
      <span className="pkroom__act">
        {pegang ? (
          <span className="pill pill--ok">{t.controls}</span>
        ) : sayaMinta ? (
          <button type="button" className="btn btn--sm btn--ghost" onClick={onBatal}>
            {t.cancelAsk}
          </button>
        ) : (
          <button type="button" className="btn btn--sm" onClick={onMinta}>
            {t.askControl}
          </button>
        )}
      </span>
    </div>
  );
}

function Status({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div className="pkstatus" role="status">
      <span aria-hidden="true">{icon}</span>
      <span>{text}</span>
      {action}
    </div>
  );
}

/* --------------------------------------------------------------- done */

function Done({
  t,
  lang,
  row,
  onAgain,
}: {
  t: KStrings;
  lang: Lang;
  row: KonsolRow;
  onAgain: () => void;
}) {
  const mulai = row.mulai;
  const selesai = row.selesai;
  const lama =
    mulai && selesai
      ? Math.max(1, Math.round((new Date(selesai).getTime() - new Date(mulai).getTime()) / 60_000))
      : null;
  const sebab = row.diputusOleh
    ? t.cutBy(row.diputusOleh)
    : row.status === "ditolak"
      ? t.because.ditolak
      : row.status === "kedaluwarsa"
        ? t.because.kedaluwarsa
        : (t.because[row.alasanSelesai ?? ""] ?? row.alasanSelesai ?? "");
  return (
    <section className="panel panel--solo pkdone">
      <div className="panel__head">
        <h2 className="panel__title">{t.doneTitle}</h2>
        <span className="pill pill--ok mono">{nomorKonsol(row.id)}</span>
      </div>
      <div className="pkstats">
        {(
          [
            [t.openedAt, mulai ? jamWib(mulai) : "?"],
            [t.closedAt, selesai ? jamWib(selesai) : "?"],
            [t.length, lama !== null ? menitLabel(lama, lang) : "?"],
            [t.data, row.transkripBytes !== null ? t.mb(row.transkripBytes) : t.dataWait],
          ] as [string, string][]
        ).map(([a, b]) => (
          <div key={a} className="stat">
            <b className="num">{b}</b>
            <span>{a}</span>
          </div>
        ))}
      </div>
      <KV
        rows={[
          [t.what, targetLabel(t, row.target)],
          [t.date, tanggalPanjang(tanggalWib(row.dimintaPada), lang)],
          [t.approvedBy, row.tanpaPersetujuan ? t.noApprover : (row.disetujuiOleh ?? "?")],
          [t.reason, row.alasan],
          [t.closedBecause, sebab],
        ]}
      />
      <div className="panel__actions pkact">
        <a className="btn" href={`${href(lang, "/reports")}?audit=konsol#audit`}>
          {t.seeAudit}
        </a>
        <button type="button" className="btn btn--primary" onClick={onAgain}>
          {t.again}
        </button>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- side */

/** Under the body before a console opens, one row of equal height: the
 *  last five consoles closed on this Pi (mine only for the rest; Audit has
 *  them all), and who is told when one opens. */
function KonsolSide({ t, lang, data }: { t: KStrings; lang: Lang; data: KonsolData }) {
  const w = S12[lang];
  const orang = data.pemeriksa ?? [];
  const lalu = (data.riwayat ?? []).slice(0, 5);
  return (
    <>
      <section className="panel s12span8">
        <h2 className="panel__title">{w.recent}</h2>
        {lalu.length ? (
          <div className="stack stack--sm">
            {lalu.map((r) => {
              const lama =
                r.mulai && r.selesai
                  ? Math.max(1, Math.round((Date.parse(r.selesai) - Date.parse(r.mulai)) / 60_000))
                  : null;
              return (
                <div key={r.id} className="s12mod" data-t={r.status === "selesai" ? "ok" : "warn"}>
                  <span className="s12lamp" aria-hidden="true" />
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <b>
                      {targetLabel(t, r.target)}
                      {lama !== null ? ` · ${menitLabel(lama, lang)}` : ""}
                    </b>
                    <span className="hint">
                      {r.olehNama} · {waktuPendek(r.mulai ?? r.dimintaPada, lang)}
                    </span>
                  </span>
                  <span className="pill mono">{nomorKonsol(r.id)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="hint">{w.recentNone}</p>
        )}
        <div className="panel__actions" style={{ marginTop: "auto" }}>
          <a
            className="btn btn--ghost btn--sm"
            href={`${href(lang, "/reports")}?audit=konsol#audit`}
          >
            {w.toAudit}
          </a>
        </div>
      </section>
      <section className="panel s12span4">
        <div className="stack stack--sm">
          <h2 className="panel__title">{w.people}</h2>
          <span className="hint">{w.peopleSub}</span>
        </div>
        {orang.length ? (
          <div className="stack stack--sm">
            {orang.map((o) => (
              <div key={o.nama} className="s12mod" data-t="ok">
                <span className="acode">{o.kode ?? "?"}</span>
                <b>{o.nama}</b>
                <span />
              </div>
            ))}
          </div>
        ) : (
          <p className="hint">{w.peopleNone}</p>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------- banner */

/** For everyone with Server access while someone else's console is open. */
export function KonsolBanner({
  lang,
  row,
  dibaca,
  bisaPutus,
  refresh,
  onJoin,
}: {
  lang: Lang;
  row: KonsolRow & { peserta?: PesertaRow[] };
  dibaca: number;
  bisaPutus: boolean;
  refresh: () => void;
  /** Opens the Konsol tab, to watch or join. */
  onJoin?: () => void;
}) {
  const t = K[lang];
  const now = useTick(5_000);
  const [ask, setAsk] = useState(false);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const m = sisaMenit(row, dibaca, now) ?? 0;
  const by = row.tanpaPersetujuan ? null : row.disetujuiOleh;
  return (
    <div className="banner banner--warn pkbanner" role="status">
      <ShieldCheckIcon size={20} aria-hidden="true" />
      <span className="grow">{t.banner(row.olehNama, by, m, row.peserta?.length ?? 0)}</span>
      {onJoin && (
        <button type="button" className="btn btn--sm" onClick={onJoin}>
          {t.joinLink}
        </button>
      )}
      {bisaPutus && (
        <button type="button" className="btn btn--sm btn--danger-soft" onClick={() => setAsk(true)}>
          {t.cutOff}
        </button>
      )}
      <Dialog
        open={ask}
        onOpenChange={setAsk}
        title={t.cutTitle}
        description={t.cutDesc}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setAsk(false)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy || why.trim().length < 5}
              onClick={async () => {
                setBusy(true);
                const r = await aksiKonsol("konsol_putus", { id: row.id, alasan: why.trim() });
                setBusy(false);
                setAsk(false);
                window.Toast?.show(r.ok ? t.cutDone : pesanK(t, r.kode), r.ok ? "ok" : "danger");
                refresh();
              }}
            >
              {t.cutOff}
            </button>
          </>
        }
      >
        <label className="field">
          <span className="field__label">{t.cutWhy}</span>
          <textarea
            className="field__input field__textarea"
            rows={3}
            maxLength={500}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
        </label>
      </Dialog>
    </div>
  );
}
