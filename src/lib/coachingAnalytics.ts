import { addDaysToDate, formatDateKey, getTodayDate, getWeekDays, parseDate } from './dates';
import { getActivities, normalizeDayData } from './dayData';
import { classifyHeartRateZone } from './athleteProfileContext';
import { formatActivityLoadLine, isObOrKrosTerrain, enrichActivityMetrics } from './loadManagement';
import type { Activity, ActivityType, DayData, StravaHrZoneSummary } from '../types/training';
import type { PaceZone, UserMetrics } from '../types/settings';
import { DEFAULT_PACE_ZONES } from '../types/settings';

export type ZoneId = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';

export type WorkoutCategory =
  | 'longrun'
  | 'tempo_threshold'
  | 'intervals'
  | 'hills'
  | 'race_simulation'
  | 'recovery_easy'
  | 'other';

const ZONE_IDS: ZoneId[] = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

const CZECH_WEEKDAYS = [
  'neděle',
  'pondělí',
  'úterý',
  'středa',
  'čtvrtek',
  'pátek',
  'sobota',
] as const;

function formatCzechWeekday(dateStr: string): string {
  return CZECH_WEEKDAYS[parseDate(dateStr).getDay()];
}

export interface ActivityAnalyticsRecord {
  date: string;
  title: string;
  type: ActivityType;
  distanceKm: number;
  durationMin: number;
  avgPace: string;
  avgHR: number;
  hrZones?: StravaHrZoneSummary[];
  category: WorkoutCategory;
}

type ZoneSeconds = Record<ZoneId, number>;

function emptyZoneSeconds(): ZoneSeconds {
  return { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 };
}

