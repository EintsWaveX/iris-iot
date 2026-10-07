/**
 * An icon-only action (Phase 9 kit). Use it only when the icon says it all
 * (close, delete, copy, zoom); otherwise use a .btn with icon and text.
 * It always has an aria-label and a tooltip with the same words.
 *
 * A disabled IconButton stays focusable (aria-disabled, not `disabled`) so
 * its tooltip still shows and can say why; clicks are ignored.
 *
 * Usage:
 *   <IconButton icon={TrashIcon} label={t.delete} kind="danger" onClick={hapus} />
 */
import { forwardRef, type ButtonHTMLAttributes, type ComponentType, type MouseEvent } from "react";
import type { IconProps } from "@phosphor-icons/react";
import Tooltip from "./Tooltip";

/** Other button props pass through, so a popover or menu trigger wrapping
 *  this (Radix asChild) can set aria-expanded, aria-haspopup and data-state. */
interface Props extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "type" | "disabled" | "className" | "children"
> {
  icon: ComponentType<IconProps>;
  label: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  kind?: "ghost" | "danger";
  sm?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  /** Shown in the tooltip instead of the label, e.g. why it is disabled. */
  tip?: string;
  type?: "button" | "submit";
  className?: string;
  tipSide?: "top" | "right" | "bottom" | "left";
}

const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  {
    icon: Icon,
    label,
    onClick,
    kind,
    sm,
    pressed,
    disabled,
    tip,
    type = "button",
    className,
    tipSide,
    ...rest
  },
  ref,
) {
  const cls = ["iconbtn", kind && `iconbtn--${kind}`, sm && "iconbtn--sm", className]
    .filter(Boolean)
    .join(" ");
  return (
    <Tooltip label={tip ?? label} side={tipSide}>
      <button
        {...rest}
        ref={ref}
        type={type}
        className={cls}
        aria-label={label}
        aria-pressed={pressed}
        aria-disabled={disabled || undefined}
        onClick={(e) => {
          if (disabled) {
            e.preventDefault();
            return;
          }
          onClick?.(e);
        }}
      >
        <Icon size={sm ? 18 : 22} aria-hidden="true" />
      </button>
    </Tooltip>
  );
});

export default IconButton;
