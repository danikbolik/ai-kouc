import type { CalendarAction, WorkoutPlanItem } from '../types/api';
import type { DayData, PlannedWorkout, RaceDetails, WarmCoolSegment, WorkoutInterval } from '../types/training';
import { emptyDay, mergeActivitiesForDay, normalizeDayData } from './dayData';

function stripNull<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value;
}

type IntervalInput = {
  repetitions: number;
  segmentValue: number;
  segmentUnit: WorkoutInterval['segmentUnit'];
  targetPace?: string | null;
  targetZone?: WorkoutInterval['targetZone'] | null;
  recoveryValue?: number | null;
  recoveryUnit?: WorkoutInterval['recoveryUnit'] | null;
};

type PlannedWorkoutInput = {
  id: string;
  phase: PlannedWorkout['phase'];
  title: string;
  type: PlannedWorkout['type'];
  isLocked?: boolean;
  distanceKm?: number | null;
  targetPace?: string | null;
  targetHR?: number | null;
  description?: string | null;
  intervals?: IntervalInput[] | null;
  warmUp?: { value: number; unit: WarmCoolSegment['unit'] } | null;
  coolDown?: { value: number; unit: WarmCoolSegment['unit'] } | null;
  raceDetails?: {
    durationMin?: number | null;
    distanceValue?: number | null;
    distanceUnit?: 'km' | 'm' | null;
    raceType?: RaceDetails['raceType'] | null;
  } | null;
  bookReference?:
    | {
        bookTitle?: string | null;
        chapterOrPage?: string | null;
        quote?: string | null;
      }
    | null;
};

function normalizeWarmCool(segment?: WarmCoolSegment | null): WarmCoolSegment | undefined {
  if (!segment?.value || segment.value <= 0) return undefined;
  return { value: segment.value, unit: segment.unit };
}

function normalizeRaceDetails(
  details?: PlannedWorkoutInput['raceDetails'],
): RaceDetails | undefined {
  if (!details) return undefined;
  const durationMin = stripNull(details.durationMin);
  const distanceValue = stripNull(details.distanceValue);
  const hasData =
    (durationMin !== undefined && durationMin > 0) ||
    (distanceValue !== undefined && distanceValue > 0) ||
    Boolean(details.raceType);
  if (!hasData) return undefined;
  return {
    durationMin,
    distanceValue,
    distanceUnit: stripNull(details.distanceUnit),
    raceType: stripNull(details.raceType),
  };
}

export function normalizePlannedWorkout(workout: PlannedWorkoutInput): PlannedWorkout {
  const bookRef = workout.bookReference;
  const hasBookRef =
    bookRef &&
    (bookRef.bookTitle?.trim() || bookRef.chapterOrPage?.trim() || bookRef.quote?.trim());

  return {
    id: workout.id,
    phase: workout.phase,
    title: workout.title,
    type: workout.type,
    isLocked: workout.isLocked ?? false,
    distanceKm: stripNull(workout.distanceKm),
    targetPace: stripNull(workout.targetPace),
    targetHR: stripNull(workout.targetHR),
    description: workout.description ?? '',
    intervals: workout.intervals
      ? workout.intervals.map((interval) => ({
          repetitions: interval.repetitions,
          segmentValue: interval.segmentValue,
          segmentUnit: interval.segmentUnit,
          targetPace: stripNull(interval.targetPace),
          targetZone: stripNull(interval.targetZone),
          recoveryValue: stripNull(interval.recoveryValue),
          recoveryUnit: stripNull(interval.recoveryUnit),
        }))
      : undefined,
    warmUp: normalizeWarmCool(workout.warmUp),
    coolDown: normalizeWarmCool(workout.coolDown),
    raceDetails: normalizeRaceDetails(workout.raceDetails),
    bookReference: hasBookRef
      ? {
          bookTitle: bookRef.bookTitle ?? '',
          chapterOrPage: bookRef.chapterOrPage ?? '',
          quote: bookRef.quote ?? '',
        }
      : undefined,
  };
}

