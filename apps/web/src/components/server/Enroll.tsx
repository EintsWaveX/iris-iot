/**
 * Register a server (Phase 9 Stage 5, mockup v-list "Enroll"): a 3-step
 * dialog. Name it (the name is also its code, lower case and hyphens), run
 * the one line on the Pi, then wait for the first heartbeat. Back is on
 * the left; once the server exists, step 1 only shows its name.
 *
 * The line (2026-10-07) installs everything on a fresh Pi and registers it
 * (public/pasang-pi.sh): no laptop step, and a Pi that already has an
 * iris-agent is asked before it is reinstalled for this server.
 */
import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import { getJson, postJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import type { ServerRow } from "./data";
import { S, pesan } from "./strings";

const KODE_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

export function perintahDaftar(kode: string, token: string): string {
  const situs = location.origin;
  return [
    `curl -fsSL ${situs}/pasang-pi.sh | sudo sh -s -- \\`,
    `  --situs ${situs} \\`,
    `  --kode ${kode} --token ${token}`,
  ].join("\n");
}

export default function Enroll({
  lang,
  onClose,
  onOpen,
}: {
  lang: Lang;
  onClose: () => void;
  onOpen: (id: number) => void;
}) {
  const t = S[lang];
  const [step, setStep] = useState(0);
  const [nama, setNama] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dibuat, setDibuat] = useState<{ id: number; kode: string; token: string } | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (step !== 2 || !dibuat || joined) return;
    const id = setInterval(async () => {
      const d = await getJson<{ ok: boolean; server: ServerRow[] }>("/api/server").catch(
        () => null,
      );
      const s = d?.server.find((x) => x.kode === dibuat.kode);
      if (s?.terdaftar && s.denyutTerakhir) setJoined(true);
    }, 4000);
    return () => clearInterval(id);
  }, [step, dibuat, joined]);

  async function lanjut() {
    if (step === 0 && !dibuat) {
      if (!KODE_RE.test(nama)) return setErr(t.wizNameBad);
      setErr(null);
      setBusy(true);
      try {
        const d = await postJson<{ ok: boolean; id?: number; kode?: string; token?: string }>(
          "/api/server",
          { nama, kode: nama },
        );
        if (!d.ok) return setErr(pesan(t, (d as { kode?: string }).kode));
        setDibuat({ id: d.id ?? 0, kode: d.kode ?? nama, token: d.token ?? "" });
      } catch {
        return setErr(t.fail);
      } finally {
        setBusy(false);
      }
    }
    setStep((s) => Math.min(2, s + 1));
  }

  const cmd = dibuat ? perintahDaftar(dibuat.kode, dibuat.token) : "";
  const label = dibuat?.kode ?? nama;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.wizTitle}
      description={t.wizStep(step + 1, t.wizSteps[step])}
      lang={lang}
      alt={
        step > 0 ? (
          <button type="button" className="btn btn--ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeftIcon size={18} aria-hidden="true" />
            {t.wizBack}
          </button>
        ) : undefined
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
          {step < 2 ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || (step === 0 && !dibuat && !nama)}
              onClick={() => void lanjut()}
            >
              {t.wizNext}
              <ArrowRightIcon size={18} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!joined}
              onClick={() => {
                window.Toast?.show(t.wizDone(label), "ok");
                if (dibuat) onOpen(dibuat.id);
              }}
            >
              <CheckIcon size={18} aria-hidden="true" />
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
              className={`pill ${i < step || (i === 2 && joined) ? "pill--ok" : i === step ? "pill--accent" : ""}`}
            >
              {i + 1}. {s}
            </span>
          ))}
        </div>

        {step === 0 && (
          <div className="field" data-invalid={err ? "yes" : undefined}>
            <label className="field__label" htmlFor="enr-name">
              {t.wizName}
            </label>
            <input
              id="enr-name"
              className="field__input mono"
              value={label}
              disabled={!!dibuat}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="iris-pi-01"
              onChange={(e) => setNama(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              onKeyDown={(e) => {
                // Handled here: the dialog's own Enter must not press Next too.
                if (e.key === "Enter") {
                  e.preventDefault();
                  void lanjut();
                }
              }}
            />
            <p className={err ? "field__error" : "field__hint"}>
              {err ?? (dibuat ? t.wizMade : t.wizNameHint)}
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            <p className="hint">{t.wizCmd}</p>
            <div className="srv-cmd">
              <pre>{cmd}</pre>
              <IconButton
                icon={CopyIcon}
                label={t.wizCopyCmd}
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(cmd)
                    .then(() => window.Toast?.show(t.copied, "ok"))
                }
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={`banner ${joined ? "" : "banner--warn"}`} aria-live="polite">
            {joined ? (
              <CheckCircleIcon size={20} color="var(--ok)" aria-hidden="true" />
            ) : (
              <span className="dot dot--warn dot--pulse" aria-hidden="true" />
            )}
            <span>
              <b>{joined ? t.wizOk(label) : t.wizWait(label)}</b>
            </span>
          </div>
        )}
      </div>
    </Dialog>
  );
}
