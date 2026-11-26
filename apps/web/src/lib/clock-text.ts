/**
 * The navigation clock's time text without building an Intl formatter.
 *
 * NavClock used `toLocaleTimeString("en-GB", {...})` every second, which constructs a new Intl.DateTimeFormat
 * each time: 1.2 ms on a 6x slower CPU, forever, plus the same again for the date. Hours, minutes and seconds
 * need no locale at all, so they are written by hand. The test holds this equal to the Intl text for every
 * second of a day.
 */

const two = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** "21:05:09": local time, 24-hour, two digits each. Same text as the en-GB hour12:false format. */
export function clockTime(d: Date): string {
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** "2026-11-19": the local calendar day, the key the long date is cached under */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}
