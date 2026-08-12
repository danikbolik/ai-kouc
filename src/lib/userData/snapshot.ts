import type { ApiKeys } from '../apiKeyHeaders';
import type { CoachNote } from '../../types/coachNotes';
import type { UploadedMethodology, UserMetrics } from '../../types/settings';
import type { DayData } from '../../types/training';
import type { UserDataSnapshot } from '../../types/userData';

export interface PersistedStoreSlice {
  days: Record<string, DayData>;
  userMetrics: UserMetrics;
  coachNotes: CoachNote[];
  uploadedMethodology: UploadedMethodology[];
  apiKeys: ApiKeys;
  stravaConnected: boolean;
}

export function extractPersistedSnapshot(
  slice: PersistedStoreSlice,
  updatedAt = new Date().toISOString(),
): UserDataSnapshot {
  return {
    days: slice.days,
    userMetrics: slice.userMetrics,
    coachNotes: slice.coachNotes,
    uploadedMethodology: slice.uploadedMethodology,
    apiKeys: slice.apiKeys,
    stravaConnected: slice.stravaConnected,
    stravaTokens: undefined,
    updatedAt,
  };
}

export function pickPersistedSlice(state: PersistedStoreSlice): PersistedStoreSlice {
  return {
    days: state.days,
    userMetrics: state.userMetrics,
    coachNotes: state.coachNotes,
    uploadedMethodology: state.uploadedMethodology,
    apiKeys: state.apiKeys,
    stravaConnected: state.stravaConnected,
  };
}

export function isCloudSnapshotNewer(
  cloud: UserDataSnapshot,
  localUpdatedAt: string | null,
): boolean {
  if (!localUpdatedAt) return true;
  return new Date(cloud.updatedAt).getTime() > new Date(localUpdatedAt).getTime();
}
