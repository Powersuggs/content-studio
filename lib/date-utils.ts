/**
 * Format a Date (an instant) as a "YYYY-MM-DD" calendar date in a given
 * IANA timezone. Deliberately NOT `date.toISOString().slice(0, 10)`,
 * which always reads UTC calendar parts regardless of the timezone you
 * actually care about -- that silently shifts posts near midnight onto
 * the wrong day.
 *
 * The 'en-CA' locale happens to format dates as YYYY-MM-DD, which we
 * use as a convenient way to get Intl to hand back parts in that shape;
 * the locale choice has nothing to do with the actual timezone applied.
 */
export function toLocalDateString(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}
