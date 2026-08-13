import type { ActivityType, PlannedWorkout, RaceDetails, RaceType, WarmCoolSegment } from '../types/training';

export const RACE_TYPE_OPTIONS: { value: RaceType; label: string }[] = [
  { value: 'ob', label: 'OB (Orientační běh)' },
  { value: 'kros', label: 'Kros (Přespolní běh)' },
  { value: 'track_road', label: 'Dráha / Silnice' },
];

export function needsWarmUpCoolDown(type: ActivityType): boolean {
  return type === 'intervals' || type === 'tempo' || type === 'race';
}

export function formatWarmCoolSegment(label: string, segment?: WarmCoolSegment): string | null {
  if (!segment?.value || segment.value <= 0) return null;
  const unitLabel = segment.unit === 'km' ? 'km' : 'min';
  return `${label}: ${segment.value} ${unitLabel}`;
}

export function formatRaceDetailsForAi(details?: RaceDetails): string | null {
  if (!details) return null;

  const parts: string[] = [];
  if (details.durationMin && details.durationMin > 0) {
    parts.push(`trvání ~${details.durationMin} min`);
  }
  if (details.distanceValue && details.distanceValue > 0) {
    parts.push(`vzdálenost ${details.distanceValue} ${details.distanceUnit ?? 'km'}`);
  }
  if (details.raceType) {
    const label = RACE_TYPE_OPTIONS.find((o) => o.value === details.raceType)?.label ?? details.raceType;
    parts.push(`typ: ${label}`);
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

export function formatWorkoutExtrasForAi(workout: Pick<PlannedWorkout, 'warmUp' | 'coolDown' | 'raceDetails'>): string {
  const parts = [
    formatWarmCoolSegment('rozklus', workout.warmUp),
    formatWarmCoolSegment('výklus', workout.coolDown),
    workout.raceDetails ? formatRaceDetailsForAi(workout.raceDetails) : null,
  ].filter(Boolean);

  return parts.length > 0 ? ` | ${parts.join(' | ')}` : '';
}
