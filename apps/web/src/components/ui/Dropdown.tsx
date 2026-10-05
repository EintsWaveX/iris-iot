/**
 * The one dropdown, in three modes (P6.3). Replaces both Select.astro (a
 * native <select>, deliberately chosen back when nothing on the site needed
 * more than that) and every ad hoc native <select> since -- the user asked
 * for a consistently styled dropdown everywhere rather than the platform's
 * own picker UI, which differs by browser and OS and cannot carry this
 * site's own hover/focus language at all.
 *
 * Modes:
 *   "select" (the default, and the only one with a live call site as of
 *             P6.3) -- single choice, replaces a native <select> one for
 *             one, including working inside a plain HTML <form> via a
 *             hidden <input> this component keeps in sync and dispatches
 *             real `change`/`input` events on, so vanilla script that reads
 *             `document.getElementById(id).value` or listens for `change`
 *             on that id (session.astro's own pattern) needs no changes at
 *             all to keep working.
 *   "multi"  -- a checkbox list, for a future view switcher ("Tampilkan:
 *             Kelompok, Bantuan...", P6.6) that shows more than one panel
 *             at once. No live call site yet; built now so P6.6 does not
 *             need to touch this file's internals.
 *   "filter" -- chips plus a menu, for a future filter row (P6.6/P6.7's
 *             group/status filters). Also no live call site yet.
 *
 * All three share one popover engine (usePopover below): a trigger button
 * in normal document flow, a listbox portalled to document.body (or into
 * the open dialog that holds the trigger, see usePopover) so it is
 * never a `position: fixed` DESCENDANT of anything with backdrop-filter --
 * see Nav.astro's own docblock for the exact containing-block trap that
 * would otherwise create, which is why the popover here is portalled OUT
 * to the body rather than living inside whatever scrollable/backdrop
 * ancestor happens to render it -- and positioned with `position: fixed`
 * coordinates computed from the trigger's own getBoundingClientRect(),
 * recomputed on open, scroll and resize. Below 640px the popover instead
 * renders as a bottom sheet, full width, pinned to the viewport's bottom
 * edge.
 *
 * Keyboard contract (WAI-ARIA collapsible listbox pattern): the trigger is
 * a `role="combobox"`; the popup is a `role="listbox"` whose options never
 * receive real DOM focus -- the trigger keeps focus throughout and
 * `aria-activedescendant` tracks the highlighted option, which is simpler
 * to keep correct than roving tabindex and matches how a native <select>'s
 * own popup already behaves from a focus-management point of view.
 *   ArrowDown/ArrowUp  move the highlight (opens the popup first if closed)
 *   Home/End           jump to the first/last option
 *   type a character   jumps to the next option starting with it
 *   Enter/Space        commits the highlighted option and closes
 *   Escape             closes without committing, refocuses the trigger
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import "./Dropdown.css";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** A code chip after the label, like the mockup's "TIR". */
  chip?: string;
  /** A small second line under the label, in the list only. */
  note?: string;
}

const MOBILE_SHEET_MAX_WIDTH = 640;
const TYPEAHEAD_RESET_MS = 700;

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_SHEET_MAX_WIDTH,
  );
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth <= MOBILE_SHEET_MAX_WIDTH);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return mobile;
}

/**
 * Shared popover mechanics: open state, where the popup goes, outside-click
 * dismissal. Every mode below (select/multi/filter) drives the SAME engine
 * so the "where does this thing render and how does it close" behaviour
 * never drifts between the three.
 *
 * Inside a dialog or drawer the popup is portalled into that dialog, not
 * the body: a modal Radix layer turns pointer events off everywhere else
 * and blocks wheel scrolling outside itself, so a list on the body could
 * only be used with the keyboard (2026-10-05, Tambah Pengganti). A dialog
 * that carries a transform becomes the containing block of a fixed child,
 * so the popup is placed by measuring where it actually lands and
 * correcting by the difference. It opens below the trigger, or above when
 * there is more room there, and is never taller than the space it has.
 */
const POPUP_GAP = 6;
const VIEW_MARGIN = 8;
const POPUP_MAX = 360;

