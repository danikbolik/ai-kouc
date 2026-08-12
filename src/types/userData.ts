import type { ApiKeys } from '../lib/apiKeyHeaders';
import type { CoachNote } from './coachNotes';
import type { UploadedMethodology, UserMetrics } from './settings';
import type { DayData } from './training';

export interface StravaTokensSnapshot {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athleteId?: number;
  athleteName?: string;
}

export interface UserDataSnapshot {
  days: Record<string, DayData>;
  userMetrics: UserMetrics;
  coachNotes: CoachNote[];
  uploadedMethodology: UploadedMethodology[];
  apiKeys: ApiKeys;
  stravaConnected: boolean;
  stravaTokens?: StravaTokensSnapshot | null;
  updatedAt: string;
}

export const EMPTY_USER_DATA_SNAPSHOT: UserDataSnapshot = {
  days: {},
  userMetrics: {} as UserMetrics,
  coachNotes: [],
  uploadedMethodology: [],
  apiKeys: {
    openaiApiKey: '',
    stravaClientId: '',
    stravaClientSecret: '',
  },
  stravaConnected: false,
  stravaTokens: null,
  updatedAt: new Date(0).toISOString(),
};
