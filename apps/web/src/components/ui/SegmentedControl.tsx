/**
 * A single-select segmented control (P7.1), built on
 * @radix-ui/react-toggle-group's `type="single"` mode. For a small, fixed
 * set of mutually exclusive choices shown side by side rather than in a
 * dropdown -- the login dialog's Praktikan/Asisten switch (P7.3) and the
 * module editor's board switch (P7.4) are the two known call sites.
 *
 * `enforceSelection` keeps the group from ever landing on "nothing
 * selected" (Radix's single-select toggle group allows deselecting the
 * active item by clicking it again, which is wrong for a control standing
 * in for a required choice) -- pass false only for a genuinely optional
 * segmented filter.
 *
 * Usage:
 *   <SegmentedControl
 *     value={role}
 *     onValueChange={setRole}
 *     options={[{value: "praktikan", label: "Praktikan"}, {value: "asisten", label: "Asisten"}]}
 *   />
 */
import * as RadixToggleGroup from "@radix-ui/react-toggle-group";
import "./SegmentedControl.css";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  enforceSelection?: boolean;
  /** Stretch the options to share the full width (the mockup's filled tabs). */
  fill?: boolean;
  "aria-label": string;
}

export default function SegmentedControl({
  value,
  onValueChange,
  options,
  enforceSelection = true,
  fill = false,
  ...rest
}: Props) {
  return (
    <RadixToggleGroup.Root
      className={fill ? "segmented segmented--fill" : "segmented"}
      type="single"
      value={value}
      onValueChange={(next) => {
        if (!next && enforceSelection) return;
        if (next) onValueChange(next);
      }}
      aria-label={rest["aria-label"]}
    >
      {options.map((opt) => (
        <RadixToggleGroup.Item key={opt.value} className="segmented__item" value={opt.value}>
          {opt.label}
        </RadixToggleGroup.Item>
      ))}
    </RadixToggleGroup.Root>
  );
}