function usePopover(triggerRef: React.RefObject<HTMLElement | null>, sheet: boolean) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    const t = triggerRef.current;
    const p = popupRef.current;
    if (!t || !p) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Measuring below lifts the height cap for a moment, which would
    // throw the list back to its top; keep where the reader was.
    const scrolled = p.scrollTop;
    // Where (0, 0) of a fixed child really is: the viewport, or the
    // dialog when a transform makes it the containing block.
    p.style.top = "0px";
    p.style.left = "0px";
    p.style.bottom = "auto";
    p.style.maxHeight = "none";
    const o = p.getBoundingClientRect();
    const ox = o.left;
    const oy = o.top;
    const scrim = scrimRef.current;
    if (scrim) {
      scrim.style.left = `${-ox}px`;
      scrim.style.top = `${-oy}px`;
      scrim.style.width = `${vw}px`;
      scrim.style.height = `${vh}px`;
    }
    if (sheet) {
      const h = Math.min(p.scrollHeight, vh * 0.7);
      p.style.left = `${-ox}px`;
      p.style.width = `${vw}px`;
      p.style.maxHeight = `${vh * 0.7}px`;
      p.style.top = `${vh - h - oy}px`;
      p.scrollTop = scrolled;
      return;
    }
    const r = t.getBoundingClientRect();
    p.style.width = "";
    p.style.minWidth = `${r.width}px`;
    const natural = Math.min(p.scrollHeight, POPUP_MAX, vh * 0.6);
    const below = vh - r.bottom - POPUP_GAP - VIEW_MARGIN;
    const above = r.top - POPUP_GAP - VIEW_MARGIN;
    const up = below < natural && above > below;
    const h = Math.max(120, Math.min(natural, up ? above : below));
    p.style.maxHeight = `${h}px`;
    const top = up ? r.top - POPUP_GAP - Math.min(h, p.scrollHeight) : r.bottom + POPUP_GAP;
    const w = p.getBoundingClientRect().width;
    const left = Math.max(VIEW_MARGIN, Math.min(r.left, vw - VIEW_MARGIN - w));
    p.style.top = `${top - oy}px`;
    p.style.left = `${left - ox}px`;
    p.dataset.side = up ? "top" : "bottom";
    p.scrollTop = scrolled;
  }, [triggerRef, sheet]);

  useLayoutEffect(() => {
    if (!open) return;
    setHost(triggerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? document.body);
  }, [open, triggerRef]);

  useLayoutEffect(() => {
    if (!open || !host) return;
    place();
    const onScrollOrResize = (ev?: Event) => {
      // Scrolling the list itself moves nothing; re-placing it then used
      // to snap it back to the top, so a long list looked stuck.
      if (ev?.type === "scroll" && popupRef.current?.contains(ev.target as Node)) return;
      place();
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    // A drawer still sliding in moves the trigger without a scroll.
    window.addEventListener("animationend", onScrollOrResize, true);
    window.addEventListener("transitionend", onScrollOrResize, true);
    // The options can change while open (a list that loads late).
    const ro = popupRef.current ? new ResizeObserver(() => onScrollOrResize()) : null;
    if (ro && popupRef.current) ro.observe(popupRef.current.firstElementChild ?? popupRef.current);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("animationend", onScrollOrResize, true);
      window.removeEventListener("transitionend", onScrollOrResize, true);
      ro?.disconnect();
    };
  }, [open, host, place]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(ev: PointerEvent) {
      const target = ev.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, triggerRef]);

  return { open, setOpen, host: open ? host : null, popupRef, scrimRef };
}

function typeaheadIndex(options: DropdownOption[], from: number, buffer: string): number | null {
  if (!buffer) return null;
  const lower = buffer.toLowerCase();
  const n = options.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (!options[i].disabled && options[i].label.toLowerCase().startsWith(lower)) return i;
  }
  return null;
}

// -----------------------------------------------------------------------
// mode="select" (single choice) -- the live one.
// -----------------------------------------------------------------------
interface SelectProps {
  id: string;
  name?: string;
  label: string;
  hideLabel?: boolean;
  options: DropdownOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}

