/**
 * The Konsol Pi tab (Phase 9 Stage 9, mockup v-console), DEV and the
 * Pencipta only: ask (target, reason, password again), wait for another DEV
 * or the Pencipta, then a terminal or a screen of the Pi through the relay,
 * and a summary when it closes. Requests waiting for this DEV, and consoles
 * the Pencipta opened without approval, show on top with their answers.
 * A running session blocks it unless forced with a reason.
 *
 * The data comes from ServerDetail's poll of GET ?aksi=konsol, so the head's
 * banner and this tab read the same state.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowClockwiseIcon,
  ChatCircleTextIcon,
  CheckIcon,
  CircleNotchIcon,
  ClockCountdownIcon,
  DesktopIcon,
  FileTextIcon,
  HourglassHighIcon,
  LockKeyIcon,
  MonitorIcon,
  PaperPlaneTiltIcon,
  PowerIcon,
  ShieldCheckIcon,
  StarFourIcon,
  TerminalWindowIcon,
  UsersIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import Disclose from "../../ui/Disclose";
import Fade from "../../ui/Fade";
import PersonBadges from "../../ui/PersonBadges";
import PasswordField from "../../ui/PasswordField";
import { StateView } from "../../ui/Display";
import { href, tanggalPanjang, useTick } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { DIAM_MENIT, type KonsolTarget } from "../../../lib/konsol";
import { hariLabel, menitLabel, modulLabel, slotLabel } from "../../../lib/labels";
import { jamWib, tanggalWib } from "../../reports/data";
import Layar, { type LayarApi } from "./Layar";
import Terminal, { type TermApi } from "./Terminal";
import {
  aksiKonsol,
  nomorKonsol,
  sisaMenit,
  TERBUKA,
  useSambung,
  type KonsolData,
  type KonsolRow,
} from "./data";
import { K, pesanK, type KStrings } from "./strings";
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
  pencipta,
  onOverview,
}: {
  lang: Lang;
  serverId: number;
  serverNama: string;
  data: KonsolData | null;
  dibaca: number;
  refresh: () => void;
  pencipta: boolean;
  onOverview: () => void;
}) {
  const t = K[lang];
  const now = useTick(1_000);
  // "Ask Again" after a closed console shows the form instead of the summary.
  const [lagi, setLagi] = useState(false);

  if (!data) {
    return <span className="skeleton" style={{ height: 320 }} aria-busy="true" />;
  }
  const mine = data.milikku ?? null;
  const open = mine && TERBUKA.includes(mine.status) ? mine : null;
  const ended = mine && !open && !lagi ? mine : null;
  const ord = !mine || lagi ? 0 : mine.status === "diminta" ? 1 : open ? 2 : 3;
  const steps = pencipta ? t.stepsPencipta : t.steps;
  const untuk = data.untukku ?? [];
  const sisa = sisaMenit(open, dibaca, now);

  // One console per Pi: while someone else's is asked for or open, there is
  // nothing to ask (the banner or the cards above say whose it is).
  const lain =
    !open &&
    (untuk.some((r) => r.status === "diminta") || (data.aktif && data.aktif.oleh !== mine?.oleh))
      ? (untuk[0] ?? data.aktif)
      : null;

  let body: ReactNode;
  if (lain && !ended) {
    body = (
      <section className="panel panel--solo">
        <StateView
          icon={<UsersIcon size={28} />}
          title={t.busyTitle}
          body={t.busyBody(lain.olehNama)}
        />
      </section>
    );
  } else if (open && open.status === "diminta") {
    body = <Wait t={t} row={open} data={data} refresh={refresh} />;
  } else if (open) {
    body = (
      <Open
        key={open.id}
        t={t}
        lang={lang}
        row={open}
        serverNama={serverNama}
        refresh={refresh}
        keberatan={(data.keberatan ?? []).filter((k) => k.konsolId === open.id)}
      />
    );
  } else if (ended) {
    body = <Done t={t} lang={lang} row={ended} onAgain={() => setLagi(true)} />;
  } else {
    body = (
      <Ask
        t={t}
        lang={lang}
        data={data}
        serverId={serverId}
        pencipta={pencipta}
        refresh={() => {
          setLagi(false);
          refresh();
        }}
        onOverview={onOverview}
      />
    );
  }

  return (
    <div className="stack stack--lg pk">
      {untuk.map((r) =>
        r.status === "diminta" ? (
          <Approve key={r.id} t={t} lang={lang} row={r} serverNama={serverNama} refresh={refresh} />
        ) : (
          <Notice key={r.id} t={t} lang={lang} row={r} serverNama={serverNama} refresh={refresh} />
        ),
      )}
      <div className="pkhead">
        {!(lain && !ended) && (
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
      </div>
      {!data.siap && (
        <div className="banner banner--warn" role="status">
          <WarningIcon size={20} aria-hidden="true" />
          <span>{t.notReady}</span>
        </div>
      )}
      <Fade k={open ? (open.status === "diminta" ? "wait" : "open") : ended ? "done" : "ask"}>
        {body}
      </Fade>
      <Disclose className="panel pksec" head={<b>{t.safeTitle}</b>}>
        <ul className="helplist">
          {t.safe.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Disclose>
    </div>
  );
}

/* ---------------------------------------------------------------- ask */

