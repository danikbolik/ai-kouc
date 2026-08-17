import type { PlannedWorkout, StravaLapSummary, WarmCoolSegment, WorkoutInterval } from '@/types/training';

export type SegmentKind = 'warmup' | 'main' | 'work' | 'recovery' | 'cooldown';

export type SegmentMatchStatus = 'match' | 'partial' | 'miss' | 'ok' | 'na';

export interface PlannedSegment {
  id: string;
  label: string;
  kind: SegmentKind;
  plannedDistanceKm?: number;
  plannedDurationMin?: number;
  plannedPace?: string;
  plannedDescription?: string;
}

export interface SegmentComparisonRow {
  id: string;
  label: string;
  kind: SegmentKind;
  plannedText: string;
  actualText: string;
  status: SegmentMatchStatus;
  statusLabel: string;
}

export interface WorkoutPaceBreakdown {
  warmUpPace?: string;
  mainPace?: string;
  coolDownPace?: string;
  overallPace?: string;
}

const PACE_MATCH_TOLERANCE_SEC = 8;
const PACE_PARTIAL_TOLERANCE_SEC = 20;

export function paceToSecPerKm(pace: string): number | null {
  const match = pace.trim().match(/^(\d+):(\d{1,2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatPaceSecPerKm(secPerKm: number): string {
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function inferEasyPace(mainPace?: string): string {
  const mainSec = mainPace ? paceToSecPerKm(mainPace) : null;
  if (mainSec != null) return formatPaceSecPerKm(mainSec + 75);
  return '5:30';
}

function formatWarmCoolPlanned(label: string, segment?: WarmCoolSegment, easyPace?: string): string {
  if (!segment?.value) return '—';
  const pacePart = easyPace ? ` @ ${easyPace}` : '';
  if (segment.unit === 'km') return `${segment.value} km${pacePart}`;
  return `${segment.value} min${pacePart}`;
}

function formatIntervalSegmentPlanned(interval: WorkoutInterval, repIndex: number): string {
  const dist =
    interval.segmentUnit === 'km'
      ? `${interval.segmentValue} km`
      : interval.segmentUnit === 'm'
        ? interval.segmentValue >= 1000
          ? `${interval.segmentValue / 1000} km`
          : `${interval.segmentValue} m`
        : `${interval.segmentValue} min`;

  const pacePart = interval.targetPace ? ` @ ${interval.targetPace}` : '';
  return `${dist}${pacePart}${interval.repetitions > 1 ? ` (opak. ${repIndex}/${interval.repetitions})` : ''}`;
}

function formatRecoveryPlanned(interval: WorkoutInterval): string {
  if (!interval.recoveryValue) return '—';
  if (interval.recoveryUnit === 'min') return `${interval.recoveryValue} min meziklus`;
  if (interval.recoveryUnit === 'm') {
    return interval.recoveryValue >= 1000
      ? `${interval.recoveryValue / 1000} km meziklus`
      : `${interval.recoveryValue} m meziklus`;
  }
  return `${interval.recoveryValue} km meziklus`;
}

function formatLapActual(lap: StravaLapSummary): string {
  const dist = `${lap.distanceKm} km`;
  const pace = lap.pace && lap.pace !== '—' ? ` @ ${lap.pace}` : '';
  return `${dist}${pace}`;
}

function comparePace(
  plannedPace: string | undefined,
  actualPace: string | undefined,
  kind: SegmentKind,
): { status: SegmentMatchStatus; statusLabel: string } {
  if (!plannedPace || !actualPace || actualPace === '—') {
    return { status: 'na', statusLabel: '—' };
  }

  const plannedSec = paceToSecPerKm(plannedPace);
  const actualSec = paceToSecPerKm(actualPace);
  if (plannedSec == null || actualSec == null) {
    return { status: 'na', statusLabel: '—' };
  }

  const delta = actualSec - plannedSec;

  if (kind === 'recovery' || kind === 'warmup' || kind === 'cooldown') {
    if (delta <= PACE_PARTIAL_TOLERANCE_SEC) {
      return { status: 'ok', statusLabel: 'OK' };
    }
    return { status: 'partial', statusLabel: 'Odchylka' };
  }

  if (Math.abs(delta) <= PACE_MATCH_TOLERANCE_SEC) {
    return { status: 'match', statusLabel: 'Splněno' };
  }
  if (delta <= PACE_PARTIAL_TOLERANCE_SEC) {
    return { status: 'partial', statusLabel: 'Odchylka' };
  }
  if (delta > 0) {
    return { status: 'miss', statusLabel: 'Pomalejší' };
  }
  return { status: 'match', statusLabel: 'Splněno' };
}

function compareDistance(
  plannedKm: number | undefined,
  actualKm: number,
  toleranceRatio = 0.12,
): boolean {
  if (!plannedKm || plannedKm <= 0) return true;
  return Math.abs(actualKm - plannedKm) / plannedKm <= toleranceRatio;
}

/** Sestaví plánované segmenty tréninku (rozklus → motiv → výklus / intervaly). */
export function buildPlannedSegments(workout: PlannedWorkout): PlannedSegment[] {
  const easyPace = inferEasyPace(workout.targetPace);
  const segments: PlannedSegment[] = [];

  if (workout.warmUp?.value) {
    segments.push({
      id: 'warmup',
      label: 'Rozklus',
      kind: 'warmup',
      plannedDistanceKm: workout.warmUp.unit === 'km' ? workout.warmUp.value : undefined,
      plannedDurationMin: workout.warmUp.unit === 'min' ? workout.warmUp.value : undefined,
      plannedPace: easyPace,
      plannedDescription: formatWarmCoolPlanned('Rozklus', workout.warmUp, easyPace),
    });
  }

  if (workout.intervals?.length) {
    let workIndex = 0;
    for (const interval of workout.intervals) {
      for (let rep = 0; rep < interval.repetitions; rep++) {
        workIndex += 1;
        const distKm =
          interval.segmentUnit === 'km'
            ? interval.segmentValue
            : interval.segmentUnit === 'm'
              ? interval.segmentValue / 1000
              : undefined;

        segments.push({
          id: `work-${workIndex}`,
          label: `Úsek ${workIndex}`,
          kind: 'work',
          plannedDistanceKm: distKm,
          plannedPace: interval.targetPace,
          plannedDescription: formatIntervalSegmentPlanned(interval, rep + 1),
        });

        if (interval.recoveryValue && rep < interval.repetitions - 1) {
          segments.push({
            id: `recovery-${workIndex}`,
            label: 'Pauza',
            kind: 'recovery',
            plannedDurationMin: interval.recoveryUnit === 'min' ? interval.recoveryValue : undefined,
            plannedDescription: formatRecoveryPlanned(interval),
          });
        }
      }
    }
  } else if (workout.distanceKm || workout.targetPace) {
    segments.push({
      id: 'main',
      label: 'Hlavní motiv',
      kind: 'main',
      plannedDistanceKm: workout.distanceKm,
      plannedPace: workout.targetPace,
      plannedDescription: [
        workout.distanceKm ? `${workout.distanceKm} km` : null,
        workout.targetPace ? `@ ${workout.targetPace}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  if (workout.coolDown?.value) {
    segments.push({
      id: 'cooldown',
      label: 'Výklus',
      kind: 'cooldown',
      plannedDistanceKm: workout.coolDown.unit === 'km' ? workout.coolDown.value : undefined,
      plannedDurationMin: workout.coolDown.unit === 'min' ? workout.coolDown.value : undefined,
      plannedPace: easyPace,
      plannedDescription: formatWarmCoolPlanned('Výklus', workout.coolDown, easyPace),
    });
  }

  return segments;
}

function isRecoveryLap(lap: StravaLapSummary, targetWorkPace?: string): boolean {
  const lapSec = paceToSecPerKm(lap.pace);
  const targetSec = targetWorkPace ? paceToSecPerKm(targetWorkPace) : null;
  if (lapSec == null) return false;
  if (targetSec != null && lapSec > targetSec + 45) return true;
  return lap.distanceKm < 0.4 && lapSec > 330;
}

/** Porovná plánované segmenty s lapy ze Stravy. */
export function comparePlannedSegmentsToLaps(
  planned: PlannedSegment[],
  laps: StravaLapSummary[] | undefined,
): SegmentComparisonRow[] {
  if (planned.length === 0) return [];

  if (!laps?.length) {
    return planned.map((segment) => ({
      id: segment.id,
      label: segment.label,
      kind: segment.kind,
      plannedText: segment.plannedDescription ?? '—',
      actualText: '—',
      status: 'na',
      statusLabel: 'Bez dat',
    }));
  }

  let lapIndex = 0;
  const rows: SegmentComparisonRow[] = [];
  let lastWorkPace: string | undefined;

  for (const segment of planned) {
    if (segment.kind === 'recovery') {
      const lap = laps[lapIndex];
      if (lap && isRecoveryLap(lap, lastWorkPace)) {
        const recoveryText =
          lap.durationSec > 0
            ? `${Math.round(lap.durationSec / 60)} min @ ${lap.pace}`
            : formatLapActual(lap);
        rows.push({
          id: segment.id,
          label: segment.label,
          kind: segment.kind,
          plannedText: segment.plannedDescription ?? '—',
          actualText: recoveryText,
          status: 'ok',
          statusLabel: 'OK',
        });
        lapIndex += 1;
      } else {
        rows.push({
          id: segment.id,
          label: segment.label,
          kind: segment.kind,
          plannedText: segment.plannedDescription ?? '—',
          actualText: '—',
          status: 'na',
          statusLabel: 'Bez dat',
        });
      }
      continue;
    }

    const lap = laps[lapIndex];
    if (!lap) {
      rows.push({
        id: segment.id,
        label: segment.label,
        kind: segment.kind,
        plannedText: segment.plannedDescription ?? '—',
        actualText: '—',
        status: 'na',
        statusLabel: 'Bez dat',
      });
      continue;
    }

    const { status, statusLabel } = comparePace(segment.plannedPace, lap.pace, segment.kind);
    const distanceOk = compareDistance(segment.plannedDistanceKm, lap.distanceKm);
    const finalStatus: SegmentMatchStatus =
      status === 'match' && !distanceOk ? 'partial' : status;
    const finalLabel =
      finalStatus === 'partial' && status === 'match' ? 'Odchylka vzdálenosti' : statusLabel;

    if (segment.kind === 'work' || segment.kind === 'main') {
      lastWorkPace = lap.pace;
    }

    rows.push({
      id: segment.id,
      label: segment.label,
      kind: segment.kind,
      plannedText: segment.plannedDescription ?? '—',
      actualText: formatLapActual(lap),
      status: finalStatus,
      statusLabel: finalLabel,
    });

    lapIndex += 1;
  }

  return rows;
}

/** Průměrné tempo hlavního motivu – bez rozklusu a výklusu. */
export function computeMainSetPaceFromLaps(
  workout: PlannedWorkout,
  laps: StravaLapSummary[] | undefined,
): string | null {
  if (!laps?.length) return null;

  const warmSkip = workout.warmUp?.value ? 1 : 0;
  const coolSkip = workout.coolDown?.value ? 1 : 0;
  let slice = laps.slice(warmSkip, laps.length - coolSkip || undefined);

  if (workout.intervals?.length) {
    const targetPace = workout.intervals[0]?.targetPace;
    slice = slice.filter((lap) => !isRecoveryLap(lap, targetPace));
  }

  if (slice.length === 0) return null;

  let totalDist = 0;
  let totalTime = 0;
  for (const lap of slice) {
    if (lap.distanceKm <= 0 || lap.durationSec <= 0) continue;
    totalDist += lap.distanceKm;
    totalTime += lap.durationSec;
  }

  if (totalDist <= 0) return null;
  return formatPaceSecPerKm(totalTime / totalDist);
}

export function computeWorkoutPaceBreakdown(
  workout: PlannedWorkout,
  laps: StravaLapSummary[] | undefined,
  overallPace?: string,
): WorkoutPaceBreakdown {
  const warmIdx = workout.warmUp?.value ? 0 : -1;
  const coolIdx = workout.coolDown?.value && laps?.length ? laps.length - 1 : -1;

  return {
    warmUpPace: warmIdx >= 0 ? laps?.[warmIdx]?.pace : undefined,
    mainPace: computeMainSetPaceFromLaps(workout, laps) ?? undefined,
    coolDownPace: coolIdx >= 0 ? laps?.[coolIdx]?.pace : undefined,
    overallPace,
  };
}

export function getSegmentStatusClasses(status: SegmentMatchStatus): string {
  switch (status) {
    case 'match':
    case 'ok':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
    case 'partial':
      return 'bg-amber-50 text-amber-900 ring-amber-200';
    case 'miss':
      return 'bg-red-50 text-red-800 ring-red-200';
    default:
      return 'bg-slate-50 text-slate-600 ring-slate-200';
  }
}
