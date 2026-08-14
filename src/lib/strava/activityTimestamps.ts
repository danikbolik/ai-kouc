import { getActivities, normalizeDayData } from '@/lib/dayData';
import type { DayData } from '@/types/training';

/** Unix timestamp (s) nejnovější Strava aktivity uložené v kalendáři. */
export function getLastStravaActivityUnix(
  days: Record<string, DayData>,
): number | null {
  let max: number | null = null;

  for (const day of Object.values(days)) {
    for (const activity of getActivities(normalizeDayData(day))) {
      if (activity.stravaStartAt == null) continue;
      if (max === null || activity.stravaStartAt > max) {
        max = activity.stravaStartAt;
      }
    }
  }

  return max;
}

export function stravaStartDateToUnix(startDateLocal: string): number {
  return Math.floor(new Date(startDateLocal).getTime() / 1000);
}
