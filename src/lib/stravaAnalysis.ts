import { formatDurationFromSeconds } from '@/lib/strava';
import type { WorkoutSession } from '@/types/training';

/** Formátuje Strava mezičasy a tepové zóny pro AI kontext */
export function formatStravaActualDetailsForAi(
  actual: NonNullable<WorkoutSession['actual']>,
): string {
  const parts: string[] = [];

  if (actual.hrZones?.length) {
    const activeZones = actual.hrZones.filter((zone) => zone.timeSec > 0);
    if (activeZones.length > 0) {
      const zoneText = activeZones
        .map(
          (zone) =>
            `${zone.zone} (${zone.minHR}-${zone.maxHR} bpm): ${zone.percent}% / ${formatDurationFromSeconds(zone.timeSec)}`,
        )
        .join(', ');
      parts.push(`Tepové zóny: ${zoneText}`);
    }
  }

  if (actual.laps?.length) {
    const lapText = actual.laps
      .map((lap) => {
        const hrPart = lap.avgHR > 0 ? `, TF ${lap.avgHR}` : '';
        return `${lap.label}: ${lap.pace}/km (${lap.distanceKm} km${hrPart})`;
      })
      .join('; ');
    parts.push(`Mezičasy: ${lapText}`);
  }

  return parts.join('. ');
}

/** Krátké shrnutí pro rychlý AI přehled (např. "80 % v Z2, 2. km @ 4:15") */
export function summarizeStravaActualForAi(
  actual: NonNullable<WorkoutSession['actual']>,
): string | null {
  const snippets: string[] = [];

  if (actual.hrZones?.length) {
    const dominant = [...actual.hrZones]
      .filter((zone) => zone.timeSec > 0)
      .sort((a, b) => b.percent - a.percent)[0];

    if (dominant) {
      snippets.push(`sportovec strávil ${dominant.percent} % času v ${dominant.zone}`);
    }
  }

  const secondKm = actual.laps?.find((lap) => lap.index === 2);
  if (secondKm) {
    snippets.push(`${secondKm.label} byl v tempu ${secondKm.pace}/km`);
  }

  return snippets.length > 0 ? snippets.join(', ') : null;
}
