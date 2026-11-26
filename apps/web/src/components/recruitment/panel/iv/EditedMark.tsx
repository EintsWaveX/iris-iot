/** A small pencil next to an examiner's code when their sheet was changed after it was sent; the tooltip says when. */
import { PencilSimpleIcon } from "@phosphor-icons/react";
import Tooltip from "../../../ui/Tooltip";
import type { Lang } from "../../../../lib/kelas";
import { ED, fmtEdit } from "./editedStrings";

export default function EditedMark({
  at,
  n,
  lang,
}: {
  at: string | null | undefined;
  n: number | undefined;
  lang: Lang;
}) {
  if (!at) return null;
  const label = ED[lang].mark(fmtEdit(at, lang), n ?? 1);
  return (
    <Tooltip label={label}>
      <span className="r4ed" role="img" aria-label={label}>
        <PencilSimpleIcon size={12} weight="bold" aria-hidden="true" />
      </span>
    </Tooltip>
  );
}
