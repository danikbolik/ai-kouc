const CZECH_MONTHS = [
  'LEDEN',
  'ÚNOR',
  'BŘEZEN',
  'DUBEN',
  'KVĚTEN',
  'ČERVEN',
  'ČERVENEC',
  'SRPEN',
  'ZÁŘÍ',
  'ŘÍJEN',
  'LISTOPAD',
  'PROSINEC',
] as const;

const CZECH_WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'] as const;

const TRAINING_PHASES: Record<number, string> = {
  0: 'Zimní báze',
  1: 'Zimní báze',
  2: 'Přípravný blok',
  3: 'Přípravný blok',
  4: 'Objemový blok',
  5: 'Objemový blok',
  6: 'Prahový blok',
  7: 'Prahový blok',
  8: 'Závodní taper',
  9: 'Regenerace',
  10: 'Zimní báze',
  11: 'Zimní báze',
};

export function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Vrátí dnešní datum ve formátu YYYY-MM-DD (lokální čas) */
export function getTodayDate(): string {
  return formatDateKey(new Date());
}

export function addDaysToDate(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonthsToDate(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function getWeekdayShort(dateStr: string): string {
  const date = parseDate(dateStr);
  const day = date.getDay();
  return CZECH_WEEKDAYS[day === 0 ? 6 : day - 1];
}

export function getDayNumber(dateStr: string): number {
  return parseDate(dateStr).getDate();
}

export function getPeriodLabel(viewDate: Date): string {
  const month = CZECH_MONTHS[viewDate.getMonth()];
  const year = viewDate.getFullYear();
  const phase = TRAINING_PHASES[viewDate.getMonth()];
  return `${month} ${year} – ${phase}`;
}

export function getMonthGridDays(viewDate: Date): string[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1, 12);
  const lastOfMonth = new Date(year, month + 1, 0, 12);

  const startOffset = firstOfMonth.getDay() === 0 ? 6 : firstOfMonth.getDay() - 1;
  const gridStart = addDaysToDate(firstOfMonth, -startOffset);

  const days: string[] = [];
  let current = gridStart;

  while (days.length < 42) {
    days.push(formatDateKey(current));
    current = addDaysToDate(current, 1);
    if (days.length >= 28 && current > lastOfMonth && current.getDay() === 1) break;
  }

  return days;
}

export function getWeekDays(viewDate: Date): string[] {
  const date = new Date(viewDate);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDaysToDate(date, mondayOffset);

  return Array.from({ length: 7 }, (_, i) => formatDateKey(addDaysToDate(monday, i)));
}

export function getTwoWeekDays(viewDate: Date): string[] {
  const weekStart = parseDate(getWeekDays(viewDate)[0]);
  return Array.from({ length: 14 }, (_, i) => formatDateKey(addDaysToDate(weekStart, i)));
}

export function isSameMonth(dateStr: string, viewDate: Date): boolean {
  const date = parseDate(dateStr);
  return (
    date.getMonth() === viewDate.getMonth() && date.getFullYear() === viewDate.getFullYear()
  );
}

export { CZECH_WEEKDAYS };
