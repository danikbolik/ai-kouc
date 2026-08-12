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

function createRestSession(date: string, phase: WorkoutSession['phase']): WorkoutSession {
  return {
    id: `${date}-${phase}-regen`,
    phase,
    title: 'Regenerační den – AI adaptace',
    type: 'rest',
    isLocked: false,
    planned: {
      description:
        'Adaptace plánu kvůli vysoké únavě (readiness ≥ 8). Kompletní odpočinek, hydratace, lehká procházka max 20 min.',
    },
  };
}

function createMobilitySession(date: string, phase: WorkoutSession['phase']): WorkoutSession {
  return {
    id: `${date}-${phase}-mobility`,
    phase,
    title: 'Regenerační mobilita – AI adaptace',
    type: 'mobility',
    isLocked: false,
    planned: {
      description:
        'Lehká mobilita a strečink 30–45 min. Bez aerobní zátěže – kyčle, hamstringy, lýtka.',
    },
  };
}

function downgradeSession(session: WorkoutSession, date: string): WorkoutSession {
  return {
    ...session,
    id: `${session.id}-adapted`,
    title: `${session.title} (posunuto – AI adaptace)`,
    planned: {
      ...session.planned,
      description: `[Posunuto z ${date}] ${session.planned.description}`,
    },
  };
}

/**
 * Simuluje structured output LLM adaptaci plánu.
 * Při readinessScore >= 8: 2 dny regenerace, těžké jednotky posunuty na později.
 * Respektuje isLocked session.
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

  const deferredHeavy: WorkoutSession[] = [];

  // Fáze 1: nejbližší 2 dny → regenerace (kromě zamčených session)
  for (let i = 0; i < Math.min(2, futureDates.length); i++) {
    const date = futureDates[i];
    const day = request.currentDays[date];
    if (!day) continue;

    const newSessions: WorkoutSession[] = [];

    for (const session of daySessions(day)) {
      if (isLocked(session, lockedIds)) {
        newSessions.push(session);
        continue;
      }

      if (HEAVY_TYPES.includes(session.type)) {
        deferredHeavy.push(downgradeSession(session, date));
        continue;
      }

      if (session.type === 'rest' || session.type === 'mobility') {
        newSessions.push(session);
      }
    }

    if (newSessions.filter((s) => !isLocked(s, lockedIds)).length === 0) {
      newSessions.unshift(
        i === 0 ? createRestSession(date, 'AM') : createMobilitySession(date, 'AM'),
      );
    } else {
      const hasRegen = newSessions.some((s) => s.type === 'rest' || s.type === 'mobility');
      if (!hasRegen) {
        newSessions.push(i === 0 ? createRestSession(date, 'PM') : createMobilitySession(date, 'PM'));
      }
    }

    updatedDays[date] = legacySessionsToDay(date, newSessions, day.feedback);
  }

  // Fáze 2: posuň odložené těžké jednotky na volné sloty po regeneraci
  if (deferredHeavy.length > 0) {
    const slotsAfterRegen = futureDates.slice(2);
    let deferredIndex = 0;

    for (const date of slotsAfterRegen) {
      if (deferredIndex >= deferredHeavy.length) break;

      const day = updatedDays[date] ?? request.currentDays[date];
      if (!day) continue;

      const sessions = daySessions(day);
      const hasHeavy = sessions.some(
        (s) => HEAVY_TYPES.includes(s.type) && isLocked(s, lockedIds),
      );
      if (hasHeavy) continue;

      const hasUnlockedHeavy = sessions.some(
        (s) => HEAVY_TYPES.includes(s.type) && !isLocked(s, lockedIds),
      );

      if (!hasUnlockedHeavy) {
        const deferred = deferredHeavy[deferredIndex];
        const rescheduled: WorkoutSession = {
          ...deferred,
          id: `${date}-${deferred.phase}-rescheduled`,
          phase: sessions[0]?.phase ?? 'PM',
          title: deferred.title.replace('(posunuto – AI adaptace)', '(přeplánováno)'),
          planned: {
            ...deferred.planned,
            description: `Přeplánováno kvůli vysoké únavě. ${deferred.planned.description}`,
          },
        };

        updatedDays[date] = legacySessionsToDay(
          date,
          [
            ...sessions.filter((s) => isLocked(s, lockedIds) || !HEAVY_TYPES.includes(s.type)),
            rescheduled,
          ],
          day.feedback,
        );
        deferredIndex++;
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

/** Připraví kontext pro LLM volání (použitelné s OpenAI structured outputs) */
export function buildRecalculatePromptContext(request: RecalculateRequest): string {
  return JSON.stringify(
    {
      fromDate: request.fromDate,
      readinessScore: request.readinessScore,
      lockedSessionIds: request.lockedSessions.map((s) => s.id),
      userMetrics: request.userMetrics,
      historyDays: request.historySummary.length,
      futureDays: Object.keys(request.currentDays).length,
      rule: request.readinessScore >= 8 ? 'APPLY_REGENERATION_PROTOCOL' : 'NO_CHANGE',
    },
    null,
    2,
  );
}
