import { addDaysToDate, formatDateKey, parseDate } from './dates';
import { dayToLegacySessions, legacySessionsToDay, normalizeDayData } from './dayData';
import type { RecalculateRequest, RecalculateResponse } from '../types/api';
import type { ActivityType, DayData, WorkoutSession } from '../types/training';

function daySessions(day: DayData): WorkoutSession[] {
  return dayToLegacySessions(normalizeDayData(day));
}

const HEAVY_TYPES: ActivityType[] = ['intervals', 'tempo', 'longrun', 'race'];

function isLocked(session: WorkoutSession, lockedIds: Set<string>): boolean {
  return session.isLocked || lockedIds.has(session.id);
}

/** Modifikace těžké jednotky místo zrušení – pro readiness ≥ 8 */
function modifyHeavySessionForFatigue(session: WorkoutSession, date: string): WorkoutSession {
  return {
    ...session,
    id: `${session.id}-fatigue-mod`,
    title: `${session.title} (úprava – mírná únava)`,
    planned: {
      ...session.planned,
      description: [
        `[Úprava kvůli readiness ≥8 – ${date}]`,
        'Běhej na pocit/laktát (~4 mmol/l). Zkrácení objemu ~25 %, delší pauzy (+15 s).',
        'Pokud po 4. opakování neudržíš tempo, ukonči předčasně.',
        session.planned.description,
      ].join(' '),
    },
  };
}

function createEasyRunSession(date: string, phase: WorkoutSession['phase']): WorkoutSession {
  return {
    id: `${date}-${phase}-easy`,
    phase,
    title: 'Lehký regenerační klus – AI adaptace',
    type: 'klus',
    isLocked: false,
    planned: {
      description:
        '8–10 km v Z1–Z2 (autoregulace). Místo zrušení kvalitní jednotky – 1 lehký den v týdnu.',
      distanceKm: 9,
      targetPace: '5:30',
    },
  };
}

/**
 * Adaptace plánu při vysoké únavě (readiness ≥ 8).
 * Modifikuje těžké jednotky místo 2 dnů kompletního volna.
 */
export function adaptTrainingPlan(request: RecalculateRequest): RecalculateResponse {
  const lockedIds = new Set(request.lockedSessions.map((s) => s.id));
  const updatedDays: Record<string, DayData> = {};

  const futureDates = Object.keys(request.currentDays)
    .filter((d) => d >= request.fromDate)
    .sort();

  if (request.readinessScore < 8 || futureDates.length === 0) {
    return { updatedDays };
  }

  let easyDayUsed = false;

  for (let i = 0; i < Math.min(2, futureDates.length); i++) {
    const date = futureDates[i];
    const day = request.currentDays[date];
    if (!day) continue;

    const sessions = daySessions(day);
    const newSessions: WorkoutSession[] = [];
    let dayModified = false;

    for (const session of sessions) {
      if (isLocked(session, lockedIds)) {
        newSessions.push(session);
        continue;
      }

      if (HEAVY_TYPES.includes(session.type)) {
        newSessions.push(modifyHeavySessionForFatigue(session, date));
        dayModified = true;
        continue;
      }

      newSessions.push(session);
    }

    if (dayModified) {
      updatedDays[date] = legacySessionsToDay(date, newSessions, day.feedback);
    }
  }

  const nextDate = futureDates[2];
  if (!easyDayUsed && nextDate && request.readinessScore >= 9) {
    const day = request.currentDays[nextDate];
    if (day) {
      const sessions = daySessions(day);
      const hasHeavy = sessions.some(
        (s) => HEAVY_TYPES.includes(s.type) && !isLocked(s, lockedIds),
      );
      if (hasHeavy) {
        const filtered = sessions.filter(
          (s) => isLocked(s, lockedIds) || !HEAVY_TYPES.includes(s.type),
        );
        updatedDays[nextDate] = legacySessionsToDay(
          nextDate,
          [...filtered, createEasyRunSession(nextDate, 'AM')],
          day.feedback,
        );
        easyDayUsed = true;
      }
    }
  }

  return { updatedDays };
}

export function collectLockedSessions(
  days: Record<string, DayData>,
  fromDate: string,
): WorkoutSession[] {
  return Object.entries(days)
    .filter(([date]) => date >= fromDate)
    .flatMap(([, day]) =>
      normalizeDayData(day).plannedWorkouts
        .filter((w) => w.isLocked)
        .map((w) => ({
          id: w.id,
          phase: w.phase,
          title: w.title,
          type: w.type,
          isLocked: true,
          planned: {
            description: w.description,
            distanceKm: w.distanceKm,
            targetPace: w.targetPace,
            targetHR: w.targetHR,
            bookReference: w.bookReference,
          },
        })),
    );
}

export function getHistorySummary(
  days: Record<string, DayData>,
  fromDate: string,
  count = 14,
): DayData[] {
  const start = parseDate(fromDate);
  return Array.from({ length: count }, (_, i) => {
    const date = formatDateKey(addDaysToDate(start, -(count - 1 - i)));
    return days[date] ? normalizeDayData(days[date]) : undefined;
  }).filter((d): d is DayData => d !== undefined);
}

export function buildRecalculatePromptContext(request: RecalculateRequest): string {
  return JSON.stringify(
    {
      fromDate: request.fromDate,
      readinessScore: request.readinessScore,
      lockedSessionIds: request.lockedSessions.map((s) => s.id),
      userMetrics: request.userMetrics,
      historyDays: request.historySummary.length,
      futureDays: Object.keys(request.currentDays).length,
      rule:
        request.readinessScore >= 8
          ? 'APPLY_FATIGUE_MODIFICATION_PROTOCOL'
          : 'NO_CHANGE',
    },
    null,
    2,
  );
}