function parsePaceMinPerKm(pace: string): number | null {
  const match = pace.match(/(\d+):(\d+)/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}

function activityDurationMin(activity: Activity): number {
  if (activity.durationMin && activity.durationMin > 0) return activity.durationMin;
  const pace = parsePaceMinPerKm(activity.avgPace);
  if (pace && activity.distanceKm > 0) return Math.round(activity.distanceKm * pace);
  return Math.round(activity.distanceKm * 6);
}

function classifyWorkoutCategory(activity: Activity): WorkoutCategory {
  const title = activity.title.toLowerCase();
  if (activity.type === 'race') return 'race_simulation';
  if (activity.type === 'longrun') return 'longrun';
  if (activity.type === 'intervals') return 'intervals';
  if (activity.type === 'tempo') return 'tempo_threshold';
  if (
    activity.type === 'strength' ||
    /kopc|kopce|hill|steep|výšl|převýš|trail climb/.test(title)
  ) {
    return 'hills';
  }
  if (activity.type === 'klus' || activity.type === 'mobility') return 'recovery_easy';
  if (/závod|race|simul|test/.test(title)) return 'race_simulation';
  if (/tempo|prah|threshold|lt|anp/.test(title)) return 'tempo_threshold';
  if (/interval|fartlek|rep/.test(title)) return 'intervals';
  if (/long|dlouh/.test(title)) return 'longrun';
  return 'other';
}

export function collectActivitiesInRange(
  days: Record<string, DayData>,
  fromDate: string,
  toDate: string,
): ActivityAnalyticsRecord[] {
  const records: ActivityAnalyticsRecord[] = [];

  for (const [date, rawDay] of Object.entries(days)) {
    if (date < fromDate || date > toDate) continue;
    const day = normalizeDayData(rawDay);
    for (const activity of getActivities(day)) {
      if (activity.distanceKm <= 0 && activityDurationMin(activity) <= 0) continue;
      records.push({
        date,
        title: activity.title,
        type: activity.type,
        distanceKm: activity.distanceKm,
        durationMin: activityDurationMin(activity),
        avgPace: activity.avgPace,
        avgHR: activity.avgHR,
        hrZones: activity.hrZones,
        category: classifyWorkoutCategory(activity),
      });
    }
  }

  return records.sort((a, b) => a.date.localeCompare(b.date));
}

function classifyPaceZone(paceMinPerKm: number, zones: PaceZone[]): ZoneId {
  for (const zone of zones) {
    const min = zone.minPace ? parsePaceMinPerKm(zone.minPace) : null;
    const max = zone.maxPace ? parsePaceMinPerKm(zone.maxPace) : null;

    if (zone.zone === 'Z1' && max !== null && paceMinPerKm >= max) return 'Z1';
    if (zone.zone === 'Z5' && min !== null && paceMinPerKm <= min) return 'Z5';
    if (min !== null && max !== null && paceMinPerKm <= max && paceMinPerKm >= min) {
      return zone.zone;
    }
    if (min !== null && max === null && paceMinPerKm <= min) return zone.zone;
    if (max !== null && min === null && paceMinPerKm >= max) return zone.zone;
  }
  return 'Z3';
}

export function aggregateHrTimeInZones(
  activities: ActivityAnalyticsRecord[],
  userMetrics: UserMetrics,
): ZoneSeconds {
  const totals = emptyZoneSeconds();

  for (const activity of activities) {
    const durationSec = activity.durationMin * 60;
    const zonesWithTime = activity.hrZones?.filter((z) => z.timeSec > 0) ?? [];

    if (zonesWithTime.length > 0) {
      for (const zone of zonesWithTime) {
        totals[zone.zone] += zone.timeSec;
      }
      continue;
    }

    if (activity.avgHR > 0) {
      const zone = classifyHeartRateZone(activity.avgHR, userMetrics) as ZoneId;
      if (ZONE_IDS.includes(zone)) {
        totals[zone] += durationSec;
      }
    }
  }

  return totals;
}

export function aggregatePaceTimeInZones(
  activities: ActivityAnalyticsRecord[],
  userMetrics: UserMetrics,
): ZoneSeconds {
  const totals = emptyZoneSeconds();
  const zones = userMetrics.paceZones?.length ? userMetrics.paceZones : DEFAULT_PACE_ZONES;

  for (const activity of activities) {
    const pace = parsePaceMinPerKm(activity.avgPace);
    if (!pace) continue;
    const zone = classifyPaceZone(pace, zones);
    totals[zone] += activity.durationMin * 60;
  }

  return totals;
}

function formatZoneDistribution(totals: ZoneSeconds, label: string): string {
  const totalSec = ZONE_IDS.reduce((s, z) => s + totals[z], 0);
  if (totalSec <= 0) return `${label}: bez dat`;

  const lines = ZONE_IDS.map((z) => {
    const min = Math.round(totals[z] / 60);
    const pct = Math.round((totals[z] / totalSec) * 100);
    return `${z}: ${min} min (${pct} %)`;
  });

  const z12 = totals.Z1 + totals.Z2;
  const z3 = totals.Z3;
  const z45 = totals.Z4 + totals.Z5;
  const polar = `Polarizace: Z1–Z2 ${Math.round((z12 / totalSec) * 100)} % | Z3 ${Math.round((z3 / totalSec) * 100)} % | Z4–Z5 ${Math.round((z45 / totalSec) * 100)} %`;

  return `${label}:\n  ${lines.join(' | ')}\n  ${polar}`;
}

function computeIntensityLoad(activity: ActivityAnalyticsRecord, userMetrics: UserMetrics): number {
  const duration = activity.durationMin;
  if (duration <= 0) return activity.distanceKm;

  const hrZones = aggregateHrTimeInZones([activity], userMetrics);
  const totalSec = ZONE_IDS.reduce((s, z) => s + hrZones[z], 0);
  if (totalSec > 0) {
    const weights: Record<ZoneId, number> = { Z1: 1, Z2: 1.5, Z3: 2.5, Z4: 4, Z5: 5 };
    let weighted = 0;
    for (const z of ZONE_IDS) {
      weighted += (hrZones[z] / totalSec) * weights[z] * duration;
    }
    return weighted;
  }

  const zone = classifyHeartRateZone(activity.avgHR, userMetrics);
  const zoneWeight: Record<string, number> = { Z1: 1, Z2: 1.5, Z3: 2.5, Z4: 4, Z5: 5, neznámá: 2 };
  return duration * (zoneWeight[zone] ?? 2);
}

const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  longrun: 'Longrun',
  tempo_threshold: 'Prahový/Tempo',
  intervals: 'Intervaly',
  hills: 'Kopce/Síla',
  race_simulation: 'Závod/Simulace',
  recovery_easy: 'Regenerace/Easy',
  other: 'Ostatní',
};

function formatWorkoutBreakdown(activities: ActivityAnalyticsRecord[], label: string): string {
  if (activities.length === 0) return `${label}: bez běhů`;

  const counts = new Map<WorkoutCategory, number>();
  for (const a of activities) {
    counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  }

  const total = activities.length;
  const lines = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => `${CATEGORY_LABELS[cat]}: ${count}× (${Math.round((count / total) * 100)} %)`);

  const totalKm = activities.reduce((s, a) => s + a.distanceKm, 0);
  return `${label} (${total} běhů, ${totalKm.toFixed(1)} km):\n  ${lines.join(' | ')}`;
}

function getPeriodActivities(
  days: Record<string, DayData>,
  periodDays: number,
  today = getTodayDate(),
): ActivityAnalyticsRecord[] {
  const from = formatDateKey(addDaysToDate(parseDate(today), -(periodDays - 1)));
  return collectActivitiesInRange(days, from, today);
}