function Ask({
  t,
  lang,
  data,
  serverId,
  pencipta,
  refresh,
  onOverview,
}: {
  t: KStrings;
  lang: Lang;
  data: KonsolData;
  serverId: number;
  pencipta: boolean;
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
            <WarningIcon size={18} aria-hidden="true" />
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
    window.Toast?.show(pencipta ? t.sentPencipta : t.sent, "ok");
    refresh();
  }

  const rules: [typeof UsersIcon, string][] = [
    pencipta ? [StarFourIcon, t.rulePencipta] : [UsersIcon, t.ruleApprove],
    [ClockCountdownIcon, t.ruleIdle],
    [LockKeyIcon, t.ruleSession],
  ];
  const siap = alasan.trim().length >= 5 && sandi.length > 0 && data.siap;

  return (
    <section className="panel panel--solo pkask">
      <div className="panel__head">
        <h2 className="panel__title">{t.askTitle}</h2>
        <PersonBadges badges={pencipta ? ["pencipta", "dev"] : ["dev"]} lang={lang} sm />
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
          {(["terminal", ":0", ":1"] as const).map((x) => {
            const Ic = TARGET_IKON[x];
            return (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={target === x}
                onClick={() => setTarget(x)}
              >
                <Ic size={18} aria-hidden="true" />
                {targetLabel(t, x)}
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
          ) : pencipta ? (
            <TerminalWindowIcon size={18} aria-hidden="true" />
          ) : (
            <PaperPlaneTiltIcon size={18} aria-hidden="true" />
          )}
          {pencipta ? t.openNow : t.send}
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
          <CheckIcon size={18} aria-hidden="true" />
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
        <span className="pill pill--violet">
          <StarFourIcon size={14} aria-hidden="true" />
          {t.noNeed}
        </span>
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
          <XIcon size={18} aria-hidden="true" />
          {t.reject}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => setDlg("tanya")}>
          <ChatCircleTextIcon size={18} aria-hidden="true" />
          {t.ask}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => void kirim("oke")}
        >
          <CheckIcon size={18} aria-hidden="true" />
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
        <PowerIcon size={16} aria-hidden="true" />
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
              <PowerIcon size={18} aria-hidden="true" />
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
  serverNama,
  refresh,
  keberatan,
}: {
  t: KStrings;
  lang: Lang;
  row: KonsolRow;
  serverNama: string;
  refresh: () => void;
  keberatan: NonNullable<KonsolData["keberatan"]>;
}) {
  const now = useTick(1_000);
  const term = useRef<TermApi | null>(null);
  const layar = useRef<LayarApi | null>(null);
  const terakhir = useRef(Date.now());
  // Output that arrives before xterm.js has loaded waits here.
  const tunda = useRef<ArrayBuffer[]>([]);
  // RFB bytes that arrive after the ready frame but before noVNC has
  // mounted wait here; anything before the ready frame belongs to an
  // earlier x11vnc connection and is dropped.
  const tundaLayar = useRef<ArrayBuffer[]>([]);
  const siapLayar = useRef(false);
  const [sandi, setSandi] = useState<string | undefined>();
  const terminal = row.target === "terminal";
  const ketik = () => (terakhir.current = Date.now());

  const { keadaan, sambung, kirim, ws } = useSambung({
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
        tundaLayar.current = [];
        siapLayar.current = true;
        setSandi(typeof o.sandi === "string" ? o.sandi : undefined);
      }
    },
    onTutup: (why) => {
      // The relay closed the room (idle, the cap, cut off): close the row
      // now rather than wait for the Pi's report. A row already closed by
      // someone else just answers "sudah_selesai".
      void aksiKonsol("konsol_putus", { id: row.id, alasan: why || "diam" }).then(refresh);
    },
  });

  useEffect(() => {
    if (keadaan.k !== "siap") {
      siapLayar.current = false;
      tundaLayar.current = [];
    }
  }, [keadaan.k]);

  // Idle: a warning at 9 minutes without input, closed at 10.
  const diam = (now - terakhir.current) / 1000;
  const batas = DIAM_MENIT * 60;
  const peringatan = keadaan.k === "siap" && diam >= batas - 60;
  const tutupDiam = useRef(false);
  useEffect(() => {
    if (keadaan.k === "siap" && diam >= batas && !tutupDiam.current) {
      tutupDiam.current = true;
      void aksiKonsol("konsol_putus", { id: row.id, alasan: "diam" }).then(refresh);
    }
  }, [diam, batas, keadaan.k, row.id, refresh]);

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
                <ArrowClockwiseIcon size={16} aria-hidden="true" />
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
              <ArrowClockwiseIcon size={16} aria-hidden="true" />
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
            <ArrowClockwiseIcon size={16} aria-hidden="true" />
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
      <div className="pkpane">
        {terminal ? (
          <Terminal
            t={t}
            host={serverNama}
            kirim={kirim}
            onKetik={ketik}
            apiRef={term}
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
            kirim={kirim}
            onGerak={ketik}
            apiRef={layar}
            tunda={tundaLayar}
          />
        )}
        {overlay && <div className="pkpane__over">{overlay}</div>}
      </div>
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
    <section className="panel panel--solo">
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
          <FileTextIcon size={18} aria-hidden="true" />
          {t.seeAudit}
        </a>
        <button type="button" className="btn btn--primary" onClick={onAgain}>
          <ArrowClockwiseIcon size={18} aria-hidden="true" />
          {t.again}
        </button>
      </div>
    </section>
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
}: {
  lang: Lang;
  row: KonsolRow;
  dibaca: number;
  bisaPutus: boolean;
  refresh: () => void;
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
      <span className="grow">{t.banner(row.olehNama, by, m)}</span>
      {bisaPutus && (
        <button type="button" className="btn btn--sm btn--danger-soft" onClick={() => setAsk(true)}>
          <PowerIcon size={16} aria-hidden="true" />
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
              <PowerIcon size={18} aria-hidden="true" />
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
