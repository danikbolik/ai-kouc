import { addDaysToDate, formatDateKey, getTodayDate, parseDate } from './dates';
import { getActivities, normalizeDayData } from './dayData';
import { formatWorkoutExtrasForAi } from './workoutExtras';
import {
  formatStravaActualDetailsForAi,
  summarizeStravaActualForAi,
} from './stravaAnalysis';
import type { DayData } from '../types/training';

export const CHAT_HISTORY_DAYS = 30;
export const CHAT_FUTURE_DAYS = 21;

function parsePaceToMinPerKm(pace: string): number | null {
  const match = pace.match(/(\d+):(\d+)/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}

function formatPaceMin(minPerKm: number): string {
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function getHistoryDates(today: string, historyDays: number): string[] {
  const end = parseDate(today);
  const start = addDaysToDate(end, -(historyDays - 1));
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(formatDateKey(current));
    current = addDaysToDate(current, 1);
  }
  return dates;
}

function getFutureDates(today: string, futureDays: number): string[] {
  const start = addDaysToDate(parseDate(today), 1);
  return Array.from({ length: futureDays }, (_, i) =>
    formatDateKey(addDaysToDate(start, i)),
  );
}

export function buildChatDateRanges(
  days: Record<string, DayData>,
  historyDays = CHAT_HISTORY_DAYS,
  futureDays = CHAT_FUTURE_DAYS,
  today = getTodayDate(),
): { historyDates: string[]; futureDates: string[]; allDates: string[] } {
  const historyDates = getHistoryDates(today, historyDays);
  const futureDates = getFutureDates(today, futureDays);
  const allDates = [...historyDates, ...futureDates];
  return { historyDates, futureDates, allDates };
}

export function buildTrainingLogForChat(
  days: Record<string, DayData>,
  historyDays = CHAT_HISTORY_DAYS,
  futureDays = CHAT_FUTURE_DAYS,
): DayData[] {
  const { allDates } = buildChatDateRanges(days, historyDays, futureDays);
  return allDates.map((date) =>
    days[date] ? normalizeDayData(days[date]) : { date, activities: [], plannedWorkouts: [] },
  );
}

interface RunRecord {
  date: string;
  title: string;
  type: string;
  distanceKm: number;
  avgPace: string;
  avgHR: number;
  stravaDetails?: string;
}

function collectStravaRuns(historyLog: DayData[]): RunRecord[] {
  const runs: RunRecord[] = [];

  for (const day of historyLog) {
    for (const activity of getActivities(day)) {
      if (activity.distanceKm <= 0) continue;

      const legacyActual = {
        distanceKm: activity.distanceKm,
        avgPace: activity.avgPace,
        avgHR: activity.avgHR,
        garminSyncStatus: activity.garminSyncStatus,
        stravaActivityId: activity.stravaActivityId,
        durationMin: activity.durationMin,
        laps: activity.laps,
        hrZones: activity.hrZones,
      };

      const summary = summarizeStravaActualForAi(legacyActual);
      const details = formatStravaActualDetailsForAi(legacyActual);

      runs.push({
        date: day.date,
        title: activity.title,
        type: activity.type,
        distanceKm: activity.distanceKm,
        avgPace: activity.avgPace,
        avgHR: activity.avgHR,
        stravaDetails: [summary, details].filter(Boolean).join('. ') || undefined,
      });
    }
  }

  return runs.sort((a, b) => a.date.localeCompare(b.date));
}

function computeWeeklyKm(runs: RunRecord[], weekDates: string[]): number {
  const weekSet = new Set(weekDates);
  return runs
    .filter((r) => weekSet.has(r.date))
    .reduce((sum, r) => sum + r.distanceKm, 0);
}

/** Agregované statistiky ze Stravy za posledních N dní */
export function buildStravaHistorySummary(
  days: Record<string, DayData>,
  historyDays = CHAT_HISTORY_DAYS,
): string {
  const today = getTodayDate();
  const { historyDates } = buildChatDateRanges(days, historyDays, 0, today);
  const historyLog = historyDates.map((date) =>
    days[date] ? normalizeDayData(days[date]) : { date, activities: [], plannedWorkouts: [] },
  );

  const runs = collectStravaRuns(historyLog);

  if (runs.length === 0) {
    return `## Reálná historie ze Stravy (posledních ${historyDays} dní)
Žádné synchronizované běhy ze Stravy v tomto období. Plán hodnotíš pouze z kalendáře – upozorni sportovce na chybějící data.`;
  }

  const totalKm = runs.reduce((s, r) => s + r.distanceKm, 0);
  const maxRun = runs.reduce((max, r) => (r.distanceKm > max.distanceKm ? r : max), runs[0]);
  const paces = runs.map((r) => parsePaceToMinPerKm(r.avgPace)).filter((p): p is number => p !== null);
  const avgPace =
    paces.length > 0 ? formatPaceMin(paces.reduce((s, p) => s + p, 0) / paces.length) : 'N/A';
  const hrs = runs.filter((r) => r.avgHR > 0).map((r) => r.avgHR);
  const avgHR = hrs.length > 0 ? Math.round(hrs.reduce((s, h) => s + h, 0) / hrs.length) : 0;

  const thisWeekDates = getHistoryDates(today, 7);
  const prevWeekStart = addDaysToDate(parseDate(today), -13);
  const prevWeekDates = Array.from({ length: 7 }, (_, i) =>
    formatDateKey(addDaysToDate(prevWeekStart, i)),
  );

  const thisWeekKm = computeWeeklyKm(runs, thisWeekDates);
  const prevWeekKm = computeWeeklyKm(runs, prevWeekDates);

  const last7Runs = runs.slice(-7);
  const runLines = last7Runs
    .map(
      (r) =>
        `- ${r.date}: ${r.title} | ${r.distanceKm} km @ ${r.avgPace}/km, TF ${r.avgHR || '?'}${r.stravaDetails ? ` | ${r.stravaDetails}` : ''}`,
    )
    .join('\n');

  const intervalRuns = runs.filter((r) => r.type === 'intervals').length;
  const longRuns = runs.filter((r) => r.type === 'longrun' || r.distanceKm >= 15);

  return `## Reálná historie ze Stravy (posledních ${historyDays} dní)

### Agregované metriky
- Celkový objem: ${totalKm.toFixed(1)} km (${runs.length} běhů)
- Tento týden (7 dní): ${thisWeekKm.toFixed(1)} km | Minulý týden: ${prevWeekKm.toFixed(1)} km
- Nejdelší běh: ${maxRun.distanceKm} km (${maxRun.date}, ${maxRun.title})
- Průměrné tempo: ${avgPace}/km | Průměrná TF: ${avgHR || 'N/A'} bpm
- Longruny (≥15 km nebo typ longrun): ${longRuns.length}× | Intervalové tréninky: ${intervalRuns}×

### Posledních ${last7Runs.length} odbehaných běhů
${runLines}`;
}

/** Nadcházející plánované tréninky z kalendáře */
export function buildUpcomingPlanSummary(
  days: Record<string, DayData>,
  futureDays = CHAT_FUTURE_DAYS,
): string {
  const today = getTodayDate();
  const { futureDates } = buildChatDateRanges(days, 0, futureDays, today);
  const lines: string[] = [];
  let totalPlannedKm = 0;

  for (const date of futureDates) {
    const day = days[date] ? normalizeDayData(days[date]) : null;
    if (!day?.plannedWorkouts.length) continue;

    for (const w of day.plannedWorkouts) {
      const kmPart = w.distanceKm !== undefined ? `${w.distanceKm} km` : '';
      const pacePart = w.targetPace ? `@ ${w.targetPace}` : '';
      const hrPart = w.targetHR ? `TF ${w.targetHR}` : '';
      totalPlannedKm += w.distanceKm ?? 0;
      lines.push(
        `- ${date} [${w.phase}] ${w.title} (${w.type}) | ${[kmPart, pacePart, hrPart].filter(Boolean).join(' ')}${w.isLocked ? ' 🔒' : ''}${formatWorkoutExtrasForAi(w)}`,
      );
    }
  }

  if (lines.length === 0) {
    return `## Nadcházející plán (následujících ${futureDays} dní)
Kalendář nemá naplánované tréninky – upozorni sportovce.`;
  }

  return `## Nadcházející plán (následujících ${futureDays} dní)
Plánovaný objem: ~${totalPlannedKm.toFixed(1)} km

${lines.join('\n')}`;
}

/** Porovnávací kontext plán vs. reálná historie pro kritickou analýzu */
export function buildPlanVsHistoryComparison(
  days: Record<string, DayData>,
  historyDays = CHAT_HISTORY_DAYS,
  futureDays = CHAT_FUTURE_DAYS,
): string {
  const today = getTodayDate();
  const historyLog = buildTrainingLogForChat(days, historyDays, 0).filter((d) => d.date <= today);
  const runs = collectStravaRuns(historyLog);

  const maxActualKm = runs.length > 0 ? Math.max(...runs.map((r) => r.distanceKm)) : 0;
  const thisWeekDates = getHistoryDates(today, 7);
  const thisWeekKm = computeWeeklyKm(runs, thisWeekDates);

  const futureDates = getFutureDates(today, futureDays);
  let maxPlannedSingle = 0;
  let maxPlannedDate = '';
  let maxPlannedTitle = '';
  let nextWeekPlannedKm = 0;
  const nextWeekEnd = formatDateKey(addDaysToDate(parseDate(today), 7));

  for (const date of futureDates) {
    const day = days[date] ? normalizeDayData(days[date]) : null;
    if (!day) continue;

    for (const w of day.plannedWorkouts) {
      const km = w.distanceKm ?? 0;
      if (km > maxPlannedSingle) {
        maxPlannedSingle = km;
        maxPlannedDate = date;
        maxPlannedTitle = w.title;
      }
      if (date <= nextWeekEnd) {
        nextWeekPlannedKm += km;
      }
    }
  }

  const volumeJump =
    thisWeekKm > 0 && nextWeekPlannedKm > 0
      ? Math.round(((nextWeekPlannedKm - thisWeekKm) / thisWeekKm) * 100)
      : null;

  const longRunRisk =
    maxPlannedSingle > 0 && maxActualKm > 0 && maxPlannedSingle > maxActualKm * 1.25;

  const flags: string[] = [];
  if (longRunRisk) {
    flags.push(
      `⚠ LONG RUN SKOK: Plánuješ ${maxPlannedSingle} km (${maxPlannedDate}, ${maxPlannedTitle}), ale nejdelší reálný běh za ${historyDays} dní byl ${maxActualKm} km.`,
    );
  }
  if (volumeJump !== null && volumeJump > 15) {
    flags.push(
      `⚠ OBJEMOVÝ SKOK: Plánovaný objem příštího týdne (${nextWeekPlannedKm.toFixed(1)} km) je o ${volumeJump} % vyšší než tento týden (${thisWeekKm.toFixed(1)} km).`,
    );
  }
  if (runs.length === 0) {
    flags.push('⚠ CHYBÍ STRAVA DATA: Nemáš reálnou historii běhů – plán nelze validovat proti odbehané zátěži.');
  }

  return `## Automatická kontrola plán vs. historie (použij v analýze)
- Nejdelší reálný běh (${historyDays} dní): ${maxActualKm} km
- Objem tento týden (Strava): ${thisWeekKm.toFixed(1)} km
- Největší plánovaný single run: ${maxPlannedSingle} km (${maxPlannedDate || 'N/A'})
- Plánovaný objem příští týden: ${nextWeekPlannedKm.toFixed(1)} km
${flags.length > 0 ? `\n### Detekovaná rizika\n${flags.join('\n')}` : '\nŽádná automatická rizika nebyla detekována – stále kriticky zkontroluj rozložení intenzit.'}`;
}

export function buildSummariesFromTrainingLog(trainingLog: DayData[]): {
  stravaHistorySummary: string;
  upcomingPlanSummary: string;
  planComparisonSummary: string;
} {
  const days: Record<string, DayData> = Object.fromEntries(
    trainingLog.map((d) => [d.date, d]),
  );
  return {
    stravaHistorySummary: buildStravaHistorySummary(days),
    upcomingPlanSummary: buildUpcomingPlanSummary(days),
    planComparisonSummary: buildPlanVsHistoryComparison(days),
  };
}

export function buildChatAiContext(
  days: Record<string, DayData>,
  historyDays = CHAT_HISTORY_DAYS,
  futureDays = CHAT_FUTURE_DAYS,
): {
  trainingLog: DayData[];
  visiblePeriod: { from: string; to: string };
  stravaHistorySummary: string;
  upcomingPlanSummary: string;
  planComparisonSummary: string;
} {
  const trainingLog = buildTrainingLogForChat(days, historyDays, futureDays);
  const today = getTodayDate();
  const historyStart = formatDateKey(addDaysToDate(parseDate(today), -(historyDays - 1)));
  const futureEnd = formatDateKey(addDaysToDate(parseDate(today), futureDays));

  return {
    trainingLog,
    visiblePeriod: { from: historyStart, to: futureEnd },
    stravaHistorySummary: buildStravaHistorySummary(days, historyDays),
    upcomingPlanSummary: buildUpcomingPlanSummary(days, futureDays),
    planComparisonSummary: buildPlanVsHistoryComparison(days, historyDays, futureDays),
  };
}
