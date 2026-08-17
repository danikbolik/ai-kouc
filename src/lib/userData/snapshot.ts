import type { ApiKeys } from '../apiKeyHeaders';
import type { CoachNote } from '../../types/coachNotes';
import type { UploadedMethodology, UserMetrics } from '../../types/settings';
import type { DayData } from '../../types/training';
import type { UserDataSnapshot } from '../../types/userData';
import { cloudHasSettingsLocalMissing, hasMeaningfulSettingsData } from './mergeSnapshots';

export interface PersistedStoreSlice {
  days: Record<string, DayData>;
  userMetrics: UserMetrics;
  coachNotes: CoachNote[];
  uploadedMethodology: UploadedMethodology[];
  apiKeys: ApiKeys;
  stravaConnected: boolean;
  lastStravaSyncAt: string | null;
  lastStravaActivityAt: number | null;
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
    lastStravaSyncAt: slice.lastStravaSyncAt ?? undefined,
    lastStravaActivityAt: slice.lastStravaActivityAt ?? undefined,
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
    lastStravaSyncAt: state.lastStravaSyncAt,
    lastStravaActivityAt: state.lastStravaActivityAt,
  };
}

export function isCloudSnapshotNewer(
  cloud: UserDataSnapshot,
  localUpdatedAt: string | null,
): boolean {
  if (!localUpdatedAt) return true;
  return new Date(cloud.updatedAt).getTime() > new Date(localUpdatedAt).getTime();
}

export function shouldPreferCloudSnapshot(
  cloud: UserDataSnapshot,
  localSlice: PersistedStoreSlice,
  localUpdatedAt: string | null,
): boolean {
  const cloudHasData =
    Object.keys(cloud.days).length > 0 ||
    hasMeaningfulSettingsData(cloud) ||
    Boolean(cloud.apiKeys?.openaiApiKey?.trim());

  const localMostlyEmpty =
    Object.keys(localSlice.days).length === 0 &&
    !hasMeaningfulSettingsData(localSlice) &&
    !localSlice.apiKeys?.openaiApiKey?.trim();

  if (cloudHasData && localMostlyEmpty) return true;

  const hasLocalCalendarData =
    Object.keys(localSlice.days).length > 0 ||
    localSlice.coachNotes.length > 0 ||
    localSlice.uploadedMethodology.length > 0 ||
    Boolean(localSlice.apiKeys?.openaiApiKey?.trim());

  if (!hasLocalCalendarData) return true;
  if (isCloudSnapshotNewer(cloud, localUpdatedAt)) return true;
  if (cloudHasSettingsLocalMissing(cloud, localSlice)) return true;
  return false;
}
