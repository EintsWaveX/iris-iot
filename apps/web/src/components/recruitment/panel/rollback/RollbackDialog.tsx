/**
 * The rollback dialog (5 Nov 2026): one flow for every action that deletes
 * more than the thing pressed. It asks the server for a preview (counts only,
 * nothing written), shows what would go, and runs only after the exact word is
 * typed. A refusal the server names (an exam room that ran, a team with other
 * members, an Asisten already made) shows in words and keeps the button off.
 */
import { useEffect, useMemo, useState } from "react";
import Dialog from "../../../ui/Dialog";
import { tri } from "../../../../lib/labels";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import {
  HITUNGAN_KOSONG,
  type Blokir,
  type HitunganRollback,
  type PnUndoPreview,
  type RollbackPreview,
} from "../../../../lib/recruitment/rollback";
import { RB } from "./rollbackStrings";
import "./rollback.css";

/** What the dialog shows from a preview answer, whatever the action. */
export interface Ringkasan {
  baris: { label: string; n: number }[];
  blokir: Blokir[];
  /** Envelopes opened by CaAs: more than zero needs a tick for pn-undo */
  terbuka: number;
}

/** The mapper for cut-unlock-force and candidate-reset. */
export function ringkasCounts(r: RollbackPreview, lang: Lang): Ringkasan {
  const L = RB[lang].lines as Record<keyof HitunganRollback, string>;
  const baris = (Object.keys(HITUNGAN_KOSONG) as (keyof HitunganRollback)[])
    .filter((k) => r.counts[k] > 0)
    .map((k) => ({ label: L[k], n: r.counts[k] }));
  return { baris, blokir: r.blocked, terbuka: 0 };
}

/** The mapper for pn-undo. */
export function ringkasPn(r: PnUndoPreview, lang: Lang): Ringkasan {
  const P = RB[lang].pn;
  const baris = [
    { label: P.promoted, n: r.promoted },
    { label: P.asistenDeleted, n: r.asistenDeleted },
    { label: P.asistenKept, n: r.asistenKept.length },
    { label: P.results, n: r.results },
  ].filter((b) => b.n > 0);
  return { baris, blokir: [], terbuka: r.opened };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Lang;
  /** The API action; it takes `preview: true` and, to run, `confirm` */
  aksi: string;
  /** Sent with both the preview and the run */
  body: Record<string, unknown>;
  title: string;
  intro: string;
  /** The word to type to run it */
  kata: string;
  /** The run button */
  jalankan: string;
  /** Shown after it ran */
  selesai: string;
  /** Turns the server's preview answer into lines; leave out for an action with no preview */
  ringkas?: (r: never, lang: Lang) => Ringkasan;
  /** Offer a tick to go on past opened envelopes (sends force: true) */
  bolehPaksa?: boolean;
  onDone: () => void;
}

type Muat = { s: "load" } | { s: "siap"; r: Ringkasan } | { s: "gagal"; kode: string };

export default function RollbackDialog({
  open,
  onOpenChange,
  lang,
  aksi,
  body,
  title,
  intro,
  kata,
  jalankan,
  selesai,
  ringkas,
  bolehPaksa = false,
  onDone,
}: Props) {
  const t = RB[lang];
  const [muat, setMuat] = useState<Muat>(ringkas ? { s: "load" } : { s: "siap", r: kosong });
  const [ketik, setKetik] = useState("");
  const [paksa, setPaksa] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [salah, setSalah] = useState<string | null>(null);
  const kunciBody = JSON.stringify(body);

  // Every time it opens: ask for the preview afresh, with nothing typed.
  useEffect(() => {
    if (!open) return;
    setKetik("");
    setPaksa(false);
    setSalah(null);
    if (!ringkas) return void setMuat({ s: "siap", r: kosong });
    let batal = false;
    setMuat({ s: "load" });
    void recPost<RollbackPreview | PnUndoPreview>(aksi, { ...body, preview: true }).then((r) => {
      if (batal) return;
      if (isFail(r)) return setMuat({ s: "gagal", kode: r.kode });
      setMuat({ s: "siap", r: ringkas(r as never, lang) });
    });
    return () => {
      batal = true;
    };
    // body is compared by value, so a new object with the same content does not refetch
  }, [open, aksi, kunciBody, lang]);

  const siap = muat.s === "siap" ? muat.r : null;
  const terhalang = !!siap && siap.blokir.length > 0;
  const perluPaksa = !!siap && siap.terbuka > 0 && bolehPaksa;
  const bolehJalan =
    !!siap && !terhalang && ketik.trim() === kata && (!perluPaksa || paksa) && !sibuk;

  const pesanGagal = useMemo(() => {
    if (muat.s !== "gagal") return null;
    if (muat.kode === "tanpa_hak") return t.noRight;
    if (muat.kode === "belum_dikunci" || muat.kode === "belum_dijadikan") return t.already;
    return t.failed;
  }, [muat, t]);

  async function jalan() {
    setSibuk(true);
    setSalah(null);
    try {
      const r = await recPost<{ ok: true }>(aksi, {
        ...body,
        confirm: ketik.trim(),
        ...(perluPaksa && paksa ? { force: true } : {}),
      });
      if (isFail(r)) {
        setSalah(r.kode === "tanpa_hak" ? t.noRight : t.failed);
        return;
      }
      window.Toast?.show(selesai, "ok");
      onOpenChange(false);
      onDone();
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !sibuk && onOpenChange(o)}
      title={title}
      description={intro}
      size="md"
      lang={lang}
      actions={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={sibuk}
            onClick={() => onOpenChange(false)}
          >
            {tri(lang, "Batal", "Cancel", "取消")}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            data-loading={sibuk ? "yes" : undefined}
            disabled={!bolehJalan}
            onClick={() => void jalan()}
          >
            <span className="btn__label">{jalankan}</span>
            <span className="btn__spinner" aria-hidden="true" />
          </button>
        </>
      }
    >
      <div className="stack stack--sm rb">
        {muat.s === "load" && (
          <p className="hint" role="status">
            {t.loading}
          </p>
        )}
        {pesanGagal && (
          <p className="field__error" role="alert">
            {pesanGagal}
          </p>
        )}
        {siap && ringkas && (
          <>
            <b>{t.previewHead}</b>
            {siap.baris.length ? (
              <ul className="rb__list">
                {siap.baris.map((b) => (
                  <li key={b.label}>
                    <span className="num">{b.n}</span> {b.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">{t.nothingElse}</p>
            )}
            {siap.blokir.map((b) => (
              <p key={b.kode} className="field__error" role="alert">
                {t.blocked[b.kode]?.(b.n) ?? b.kode}
              </p>
            ))}
          </>
        )}
        {perluPaksa && (
          <label className="row rb__force">
            <input type="checkbox" checked={paksa} onChange={(e) => setPaksa(e.target.checked)} />
            <span>
              {t.force}
              <small className="hint"> {t.forceHint(siap.terbuka)}</small>
            </span>
          </label>
        )}
        {siap && !terhalang && (
          <label className="field">
            <span className="field__label">{t.typeHead(kata)}</span>
            <input
              className="field__input mono"
              value={ketik}
              placeholder={t.typeLabel}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setKetik(e.target.value)}
              aria-label={t.typeLabel}
            />
          </label>
        )}
        {salah && (
          <p className="field__error" role="alert">
            {salah}
          </p>
        )}
      </div>
    </Dialog>
  );
}

const kosong: Ringkasan = { baris: [], blokir: [], terbuka: 0 };
