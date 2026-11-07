/**
 * What the candidate sees of their violations (9 Nov 2026): a warning they must acknowledge (their
 * own rising level, or a message a pengawas sent) and a small chip with their points in the part.
 * The numbers come from the server (TestView.violation and .warnings); nothing here counts. The
 * wording says what was recorded and what the rule is, and that the committee decides any cut.
 */
import { WarningIcon } from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import type { Lang } from "../../../lib/kelas";
import type { PendingWarning, SeatViolationView } from "../../../lib/recruitment/seat-types";
import { TS } from "./testStrings";

export function ViolationWarning({
  lang,
  warning,
  rule,
  onAck,
}: {
  lang: Lang;
  warning: PendingWarning | null;
  rule: SeatViolationView["rule"] | undefined;
  onAck: (id: number) => void;
}) {
  const t = TS[lang].viol;
  const staff = warning?.source === "staff";
  const level = Math.min(3, Math.max(1, warning?.level ?? 1));
  const part = warning?.part ? TS[lang].part[warning.part].l : "";
  return (
    <Dialog
      open={!!warning}
      onOpenChange={() => undefined}
      required
      title={staff ? t.staffTitle : t.titles[level - 1]}
      description={
        warning
          ? staff
            ? warning.text
            : t.body(level, warning.points, warning.cut, part, rule ?? null)
          : ""
      }
      size="sm"
      lang={lang}
      actions={
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => warning && onAck(warning.id)}
        >
          {t.ok}
        </button>
      }
    >
      <div className="r3vio__icon" data-level={staff ? 1 : level} aria-hidden="true">
        <WarningIcon size={30} weight="fill" />
      </div>
    </Dialog>
  );
}

/** Points so far in the part being worked; hidden at zero */
export function ViolationChip({ lang, v }: { lang: Lang; v: SeatViolationView | null }) {
  if (!v || v.points <= 0) return null;
  return (
    <span className="r3vio__chip" data-level={v.level} role="status">
      <WarningIcon size={16} weight="fill" aria-hidden="true" />
      {TS[lang].viol.chip(v.points)}
    </span>
  );
}
