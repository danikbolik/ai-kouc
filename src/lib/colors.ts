import type { ActivityType, WorkoutSession } from '../types/training';

/** Stav shody plánovaného vs. skutečného tréninku */
export type MatchStatus = 'match' | 'partial' | 'miss';

export interface ActivityColorClasses {
  background: string;
  text: string;
  border: string;
  indicator: string;
}

export interface MatchIndicatorClasses {
  background: string;
  text: string;
  border: string;
  dot: string;
}

const ACTIVITY_COLORS: Record<ActivityType, ActivityColorClasses> = {
  klus: {
    background: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
    indicator: 'bg-emerald-500',
  },
  longrun: {
    background: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
    indicator: 'bg-emerald-500',
  },
  tempo: {
    background: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-300',
    indicator: 'bg-amber-500',
  },
  intervals: {
    background: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-300',
    indicator: 'bg-amber-500',
  },
  strength: {
    background: 'bg-sky-50',
    text: 'text-sky-900',
    border: 'border-sky-300',
    indicator: 'bg-sky-500',
  },
  mobility: {
    background: 'bg-purple-50',
    text: 'text-purple-900',
    border: 'border-purple-300',
    indicator: 'bg-purple-500',
  },
  rest: {
    background: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-300',
    indicator: 'bg-slate-500',
  },
  race: {
    background: 'bg-rose-50',
    text: 'text-rose-900',
    border: 'border-rose-300',
    indicator: 'bg-rose-500',
  },
};

const MATCH_INDICATOR_COLORS: Record<MatchStatus, MatchIndicatorClasses> = {
  match: {
    background: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-500',
    dot: 'bg-green-500',
  },
  partial: {
    background: 'bg-yellow-100',
    text: 'text-yellow-700',
    border: 'border-yellow-500',
    dot: 'bg-yellow-500',
  },
  miss: {
    background: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-500',
    dot: 'bg-red-500',
  },
};

/** Vrátí Tailwind třídy pro daný typ aktivity */
export function getActivityColors(type: ActivityType): ActivityColorClasses {
  return ACTIVITY_COLORS[type];
}

/** Vrátí Tailwind třídy pro indikátor shody planned vs. actual */
export function getMatchIndicatorColors(
  status: MatchStatus,
): MatchIndicatorClasses {
  return MATCH_INDICATOR_COLORS[status];
}

/** Složí třídy karty aktivity do jednoho řetězce */
export function activityCardClassName(type: ActivityType): string {
  const { background, text, border } = getActivityColors(type);
  return `${background} ${text} ${border} border`;
}

/** Vrátí CSS třídy z activity-theme.css pro daný typ aktivity */
export function getActivityCssClasses(type: ActivityType): {
  root: string;
  background: string;
  text: string;
  border: string;
  indicator: string;
} {
  return {
    root: `activity-${type}`,
    background: `activity-${type}-bg`,
    text: `activity-${type}-text`,
    border: `activity-${type}-border`,
    indicator: `activity-${type}-indicator`,
  };
}

/** Vrátí CSS třídy indikátoru shody z activity-theme.css */
export function getMatchCssClasses(status: MatchStatus): {
  background: string;
  text: string;
  border: string;
  dot: string;
} {
  const suffix = status === 'match' ? 'good' : status;
  return {
    background: `match-${suffix}-bg`,
    text: `match-${suffix}-text`,
    border: `match-${suffix}-border`,
    dot: `match-${suffix}-dot`,
  };
}

function parsePace(pace: string | undefined): number | undefined {
  if (!pace || pace === '—') return undefined;
  const parts = pace.split(':');
  if (parts.length === 2) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    if (!Number.isNaN(minutes) && !Number.isNaN(seconds)) {
      return minutes + seconds / 60;
    }
  }
  const numeric = Number(pace);
  return Number.isNaN(numeric) ? undefined : numeric;
}

function metricDeviation(
  planned: number | undefined,
  actual: number | undefined,
  toleranceRatio: number,
): MatchStatus | undefined {
  if (planned === undefined || actual === undefined) return undefined;
  if (planned === 0) return actual === 0 ? 'match' : 'miss';

  const ratio = Math.abs(actual - planned) / planned;
  if (ratio <= toleranceRatio) return 'match';
  if (ratio <= toleranceRatio * 2) return 'partial';
  return 'miss';
}

/**
 * Vyhodnotí shodu plánovaného a skutečného tréninku pro jednu session.
 * Vrací null pro budoucí dny nebo dnešek bez actual dat.
 */
export function computeSessionMatchStatus(
  session: WorkoutSession,
  date: string,
  today: string,
): MatchStatus | null {
  if (date > today) return null;
  if (date === today && !session.actual) return null;

  if (session.type === 'rest') return 'match';
  if (!session.actual) return 'miss';

  const statuses: MatchStatus[] = [];

  const distanceStatus = metricDeviation(
    session.planned.distanceKm,
    session.actual.distanceKm,
    0.1,
  );
  if (distanceStatus) statuses.push(distanceStatus);

  const plannedPace = parsePace(session.planned.targetPace);
  const actualPace = parsePace(session.actual.avgPace);
  const paceStatus = metricDeviation(plannedPace, actualPace, 0.05);
  if (paceStatus) statuses.push(paceStatus);

  const hrStatus = metricDeviation(
    session.planned.targetHR,
    session.actual.avgHR,
    0.05,
  );
  if (hrStatus) statuses.push(hrStatus);

  if (statuses.length === 0) return 'match';
  if (statuses.includes('miss')) return 'miss';
  if (statuses.includes('partial')) return 'partial';
  return 'match';
}

const MATCH_EMOJI: Record<MatchStatus, string> = {
  match: '🟢',
  partial: '🟡',
  miss: '🔴',
};

export function getMatchEmoji(status: MatchStatus): string {
  return MATCH_EMOJI[status];
}