export function workoutPlanItemToPlannedWorkout(item: WorkoutPlanItem): PlannedWorkout {
  return normalizePlannedWorkout({
    id: item.id ?? `${item.date}-${item.phase.toLowerCase()}-${item.title.toLowerCase().replace(/\s+/g, '-')}`,
    phase: item.phase,
    title: item.title,
    type: item.type,
    isLocked: item.isLocked ?? false,
    distanceKm: item.distanceKm,
    targetPace: item.targetPace,
    targetHR: item.targetHR,
    description: item.description ?? '',
    intervals: item.intervals,
    warmUp: item.warmUp,
    coolDown: item.coolDown,
    raceDetails: item.raceDetails,
    bookReference: item.bookReference,
  });
}

export function planItemsToCalendarActions(items: WorkoutPlanItem[]): CalendarAction[] {
  return items.map((item) => ({
    type: 'upsert_planned_workout' as const,
    date: item.date,
    workout: workoutPlanItemToPlannedWorkout(item),
  }));
}

export function applyCalendarActionsToDays(
  days: Record<string, DayData>,
  actions: CalendarAction[],
): Record<string, DayData> {
  if (actions.length === 0) return days;

  const updated: Record<string, DayData> = { ...days };

  for (const action of actions) {
    if (action.type === 'create_workout_plan') {
      const nested = planItemsToCalendarActions(action.workouts);
      Object.assign(updated, applyCalendarActionsToDays(updated, nested));
      continue;
    }

    if (action.type === 'delete_planned_workout' || action.type === 'delete_session') {
      const workoutId = action.type === 'delete_planned_workout' ? action.workoutId : action.sessionId;
      const day = updated[action.date];
      if (!day) continue;

      const normalized = normalizeDayData(day);
      const plannedWorkouts = normalized.plannedWorkouts.filter((w) => w.id !== workoutId);
      const nextDay = { ...normalized, plannedWorkouts };

      if (plannedWorkouts.length === 0 && normalized.activities.length === 0) {
        delete updated[action.date];
      } else {
        updated[action.date] = nextDay;
      }
      continue;
    }

    if (action.type === 'upsert_planned_workout') {
      const workout = normalizePlannedWorkout(action.workout);
      const day = normalizeDayData(updated[action.date] ?? emptyDay(action.date));
      const index = day.plannedWorkouts.findIndex((w) => w.id === workout.id);
      const plannedWorkouts =
        index >= 0
          ? day.plannedWorkouts.map((w, i) => (i === index ? workout : w))
          : [...day.plannedWorkouts, workout];

      updated[action.date] = { ...day, date: action.date, plannedWorkouts };
      continue;
    }

    if (action.type === 'upsert_session') {
      const session = action.session;
      const workout = normalizePlannedWorkout({
        id: session.id,
        phase: session.phase,
        title: session.title,
        type: session.type,
        isLocked: session.isLocked ?? false,
        distanceKm: session.planned.distanceKm,
        targetPace: session.planned.targetPace,
        targetHR: session.planned.targetHR,
        description: session.planned.description ?? '',
        bookReference: session.planned.bookReference,
      });

      Object.assign(
        updated,
        applyCalendarActionsToDays(updated, [
          { type: 'upsert_planned_workout', date: action.date, workout },
        ]),
      );
    }
  }

  return updated;
}

export function createEmptyPlannedWorkout(
  date: string,
  phase: PlannedWorkout['phase'] = 'AM',
): PlannedWorkout {
  return {
    id: `${date}-${phase.toLowerCase()}-${Date.now()}`,
    phase,
    title: 'Nový trénink',
    type: 'klus',
    isLocked: false,
    description: '',
    distanceKm: 10,
    targetPace: '5:30',
  };
}

/** @deprecated alias */
export function createEmptySession(date: string, phase: PlannedWorkout['phase'] = 'AM') {
  const workout = createEmptyPlannedWorkout(date, phase);
  return {
    id: workout.id,
    phase: workout.phase,
    title: workout.title,
    type: workout.type,
    isLocked: workout.isLocked,
    planned: {
      description: workout.description,
      distanceKm: workout.distanceKm,
      targetPace: workout.targetPace,
      targetHR: workout.targetHR,
    },
  };
}

export { mergeActivitiesForDay, normalizeDayData };
