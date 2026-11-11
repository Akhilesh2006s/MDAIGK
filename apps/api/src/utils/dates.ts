/** YYYY-MM-DD for `date` in the given IANA timezone (the school's local day boundary). */
export function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Offset (ms) of timeZone from UTC at the given instant. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant of the next local midnight in `timeZone` after `date` (daily game reset). */
export function nextLocalMidnight(date: Date, timeZone: string): Date {
  const [y, m, d] = localDateKey(date, timeZone).split('-').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
  return new Date(utcGuess - tzOffsetMs(new Date(utcGuess), timeZone));
}

/** Shift a YYYY-MM-DD key by n days. */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Build a Mongo date-range filter from optional ISO strings. */
export function dateRange(from?: string, to?: string) {
  const range: { $gte?: Date; $lte?: Date } = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return Object.keys(range).length ? range : undefined;
}
