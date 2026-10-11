/**
 * The one group picker (P7.1) -- a row of chips, one per practicum group,
 * each carrying that group's own hue (`--group-1..5`) as a left accent
 * bar, exactly one selected at a time. Replaces four independent,
 * byte-for-byte copies of the same `*__picker-btn` pattern that had
 * accumulated across the live views (finding F11).
 *
 * Built on @radix-ui/react-toggle-group (single-select), the same
 * mechanism as SegmentedControl, but keeps its own chip shape and
 * per-item colour rather than SegmentedControl's single bordered track --
 * a group is an identity, not a settings toggle, and reads better as
 * independent chips than as segments of one control.
 *
 * Usage:
 *   <GroupPicker
 *     value={selectedGroup}
 *     onValueChange={setSelectedGroup}
 *     groups={[1, 2, 3, 4, 5, 6]}
 *   />
 */
import * as RadixToggleGroup from "@radix-ui/react-toggle-group";
import { toGroupValue } from "../../lib/group-picker";
import "./GroupPicker.css";

interface Props {
  value: number;
  onValueChange: (group: number) => void;
  groups: number[];
  "aria-label"?: string;
  /** The word before the number ("Kelompok" / "Group"). */
  label?: string;
  /** Phase 8: the viewer's own group gets a small star and this label. */
  mark?: number;
  markLabel?: string;
  /** Bigger chips that share the row equally (the Live room). */
  size?: "lg";
}

export default function GroupPicker({
  value,
  onValueChange,
  groups,
  label = "Kelompok",
  mark,
  markLabel,
  size,
  ...rest
}: Props) {
  return (
    <RadixToggleGroup.Root
      className={size === "lg" ? "group-picker group-picker--lg" : "group-picker"}
      type="single"
      value={String(value)}
      onValueChange={(next) => {
        const group = toGroupValue(next);
        if (group !== null) onValueChange(group);
      }}
      aria-label={rest["aria-label"] ?? "Pilih kelompok"}
    >
      {groups.map((g) => (
        <RadixToggleGroup.Item
          key={g}
          className="group-picker__item"
          value={String(g)}
          style={{ "--tile-hue": `var(--group-${g})` } as React.CSSProperties}
        >
          {label} {g}
          {mark === g && (
            <span className="group-picker__mark" aria-label={markLabel}>
              ★
            </span>
          )}
        </RadixToggleGroup.Item>
      ))}
    </RadixToggleGroup.Root>
  );
}
