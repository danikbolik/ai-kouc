import { getDaysUntilDate, getTodayDate, getTrainingPhaseLabel } from './dates';
import type { UserMetrics } from '../types/settings';
import { formatPaceZoneForDisplay } from '../types/settings';

/** Odvozené tepové zóny Z1–Z5 z profilu sportovce */
export function buildHrZonesContext(userMetrics: UserMetrics): string {
  const max = userMetrics.HRmax;
  const aet = userMetrics.AeT ?? Math.round(max * 0.75);
  const anp = userMetrics.ANP;
  const z1Max = Math.round(max * 0.65);
  const z4Max = Math.round(max * 0.95);

  return [
    'Tepové zóny (VYHODNOCUJ KAŽDÝ BĚH STRIKTNĚ PODLE TĚCHTO HRANIC – ne obecných tabulek):',
    `  Z1 regenerace/easy: TF ≤ ${z1Max} bpm`,
    `  Z2 aerobní objem: ${z1Max + 1}–${aet} bpm`,
    `  Z3 střední/intenzita: ${aet + 1}–${anp} bpm`,
    `  Z4 prahová/závodní: ${anp + 1}–${z4Max} bpm`,
    `  Z5 VO2max/sprint: > ${z4Max} bpm`,
    `  Referenční prahy: AeT ${aet} bpm | ANP/LT ${anp} bpm | TFmax ${max} bpm`,
  ].join('\n');
}

export function classifyHeartRateZone(hr: number, userMetrics: UserMetrics): string {
  if (hr <= 0) return 'neznámá';
  const max = userMetrics.HRmax;
  const aet = userMetrics.AeT ?? Math.round(max * 0.75);
  const anp = userMetrics.ANP;
  const z1Max = Math.round(max * 0.65);
  const z4Max = Math.round(max * 0.95);

  if (hr <= z1Max) return 'Z1';
  if (hr <= aet) return 'Z2';
  if (hr <= anp) return 'Z3';
  if (hr <= z4Max) return 'Z4';
  return 'Z5';
}

export function buildEnhancedAthleteProfile(userMetrics: UserMetrics): string {
  const today = getTodayDate();
  const paceZoneLines =
    userMetrics.paceZones?.map(
      (zone) => `  ${zone.zone}: ${formatPaceZoneForDisplay(zone)} min/km`,
    ) ?? [];

  const daysToRace =
    userMetrics.raceDate && userMetrics.raceDate >= today
      ? getDaysUntilDate(today, userMetrics.raceDate)
      : null;

  return [
    `HRmax: ${userMetrics.HRmax} bpm`,
    userMetrics.AeT !== undefined ? `Aerobní práh (AeT): ${userMetrics.AeT} bpm` : null,
    `Anaerobní práh (ANP/LT): ${userMetrics.ANP} bpm`,
    buildHrZonesContext(userMetrics),
    paceZoneLines.length > 0
      ? `Tempové zóny (min/km):\n${paceZoneLines.join('\n')}`
      : null,
    '',
    '## Cíle a periodizace',
    `Cílový závod: ${userMetrics.targetRace}`,
    userMetrics.raceDate ? `Datum závodu: ${userMetrics.raceDate}` : null,
    daysToRace !== null ? `Do závodu: ${daysToRace} dní` : null,
    userMetrics.raceDistanceKm !== undefined
      ? `Vzdálenost závodu: ${userMetrics.raceDistanceKm} km`
      : null,
    `Aktuální tréninková fáze/blok: ${getTrainingPhaseLabel(today)}`,
  ]
    .filter((line) => line !== null && line !== '')
    .join('\n');
}
