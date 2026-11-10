/**
 * The calendar inside DateField's popover. Its own file so the day picker
 * (react-day-picker and its locales and stylesheet, about 90 KB) is fetched
 * when a calendar is first opened or about to be, not with every page that
 * has a date field somewhere in it.
 */
import { DayPicker, type Matcher } from "react-day-picker";
import "react-day-picker/style.css";
import { id as dpId, enGB as dpEnGB, zhCN as dpZhCN } from "react-day-picker/locale";
import type { Lang } from "../../lib/kelas";

// The day picker's own locales: date-fns's plus its screen reader labels
// ("Hari ini, …", "Ke bulan sebelumnya"), which date-fns's alone left English.
const DP_LOCALE = { id: dpId, en: dpEnGB, zh: dpZhCN } as const;

export default function DayPanel({
  date,
  disabled,
  lang,
  onPick,
}: {
  date: Date | undefined;
  disabled: Matcher[];
  lang: Lang;
  onPick: (d: Date) => void;
}) {
  return (
    <DayPicker
      mode="single"
      selected={date}
      defaultMonth={date}
      disabled={disabled}
      onSelect={(d) => {
        if (d) onPick(d);
      }}
      locale={DP_LOCALE[lang]}
      weekStartsOn={1}
      showOutsideDays
    />
  );
}
