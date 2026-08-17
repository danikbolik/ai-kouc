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

export type WarmCoolUnit = 'km' | 'min';

/** Rozklus nebo výklus – vzdálenost (km) nebo čas (min) */
export interface WarmCoolSegment {
  value: number;
  unit: WarmCoolUnit;
}

export type RaceType = 'ob' | 'kros' | 'track_road';

/** Specifikace závodu pro tapering a periodizaci */
export interface RaceDetails {
  durationMin?: number;
  distanceValue?: number;
  distanceUnit?: 'km' | 'm';
  raceType?: RaceType;
}



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

  /** Unix timestamp (s) startu aktivity ze Stravy – pro inkrementální sync. */
  stravaStartAt?: number;

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

  /** Nastoupané metry ze Stravy (+m) */
  elevationGainM?: number;

  /** Training Stress Score (hrTSS) */
  tss?: number;

  /** Grade Adjusted Pace – korigované tempo na rovinu */
  gapPace?: string;

  /** Typ terénu pro OB/kros logiku */
  terrainType?: 'road' | 'ob' | 'kros' | 'trail';

  /** Poznámka běžce k provedenému běhu */
  notes?: string;

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

  warmUp?: WarmCoolSegment;

  coolDown?: WarmCoolSegment;

  raceDetails?: RaceDetails;

  bookReference?: {

    bookTitle: string;

    chapterOrPage: string;

    quote: string;

  };

  /** Poznámka běžce ke konkrétnímu tréninku (pro AI analýzy). */
  notes?: string;

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

    /** Vzdálenost hlavního motivu bez rozklusu a výklusu. */
    mainDistanceKm?: number;

    targetPace?: string;

    targetHR?: number;

    description: string;

    notes?: string;

    warmUp?: WarmCoolSegment;

    coolDown?: WarmCoolSegment;

    intervals?: WorkoutInterval[];

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

    elevationGainM?: number;

    tss?: number;

    gapPace?: string;

    terrainType?: 'road' | 'ob' | 'kros' | 'trail';

  };

}



export interface DayData {

  date: string;

  activities: Activity[];

  plannedWorkouts: PlannedWorkout[];

  feedback?: {

    readinessScore?: number;

    userComment?: string;

    /** @deprecated – odstraněno z UI */
    rpe?: number;

    /** @deprecated – odstraněno z UI */
    sleepQuality?: number;

  };

  /** @deprecated – migrace do activities + plannedWorkouts */

  sessions?: WorkoutSession[];

}


