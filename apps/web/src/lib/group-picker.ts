/**
 * The one non-trivial bit of logic components/ui/GroupPicker.tsx owns,
 * pulled into its own plain module so it can be unit-tested without a JSX
 * transform (every other test in this project is pure-logic, importing from
 * src/lib -- there is no component-rendering test harness here).
 *
 * Radix's single-select toggle group calls onValueChange("") when its
 * currently-pressed item is clicked again (its own deselect behaviour, same
 * reasoning SegmentedControl's `enforceSelection` guards against).
 * GroupPicker's own `value` is controlled from the parent's state though, so
 * the visual selection never actually moves on that click -- this function
 * is only what decides whether the parent's `onValueChange` fires at all.
 * Returns null for the deselect case, otherwise the group number Radix's
 * string value round-trips to.
 */
export function toGroupValue(next: string): number | null {
  return next ? Number(next) : null;
}
