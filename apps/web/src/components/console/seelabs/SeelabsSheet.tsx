/**
 * "Salin untuk SeeLabs" (Phase 9 Stage 3g, mockup c-seelabs): one group's
 * scores in SeeLabs' field order, with the steps to put them in.
 *
 * - SeelabsBody: the banners (borrowed account, Input Jaga, no KLP, changed
 *   since saved), the SeeLabs steps, the table, and the two copies: plain
 *   text (TSV) and the IRIS-SEELABS/1 payload for the bookmarklet. Each copy
 *   is logged; nothing is sent to SeeLabs, which has no API.
 * - SeelabsSheet: the body in a dialog, with "Sudah Disimpan di SeeLabs".
 *
 * The scores come from the same GET as the status, so what is copied is
 * exactly what the status fingerprint describes.
 */
import { type ReactNode } from "react";
import {
  CheckCircleIcon,
  CopyIcon,
  CursorClickIcon,
  QuestionIcon,
  UserSwitchIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import { kelompokLabel } from "../../../lib/labels";
import type { Lang } from "../../../lib/kelas";
import {
  SEELABS_KOLOM,
  SEELABS_PRAKTIKUM,
  buatPayload,
  teksSeelabs,
  type StatusSeelabs,
} from "../../../lib/seelabs";
import { kirimSeelabs, salinTeks, type KelompokSeelabs, type SeelabsData } from "./data";
import { pesanSl, type SeelabsStrings } from "./strings";
import "./seelabs.css";
import Nil from "../../ui/Nil";

const TONE: Record<StatusSeelabs, string> = {
  terkirim: "ok",
  berubah: "warn",
  siap: "accent",
  butuh_akun: "warn",
  kosong: "",
};

export function StatusPill({ t, status }: { t: SeelabsStrings; status: StatusSeelabs }) {
  return (
    <span className={`pill${TONE[status] ? ` pill--${TONE[status]}` : ""}`}>
      {t.status[status]}
    </span>
  );
}

export interface BodyProps {
  t: SeelabsStrings;
  lang: Lang;
  data: SeelabsData;
  g: KelompokSeelabs;
  /** Display name with code, "Desta Saputra (DES)". */
  nama: (nim: string | null) => string;
  /** The three-letter code alone, for short sentences. */
  kode: (nim: string | null) => string;
  /** The main action, at the end of the action row. */
  main?: ReactNode;
  /** True when the main action sits elsewhere (the dialog footer). */
  mainElsewhere?: boolean;
  onCopied?: () => void;
}

export function SeelabsBody({
  t,
  lang,
  data,
  g,
  nama,
  kode,
  main,
  mainElsewhere,
  onCopied,
}: BodyProps) {
  const label = kelompokLabel(g.nomor, lang);
  const klp = g.klp.join(", ");
  const kelas = data.sesi.kelas;
  const bisa = !!g.akun && g.status !== "kosong";

  async function copy(teks: string, ok: string) {
    if (!(await salinTeks(teks))) {
      window.Toast?.show(t.copyFail, "danger");
      return;
    }
    window.Toast?.show(ok, "ok");
    try {
      const r = await kirimSeelabs({ aksi: "salin", sesiId: data.sesi.id, kelompok: g.nomor });
      if (!r.ok) window.Toast?.show(pesanSl(t, r.kode), "warn");
    } catch {
      /* the copy itself worked; the log is best effort */
    }
    onCopied?.();
  }

  return (
    <div className="stack seebody">
      {g.pinjam && g.akun && (
        <div className="banner banner--warn">
          <UserSwitchIcon size={20} aria-hidden="true" />
          <span>{t.lenderBanner(label, nama(g.akun), kode(g.akun))}</span>
        </div>
      )}
      {g.pinjam && g.akun && data.sesi.slot && g.klp.length > 0 && (
        <div className="banner banner--warn">
          <WarningIcon size={20} aria-hidden="true" />
          <span>{t.jagaBanner(kode(g.akun), data.sesi.slot, klp)}</span>
        </div>
      )}
      {g.klp.length === 0 && (
        <div className="banner banner--warn">
          <WarningIcon size={20} aria-hidden="true" />
          <span>{t.klpMissing}</span>
        </div>
      )}
      {g.status in t.statusHint && g.status !== "kosong" && (
        <div className="banner banner--warn">
          <WarningIcon size={20} aria-hidden="true" />
          <span>{t.statusHint[g.status]}</span>
        </div>
      )}
      <ol className="seesteps">
        <li>{t.steps[0]}</li>
        <li>{t.steps[1](SEELABS_PRAKTIKUM[kelas])}</li>
        <li>{t.steps[2](klp || t.stepKlpUnknown)}</li>
        <li>{t.steps[3](data.sesi.modul)}</li>
      </ol>
      <div className="seetable__wrap">
        <table className="seetable">
          <thead>
            <tr>
              <th scope="col">{t.nim}</th>
              <th scope="col">{t.name}</th>
              {SEELABS_KOLOM.map((c) => (
                <th scope="col" key={c} className="num mono">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.baris.map((b) => (
              <tr key={b.nim}>
                <td className="mono">{b.nim}</td>
                <td>{b.nama}</td>
                {SEELABS_KOLOM.map((c) => (
                  <td key={c} className="num" data-empty={b.skor[c] == null ? "yes" : undefined}>
                    {b.skor[c] ?? <Nil dot />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="hint">{t.orderHint}</span>
      <div className="seeact">
        <button
          type="button"
          className="btn"
          disabled={!bisa}
          onClick={() => void copy(teksSeelabs(g.baris), t.copiedText)}
        >
          <CopyIcon size={18} aria-hidden="true" />
          {t.copyText}
        </button>
        <button
          type="button"
          className={`btn ${main || mainElsewhere ? "btn--inverse" : "btn--primary"}`}
          disabled={!bisa}
          onClick={() =>
            void copy(
              buatPayload({
                kelas,
                klp: g.klp,
                modul: data.sesi.modul,
                kelompok: g.nomor,
                bahasa: lang,
                baris: g.baris,
              }),
              t.copiedBm,
            )
          }
        >
          <CursorClickIcon size={18} aria-hidden="true" />
          {t.copyBm}
        </button>
        {main}
      </div>
    </div>
  );
}

/** Marks a group saved in SeeLabs (or takes it back). True on success. */
export async function tandaiSimpan(
  t: SeelabsStrings,
  sesiId: number,
  nomor: number,
  simpan: boolean,
): Promise<boolean> {
  try {
    const r = await kirimSeelabs({ aksi: simpan ? "simpan" : "belum", sesiId, kelompok: nomor });
    if (!r.ok) {
      window.Toast?.show(pesanSl(t, r.kode), "danger");
      return false;
    }
    return true;
  } catch {
    window.Toast?.show(t.codeFallback, "danger");
    return false;
  }
}

export function SavedButton({
  t,
  lang,
  sesiId,
  g,
  onDone,
}: {
  t: SeelabsStrings;
  lang: Lang;
  sesiId: number;
  g: KelompokSeelabs;
  onDone: () => void;
}) {
  const label = kelompokLabel(g.nomor, lang);
  if (g.status === "terkirim")
    return (
      <button
        type="button"
        className="btn btn--ghost"
        onClick={async () => {
          if (await tandaiSimpan(t, sesiId, g.nomor, false)) {
            window.Toast?.show(t.unmarked(label), "ok");
            onDone();
          }
        }}
      >
        {t.unmark}
      </button>
    );
  return (
    <button
      type="button"
      className="btn btn--primary"
      disabled={!g.akun || g.status === "kosong"}
      onClick={async () => {
        if (await tandaiSimpan(t, sesiId, g.nomor, true)) {
          window.Toast?.show(t.markedSaved(label), "ok");
          onDone();
        }
      }}
    >
      <CheckCircleIcon size={18} aria-hidden="true" />
      {t.saved}
    </button>
  );
}

export default function SeelabsSheet({
  open,
  onOpenChange,
  onHow,
  onChanged,
  ...body
}: Omit<BodyProps, "main"> & {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** "Cara Kerjanya": opens the SeeLabs page. */
  onHow?: () => void;
  onChanged: () => void;
}) {
  const { t, lang, g, data } = body;
  const label = kelompokLabel(g.nomor, lang);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={g.klp.length ? t.sheetTitle(label, g.klp.join(", ")) : t.sheetTitleNoKlp(label)}
      size="lg"
      lang={lang}
      foot="12"
      actions={
        <>
          {g.status === "terkirim" ? (
            <SavedButton t={t} lang={lang} sesiId={data.sesi.id} g={g} onDone={onChanged} />
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!g.akun || g.status === "kosong"}
              onClick={async () => {
                if (await tandaiSimpan(t, data.sesi.id, g.nomor, true)) {
                  window.Toast?.show(t.markedSaved(label), "ok");
                  onChanged();
                  onOpenChange(false);
                }
              }}
            >
              <CheckCircleIcon size={18} aria-hidden="true" />
              {t.saved}
            </button>
          )}
          {onHow && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                onOpenChange(false);
                onHow();
              }}
            >
              <QuestionIcon size={18} aria-hidden="true" />
              {t.howItWorks}
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.close}
          </button>
        </>
      }
    >
      <SeelabsBody {...body} mainElsewhere onCopied={onChanged} />
    </Dialog>
  );
}
