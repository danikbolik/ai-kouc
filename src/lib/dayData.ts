import type {
  Activity,
  DayData,
  PlannedWorkout,
  StravaHrZoneSummary,
  StravaLapSummary,
  WorkoutSession,
} from '../types/training';
import { getPlannedWorkoutTotalDistanceKm } from './workoutExtras';

export function emptyDay(date: string): DayData {
  return { date, activities: [], plannedWorkouts: [] };
}

/** Migrace starého formátu sessions → activities + plannedWorkouts */
export function normalizeDayData(raw: Partial<DayData> & { date: string }): DayData {
  const hasNewFormat =
    Array.isArray(raw.activities) || Array.isArray(raw.plannedWorkouts);

  if (hasNewFormat) {
    return {
      date: raw.date,
      activities: raw.activities ?? [],
      plannedWorkouts: raw.plannedWorkouts ?? [],
      feedback: raw.feedback,
    };
  }

  if (raw.sessions?.length) {
    return migrateSessionsDay(raw.date, raw.sessions, raw.feedback);
  }

  return emptyDay(raw.date);
}

export function normalizeAllDays(
  days: Record<string, Partial<DayData> & { date: string }>,
): Record<string, DayData> {
  const result: Record<string, DayData> = {};
  for (const [date, day] of Object.entries(days)) {
    result[date] = normalizeDayData({ ...day, date: day.date ?? date });
  }
  return result;
}

function isStravaOnlySession(session: WorkoutSession): boolean {
  return (
    session.id.includes('strava') ||
    session.title.toLowerCase().includes('strava') ||
    (!session.planned.distanceKm &&
      !session.planned.targetPace &&
      !session.planned.targetHR &&
      Boolean(session.actual))
  );
}

function sessionToPlannedWorkout(session: WorkoutSession): PlannedWorkout {
  return {
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
  };
}

function sessionActualToActivity(session: WorkoutSession): Activity {
  const actual = session.actual!;
  return {
    id: `activity-${actual.stravaActivityId ?? session.id}`,
    stravaActivityId: actual.stravaActivityId,
    title: session.title,
    type: session.type,
    phase: session.phase,
    distanceKm: actual.distanceKm,
    durationMin: actual.durationMin,
    avgPace: actual.avgPace,
    avgHR: actual.avgHR,
    garminSyncStatus: actual.garminSyncStatus,
    laps: actual.laps,
    hrZones: actual.hrZones,
    elevationGainM: actual.elevationGainM,
    tss: actual.tss,
    gapPace: actual.gapPace,
    terrainType: actual.terrainType,
  };
}

function migrateSessionsDay(
  date: string,
  sessions: WorkoutSession[],
  feedback?: DayData['feedback'],
): DayData {
  const activities: Activity[] = [];
  const plannedWorkouts: PlannedWorkout[] = [];

  for (const session of sessions) {
    if (session.actual) {
      activities.push(sessionActualToActivity(session));
    }
    if (!isStravaOnlySession(session)) {
      plannedWorkouts.push(sessionToPlannedWorkout(session));
    }
  }

  return { date, activities, plannedWorkouts, feedback };
}

export function getPlannedWorkouts(day?: DayData): PlannedWorkout[] {
  if (!day) return [];
  return normalizeDayData(day).plannedWorkouts;
}

export function getActivities(day?: DayData): Activity[] {
  if (!day) return [];
  return normalizeDayData(day).activities;
}

export function dayHasContent(day?: DayData): boolean {
  if (!day) return false;
  const normalized = normalizeDayData(day);
  return normalized.plannedWorkouts.length > 0 || normalized.activities.length > 0;
}

/** Pro LLM / recalculate – sloučí plán + actual do sessions */
export function dayToLegacySessions(day: DayData): WorkoutSession[] {
  const normalized = normalizeDayData(day);
  const sessions: WorkoutSession[] = [];

  for (const planned of normalized.plannedWorkouts) {
    const matchedActivity = normalized.activities.find((a) => a.phase === planned.phase);
    sessions.push({
      id: planned.id,
      phase: planned.phase,
      title: planned.title,
      type: planned.type,
      isLocked: planned.isLocked,
      planned: {
        description: planned.description,
        distanceKm: getPlannedWorkoutTotalDistanceKm(planned),
        targetPace: planned.targetPace,
        targetHR: planned.targetHR,
        bookReference: planned.bookReference,
        notes: planned.notes,
      },
      actual: matchedActivity
        ? {
            distanceKm: matchedActivity.distanceKm,
            durationMin: matchedActivity.durationMin,
            avgPace: matchedActivity.avgPace,
            avgHR: matchedActivity.avgHR,
            garminSyncStatus: matchedActivity.garminSyncStatus,
            stravaActivityId: matchedActivity.stravaActivityId,
            laps: matchedActivity.laps,
            hrZones: matchedActivity.hrZones,
          }
        : undefined,
    });
  }

  for (const activity of normalized.activities) {
    const alreadyLinked = sessions.some(
      (s) => s.actual?.stravaActivityId === activity.stravaActivityId,
    );
    if (alreadyLinked) continue;

    sessions.push({
      id: activity.id,
      phase: activity.phase ?? 'AM',
      title: activity.title,
      type: activity.type,
      isLocked: false,
      planned: {
        description: 'Synchronizováno ze Stravy.',
        notes: activity.notes,
      },
      actual: {
        distanceKm: activity.distanceKm,
        durationMin: activity.durationMin,
        avgPace: activity.avgPace,
        avgHR: activity.avgHR,
        garminSyncStatus: activity.garminSyncStatus,
        stravaActivityId: activity.stravaActivityId,
        laps: activity.laps,
        hrZones: activity.hrZones,
      },
    });
  }

  return sessions;
}

export function legacySessionsToDay(date: string, sessions: WorkoutSession[], feedback?: DayData['feedback']): DayData {
  return migrateSessionsDay(date, sessions, feedback);
}

export function mergeActivitiesForDay(
  day: DayData | undefined,
  incoming: Activity[],
  date: string,
): DayData {
  const base = day ? normalizeDayData(day) : emptyDay(date);
  const byStravaId = new Map<number, Activity>();

  for (const activity of base.activities) {
    if (activity.stravaActivityId) {
      byStravaId.set(activity.stravaActivityId, activity);
    }
  }

  for (const activity of incoming) {
    if (activity.stravaActivityId) {
      byStravaId.set(activity.stravaActivityId, activity);
    } else {
      byStravaId.set(Number(activity.id.replace(/\D/g, '').slice(-9)) || Date.now(), activity);
    }
  }

  return {
    ...base,
    date,
    activities: Array.from(byStravaId.values()).sort((a, b) =>
      (a.phase ?? 'AM').localeCompare(b.phase ?? 'AM'),
    ),
  };
}

export type { StravaLapSummary, StravaHrZoneSummary };
