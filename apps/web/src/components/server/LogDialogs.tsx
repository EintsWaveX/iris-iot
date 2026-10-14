/**
 * The Server page's log dialogs (Phase 9 Stage 5, mockup v-over LogModal):
 * All Commands (filters, paging, retry or cancel, CSV, clear) and Full
 * History (7 days of reboots, offline gaps and service changes, CSV,
 * clear). Clear log sits on the left and asks first, on top of the dialog;
 * Esc closes only that top layer. Plus OutputDialog, which shows one
 * command's output (a service log, a diagnostic) with fetch-again and
 * download.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowClockwiseIcon, CircleNotchIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Confirm from "../ui/Confirm";
import { getJson, localeOf, postJson } from "../../lib/app";
import { useSegar } from "../../lib/siaran";
import { unduhCsv } from "../../lib/csv";
import type { Lang } from "../../lib/kelas";
import type { Perintah } from "../console/types";
import { statusTampil } from "./ops";
import { BERJALAN, kejadianDari, unduhTeks, type Riwayat } from "./data";
import { S, pesan, type SStrings } from "./strings";
import Lalu from "../ui/Lalu";

type Filter = "all" | "selesai" | "gagal" | "kedaluwarsa" | "menunggu";

export function labelPerintah(t: SStrings, p: Perintah): string {
  const a = t.aksi[p.aksi] ?? p.aksi;
  const l = p.argumen?.layanan;
  const m = p.argumen?.modul;
  return `${a}${l ? ` · ${t.svc[l] ?? l}` : ""}${m ? ` · ${t.readyMod(m)}` : ""}`;
}

export function StatusPill({ t, p }: { t: SStrings; p: Perintah }) {
  const st = statusTampil(p);
  const tone =
    st === "selesai"
      ? "pill--ok"
      : st === "gagal"
        ? "pill--danger"
        : BERJALAN(p)
          ? "pill--accent"
          : "";
  return <span className={`pill ${tone}`}>{t.status[st] ?? st}</span>;
}

function waktu(iso: string, lang: Lang) {
  return new Date(iso).toLocaleString(localeOf(lang), { timeZone: "Asia/Jakarta" });
}

export function CommandsDialog({
  lang,
  serverId,
  nama,
  awal,
  bisaHapus,
  bisaKendali,
  siapa,
  onClose,
  refresh,
}: {
  lang: Lang;
  serverId: number;
  nama: string;
  /** The newest page, from the detail poll. */
  awal: Perintah[];
  bisaHapus: boolean;
  bisaKendali: boolean;
  siapa: (nim: string | null) => string;
  onClose: () => void;
  refresh: () => void;
}) {
  const t = S[lang];
  const [f, setF] = useState<Filter>("all");
  const [older, setOlder] = useState<Perintah[]>([]);
  const [lagi, setLagi] = useState(awal.length >= 20);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [kosong, setKosong] = useState(false);

  const rows = useMemo(() => {
    if (kosong) return awal.filter(BERJALAN);
    const seen = new Set(awal.map((p) => p.id));
    return [...awal, ...older.filter((p) => !seen.has(p.id))];
  }, [awal, older, kosong]);
  const shown = rows.filter((p) => {
    if (f === "all") return true;
    if (f === "menunggu") return BERJALAN(p);
    return statusTampil(p) === f;
  });

  async function more() {
    if (!rows.length) return;
    setBusy(true);
    try {
      const sebelum = Math.min(...rows.map((p) => p.id));
      const r = await getJson<{ ok: boolean; perintah: Perintah[]; lagi: boolean }>(
        `/api/server/${serverId}?aksi=perintah&sebelum=${sebelum}`,
      );
      if (r.ok) {
        setOlder((o) => [...o, ...r.perintah]);
        setLagi(r.lagi);
      }
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }

  async function ulang(p: Perintah, tipe: "perintah_ulang" | "perintah_batal") {
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/action", { tipe, id: p.id });
      if (!r.ok) window.Toast?.show(pesan(t, r.kode), "danger");
      else if (tipe === "perintah_ulang") window.Toast?.show(t.cmdRetried, "ok");
      refresh();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  const csv = () => {
    unduhCsv(
      `perintah-${nama}.csv`,
      [t.cCmd, t.cBy, t.cStatus, t.cWhen, "output"],
      shown.map((p) => [
        labelPerintah(t, p),
        siapa(p.dimintaOleh) || "",
        t.status[statusTampil(p)] ?? p.status,
        waktu(p.dimintaPada, lang),
        p.keluaran?.slice(0, 500) ?? "",
      ]),
    );
    window.Toast?.show(t.csvSaved, "ok");
  };

  const filters: [Filter, string][] = [
    ["all", t.fAll],
    ["selesai", t.fDone],
    ["gagal", t.fFail],
    ["kedaluwarsa", t.fExp],
    ["menunggu", t.fWait],
  ];

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.cmdTitle}
      description={t.cmdDesc(nama)}
      size="xl"
      lang={lang}
      alt={
        bisaHapus ? (
          <button type="button" className="btn btn--danger" onClick={() => setAsk(true)}>
            {t.clearLog}
          </button>
        ) : undefined
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.close}
          </button>
          <button type="button" className="btn btn--primary" disabled={!shown.length} onClick={csv}>
            {t.saveCsv}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="seg" role="group" aria-label={t.cStatus}>
          {filters.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={f === v} onClick={() => setF(v)}>
              {l}
            </button>
          ))}
        </div>
        <div className="srv-scroll" style={{ maxHeight: 420 }}>
          <table className="srv-table">
            <thead>
              <tr>
                <th>{t.cCmd}</th>
                <th>{t.cBy}</th>
                <th>{t.cStatus}</th>
                <th>{t.cWhen}</th>
                {bisaKendali && <th aria-label={t.retryCmd} />}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{labelPerintah(t, p)}</b>
                    {p.status === "gagal" && p.keluaran && (
                      <div className="hint mono truncate" style={{ maxWidth: 420 }}>
                        {p.keluaran.split("\n")[0]}
                      </div>
                    )}
                  </td>
                  <td>{siapa(p.dimintaOleh) || "·"}</td>
                  <td>
                    <StatusPill t={t} p={p} />
                  </td>
                  <td className="hint" style={{ whiteSpace: "nowrap" }}>
                    <Lalu iso={p.selesaiPada ?? p.dimintaPada} lang={lang} />
                  </td>
                  {bisaKendali && (
                    <td>
                      {p.status === "menunggu" ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => void ulang(p, "perintah_batal")}
                        >
                          {t.cancelCmd}
                        </button>
                      ) : p.status === "gagal" || p.status === "kedaluwarsa" ? (
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => void ulang(p, "perintah_ulang")}
                        >
                          {t.retryCmd}
                        </button>
                      ) : null}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <p className="hint" style={{ textAlign: "center", padding: 20 }}>
              {t.logEmpty}
            </p>
          )}
        </div>
        {lagi && !kosong && (
          <div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => void more()}
            >
              {busy && <CircleNotchIcon size={15} className="ctl-spin" aria-hidden="true" />}
              {t.more}
            </button>
          </div>
        )}
      </div>
      <Confirm
        open={ask}
        onOpenChange={setAsk}
        title={t.clearAsk}
        body={t.clearBody}
        confirmLabel={t.clear}
        lang={lang}
        onConfirm={async () => {
          const r = await postJson<{ ok: boolean; kode?: string }>("/api/action", {
            tipe: "perintah_hapus",
            serverId,
          }).catch(() => ({ ok: false, kode: undefined }));
          if (!r.ok) {
            window.Toast?.show(pesan(t, r.kode), "danger");
            return false;
          }
          setKosong(true);
          setLagi(false);
          window.Toast?.show(t.cleared, "ok");
          refresh();
        }}
      />
    </Dialog>
  );
}

