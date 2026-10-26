/**
 * Register a server (Phase 9 Stage 5, reworked 2026-10-08): a 2-step
 * dialog. Install: name it (the name is also its code, lower case and
 * hyphens) and get the one line to paste on the PC once. Activate: the
 * line reports every step back (public/pasang-pc.sh, pasang_kabar), so
 * the install, the agent's activation and its first heartbeat show here
 * live and nobody reads the PC's terminal.
 *
 * Closing it never loses anything: the install goes on, and the same
 * dialog opens again from the server's Settings tab (with `server`), with
 * the command this tab made still shown while it is valid.
 */
import { useEffect, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  CaretLeftIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  CopyIcon,
  TerminalWindowIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import { getJson, postJson } from "../../lib/app";
import { usePoll } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { LANGKAH_PASANG, posisiPasang } from "../../lib/server-shared";
import type { Detail } from "./data";
import { S, pesan } from "./strings";
import Lalu from "../ui/Lalu";

const KODE_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const UMUR_TOKEN_MS = 30 * 60 * 1000;

export interface ServerAda {
  id: number;
  kode: string;
  nama: string;
}

interface Perintah {
  kode: string;
  token: string;
  /** When this tab made it (ms). */
  dibuat: number;
}

export function perintahDaftar(kode: string, token: string): string {
  const situs = location.origin;
  return [
    `curl -fsSL ${situs}/pasang-pc.sh | sudo sh -s -- \\`,
    `  --situs ${situs} \\`,
    `  --kode ${kode} --token ${token}`,
  ].join("\n");
}

// The command lives in this tab only while its token can still work, so
// the dialog opened again from Settings shows the same line.
const kunciSimpan = (id: number) => `iris-pasang-${id}`;

function simpanPerintah(id: number, p: Perintah): void {
  try {
    sessionStorage.setItem(kunciSimpan(id), JSON.stringify(p));
  } catch {
    /* private mode: the dialog still works while it stays open */
  }
}

export function bacaPerintah(id: number): Perintah | null {
  try {
    const raw = sessionStorage.getItem(kunciSimpan(id));
    const p = raw ? (JSON.parse(raw) as Perintah) : null;
    if (p && typeof p.token === "string" && Date.now() - p.dibuat < UMUR_TOKEN_MS) return p;
    sessionStorage.removeItem(kunciSimpan(id));
  } catch {
    /* nothing saved */
  }
  return null;
}

export default function Enroll({
  lang,
  onClose,
  onOpen,
  server,
}: {
  lang: Lang;
  onClose: () => void;
  /** After Done: open the server (from the list). */
  onOpen?: (id: number) => void;
  /** An existing server (Settings, or the detail's waiting banner). */
  server?: ServerAda;
}) {
  const t = S[lang];
  const [step, setStep] = useState(0);
  const [nama, setNama] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ada, setAda] = useState<ServerAda | null>(server ?? null);
  const [cmd, setCmd] = useState<Perintah | null>(() => (server ? bacaPerintah(server.id) : null));

  const poll = usePoll(
    async () => {
      const d = await getJson<{ ok: boolean } & Detail>(`/api/server/${ada?.id}`);
      if (!d.ok) throw new Error("gone");
      return d as Detail;
    },
    60_000,
    !!ada,
    ["server"],
    0,
    ada?.id,
  );
  const d = poll.data;
  const pos = d
    ? posisiPasang(
        d.pasang,
        d.server.terdaftarPada ?? null,
        d.denyutTerakhir?.pada ?? null,
        cmd?.dibuat ?? null,
      )
    : null;
  const selesai = pos?.langkah === LANGKAH_PASANG;
  // The PC is in the middle of an install with the current token.
  const sedang = !!d?.pasang && !pos?.gagal && !selesai && (pos?.langkah ?? 0) >= 1;

  // Opened again while the PC is at work (or done): straight to Activate.
  const lompat = useRef(!!server);
  useEffect(() => {
    if (!lompat.current || !pos) return;
    lompat.current = false;
    if (d?.pasang || (cmd && pos.langkah > 0)) setStep(1);
  }, [pos, d?.pasang, cmd]);

  async function buatPerintah() {
    setErr(null);
    if (!ada && !KODE_RE.test(nama)) return setErr(t.wizNameBad);
    setBusy(true);
    try {
      const r = ada
        ? await postJson<{ ok: boolean; kode?: string; token?: string }>(
            `/api/server/${ada.id}`,
            {},
          )
        : await postJson<{ ok: boolean; id?: number; kode?: string; token?: string }>(
            "/api/server",
            { nama, kode: nama },
          );
      if (!r.ok || !r.token) return setErr(pesan(t, r.kode));
      const srv = ada ?? { id: (r as { id?: number }).id ?? 0, kode: r.kode ?? nama, nama };
      const p = { kode: srv.kode, token: r.token, dibuat: Date.now() };
      simpanPerintah(srv.id, p);
      setAda(srv);
      setCmd(p);
      poll.refresh();
    } catch {
      setErr(t.fail);
    } finally {
      setBusy(false);
    }
  }

  const label = ada?.nama ?? nama;
  const baris = cmd ? perintahDaftar(cmd.kode, cmd.token) : "";

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={server ? t.wizTitleAgain : t.wizTitle}
      description={t.wizStep(step + 1, t.wizSteps[step])}
      lang={lang}
      alt={
        step > 0 ? (
          <button type="button" className="btn btn--ghost" onClick={() => setStep(0)}>
            <CaretLeftIcon size={16} weight="bold" className="btn__back" aria-hidden="true" />
            {t.wizBack}
          </button>
        ) : undefined
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {ada ? t.wizClose : t.cancel}
          </button>
          {step === 0 && !cmd && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || (!ada && !nama)}
              onClick={() => void buatPerintah()}
            >
              {busy ? (
                <CircleNotchIcon size={18} className="ctl-spin" aria-hidden="true" />
              ) : (
                <TerminalWindowIcon size={18} aria-hidden="true" />
              )}
              {t.wizMake}
            </button>
          )}
          {step === 0 && cmd && (
            <button type="button" className="btn btn--primary" onClick={() => setStep(1)}>
              {t.wizNext}
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!selesai}
              onClick={() => {
                window.Toast?.show(t.wizDone(label), "ok");
                if (ada && onOpen) onOpen(ada.id);
                else onClose();
              }}
            >
              {t.wizFinish}
            </button>
          )}
        </>
      }
    >
      <div className="stack stack--lg">
        <div className="srv-steps" aria-hidden="true">
          {t.wizSteps.map((s, i) => (
            <span
              key={s}
              className={`pill ${i < step || (i === 1 && selesai) ? "pill--ok" : i === step ? "pill--accent" : ""}`}
            >
              {i + 1}. {s}
            </span>
          ))}
        </div>

        {step === 0 && (
          <>
            <div className="field" data-invalid={err ? "yes" : undefined}>
              <label className="field__label" htmlFor="enr-name">
                {t.wizName}
              </label>
              <input
                id="enr-name"
                className="field__input mono"
                value={ada?.kode ?? nama}
                disabled={!!ada}
                autoFocus={!ada}
                autoComplete="off"
                spellCheck={false}
                placeholder="iris-pc-01"
                onChange={(e) => setNama(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                onKeyDown={(e) => {
                  // Handled here: the dialog's own Enter must not press a button too.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!cmd) void buatPerintah();
                  }
                }}
              />
              <p className={err ? "field__error" : "field__hint"}>
                {err ?? (ada ? (server ? t.wizExisting : t.wizMade) : t.wizNameHint)}
              </p>
            </div>

            {sedang && (
              <div className="banner banner--warn">
                <WarningIcon size={20} aria-hidden="true" />
                <span>{t.wizBusyWarn}</span>
              </div>
            )}

            {cmd ? (
              <div className="stack">
                <p className="hint">{t.wizCmd}</p>
                <div className="srv-cmd">
                  <pre>{baris}</pre>
                  <IconButton
                    icon={CopyIcon}
                    label={t.wizCopyCmd}
                    onClick={() =>
                      void navigator.clipboard
                        ?.writeText(baris)
                        .then(() => window.Toast?.show(t.copied, "ok"))
                    }
                  />
                </div>
                <div className="row row--between">
                  <span className="hint">
                    {
                      <Lalu
                        iso={new Date(cmd.dibuat).toISOString()}
                        lang={lang}
                        fmt={t.wizCmdAge}
                      />
                    }
                  </span>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    disabled={busy}
                    onClick={() => void buatPerintah()}
                  >
                    <ArrowClockwiseIcon size={16} weight="bold" aria-hidden="true" />
                    {t.wizRemake}
                  </button>
                </div>
              </div>
            ) : (
              ada && <p className="hint">{t.wizNeedCmd}</p>
            )}
          </>
        )}

        {step === 1 && (
          <div className="stack">
            <ol className="srv-prog" aria-live="polite">
              {t.wizRows.map((row, i) => {
                const lewat = !!pos?.lewati && (i === 1 || i === 2);
                const st = !pos
                  ? "tunggu"
                  : lewat
                    ? "lewat"
                    : i < pos.langkah
                      ? "ok"
                      : i === pos.langkah
                        ? pos.gagal
                          ? "gagal"
                          : "jalan"
                        : "tunggu";
                return (
                  <li key={row} className="srv-prog__i" data-st={st}>
                    {st === "ok" ? (
                      <CheckCircleIcon size={20} weight="fill" aria-hidden="true" />
                    ) : st === "gagal" ? (
                      <XCircleIcon size={20} weight="fill" aria-hidden="true" />
                    ) : st === "jalan" ? (
                      <CircleNotchIcon size={20} className="ctl-spin" aria-hidden="true" />
                    ) : (
                      <span className="srv-prog__dot" aria-hidden="true" />
                    )}
                    <span className="srv-prog__t">
                      <b>{row}</b>
                      {lewat && <small>{t.wizSkipped}</small>}
                      {st === "jalan" && i === 2 && <small>{t.wizSlow}</small>}
                    </span>
                  </li>
                );
              })}
            </ol>

            {pos?.gagal ? (
              <div className="banner banner--danger srv-progban">
                <XCircleIcon size={20} aria-hidden="true" />
                <span>
                  <b>{t.wizFailed}</b> {pos.gagal}
                  <br />
                  {t.wizFailedHint}
                </span>
              </div>
            ) : selesai ? (
              <div className="banner srv-progban">
                <CheckCircleIcon size={20} color="var(--ok)" aria-hidden="true" />
                <span>
                  <b>{t.wizOk(label)}</b>
                </span>
              </div>
            ) : (
              <p className="hint">
                {pos?.langkah === 4 ? (
                  t.wizWait(label)
                ) : pos && pos.langkah > 0 && d?.pasang ? (
                  <Lalu iso={d.pasang.pada} lang={lang} fmt={t.wizLast} />
                ) : (
                  t.wizWaitPc
                )}
              </p>
            )}
            {!selesai && <p className="hint">{t.wizLater}</p>}
          </div>
        )}
      </div>
    </Dialog>
  );
}
