/**
 * Changing a group's assistant while a session runs (Phase 9 Stage 3,
 * mockup c-run "Ganti asisten"): pick the new assistant, write the reason,
 * see the exact line Reports will show. The server checks the `pair` right
 * and logs the change in `sesi_kejadian` (api/_lib/berjalan.ts).
 *
 * `usePasangan` reads those logged changes for the inspector's pairing
 * history and for each group's first pairing.
 */
import { useCallback, useEffect, useState } from "react";
import { UserSwitchIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import { getJson, postJson } from "../../lib/app";
import { namaAsisten } from "../../lib/people";
import type { Lang } from "../../lib/kelas";
import { pesan, type Strings } from "./strings";
import type { AsistenRef } from "./types";
import { useSiaran } from "../../lib/siaran";

const ALASAN_MIN = 5;

export interface Pasangan {
  kelompokId: number;
  nomor: number | null;
  dari: string | null;
  ke: string | null;
  awal: string | null;
  alasan: string | null;
  aktorNim: string;
  pada: string;
}

/** The session's pairing changes, oldest first, and a reload. */
export function usePasangan(sesiId: number | null) {
  const [list, setList] = useState<Pasangan[]>([]);
  const load = useCallback(() => {
    if (!sesiId) return;
    void getJson<{
      ok: boolean;
      kejadian: {
        jenis: string;
        detail: Omit<Pasangan, "aktorNim" | "pada">;
        aktorNim: string;
        pada: string;
      }[];
    }>(`/api/session/kejadian?sesiId=${sesiId}`)
      .then((d) =>
        setList(
          d.ok
            ? d.kejadian
                .filter((k) => k.jenis === "pasangan")
                .map((k) => ({ ...k.detail, aktorNim: k.aktorNim, pada: k.pada }))
            : [],
        ),
      )
      .catch(() => {});
  }, [sesiId]);
  useEffect(load, [load]);
  useSiaran(["sesi"], load);
  return { list, reload: load };
}

export default function ChangeAssistant({
  t,
  lang,
  open,
  onOpenChange,
  sesiId,
  kelompokId,
  nomor,
  cur,
  awal,
  meNim,
  asisten,
  pick = null,
  onDone,
}: {
  t: Strings;
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sesiId: number;
  kelompokId: number;
  nomor: number;
  /** The group's assistant now. */
  cur: string | null;
  /** The group's first pairing this session. */
  awal: string | null;
  meNim: string;
  asisten: Map<string, AsistenRef>;
  /** Preselects someone (the pairing list's pick). */
  pick?: string | null;
  onDone: () => void;
}) {
  const options = [...asisten.values()]
    .filter((a) => a.nim !== cur)
    .sort((a, b) => a.kode.localeCompare(b.kode));
  const first =
    options.find((a) => a.nim === pick)?.nim ??
    options.find((a) => a.nim === meNim)?.nim ??
    options[0]?.nim ??
    "";
  const [to, setTo] = useState(first);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTo(first);
    setWhy("");
  }, [open, pick]);

  const nama = (nim: string | null) => (nim ? namaAsisten(asisten.get(nim), nim) : "?");
  const ok = why.trim().length >= ALASAN_MIN && !!to;

  async function go() {
    if (!ok) return;
    setBusy(true);
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/assignment", {
      sesiId,
      kelompokId,
      asistenNim: to,
      alasan: "ubah",
      catatan: why.trim(),
    }).catch(() => ({ ok: false, kode: undefined }) as { ok: boolean; kode?: string });
    setBusy(false);
    if (!r.ok) return window.Toast?.show(pesan(t, r.kode), "danger");
    window.Toast?.show(t.chgDone, "ok");
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.chgTitle(nomor)}
      description={t.chgNow(nama(cur))}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !ok}
            onClick={() => void go()}
          >
            <UserSwitchIcon size={18} aria-hidden="true" />
            {t.chg}
          </button>
        </>
      }
    >
      <div className="stack">
        <Dropdown
          id={`chg-${kelompokId}`}
          label={t.chgNew}
          value={to}
          onChange={setTo}
          options={options.map((a) => ({ value: a.nim, label: namaAsisten(a) }))}
        />
        <label className="field">
          <span className="field__label">{t.chgWhy}</span>
          <textarea
            className="field__input field__textarea"
            rows={3}
            maxLength={300}
            placeholder={t.chgWhyPh}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
        </label>
        <div className="auditline">
          <span className="field__label">{t.chgLogAs}</span>
          <p>{t.chgLine(nama(to), nomor, nama(awal ?? cur))}</p>
        </div>
        <span className="hint">{t.chgOnly}</span>
      </div>
    </Dialog>
  );
}