export default function Dropdown({
  id,
  name,
  label,
  hideLabel = false,
  options,
  value,
  defaultValue,
  onChange,
  required = false,
  hint,
  disabled = false,
}: SelectProps) {
  const [internal, setInternal] = useState(() => value ?? defaultValue ?? options[0]?.value ?? "");
  const selectedValue = value !== undefined ? value : internal;
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === selectedValue),
  );

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const hiddenRef = useRef<HTMLInputElement | null>(null);
  const isMobile = useIsMobile();
  const { open, setOpen, host, popupRef, scrimRef } = usePopover(triggerRef, isMobile);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const typeaheadBuffer = useRef("");
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();

  const commit = useCallback(
    (index: number) => {
      const opt = options[index];
      if (!opt || opt.disabled) return;
      if (value === undefined) setInternal(opt.value);
      onChange?.(opt.value);
      const hidden = hiddenRef.current;
      if (hidden && hidden.value !== opt.value) {
        hidden.value = opt.value;
        hidden.dispatchEvent(new Event("input", { bubbles: true }));
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (hidden) {
        // Value unchanged from the hidden input's own point of view (e.g.
        // re-selecting the current option) -- vanilla listeners keyed on
        // "change" only fire on a real change, matching a native <select>.
      }
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange, options, setOpen, value],
  );

  function openAt(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  function onTriggerKeyDown(ev: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    switch (ev.key) {
      case "ArrowDown":
      case "ArrowUp":
        ev.preventDefault();
        if (!open) {
          openAt(selectedIndex);
        } else {
          moveActive(ev.key === "ArrowDown" ? 1 : -1);
        }
        return;
      case "Home":
        if (open) {
          ev.preventDefault();
          setActiveIndex(firstEnabled());
        }
        return;
      case "End":
        if (open) {
          ev.preventDefault();
          setActiveIndex(lastEnabled());
        }
        return;
      case "Enter":
      case " ":
        ev.preventDefault();
        if (open) commit(activeIndex);
        else openAt(selectedIndex);
        return;
      case "Escape":
        if (open) {
          ev.preventDefault();
          setOpen(false);
        }
        return;
      case "Tab":
        setOpen(false);
        return;
      default:
        if (ev.key.length === 1 && /\S/.test(ev.key)) {
          if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
          typeaheadBuffer.current += ev.key;
          typeaheadTimer.current = setTimeout(() => {
            typeaheadBuffer.current = "";
          }, TYPEAHEAD_RESET_MS);
          const from = open ? activeIndex : selectedIndex;
          const found = typeaheadIndex(options, from - 1, typeaheadBuffer.current);
          if (found !== null) {
            if (open) setActiveIndex(found);
            else commit(found);
          }
        }
    }
  }

  function firstEnabled(): number {
    const i = options.findIndex((o) => !o.disabled);
    return i === -1 ? 0 : i;
  }
  function lastEnabled(): number {
    for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) return i;
    return options.length - 1;
  }
  function moveActive(delta: 1 | -1) {
    setActiveIndex((prev) => {
      const n = options.length;
      let next = prev;
      for (let step = 0; step < n; step++) {
        next = (next + delta + n) % n;
        if (!options[next].disabled) return next;
      }
      return prev;
    });
  }

  const selectedLabel = options[selectedIndex]?.label ?? "";
  const selectedChip = options[selectedIndex]?.chip;

  return (
    <div className="dropdown">
      <span
        className={hideLabel ? "dropdown__label visually-hidden" : "dropdown__label"}
        id={`${id}-label`}
      >
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        id={`${id}-trigger`}
        className="dropdown__trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${id}-label ${id}-trigger`}
        aria-activedescendant={open ? `${id}-opt-${activeIndex}` : undefined}
        disabled={disabled}
        data-open={open ? "yes" : "no"}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="dropdown__value">{selectedLabel}</span>
        {selectedChip && <span className="acode dropdown__chip">{selectedChip}</span>}
        <svg className="dropdown__chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <input
        ref={hiddenRef}
        type="hidden"
        id={id}
        name={name ?? id}
        defaultValue={selectedValue}
        required={required}
      />
      {hint && (
        <p className="dropdown__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {open &&
        host &&
        createPortal(
          <>
            {isMobile && (
              <div
                ref={scrimRef}
                className="dropdown__scrim"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />
            )}
            <div ref={popupRef} className="dropdown__popup" data-sheet={isMobile ? "yes" : "no"}>
              <ul
                className="dropdown__list"
                role="listbox"
                id={listId}
                aria-labelledby={`${id}-label`}
              >
                {options.map((opt, i) => (
                  <li
                    key={opt.value}
                    id={`${id}-opt-${i}`}
                    role="option"
                    aria-selected={i === selectedIndex}
                    aria-disabled={opt.disabled}
                    data-active={i === activeIndex ? "yes" : "no"}
                    className="dropdown__option"
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => commit(i)}
                  >
                    <span className="dropdown__txt">
                      {opt.label}
                      {opt.note && <small className="dropdown__note">{opt.note}</small>}
                    </span>
                    {opt.chip && <span className="acode dropdown__chip">{opt.chip}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </>,
          host,
        )}
    </div>
  );
}

// -----------------------------------------------------------------------
// mode="multi" (checkbox list) -- built for P6.6's view switcher, no live
// call site yet. Shares the same trigger/popup shape as the select mode
// above; the difference is purely which options can be true at once and
// what the trigger's own label summarises.
// -----------------------------------------------------------------------
interface MultiProps {
  id: string;
  label: string;
  options: DropdownOption[];
  values: string[];
  onChange: (values: string[]) => void;
  summary?: (selected: DropdownOption[]) => string;
}

export function DropdownMulti({ id, label, options, values, onChange, summary }: MultiProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const isMobile = useIsMobile();
  const { open, setOpen, host, popupRef, scrimRef } = usePopover(triggerRef, isMobile);
  const listId = useId();

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  const selected = options.filter((o) => values.includes(o.value));
  const triggerLabel = summary
    ? summary(selected)
    : selected.length === 0
      ? label
      : selected.map((o) => o.label).join(", ");

  return (
    <div className="dropdown">
      <button
        ref={triggerRef}
        type="button"
        className="dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        data-open={open ? "yes" : "no"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="dropdown__value">{triggerLabel}</span>
        <svg className="dropdown__chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open &&
        host &&
        createPortal(
          <>
            {isMobile && (
              <div
                ref={scrimRef}
                className="dropdown__scrim"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />
            )}
            <div ref={popupRef} className="dropdown__popup" data-sheet={isMobile ? "yes" : "no"}>
              <ul
                className="dropdown__list"
                role="listbox"
                id={listId}
                aria-multiselectable="true"
                aria-label={label}
              >
                {options.map((opt) => (
                  <li
                    key={opt.value}
                    id={`${id}-opt-${opt.value}`}
                    role="option"
                    aria-selected={values.includes(opt.value)}
                    aria-disabled={opt.disabled}
                    className="dropdown__option dropdown__option--checkbox"
                    onClick={() => !opt.disabled && toggle(opt.value)}
                  >
                    <span className="dropdown__checkbox" aria-hidden="true" />
                    {opt.label}
                  </li>
                ))}
              </ul>
            </div>
          </>,
          host,
        )}
    </div>
  );
}

// -----------------------------------------------------------------------
// mode="filter" (chips + menu) -- built for a future group/status filter
// row (P6.6/P6.7), no live call site yet. A thin presentation layer over
// the same multi-select behaviour: chips replace the comma-joined summary,
// and each chip removes itself without opening the menu.
// -----------------------------------------------------------------------
interface FilterProps {
  id: string;
  label: string;
  options: DropdownOption[];
  values: string[];
  onChange: (values: string[]) => void;
}

export function DropdownFilter({ id, label, options, values, onChange }: FilterProps) {
  const selected = useMemo(
    () => options.filter((o) => values.includes(o.value)),
    [options, values],
  );

  return (
    <div className="dropdown-filter">
      <DropdownMulti
        id={id}
        label={label}
        options={options}
        values={values}
        onChange={onChange}
        summary={() => label}
      />
      {selected.length > 0 && (
        <ul className="dropdown-filter__chips">
          {selected.map((opt) => (
            <li key={opt.value} className="dropdown-filter__chip">
              {opt.label}
              <button
                type="button"
                className="dropdown-filter__chip-remove"
                aria-label={`Hapus filter ${opt.label}`}
                onClick={() => onChange(values.filter((v) => v !== opt.value))}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
