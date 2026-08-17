import { buildLoadManagementCoachRules } from './coachCalibration';
import { getActivities, normalizeDayData } from './dayData';
import { addDaysToDate, formatDateKey, getTodayDate, parseDate } from './dates';
import type { Activity, DayData } from '../types/training';
import type { UserMetrics } from '../types/settings';

export type TerrainType = 'road' | 'ob' | 'kros' | 'trail';

export interface DailyTssEntry {
  date: string;
  tss: number;
}

export interface LoadMetricsSnapshot {
  ctl: number;
  atl: number;
  tsb: number;
  todayTss: number;
  yesterdayTsb: number;
  last7dTss: number;
  last28dTss: number;
}

export interface DailyLoadMetrics {
  date: string;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

function parsePaceMinPerKm(pace: string): number | null {
  const match = pace.match(/(\d+):(\d+)/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}

export function formatPaceMinPerKm(minPerKm: number): string {
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** hrTSS – 1 h na prahu (ANP/LTHR) ≈ 100 TSS */
export function calculateHrTSS(
  durationMin: number,
  avgHR: number,
  thresholdHR: number,
): number {
  if (durationMin <= 0 || avgHR <= 0 || thresholdHR <= 0) return 0;
  const intensityFactor = Math.min(avgHR / thresholdHR, 1.65);
  const hours = durationMin / 60;
  return Math.round(hours * intensityFactor * intensityFactor * 100 * 10) / 10;
}

/**
 * Zjednodušené GAP – korigované tempo na rovinu z převýšení.
 * Při stoupání je GAP rychlejší (nižší min/km) než reálné tempo.
 */
export function calculateGradeAdjustedPaceMin(
  avgPaceMinPerKm: number,
  distanceKm: number,
  elevationGainM: number,
): number {
  if (distanceKm <= 0 || elevationGainM <= 0) return avgPaceMinPerKm;
  const grade = elevationGainM / (distanceKm * 1000);
  const adjustmentMinPerKm = grade * 4.5;
  return Math.max(avgPaceMinPerKm - adjustmentMinPerKm, avgPaceMinPerKm * 0.75);
}

export function calculateGapPaceString(
  avgPace: string,
  distanceKm: number,
  elevationGainM: number,
): string | undefined {
  const paceMin = parsePaceMinPerKm(avgPace);
  if (paceMin === null || elevationGainM <= 0) return undefined;
  return `${formatPaceMinPerKm(calculateGradeAdjustedPaceMin(paceMin, distanceKm, elevationGainM))}/km`;
}

export function inferTerrainType(title: string, sportType?: string): TerrainType {
  const lower = `${title} ${sportType ?? ''}`.toLowerCase();
  if (/orient|^\s*ob\b|\bob[\s\-]|orienteering/.test(lower)) return 'ob';
  if (/kros|cross.?country|přespoln|prespoln|skyrun/.test(lower)) return 'kros';
  if (/trail|horsk|skialp|vertical/.test(lower)) return 'trail';
  return 'road';
}

export function isObOrKrosTerrain(terrain?: TerrainType): boolean {
  return terrain === 'ob' || terrain === 'kros' || terrain === 'trail';
}

export function activityDurationMin(activity: Activity): number {
  if (activity.durationMin && activity.durationMin > 0) return activity.durationMin;
  const pace = parsePaceMinPerKm(activity.avgPace);
  if (pace && activity.distanceKm > 0) return Math.round(activity.distanceKm * pace);
  return Math.round(activity.distanceKm * 6);
}

export function enrichActivityMetrics(
  activity: Activity,
  userMetrics: UserMetrics,
): Activity {
  const durationMin = activityDurationMin(activity);
  const thresholdHR = userMetrics.ANP || userMetrics.HRmax * 0.9;
  const elevationGainM = activity.elevationGainM ?? 0;
  const paceMin = parsePaceMinPerKm(activity.avgPace);

  const tss =
    activity.tss ??
    calculateHrTSS(durationMin, activity.avgHR, thresholdHR);

  const gapPace =
    activity.gapPace ??
    (paceMin !== null && elevationGainM > 0
      ? calculateGapPaceString(activity.avgPace, activity.distanceKm, elevationGainM)
      : undefined);

  const terrainType =
    activity.terrainType ?? inferTerrainType(activity.title);

  return {
    ...activity,
    durationMin,
    elevationGainM: elevationGainM > 0 ? elevationGainM : activity.elevationGainM,
    tss,
    gapPace,
    terrainType,
  };
}

export function computeActivityTss(activity: Activity, userMetrics: UserMetrics): number {
  return enrichActivityMetrics(activity, userMetrics).tss ?? 0;
}

export function collectDailyTss(
  days: Record<string, DayData>,
  userMetrics: UserMetrics,
  fromDate: string,
  toDate: string,
): DailyTssEntry[] {
  const entries: DailyTssEntry[] = [];
  let cursor = parseDate(fromDate);
  const end = parseDate(toDate);

  while (cursor <= end) {
    const dateKey = formatDateKey(cursor);
    const day = days[dateKey] ? normalizeDayData(days[dateKey]) : null;
    const activities = day ? getActivities(day) : [];
    const tss = activities.reduce(
      (sum, act) => sum + computeActivityTss(act, userMetrics),
      0,
    );
    entries.push({ date: dateKey, tss: Math.round(tss * 10) / 10 });
    cursor = addDaysToDate(cursor, 1);
  }

  return entries;
}

function ewmaStep(previous: number, value: number, timeConstant: number): number {
  return previous + (value - previous) / timeConstant;
}

export function computeLoadMetricsFromDailyTss(
  dailyTss: DailyTssEntry[],
): LoadMetricsSnapshot {
  if (dailyTss.length === 0) {
    return { ctl: 0, atl: 0, tsb: 0, todayTss: 0, yesterdayTsb: 0, last7dTss: 0, last28dTss: 0 };
  }

  let ctl = 0;
  let atl = 0;
  let prevCtl = 0;
  let prevAtl = 0;
  let prevTsb = 0;

  for (const entry of dailyTss) {
    prevCtl = ctl;
    prevAtl = atl;
    ctl = ewmaStep(ctl, entry.tss, 42);
    atl = ewmaStep(atl, entry.tss, 7);
    prevTsb = prevCtl - prevAtl;
  }

  const today = dailyTss[dailyTss.length - 1];
  const last7 = dailyTss.slice(-7);
  const last28 = dailyTss.slice(-28);

  return {
    ctl: Math.round(ctl * 10) / 10,
    atl: Math.round(atl * 10) / 10,
    tsb: Math.round((ctl - atl) * 10) / 10,
    todayTss: today.tss,
    yesterdayTsb: Math.round(prevTsb * 10) / 10,
    last7dTss: Math.round(last7.reduce((s, d) => s + d.tss, 0) * 10) / 10,
    last28dTss: Math.round(last28.reduce((s, d) => s + d.tss, 0) * 10) / 10,
  };
}

export function computeLoadMetrics(
  days: Record<string, DayData>,
  userMetrics: UserMetrics,
  lookbackDays = 90,
): LoadMetricsSnapshot {
  const today = getTodayDate();
  const fromDate = formatDateKey(addDaysToDate(parseDate(today), -(lookbackDays - 1)));
  const dailyTss = collectDailyTss(days, userMetrics, fromDate, today);
  return computeLoadMetricsFromDailyTss(dailyTss);
}

/** Denní časová řada CTL / ATL / TSB pro graf (posledních N dní). */
export function computeLoadMetricsTimeSeries(
  days: Record<string, DayData>,
  userMetrics: UserMetrics,
  lookbackDays = 60,
): DailyLoadMetrics[] {
  const today = getTodayDate();
  const fromDate = formatDateKey(addDaysToDate(parseDate(today), -(lookbackDays - 1)));
  const dailyTss = collectDailyTss(days, userMetrics, fromDate, today);

  let ctl = 0;
  let atl = 0;
  const series: DailyLoadMetrics[] = [];

  for (const entry of dailyTss) {
    ctl = ewmaStep(ctl, entry.tss, 42);
    atl = ewmaStep(atl, entry.tss, 7);
    series.push({
      date: entry.date,
      tss: entry.tss,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
    });
  }

  return series;
}

export function formatActivityLoadLine(activity: Activity, userMetrics: UserMetrics): string {
  const enriched = enrichActivityMetrics(activity, userMetrics);
  const parts = [
    `${enriched.distanceKm} km @ ${enriched.avgPace}/km`,
    enriched.avgHR > 0 ? `TF ${enriched.avgHR}` : null,
    enriched.elevationGainM ? `+${Math.round(enriched.elevationGainM)} m` : null,
    enriched.tss ? `TSS ${enriched.tss}` : null,
  ];

  if (isObOrKrosTerrain(enriched.terrainType)) {
    parts.push(`GAP ${enriched.gapPace ?? 'N/A'}`);
    parts.push(`terén: ${enriched.terrainType?.toUpperCase()}`);
  }

  return parts.filter(Boolean).join(', ');
}

export function buildLoadManagementContext(
  days: Record<string, DayData>,
  userMetrics: UserMetrics,
): string {
  const metrics = computeLoadMetrics(days, userMetrics);
  const tsbStatus =
    metrics.tsb < -35
      ? '🔴 Akutní přetížení (TSB < -35) – regenerace, max 1–2 lehké dny'
      : metrics.tsb < -25
        ? '🟠 Hluboká únava (TSB -25 až -35) – prioritizuj lehký den, zachovej strukturu týdne'
        : metrics.tsb < -15
          ? '🟡 Functional overreaching (TSB -15 až -25) – kvalitu MODIFIKUJ, ne ruš'
          : metrics.tsb < -5
            ? '🟢 Optimální tréninková zóna (TSB -5 až -15) – kvalita OK s autoregulací'
            : metrics.tsb > 10
              ? '🟢 Fresh forma (TSB > +10) – vhodné pro závod / max kvalitu'
              : '✅ Vyvážená zátěž (TSB -5 až +10) – plán drž';

  return `## TSS / CTL / ATL / TSB (Load Management)

- **CTL** (Chronic Training Load / kondice, 42d): **${metrics.ctl}**
- **ATL** (Acute Training Load / únava, 7d): **${metrics.atl}**
- **TSB** (Training Stress Balance / forma): **${metrics.tsb}** – ${tsbStatus}
- TSS dnes: ${metrics.todayTss} | TSS posledních 7 dní: ${metrics.last7dTss}

${buildLoadManagementCoachRules(metrics)}
- U OB a krosu ignoruj ploché tempo – hodnot intenzitu podle TF, zón, +m a TSS
- U vícedenních OB etap hlídej glykogen a TSB mezi etapami`;
}

export function buildObKrosEvaluationRules(): string {
  return `## OB a Kros – pravidla hodnocení intenzity (POVINNÉ)

- U tréninků/závodů typu **OB**, **Kros** nebo trail **NESMÍŠ** posuzovat intenzitu podle čistého tempa (min/km)
- Terén a převýšení tempo výrazně zkreslují – používej:
  a) Tepovou frekvenci a čas v zónách (BPM profil sportovce)
  b) Nastoupané metry (+m) a TSS
  c) GAP (grade adjusted pace) pouze jako doplňkový kontext, ne primární metriku
- U vícedenních/víceetapových OB závodů (např. 4 etapy) hlídej vyčerpání glykogenu – podle TSB navrhuj regenerační mikrofáze mezi etapami
- NEHALUCINUJ různé formáty etap – etapy stejného typu = stejný formát`;
}