function getWinterPeriodRange(today = getTodayDate()): { from: string; to: string; label: string } {
  const date = parseDate(today);
  const month = date.getMonth();
  const year = date.getFullYear();

  if (month >= 10 || month <= 2) {
    const winterStartYear = month <= 2 ? year - 1 : year;
    const from = `${winterStartYear}-11-01`;
    const to = month <= 2 ? today : `${year}-03-31`;
    return { from, to, label: 'Zimní příprava (lis–bře)' };
  }

  const from = formatDateKey(addDaysToDate(date, -89));
  return { from, to: today, label: 'Poslední 3 měsíce' };
}

function computeWeeklyLoads(
  activities: ActivityAnalyticsRecord[],
  userMetrics: UserMetrics,
  weekCount: number,
  today = getTodayDate(),
): { weekStart: string; km: number; load: number; highIntensityMin: number }[] {
  const weeks: { weekStart: string; km: number; load: number; highIntensityMin: number }[] = [];

  for (let i = weekCount - 1; i >= 0; i--) {
    const anchor = addDaysToDate(parseDate(today), -i * 7);
    const weekDates = getWeekDays(anchor);
    const weekStart = weekDates[0];
    const weekSet = new Set(weekDates);
    const weekActs = activities.filter((a) => weekSet.has(a.date));

    const km = weekActs.reduce((s, a) => s + a.distanceKm, 0);
    const load = weekActs.reduce((s, a) => s + computeIntensityLoad(a, userMetrics), 0);
    const hrTotals = aggregateHrTimeInZones(weekActs, userMetrics);
    const highIntensityMin = Math.round((hrTotals.Z4 + hrTotals.Z5) / 60);

    weeks.push({
      weekStart,
      km: Math.round(km * 10) / 10,
      load: Math.round(load),
      highIntensityMin,
    });
  }

  return weeks;
}

export function buildTimeInZonesReport(
  days: Record<string, DayData>,
  userMetrics: UserMetrics,
): string {
  const today = getTodayDate();
  const periods = [
    { label: 'Poslední týden', days: 7 },
    { label: 'Poslední 4 týdny', days: 28 },
  ];
  const winter = getWinterPeriodRange(today);
  const winterActs = collectActivitiesInRange(days, winter.from, winter.to);

  const blocks: string[] = ['## Distribuce času v zónách (Time in Zones)'];

  for (const period of periods) {
    const acts = getPeriodActivities(days, period.days, today);
    if (acts.length === 0) {
      blocks.push(`\n### ${period.label}\nBez Strava dat.`);
      continue;
    }
    const hr = aggregateHrTimeInZones(acts, userMetrics);
    const pace = aggregatePaceTimeInZones(acts, userMetrics);
    blocks.push(
      `\n### ${period.label}`,
      `**TF zóny (Strava/odhad):**\n${formatZoneDistribution(hr, '  ')}`,
      `**Tempo zóny (průměrné tempo běhu):**\n${formatZoneDistribution(pace, '  ')}`,
    );
  }

  if (winterActs.length > 0) {
    const hr = aggregateHrTimeInZones(winterActs, userMetrics);
    const pace = aggregatePaceTimeInZones(winterActs, userMetrics);
    blocks.push(
      `\n### ${winter.label}`,
      `**TF zóny:**\n${formatZoneDistribution(hr, '  ')}`,
      `**Tempo zóny:**\n${formatZoneDistribution(pace, '  ')}`,
    );
  } else {
    blocks.push(`\n### ${winter.label}\nBez Strava dat v tomto období.`);
  }

  blocks.push(
    '\nPři hodnocení struktury tréninku cituj konkrétní % Z1–Z2 vs Z3–Z5 z řádků Polarizace výše. Vyhodnocuj polarizaci (cíl ~80/20): vysoký podíl Z1–Z2 v objemové/zimní fázi je správně; nadprahová VO2max objem mimo specifickou fázi kritizuj.',
  );

  return blocks.join('\n');
}

