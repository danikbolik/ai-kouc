import { addDaysToDate, formatDateKey, getTodayDate, getWeekDays, parseDate } from './dates';
import { getActivities, getPlannedWorkouts, normalizeDayData } from './dayData';
import { formatWorkoutExtrasForAi, getPlannedWorkoutTotalDistanceKm } from './workoutExtras';
import {
  formatStravaActualDetailsForAi,
  summarizeStravaActualForAi,
} from './stravaAnalysis';
import {
  buildCoachingAnalyticsSummary,
  buildRecentStravaRunsDetail,
} from './coachingAnalytics';
import { buildMacrocyclePhaseContext } from './athleteProfileContext';
import type { DayData } from '../types/training';
import type { UserMetrics } from '../types/settings';

export const CHAT_HISTORY_DAYS = 30;
export const CHAT_FUTURE_DAYS = 21;
export const LONG_TERM_HISTORY_DAYS = 365;

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

function collectAllRunsFromDays(
  days: Record<string, DayData>,
  fromDate: string,
  toDate: string,
): RunRecord[] {
  const historyLog = Object.keys(days)
    .filter((date) => date >= fromDate && date <= toDate)
    .sort()
    .map((date) => normalizeDayData(days[date]));

  return collectStravaRuns(historyLog);
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const monthNames = [
    'led', 'úno', 'bře', 'dub', 'kvě', 'čvn',
    'čvc', 'srp', 'zář', 'říj', 'lis', 'pro',
  ];
  const idx = Number(month) - 1;
  return `${monthNames[idx] ?? month} ${year}`;
}

/** Souhrnné statistiky za rok + trenérská analytika (zóny, trendy) */
export function buildLongTermHistorySummary(
  days: Record<string, DayData>,
  userMetrics?: UserMetrics,
  lookbackDays = LONG_TERM_HISTORY_DAYS,
): string {
  const today = getTodayDate();
  const fromDate = formatDateKey(addDaysToDate(parseDate(today), -(lookbackDays - 1)));
  const runs = collectAllRunsFromDays(days, fromDate, today);

  const coachingBlock =
    userMetrics != null
      ? buildCoachingAnalyticsSummary(days, userMetrics)
      : '## Trenérská analytika\nChybí profil sportovce (zóny) – vyhodnocuj pouze z dostupných Strava dat.';

  if (runs.length === 0) {
    return `${coachingBlock}

## Dlouhodobý objem (posledních ${lookbackDays} dní)
Žádná synchronizovaná Strava data v tomto období.`;
  }

  const totalKm = runs.reduce((s, r) => s + r.distanceKm, 0);
  const monthlyKm = new Map<string, number>();
  const weeklyKm = new Map<string, number>();

  for (const run of runs) {
    const monthKey = run.date.slice(0, 7);
    monthlyKm.set(monthKey, (monthlyKm.get(monthKey) ?? 0) + run.distanceKm);
    const weekStart = getWeekDays(parseDate(run.date))[0];
    weeklyKm.set(weekStart, (weeklyKm.get(weekStart) ?? 0) + run.distanceKm);
  }

  const maxWeeklyEntry = [...weeklyKm.entries()].sort((a, b) => b[1] - a[1])[0];
  const maxMonthlyEntry = [...monthlyKm.entries()].sort((a, b) => b[1] - a[1])[0];
  const topLongRuns = [...runs].sort((a, b) => b.distanceKm - a.distanceKm).slice(0, 3);

  const volumeBlock = `## Dlouhodobý objem (doplňkový kontext, ne primární metrika)
- Celkový objem ${lookbackDays} dní: ${totalKm.toFixed(1)} km (${runs.length} běhů)
- Max. týden: ${maxWeeklyEntry[1].toFixed(1)} km (od ${maxWeeklyEntry[0]})
- Max. měsíc: ${maxMonthlyEntry[1].toFixed(1)} km (${formatMonthLabel(maxMonthlyEntry[0])})
- Top longruny: ${topLongRuns.map((r) => `${r.distanceKm} km (${r.date})`).join(', ')}`;

  return `${coachingBlock}\n\n${volumeBlock}`;
}

