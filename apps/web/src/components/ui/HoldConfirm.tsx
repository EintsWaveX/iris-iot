/**
 * A restore-to-default button that cannot be hit by accident (2026-11-24, after "Kembalikan Bawaan" wiped a
 * saved interview template with one click): the person holds it first (HoldButton), and only then a confirm
 * dialog asks, naming what is lost. Nothing runs until the dialog's own button is pressed.
 */
import { useState } from "react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import HoldButton from "./HoldButton";
import Confirm from "./Confirm";
import type { Lang } from "../../lib/kelas";

const W = {
  id: {
    title: "Kembalikan ke bawaan?",
    body: (what?: string) =>
      `${what ? `${what}: ` : ""}semua yang sudah kamu ubah akan hilang dan kembali ke isi bawaan. Ini tidak bisa diurungkan.`,
    yes: "Ya, Kembalikan",
    cancel: "Batal",
  },
  en: {
    title: "Restore the default?",
    body: (what?: string) =>
      `${what ? `${what}: ` : ""}everything you changed is lost and the default comes back. This can't be undone.`,
    yes: "Yes, Restore",
    cancel: "Cancel",
  },
  zh: {
    title: "恢复默认？",
    body: (what?: string) =>
      `${what ? `${what}：` : ""}你所做的全部修改都会丢失，并恢复为默认内容。此操作无法撤销。`,
    yes: "确认恢复",
    cancel: "取消",
  },
} as const;

export default function HoldConfirm({
  lang,
  label,
  what,
  onConfirm,
  disabled = false,
  title,
}: {
  lang: Lang;
  /** The button's own words ("Kembalikan Bawaan") */
  label: string;
  /** What is restored, said in the dialog ("Template Wawancara") */
  what?: string;
  /** Runs after the dialog's confirm; return false to keep the dialog open (an error was shown) */
  onConfirm: () => Promise<boolean | void> | boolean | void;
  disabled?: boolean;
  /** Why it is disabled, for a tooltip */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const w = W[lang] ?? W.id;
  return (
    <>
      <HoldButton
        label={label}
        tint="warn"
        size="compact"
        icon={ArrowCounterClockwiseIcon}
        disabled={disabled}
        title={title}
        onDone={() => setOpen(true)}
      />
      <Confirm
        open={open}
        onOpenChange={setOpen}
        title={w.title}
        body={w.body(what)}
        confirmLabel={w.yes}
        cancelLabel={w.cancel}
        lang={lang}
        onConfirm={onConfirm}
      />
    </>
  );
}