export function buildWorkoutDistributionAndTrendsReport(
  days: Record<string, DayData>,
  userMetrics: UserMetrics,
): string {
  const today = getTodayDate();
  const allActs = collectActivitiesInRange(
    days,
    formatDateKey(addDaysToDate(parseDate(today), -89)),
    today,
  );

  const week1 = getPeriodActivities(days, 7, today);
  const week4 = getPeriodActivities(days, 28, today);
  const winter = getWinterPeriodRange(today);
  const winterActs = collectActivitiesInRange(days, winter.from, winter.to);

  const weeklyTrends = computeWeeklyLoads(allActs, userMetrics, 8, today);
  const trendLines = weeklyTrends.map(
    (w) =>
      `- Týden ${w.weekStart}: ${w.km} km | load ${w.load} | Z4–Z5 ${w.highIntensityMin} min`,
  );

  const acuteLoad = week1.reduce((s, a) => s + computeIntensityLoad(a, userMetrics), 0);
  const chronicActs = getPeriodActivities(days, 28, today);
  const chronicWeekly =
    chronicActs.length > 0
      ? chronicActs.reduce((s, a) => s + computeIntensityLoad(a, userMetrics), 0) / 4
      : 0;
  const acwr = chronicWeekly > 0 ? (acuteLoad / chronicWeekly).toFixed(2) : 'N/A';

  let wowKm = 'N/A';
  if (weeklyTrends.length >= 2) {
    const prev = weeklyTrends[weeklyTrends.length - 2].km;
    const curr = weeklyTrends[weeklyTrends.length - 1].km;
    if (prev > 0) wowKm = `${Math.round(((curr - prev) / prev) * 100)} %`;
  }

  return `## Skladba tréninků a trendy zátěže

### Rozložení typů tréninků
${formatWorkoutBreakdown(week1, 'Poslední týden')}
${formatWorkoutBreakdown(week4, 'Poslední 4 týdny')}
${winterActs.length > 0 ? formatWorkoutBreakdown(winterActs, winter.label) : `${winter.label}: bez dat`}

### Mezitýdenní trend (posledních 8 týdnů)
${trendLines.join('\n')}

### Acute vs. Chronic workload
- Akutní zátěž (7 dní): ${Math.round(acuteLoad)} load units | ${week1.reduce((s, a) => s + a.distanceKm, 0).toFixed(1)} km
- Chronická zátěž (průměr 4 týdnů): ${Math.round(chronicWeekly)} load units/týden
- **ACWR poměr:** ${acwr} ${Number(acwr) > 1.3 ? '⚠ riziko přetížení' : Number(acwr) < 0.8 ? '⚠ podstimulace' : ''}
- Mezitýdenní změna km (poslední vs. předchozí týden): ${wowKm}`;
}

export function buildRecentStravaRunsDetail(
  days: Record<string, DayData>,
  lastDays = 14,
  userMetrics?: UserMetrics,
): string {
  const today = getTodayDate();
  const from = formatDateKey(addDaysToDate(parseDate(today), -(lastDays - 1)));
  const lines: string[] = [];

  for (const [date, rawDay] of Object.entries(days)) {
    if (date < from || date > today) continue;
    const day = normalizeDayData(rawDay);
    for (const activity of getActivities(day)) {
      if (activity.distanceKm <= 0 && activityDurationMin(activity) <= 0) continue;
      const enriched = userMetrics ? enrichActivityMetrics(activity, userMetrics) : activity;
      const hrZone =
        userMetrics && enriched.avgHR > 0
          ? classifyHeartRateZone(enriched.avgHR, userMetrics)
          : '?';
      const hrDetail =
        enriched.hrZones?.filter((z) => z.timeSec > 0)
          .map((z) => `${z.zone} ${z.percent}%`)
          .join(', ') ?? null;
      const loadExtras =
        userMetrics && (enriched.tss || enriched.elevationGainM)
          ? ` | ${formatActivityLoadLine(enriched, userMetrics)}`
          : '';
      const obNote =
        userMetrics && isObOrKrosTerrain(enriched.terrainType)
          ? ' | ⚠ OB/Kros – nehodnotit dle plochého tempa'
          : '';

      lines.push(`- **${date} (${formatCzechWeekday(date)})** | ${enriched.title} (${CATEGORY_LABELS[classifyWorkoutCategory(enriched)]})
  TF ${enriched.avgHR || '?'} (${hrZone})${hrDetail ? ` | zóny: ${hrDetail}` : ''}${loadExtras}${obNote}`);
    }
  }

  lines.sort((a, b) => a.localeCompare(b));

  if (lines.length === 0) {
    return `## Přesný přehled odbehaných běhů (posledních ${lastDays} dní)
Žádné synchronizované běhy – AI nemá data o včerejšku ani minulých dnech.`;
  }

  return `## Přesný přehled odbehaných běhů ze Stravy (posledních ${lastDays} dní)
Použij pro kontrolu včerejška, středy a dalších dnů – referuj český den. U OB/krosu hodnot TSS, +m a TF, ne ploché tempo.

${lines.join('\n')}`;
}

export function buildCoachingAnalyticsSummary(
  days: Record<string, DayData>,
  userMetrics: UserMetrics,
): string {
  return [
    buildTimeInZonesReport(days, userMetrics),
    buildWorkoutDistributionAndTrendsReport(days, userMetrics),
  ].join('\n\n');
}