/** Aktuální týden (Po–Ne): reálné Strava běhy vs. plán */
export function buildCurrentWeekActualVsPlan(days: Record<string, DayData>): string {
  const today = getTodayDate();
  const weekDates = getWeekDays(parseDate(today));
  const lines: string[] = [];

  for (const date of weekDates) {
    const day = days[date] ? normalizeDayData(days[date]) : null;
    const activities = day ? getActivities(day) : [];
    const planned = day ? getPlannedWorkouts(day) : [];
    const weekday = date === today ? 'DNES' : date < today ? 'odjeté' : 'plánované';

    if (activities.length === 0 && planned.length === 0) {
      lines.push(`- **${date}** (${weekday}): bez tréninku / bez dat`);
      continue;
    }

    for (const activity of activities) {
      lines.push(
        `- **${date}** (${weekday}) ✅ STRAVA: ${activity.title} | ${activity.distanceKm} km @ ${activity.avgPace}/km, TF ${activity.avgHR || '?'}${activity.hrZones?.length ? ` | zóny: ${activity.hrZones.filter((z) => z.timeSec > 0).map((z) => `${z.zone} ${z.percent}%`).join(', ')}` : ''}`,
      );
    }

    for (const workout of planned) {
      const totalKm = getPlannedWorkoutTotalDistanceKm(workout);
      const hrPart = workout.targetHR ? `, cíl TF ${workout.targetHR}` : '';
      const pacePart = workout.targetPace ? ` @ ${workout.targetPace}` : '';
      lines.push(
        `- **${date}** (${weekday}) 📋 PLÁN: ${workout.title} (${workout.type}) | ${totalKm > 0 ? `${totalKm} km` : 'bez km'}${pacePart}${hrPart}`,
      );
    }

    const actualKm = activities.reduce((s, a) => s + a.distanceKm, 0);
    const plannedKm = planned.reduce((s, w) => s + getPlannedWorkoutTotalDistanceKm(w), 0);
    if (activities.length > 0 && planned.length > 0 && date <= today) {
      const diff = actualKm - plannedKm;
      const diffLabel =
        Math.abs(diff) < 1
          ? 'v souladu s plánem'
          : diff > 0
            ? `+${diff.toFixed(1)} km nad plán`
            : `${diff.toFixed(1)} km pod plán`;
      lines.push(`  → Srovnání ${date}: ${diffLabel} (Strava ${actualKm.toFixed(1)} km vs. plán ${plannedKm.toFixed(1)} km)`);
    }
  }

  return `## Aktuální týden – reálné běhy vs. plán (Po–Ne)
Explicitně vyhodnoť odjeté dny tohoto týdne proti plánu a zohledni je při analýze zbytku týdne.

${lines.join('\n')}`;
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
      const totalKm = getPlannedWorkoutTotalDistanceKm(w);
      const kmPart = totalKm > 0 ? `${totalKm} km` : w.distanceKm !== undefined ? `${w.distanceKm} km` : '';
      const pacePart = w.targetPace ? `@ ${w.targetPace}` : '';
      const hrPart = w.targetHR ? `TF ${w.targetHR}` : '';
      totalPlannedKm += totalKm;
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

  const yearFrom = formatDateKey(addDaysToDate(parseDate(today), -(LONG_TERM_HISTORY_DAYS - 1)));
  const longTermRuns = collectAllRunsFromDays(days, yearFrom, today);
  let maxYearlyWeeklyKm = 0;
  if (longTermRuns.length > 0) {
    const weeklyKm = new Map<string, number>();
    for (const run of longTermRuns) {
      const weekStart = getWeekDays(parseDate(run.date))[0];
      weeklyKm.set(weekStart, (weeklyKm.get(weekStart) ?? 0) + run.distanceKm);
    }
    maxYearlyWeeklyKm = Math.max(...weeklyKm.values());
  }

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
      const km = getPlannedWorkoutTotalDistanceKm(w);
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
  if (volumeJump !== null && volumeJump > 15 && (maxYearlyWeeklyKm === 0 || nextWeekPlannedKm > maxYearlyWeeklyKm * 1.15)) {
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
- Max. týdenní objem za poslední rok: ${maxYearlyWeeklyKm > 0 ? `${maxYearlyWeeklyKm.toFixed(1)} km` : 'N/A'}
- Největší plánovaný single run: ${maxPlannedSingle} km (${maxPlannedDate || 'N/A'})
- Plánovaný objem příští týden: ${nextWeekPlannedKm.toFixed(1)} km
${flags.length > 0 ? `\n### Detekovaná rizika\n${flags.join('\n')}` : '\nŽádná automatická rizika nebyla detekována – stále kriticky zkontroluj rozložení intenzit.'}`;
}

export function buildAiContextSummaries(
  days: Record<string, DayData>,
  userMetrics?: UserMetrics,
): {
  stravaHistorySummary: string;
  longTermHistorySummary: string;
  macrocyclePhaseSummary: string;
  recentRunsDetail: string;
  currentWeekActualVsPlan: string;
  upcomingPlanSummary: string;
  planComparisonSummary: string;
} {
  return {
    stravaHistorySummary: buildStravaHistorySummary(days),
    longTermHistorySummary: buildLongTermHistorySummary(days, userMetrics),
    macrocyclePhaseSummary: userMetrics
      ? buildMacrocyclePhaseContext(userMetrics)
      : 'Makrocyklus: chybí profil sportovce.',
    recentRunsDetail: buildRecentStravaRunsDetail(days, 14, userMetrics),
    currentWeekActualVsPlan: buildCurrentWeekActualVsPlan(days),
    upcomingPlanSummary: buildUpcomingPlanSummary(days),
    planComparisonSummary: buildPlanVsHistoryComparison(days),
  };
}

/** @deprecated – použij buildAiContextSummaries s plným days záznamem */
export function buildSummariesFromTrainingLog(trainingLog: DayData[]): {
  stravaHistorySummary: string;
  upcomingPlanSummary: string;
  planComparisonSummary: string;
} {
  const days: Record<string, DayData> = Object.fromEntries(
    trainingLog.map((d) => [d.date, d]),
  );
  const summaries = buildAiContextSummaries(days);
  return {
    stravaHistorySummary: summaries.stravaHistorySummary,
    upcomingPlanSummary: summaries.upcomingPlanSummary,
    planComparisonSummary: summaries.planComparisonSummary,
  };
}

export function buildChatAiContext(
  days: Record<string, DayData>,
  historyDays = CHAT_HISTORY_DAYS,
  futureDays = CHAT_FUTURE_DAYS,
  userMetrics?: UserMetrics,
): {
  trainingLog: DayData[];
  visiblePeriod: { from: string; to: string };
  stravaHistorySummary: string;
  longTermHistorySummary: string;
  macrocyclePhaseSummary: string;
  recentRunsDetail: string;
  currentWeekActualVsPlan: string;
  upcomingPlanSummary: string;
  planComparisonSummary: string;
} {
  const trainingLog = buildTrainingLogForChat(days, historyDays, futureDays);
  const today = getTodayDate();
  const historyStart = formatDateKey(addDaysToDate(parseDate(today), -(historyDays - 1)));
  const futureEnd = formatDateKey(addDaysToDate(parseDate(today), futureDays));
  const summaries = buildAiContextSummaries(days, userMetrics);

  return {
    trainingLog,
    visiblePeriod: { from: historyStart, to: futureEnd },
    ...summaries,
  };
}