export function HistoryDialog({
  lang,
  serverId,
  nama,
  bisaHapus,
  onClose,
  refresh,
}: {
  lang: Lang;
  serverId: number;
  nama: string;
  bisaHapus: boolean;
  onClose: () => void;
  refresh: () => void;
}) {
  const t = S[lang];
  const [h, setH] = useState<Riwayat | null>(null);
  const [ask, setAsk] = useState(false);
  const segar = useSegar(["server"]);
  useEffect(() => {
    let alive = true;
    getJson<{ ok: boolean } & Riwayat>(`/api/server/${serverId}?aksi=riwayat&rentang=7d`)
      .then((d) => alive && d.ok && setH(d))
      .catch(() => alive && !segar && window.Toast?.show(t.fail, "danger"));
    return () => {
      alive = false;
    };
  }, [serverId, segar, t.fail]);
  const rows = kejadianDari(h, lang);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.histTitle}
      description={t.histDesc(nama)}
      size="lg"
      lang={lang}
      alt={
        bisaHapus ? (
          <button
            type="button"
            className="btn btn--danger"
            disabled={!rows.length}
            onClick={() => setAsk(true)}
          >
            {t.clearLog}
          </button>
        ) : undefined
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.close}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!rows.length}
            onClick={() => {
              unduhCsv(
                `riwayat-${nama}.csv`,
                [t.cEvent, t.cWhen],
                rows.map((r) => [r.teks, waktu(r.pada, lang)]),
              );
              window.Toast?.show(t.csvSaved, "ok");
            }}
          >
            {t.saveCsv}
          </button>
        </>
      }
    >
      <div className="srv-scroll" style={{ maxHeight: 420 }}>
        {h === null ? (
          <span className="skeleton" style={{ height: 160, display: "block" }} />
        ) : rows.length === 0 ? (
          <p className="hint" style={{ textAlign: "center", padding: 20 }}>
            {t.logEmpty}
          </p>
        ) : (
          <table className="srv-table">
            <thead>
              <tr>
                <th>{t.cEvent}</th>
                <th>{t.cWhen}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <span
                        className={`dot dot--${r.tone === "danger" ? "danger" : r.tone}`}
                        aria-hidden="true"
                      />
                      {r.teks}
                    </span>
                  </td>
                  <td className="hint" style={{ whiteSpace: "nowrap" }}>
                    <Lalu iso={r.pada} lang={lang} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Confirm
        open={ask}
        onOpenChange={setAsk}
        title={t.clearAsk}
        body={t.clearBody}
        confirmLabel={t.clear}
        lang={lang}
        onConfirm={async () => {
          const r = await postJson<{ ok: boolean; kode?: string }>("/api/action", {
            tipe: "riwayat_hapus",
            serverId,
          }).catch(() => ({ ok: false, kode: undefined }));
          if (!r.ok) {
            window.Toast?.show(pesan(t, r.kode), "danger");
            return false;
          }
          setH((x) => (x ? { ...x, reboot: [], gap: [], timelineLayanan: [] } : x));
          window.Toast?.show(t.cleared, "ok");
          refresh();
        }}
      />
    </Dialog>
  );
}

