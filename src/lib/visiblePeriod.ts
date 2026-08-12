import {
  getMonthGridDays,
  getTwoWeekDays,
  getWeekDays,
  parseDate,
} from './dates';
import { buildTrainingLogForPeriod } from './weeklySummary';
import type { DayData } from '../types/training';

type CalendarView = 'month' | '2weeks' | 'week';

export function getVisibleDates(anchorDate: string, view: CalendarView): string[] {
  const viewDate = parseDate(anchorDate);
  switch (view) {
    case 'week':
      return getWeekDays(viewDate);
    case '2weeks':
      return getTwoWeekDays(viewDate);
    default:
      return getMonthGridDays(viewDate);
  }
}

export function buildVisiblePeriodContext(
  days: Record<string, DayData>,
  anchorDate: string,
  view: CalendarView,
) {
  const visibleDates = getVisibleDates(anchorDate, view);
  const trainingLog = buildTrainingLogForPeriod(days, visibleDates);
  const visiblePeriod = {
    from: visibleDates[0],
    to: visibleDates[visibleDates.length - 1],
  };

  return { trainingLog, visiblePeriod, visibleDates };
}
