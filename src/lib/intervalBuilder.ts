import type { WorkoutInterval } from '../types/training';

export function createDefaultInterval(): WorkoutInterval {
  return {
    repetitions: 6,
    segmentValue: 1000,
    segmentUnit: 'm',
    targetPace: '3:45',
    recoveryValue: 2,
    recoveryUnit: 'min',
  };
}

function formatSegmentLength(interval: WorkoutInterval): string {
  const { segmentValue, segmentUnit } = interval;
  if (segmentUnit === 'm') {
    return segmentValue >= 1000 ? `${segmentValue / 1000}km` : `${segmentValue}m`;
  }
  if (segmentUnit === 'km') return `${segmentValue} km`;
  return `${segmentValue} min`;
}

function formatRecovery(interval: WorkoutInterval): string | null {
  if (!interval.recoveryValue || !interval.recoveryUnit) return null;
  const { recoveryValue, recoveryUnit } = interval;
  if (recoveryUnit === 'min') return `${recoveryValue} min`;
  if (recoveryUnit === 'm') {
    return recoveryValue >= 1000 ? `${recoveryValue / 1000} km` : `${recoveryValue} m`;
  }
  return `${recoveryValue} km`;
}

function formatTarget(interval: WorkoutInterval): string {
  if (interval.targetPace?.trim()) return `@ ${interval.targetPace} min/km`;
  if (interval.targetZone) return `@ ${interval.targetZone}`;
  return '';
}

export function buildIntervalTitle(interval: WorkoutInterval): string {
  const segment = formatSegmentLength(interval);
  const target = formatTarget(interval);
  const recovery = formatRecovery(interval);
  const base = `Intervaly: ${interval.repetitions}x ${segment}${target ? ` ${target}` : ''}`;
  return recovery ? `${base} (pauza ${recovery})` : base;
}

export function buildIntervalDescription(interval: WorkoutInterval): string {
  const segment = formatSegmentLength(interval);
  const target = interval.targetPace
    ? `tempo ${interval.targetPace} min/km`
    : interval.targetZone
      ? `zóna ${interval.targetZone}`
      : 'volné tempo';
  const recovery = formatRecovery(interval);
  const recoveryPart = recovery ? ` Mezi opakováními pauza ${recovery}.` : '';
  return `${interval.repetitions}× ${segment} v ${target}.${recoveryPart}`;
}

export function estimateIntervalDistanceKm(interval: WorkoutInterval): number {
  let segmentKm = 0;
  if (interval.segmentUnit === 'm') segmentKm = interval.segmentValue / 1000;
  else if (interval.segmentUnit === 'km') segmentKm = interval.segmentValue;
  else segmentKm = 0.3; // rough estimate for time-based segments

  return Math.round(interval.repetitions * segmentKm * 10) / 10;
}
