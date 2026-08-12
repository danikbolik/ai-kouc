export type ActivityType =

  | 'klus'

  | 'tempo'

  | 'intervals'

  | 'longrun'

  | 'strength'

  | 'mobility'

  | 'rest'

  | 'race';



export type PaceZoneId = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';



export type IntervalSegmentUnit = 'm' | 'km' | 'min';

export type IntervalRecoveryUnit = 'min' | 'm' | 'km';



/** Strukturovaný interval pro builder */

export interface WorkoutInterval {

  repetitions: number;

  segmentValue: number;

  segmentUnit: IntervalSegmentUnit;

  targetPace?: string;

  targetZone?: PaceZoneId;

  recoveryValue?: number;

  recoveryUnit?: IntervalRecoveryUnit;

}



export interface StravaLapSummary {

  index: number;

  label: string;

  distanceKm: number;

  pace: string;

  avgHR: number;

  durationSec: number;

}



export interface StravaHrZoneSummary {

  zone: 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';

  minHR: number;

  maxHR: number;

  timeSec: number;

  percent: number;

}



/** Reálný běh ze Stravy / trackingu */

export interface Activity {

  id: string;

  stravaActivityId?: number;

  title: string;

  type: ActivityType;

  phase?: 'AM' | 'PM' | 'EVENING';

  distanceKm: number;

  durationMin?: number;

  avgPace: string;

  avgHR: number;

  garminSyncStatus: 'synced' | 'pending';

  laps?: StravaLapSummary[];

  hrZones?: StravaHrZoneSummary[];

}



/** Plánovaný trénink (AI / metodik / ruční) */

export interface PlannedWorkout {

  id: string;

  phase: 'AM' | 'PM' | 'EVENING';

  title: string;

  type: ActivityType;

  isLocked: boolean;

  distanceKm?: number;

  targetPace?: string;

  targetHR?: number;

  description: string;

  intervals?: WorkoutInterval[];

  bookReference?: {

    bookTitle: string;

    chapterOrPage: string;

    quote: string;

  };

}



/** @deprecated Pro migraci a LLM kompatibilitu */

export interface WorkoutSession {

  id: string;

  phase: 'AM' | 'PM' | 'EVENING';

  title: string;

  type: ActivityType;

  isLocked: boolean;

  planned: {

    distanceKm?: number;

    targetPace?: string;

    targetHR?: number;

    description: string;

    bookReference?: {

      bookTitle: string;

      chapterOrPage: string;

      quote: string;

    };

  };

  actual?: {

    distanceKm: number;

    durationMin?: number;

    avgPace: string;

    avgHR: number;

    garminSyncStatus: 'synced' | 'pending';

    stravaActivityId?: number;

    laps?: StravaLapSummary[];

    hrZones?: StravaHrZoneSummary[];

  };

}



export interface DayData {

  date: string;

  activities: Activity[];

  plannedWorkouts: PlannedWorkout[];

  feedback?: {

    rpe?: number;

    readinessScore?: number;

    sleepQuality?: number;

    userComment?: string;

  };

  /** @deprecated – migrace do activities + plannedWorkouts */

  sessions?: WorkoutSession[];

}


