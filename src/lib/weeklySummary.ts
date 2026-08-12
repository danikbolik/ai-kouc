import { getWeekdayShort } from './dates';
import { getActivities, getPlannedWorkouts, normalizeDayData } from './dayData';
import type { Activity, DayData, PlannedWorkout } from '../types/training';

export interface DayKmBreakdown {
  date: string;
  weekdayShort: string;
  plannedKm: number;
  actualKm: number;
  durationMin: number;
  hasTraining: boolean;
  isRestDay: boolean;
  sessionTitles: string[];
}

export interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  plannedKm: number;
  actualKm: number;
  totalDurationMin: number;
  trainingDays: number;
  restDays: number;
  completionPercent: number;
  days: DayKmBreakdown[];
}

const REST_TYPES = new Set(['rest', 'mobility']);

function isRestPlanned(workout: PlannedWorkout): boolean {
  return REST_TYPES.has(workout.type);
}

function activityDurationMin(activity: Activity): number {
  if (activity.durationMin && activity.durationMin > 0) return activity.durationMin;
  if (!activity.distanceKm || activity.distanceKm <= 0) return 0;
  const match = activity.avgPace.match(/(\d+):(\d+)/);
  if (!match) return Math.round(activity.distanceKm * 6);
  const paceMin = Number(match[1]) + Number(match[2]) / 60;
  return Math.round(activity.distanceKm * paceMin);
}

function plannedDurationMin(workout: PlannedWorkout): number {
  if (!workout.distanceKm || workout.distanceKm <= 0) return 0;
  const pace = workout.targetPace;
  if (!pace) return Math.round(workout.distanceKm * 6);
  const match = pace.match(/(\d+):(\d+)/);
  if (!match) return Math.round(workout.distanceKm * 6);
  const paceMin = Number(match[1]) + Number(match[2]) / 60;
  return Math.round(workout.distanceKm * paceMin);
}

function analyzeDay(date: string, dayData?: DayData): DayKmBreakdown {
  const normalized = dayData ? normalizeDayData(dayData) : undefined;
  const plannedWorkouts = normalized ? getPlannedWorkouts(normalized) : [];
  const activities = normalized ? getActivities(normalized) : [];
  const weekdayShort = getWeekdayShort(date);

  const plannedKm = plannedWorkouts
    .filter((w) => !isRestPlanned(w))
    .reduce((sum, w) => sum + (w.distanceKm ?? 0), 0);
  const actualKm = activities.reduce((sum, a) => sum + a.distanceKm, 0);
  const durationMin =
    activities.reduce((sum, a) => sum + activityDurationMin(a), 0) ||
    plannedWorkouts.reduce((sum, w) => sum + plannedDurationMin(w), 0);

  const hasPlanned = plannedWorkouts.some((w) => !isRestPlanned(w) && (w.distanceKm ?? 0) > 0);
  const hasActual = activities.length > 0;
  const allRest =
    plannedWorkouts.length > 0 && plannedWorkouts.every(isRestPlanned) && !hasActual;

  const sessionTitles = [
    ...plannedWorkouts.map((w) => w.title),
    ...activities.map((a) => a.title),
  ];

  if (plannedWorkouts.length === 0 && activities.length === 0) {
    return {
      date,
      weekdayShort,
      plannedKm: 0,
      actualKm: 0,
      durationMin: 0,
      hasTraining: false,
      isRestDay: true,
      sessionTitles: [],
    };
  }

  return {
    date,
    weekdayShort,
    plannedKm: Math.round(plannedKm * 10) / 10,
    actualKm: Math.round(actualKm * 10) / 10,
    durationMin,
    hasTraining: hasPlanned || hasActual,
    isRestDay: allRest,
    sessionTitles,
  };
}

export function formatDurationHhMm(totalMin: number): string {
  if (totalMin <= 0) return '0:00';
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}:${String(mins).padStart(2, '0')}`;
}

export function computeWeekSummary(
  weekDates: string[],
  days: Record<string, DayData>,
): WeekSummary {
  const dayBreakdowns = weekDates.map((date) => analyzeDay(date, days[date]));

  const plannedKm = dayBreakdowns.reduce((sum, d) => sum + d.plannedKm, 0);
  const actualKm = dayBreakdowns.reduce((sum, d) => sum + d.actualKm, 0);
  const totalDurationMin = dayBreakdowns.reduce((sum, d) => sum + d.durationMin, 0);
  const trainingDays = dayBreakdowns.filter((d) => d.hasTraining).length;
  const restDays = dayBreakdowns.filter((d) => d.isRestDay || !d.hasTraining).length;

  const completionPercent =
    plannedKm > 0 ? Math.min(100, Math.round((actualKm / plannedKm) * 100)) : actualKm > 0 ? 100 : 0;

  const weekStart = weekDates[0];
  const weekEnd = weekDates[weekDates.length - 1];
  const startLabel = new Date(`${weekStart}T12:00:00`).getDate();
  const endLabel = new Date(`${weekEnd}T12:00:00`).getDate();

  return {
    weekStart,
    weekEnd,
    weekLabel: `${startLabel}.–${endLabel}.`,
    plannedKm: Math.round(plannedKm * 10) / 10,
    actualKm: Math.round(actualKm * 10) / 10,
    totalDurationMin,
    trainingDays,
    restDays,
    completionPercent,
    days: dayBreakdowns,
  };
}

export function chunkDatesIntoWeeks(dates: string[]): string[][] {
  const weeks: string[][] = [];
  for (let i = 0; i < dates.length; i += 7) {
    weeks.push(dates.slice(i, i + 7));
  }
  return weeks;
}

export function buildTrainingLogForPeriod(
  days: Record<string, DayData>,
  periodDates: string[],
): DayData[] {
  const uniqueDates = [...new Set(periodDates)].sort();
  return uniqueDates.map((date) =>
    days[date] ? normalizeDayData(days[date]) : emptyDay(date),
  );
}

function emptyDay(date: string): DayData {
  return { date, activities: [], plannedWorkouts: [] };
}
