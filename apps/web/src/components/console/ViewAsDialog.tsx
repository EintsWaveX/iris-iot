/**
 * Lihat Sebagai Praktikan (Phase 9, mockup c-run): pick a group, see
 * whether it is mine (full control: ports, captures and answers, logged
 * under my name and shown to the group as "diisi asisten") or someone
 * else's (view only), then open the module page as that group.
 */
import { useState } from "react";
import { CheckCircleIcon, EyeIcon, WarningIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import { href, namaKelompok } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import type { Strings } from "./strings";
import type { AsistenRef, GroupRow } from "./types";

export default function ViewAsDialog({
  t,
  lang,
  modul,
  groups,
  pemilik,
  asisten,
  meNim,
  initial,
  onClose,
}: {
  t: Strings;
  lang: Lang;
  modul: number;
  groups: GroupRow[];
  pemilik: Record<string, string>;
  asisten: Map<string, AsistenRef>;
  meNim: string;
  initial: number;
  onClose: () => void;
}) {
  const [id, setId] = useState(initial);
  const g = groups.find((x) => x.id === id) ?? groups[0];
  // A session whose live roster is empty (a susulan started before its
  // roster was filled) has no group to view as. The button used to do
  // nothing then; it says why and still offers the module page.
  if (!g)
    return (
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t.viewAs}
        description={t.viewAsDesc}
        size="sm"
        lang={lang}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {t.cancel}
            </button>
            <a className="btn btn--primary" href={href(lang, `/modules/${modul}`)}>
              {t.viewAsModule}
            </a>
          </>
        }
      >
        <div className="banner banner--warn">
          <WarningIcon size={20} aria-hidden="true" />
          <span>{t.viewAsEmpty}</span>
        </div>
      </Dialog>
    );
  const mine = pemilik[g.id] === meNim;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.viewAs}
      description={t.viewAsDesc}
      size="sm"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <a className="btn btn--primary" href={href(lang, `/modules/${modul}?lihat=${g.nomor}`)}>
            {t.open}
          </a>
        </>
      }
    >
      <div className="stack">
        <Dropdown
          id="viewas-group"
          label={t.viewAsGroup}
          value={String(g.id)}
          onChange={(v) => setId(Number(v))}
          options={groups.map((x) => ({
            value: String(x.id),
            label: `${t.group(x.nomor)} · ${namaKelompok(x.nomor, x.nama)}${
              pemilik[x.id] && asisten.get(pemilik[x.id])?.kode
                ? ` (${asisten.get(pemilik[x.id])!.kode!.toUpperCase()})`
                : ""
            }`,
          }))}
        />
        {mine ? (
          <div className="banner banner--ok">
            <CheckCircleIcon size={20} aria-hidden="true" />
            <span>{t.viewAsOwn}</span>
          </div>
        ) : (
          <div className="banner banner--lock">
            <EyeIcon size={20} aria-hidden="true" />
            <span>{t.viewAsOther}</span>
          </div>
        )}
      </div>
    </Dialog>
  );
}
