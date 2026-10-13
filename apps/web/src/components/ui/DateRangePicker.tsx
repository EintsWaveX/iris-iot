/**
 * A date-range filter control (P7.1), replacing the native `mm/dd/yyyy`
 * `<input type="date">` pair Laporan's filter bar uses today (finding F15:
 * a browser-locale date format inside an otherwise Indonesian UI). Built
 * on react-day-picker's range mode plus this package's own Popover, with
 * `id-ID` formatting throughout (dd/mm/yyyy display, Indonesian month/day
 * names) and three quick presets so the common cases never need the
 * calendar at all.
 *
 * Usage:
 *   <DateRangePicker
 *     value={{ from: undefined, to: undefined }}
 *     onChange={setRange}
 *   />
 */
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { id as localeId } from "date-fns/locale";
import { id as dpId } from "react-day-picker/locale";
import { format, startOfDay, subDays } from "date-fns";
import Popover from "./Popover";
import "./DateRangePicker.css";

interface Props {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
}

function formatRange(range: DateRange | undefined): string {
  if (!range?.from) return "Pilih tanggal";
  const from = format(range.from, "dd/MM/yyyy", { locale: localeId });
  if (!range.to || range.to.getTime() === range.from.getTime()) return from;
  const to = format(range.to, "dd/MM/yyyy", { locale: localeId });
  return `${from} – ${to}`;
}

const PRESETS: { label: string; range: () => DateRange }[] = [
  {
    label: "Hari ini",
    range: () => ({ from: startOfDay(new Date()), to: startOfDay(new Date()) }),
  },
  {
    label: "7 hari",
    range: () => ({ from: startOfDay(subDays(new Date(), 6)), to: startOfDay(new Date()) }),
  },
  {
    label: "30 hari",
    range: () => ({ from: startOfDay(subDays(new Date(), 29)), to: startOfDay(new Date()) }),
  },
];

export default function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className="btn btn--ghost daterange__trigger">
          {formatRange(value)}
        </button>
      }
    >
      <div className="daterange__panel">
        <div className="daterange__presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                onChange(p.range());
                setOpen(false);
              }}
            >
              {p.label}
            </button>
          ))}
          {value?.from && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              Bersihkan
            </button>
          )}
        </div>
        <DayPicker
          mode="range"
          selected={value}
          onSelect={onChange}
          locale={dpId}
          weekStartsOn={1}
          showOutsideDays
        />
      </div>
    </Popover>
  );
}