/** One command's output: a service log, a diagnostic. `run` queues it
 *  again; while one is on its way the button spins. */
export function OutputDialog({
  lang,
  title,
  desc,
  hasil,
  jalan,
  run,
  file,
  onClose,
}: {
  lang: Lang;
  title: string;
  desc: string;
  hasil: Perintah | undefined;
  jalan: boolean;
  run?: () => void;
  file: string;
  onClose: () => void;
}) {
  const t = S[lang];
  const teks = hasil?.keluaran ?? "";
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={desc}
      size="lg"
      lang={lang}
      alt={
        run ? (
          <button type="button" className="btn btn--ghost" disabled={jalan} onClick={run}>
            {jalan ? (
              <CircleNotchIcon size={18} className="ctl-spin" aria-hidden="true" />
            ) : (
              <ArrowClockwiseIcon size={18} aria-hidden="true" />
            )}
            {t.refresh}
          </button>
        ) : undefined
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.close}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!teks}
            onClick={() => unduhTeks(file, teks)}
          >
            {t.downloadLog}
          </button>
        </>
      }
    >
      <div className="stack stack--sm">
        <span className="hint" aria-live="polite">
          {jalan ? (
            t.logWait
          ) : hasil ? (
            <Lalu iso={hasil.selesaiPada ?? hasil.dimintaPada} lang={lang} fmt={t.logAt} />
          ) : (
            t.neverRun
          )}
        </span>
        <pre className="srv-log srv-log--tall">{teks || "·"}</pre>
      </div>
    </Dialog>
  );
}
