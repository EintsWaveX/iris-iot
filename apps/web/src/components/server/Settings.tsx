/**
 * The Settings tab (Phase 9 Stage 5, mockup v-settings): Identity and
 * "Agent and diagnostics" as two columns of the same height, the Full
 * view's journal and network configuration, the Setup card (the Register
 * a Server dialog again, 2026-10-08), then the danger zone across the
 * full width. Changing anything needs the full right; everyone else
 * reads it.
 */
import { useState, type FormEvent } from "react";
import {
  CircleNotchIcon,
  DownloadSimpleIcon,
  FloppyDiskIcon,
  ListBulletsIcon,
  LockSimpleIcon,
  PlayIcon,
  PlugsConnectedIcon,
  PulseIcon,
  TerminalWindowIcon,
  TrashIcon,
  WifiHighIcon,
} from "@phosphor-icons/react";
import Confirm from "../ui/Confirm";
import Dropdown from "../ui/Dropdown";
import Tooltip from "../ui/Tooltip";
import { sejak, useTick } from "../../lib/app";
import { durasiLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import { bacaRinci, JOURNAL_UNIT, LANGKAH_PASANG, posisiPasang } from "../../lib/server-shared";
import Enroll, { bacaPerintah } from "./Enroll";
import {
  kirim,
  sedangBerjalan,
  terakhirDari,
  unduhTeks,
  waktuPendek,
  type Bisa,
  type Detail,
} from "./data";
import { S, pesan } from "./strings";

const DIAGS = [
  ["diag.ringkas", "dQuick", PulseIcon],
  ["diag.jaringan", "dNet", WifiHighIcon],
  ["diag.dmesg", "dKern", TerminalWindowIcon],
] as const;

function Journal({
  lang,
  id,
  data,
  refresh,
}: {
  lang: Lang;
  id: number;
  data: Detail;
  refresh: () => void;
}) {
  const t = S[lang];
  const now = useTick(1_000);
  const [unit, setUnit] = useState("semua");
  const [lvl, setLvl] = useState("semua");
  const last = terakhirDari(data, "diag.journal");
  const sama =
    last && (last.argumen?.unit ?? "semua") === unit && (last.argumen?.tingkat ?? "semua") === lvl;
  const jalan = sedangBerjalan(data, "diag.journal");
  const ambil = () =>
    void kirim(id, "diag.journal", { unit, tingkat: lvl }, lang, false).then(refresh);
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.journal}</h2>
        <button
          type="button"
          className="btn btn--sm"
          disabled={!sama || !last?.keluaran}
          onClick={() => unduhTeks(`journal-${data.server.nama}-24jam.txt`, last?.keluaran ?? "")}
        >
          <DownloadSimpleIcon size={16} aria-hidden="true" />
          {t.journal24}
        </button>
      </div>
      <div className="row" style={{ alignItems: "end" }}>
        <div style={{ width: 220 }}>
          <Dropdown
            id="srv-journal-unit"
            label={t.cUnit}
            hideLabel
            value={unit}
            onChange={setUnit}
            options={JOURNAL_UNIT.map((u) => ({
              value: u,
              label: u === "semua" ? t.allUnits : u === "kernel" ? t.kernel : u,
            }))}
          />
        </div>
        <div className="seg" role="group" aria-label={t.cState}>
          {(
            [
              ["semua", t.lvlAll],
              ["galat", t.lvlErr],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={lvl === v} onClick={() => setLvl(v)}>
              {l}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--sm" disabled={jalan} onClick={ambil}>
          {jalan ? (
            <CircleNotchIcon size={16} className="ctl-spin" aria-hidden="true" />
          ) : (
            <PlayIcon size={16} aria-hidden="true" />
          )}
          {t.run}
        </button>
      </div>
      <span className="hint" aria-live="polite">
        {jalan
          ? t.journalWait
          : sama && last
            ? t.logAt(sejak(last.selesaiPada ?? last.dimintaPada, lang, now))
            : t.neverRun}
      </span>
      <pre className="srv-log srv-log--tall">
        {sama
          ? last?.keluaran?.trim() && last.keluaran !== "(tidak ada keluaran)"
            ? last.keluaran
            : t.journalNone
          : "·"}
      </pre>
    </section>
  );
}

/** systemd's "Sat 2026-10-03 09:20:00" (the Pi's local time, WIB) in the
 *  page's language, without the abbreviated English weekday. */
function waktuTimer(raw: string, lang: Lang): string {
  const m = /(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(raw);
  if (!m) return raw;
  const d = new Date(`${m[1]}T${m[2]}:00+07:00`);
  return Number.isNaN(d.getTime()) ? raw : waktuPendek(d.toISOString(), lang);
}

function NetConf({ lang, data, onCommands }: { lang: Lang; data: Detail; onCommands: () => void }) {
  const t = S[lang];
  const r = bacaRinci(terakhirDari(data, "diag.rinci")?.keluaran);
  const paket = () => {
    const s = data.server;
    const isi = [
      `# ${s.nama} (${s.kode})`,
      `waktu: ${new Date().toISOString()}`,
      `agenVersi: ${s.agenVersi ?? ""}`,
      `alamatLan: ${s.alamatLan ?? ""}`,
      "",
      "## infoSistem",
      JSON.stringify(s.infoSistem ?? {}, null, 2),
      "",
      "## kondisi",
      JSON.stringify(s.kondisi ?? {}, null, 2),
      "",
      "## rinci (konfigurasi tanpa rahasia)",
      JSON.stringify(r ?? {}, null, 2),
      "",
      ...data.terakhir
        .filter((p) => p.aksi !== "diag.rinci")
        .flatMap((p) => [
          `## ${p.aksi} ${JSON.stringify(p.argumen ?? {})} ${p.selesaiPada ?? ""}`,
          p.keluaran ?? "",
          "",
        ]),
    ].join("\n");
    unduhTeks(`diagnosis-${s.nama}.txt`, isi);
    window.Toast?.show(t.bundleDone, "ok");
  };
  return (
    <section className="panel">
      <h2 className="panel__title">{t.netConf}</h2>
      <span className="hint mono">/etc/default/iris-ap</span>
      {r?.konfigAp ? (
        <div className="tabstops tabstops--3">
          {r.konfigAp.map(([k, v, rahasia]) => (
            <div key={k} className="tabstops__row">
              <span className="kbd">{k}</span>
              <span className="mono">{rahasia ? "••••••••" : v || "·"}</span>
              {rahasia ? (
                <Tooltip label={t.secretTip}>
                  <span className="pill" tabIndex={0}>
                    <LockSimpleIcon size={13} aria-hidden="true" />
                    {t.secret}
                  </span>
                </Tooltip>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">{t.fullWait}</p>
      )}
      <h3 className="panel__title" style={{ fontSize: "1rem" }}>
        {t.timers}
      </h3>
      {r?.timer.length ? (
        <div className="tabstops">
          {r.timer.slice(0, 8).map((x) => (
            <div key={x.unit} className="tabstops__row">
              <span className="kbd">{x.unit}</span>
              <span>{x.berikut ? t.timerNext(waktuTimer(x.berikut, lang)) : t.timerNone}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">{t.noData}</p>
      )}
      <div className="row panel__actions">
        <button type="button" className="btn" onClick={paket}>
          <DownloadSimpleIcon size={18} aria-hidden="true" />
          {t.bundleDl}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCommands}>
          <ListBulletsIcon size={18} aria-hidden="true" />
          {t.cmdHistory}
        </button>
      </div>
    </section>
  );
}

export default function Settings({
  lang,
  id,
  data,
  refresh,
  bisa,
  full,
  onDeleted,
  onCommands,
}: {
  lang: Lang;
  id: number;
  data: Detail;
  refresh: () => void;
  bisa: Bisa;
  full: boolean;
  onDeleted: () => void;
  onCommands: () => void;
}) {
  const t = S[lang];
  const now = useTick(1_000);
  const s = data.server;
  const saved = { nama: s.nama, lokasi: s.lokasi ?? "", catatan: s.catatan ?? "" };
  const [form, setForm] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<(typeof DIAGS)[number][0]>("diag.ringkas");
  const [ask, setAsk] = useState<"hapus" | null>(null);
  const [setup, setSetup] = useState(false);
  const ro = !bisa.full;
  const info = s.infoSistem ?? {};
  const protokol = typeof info.protokol === "number" ? String(info.protokol) : "·";
  const up = data.denyutTerakhir?.uptimeSec;

  async function save(e: FormEvent) {
    e.preventDefault();
    // Only what changed, so a field nobody touched is never overwritten.
    const patch = Object.fromEntries(
      Object.entries(form).filter(([k, v]) => v !== saved[k as keyof typeof saved]),
    );
    if (Object.keys(patch).length === 0) {
      window.Toast?.show(t.saved, "ok");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/server/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then((x) => x.json() as Promise<{ ok: boolean; kode?: string }>);
      window.Toast?.show(r.ok ? t.saved : pesan(t, r.kode), r.ok ? "ok" : "danger");
      refresh();
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }

  const hasil = terakhirDari(data, diag);
  const jalan = sedangBerjalan(data, diag);

  return (
    <div className="srv">
      <div className="srv-g2">
        <form className={`panel${ro ? " srv-ro" : ""}`} onSubmit={save} noValidate>
          <h2 className="panel__title">{t.identity}</h2>
          {ro && (
            <div className="banner banner--lock">
              <LockSimpleIcon size={18} aria-hidden="true" />
              <span>{t.readOnly}</span>
            </div>
          )}
          <div className="field">
            <label className="field__label" htmlFor="srv-nama">
              {t.name}
            </label>
            <input
              id="srv-nama"
              className="field__input"
              value={form.nama}
              readOnly={ro}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="srv-lok">
              {t.location}
            </label>
            <input
              id="srv-lok"
              className="field__input"
              value={form.lokasi}
              readOnly={ro}
              placeholder={t.locPh}
              onChange={(e) => setForm({ ...form, lokasi: e.target.value })}
            />
            <p className="field__hint">{t.locHint}</p>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="srv-lan">
              {t.lan} <span className="pill pill--accent">{t.fromAgent}</span>
            </label>
            <input
              id="srv-lan"
              className="field__input mono"
              value={s.alamatLan ?? ""}
              readOnly
              placeholder="·"
            />
            <p className="field__hint">{t.lanHint}</p>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="srv-cat">
              {t.notes}
            </label>
            <textarea
              id="srv-cat"
              className="field__input"
              rows={3}
              value={form.catatan}
              readOnly={ro}
              onChange={(e) => setForm({ ...form, catatan: e.target.value })}
            />
            <p className="field__hint">{t.notesHint}</p>
          </div>
          {!ro && (
            <div className="row row--end panel__actions">
              <button
                type="submit"
                className="btn btn--primary"
                disabled={busy || !form.nama.trim()}
              >
                <FloppyDiskIcon size={18} aria-hidden="true" />
                {t.save}
              </button>
            </div>
          )}
        </form>

        <section className="panel">
          <div className="stack stack--sm">
            <h2 className="panel__title">{t.agentDiag}</h2>
            <p className="panel__sub">{t.diagSub}</p>
          </div>
          <div className="srv-stats" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <div className="srv-stat">
              <b>{protokol}</b>
              <span>{t.sAgent}</span>
            </div>
            <div className="srv-stat">
              <b className="srv-stat__sm">{up ? durasiLabel(Math.floor(up / 60), lang) : "·"}</b>
              <span>{t.sUp}</span>
            </div>
            <div className="srv-stat">
              <b className="srv-stat__sm">{typeof info.os === "string" ? info.os : "·"}</b>
              <span>{t.sSystem}</span>
            </div>
            <div className="srv-stat">
              <b className="srv-stat__sm">{typeof info.kernel === "string" ? info.kernel : "·"}</b>
              <span>{t.sKernel}</span>
            </div>
          </div>
          <div className="srv-diagbtns">
            {DIAGS.map(([a, k, Icon]) => (
              <button
                key={a}
                type="button"
                className="btn btn--sm"
                aria-pressed={diag === a}
                onClick={() => setDiag(a)}
              >
                <Icon size={16} aria-hidden="true" />
                {t[k]}
              </button>
            ))}
          </div>
          <div className="row row--between">
            <span className="hint" aria-live="polite">
              {jalan
                ? t.logWait
                : hasil
                  ? t.logAt(sejak(hasil.selesaiPada ?? hasil.dimintaPada, lang, now))
                  : t.neverRun}
            </span>
            {bisa.server && (
              <button
                type="button"
                className="btn btn--sm"
                disabled={jalan}
                onClick={() => void kirim(id, diag, {}, lang, false).then(refresh)}
              >
                {jalan ? (
                  <CircleNotchIcon size={16} className="ctl-spin" aria-hidden="true" />
                ) : (
                  <PlayIcon size={16} aria-hidden="true" />
                )}
                {t.run}
              </button>
            )}
          </div>
          {hasil?.keluaran != null && <pre className="srv-log">{hasil.keluaran}</pre>}
        </section>
      </div>

      {full && (
        <>
          <div className="seplabel">
            <span>{t.full}</span>
          </div>
          <div className="srv-g2">
            <Journal lang={lang} id={id} data={data} refresh={refresh} />
            <NetConf lang={lang} data={data} onCommands={onCommands} />
          </div>
        </>
      )}

      {bisa.full && (
        <section className="panel">
          <div className="panel__head">
            <div className="stack stack--sm">
              <h2 className="panel__title">{t.setupTitle}</h2>
              <span className="hint">{t.setupSub}</span>
            </div>
            <button type="button" className="btn" onClick={() => setSetup(true)}>
              <PlugsConnectedIcon size={18} aria-hidden="true" />
              {s.terdaftar ? t.setupOpen : t.setupContinue}
            </button>
          </div>
          <SetupState lang={lang} id={id} data={data} now={now} />
        </section>
      )}

      {bisa.full && (
        <section className="panel dangerzone">
          <div className="panel__head">
            <div className="stack stack--sm">
              <h2 className="panel__title">{t.danger}</h2>
              <span className="hint">{t.dangerHint}</span>
            </div>
            <button type="button" className="btn btn--danger" onClick={() => setAsk("hapus")}>
              <TrashIcon size={18} aria-hidden="true" />
              {t.delServer}
            </button>
          </div>
        </section>
      )}

      {setup && (
        <Enroll
          lang={lang}
          server={{ id, kode: s.kode, nama: s.nama }}
          onClose={() => {
            setSetup(false);
            refresh();
          }}
        />
      )}

      <Confirm
        open={ask === "hapus"}
        onOpenChange={(o) => !o && setAsk(null)}
        title={t.delAsk(s.nama)}
        body={t.delBody}
        confirmLabel={t.del}
        lang={lang}
        onConfirm={async () => {
          const r = await fetch(`/api/server/${id}`, { method: "DELETE" })
            .then((x) => x.json() as Promise<{ ok: boolean; kode?: string }>)
            .catch(() => ({ ok: false, kode: undefined }));
          if (!r.ok) {
            window.Toast?.show(pesan(t, r.kode), "danger");
            return false;
          }
          window.Toast?.show(t.deleted(s.nama), "ok");
          onDeleted();
        }}
      />
    </div>
  );
}

/** One line on how this server's install stands. */
function SetupState({
  lang,
  id,
  data,
  now,
}: {
  lang: Lang;
  id: number;
  data: Detail;
  now: number;
}) {
  const t = S[lang];
  const s = data.server;
  const pos = posisiPasang(
    data.pasang,
    s.terdaftarPada ?? null,
    data.denyutTerakhir?.pada ?? null,
    bacaPerintah(id)?.dibuat ?? null,
  );
  const [teks, st] = pos.gagal
    ? [t.setupFail, "danger"]
    : pos.langkah === LANGKAH_PASANG
      ? [t.setupDone(sejak(s.terdaftarPada ?? null, lang, now)), "ok"]
      : pos.langkah === 4
        ? [t.setupBeat, "warn"]
        : data.pasang
          ? [t.setupRun(t.wizRows[pos.langkah]), "warn"]
          : s.terdaftar
            ? [t.setupDone(sejak(s.terdaftarPada ?? null, lang, now)), "ok"]
            : [t.setupNone, "warn"];
  return (
    <p className="srv-wait" aria-live="polite">
      <span
        className={`dot dot--${st}${st === "warn" && data.pasang ? " dot--pulse" : ""}`}
        aria-hidden="true"
      />
      <span>{teks}</span>
    </p>
  );
}
