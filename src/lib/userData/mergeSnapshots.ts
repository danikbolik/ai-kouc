import { EMPTY_API_KEYS, type ApiKeys } from '../apiKeyHeaders';
import { DEFAULT_USER_METRICS } from '../../types/settings';
import type { CoachNote } from '../../types/coachNotes';
import type { UploadedMethodology, UserMetrics } from '../../types/settings';
import type { DayData } from '../../types/training';
import type { StravaTokensSnapshot, UserDataSnapshot } from '../../types/userData';

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function isDefaultUserMetrics(metrics: UserMetrics): boolean {
  const normalized = {
    HRmax: metrics.HRmax,
    ANP: metrics.ANP,
    AeT: metrics.AeT,
    targetRace: metrics.targetRace,
    raceDate: metrics.raceDate,
    raceDistanceKm: metrics.raceDistanceKm,
    mesocycleStartDate: metrics.mesocycleStartDate,
  };
  const defaults = {
    HRmax: DEFAULT_USER_METRICS.HRmax,
    ANP: DEFAULT_USER_METRICS.ANP,
    AeT: DEFAULT_USER_METRICS.AeT,
    targetRace: DEFAULT_USER_METRICS.targetRace,
    raceDate: DEFAULT_USER_METRICS.raceDate,
    raceDistanceKm: DEFAULT_USER_METRICS.raceDistanceKm,
    mesocycleStartDate: DEFAULT_USER_METRICS.mesocycleStartDate,
  };
  return stableJson(normalized) === stableJson(defaults);
}

export function hasMeaningfulSettingsData(snapshot: Pick<
  UserDataSnapshot,
  'userMetrics' | 'coachNotes' | 'uploadedMethodology'
>): boolean {
  return (
    !isDefaultUserMetrics(snapshot.userMetrics) ||
    snapshot.coachNotes.length > 0 ||
    snapshot.uploadedMethodology.length > 0
  );
}

function mergeCoachNotes(base: CoachNote[], incoming: CoachNote[]): CoachNote[] {
  const byId = new Map<string, CoachNote>();
  for (const note of base) byId.set(note.id, note);
  for (const note of incoming) byId.set(note.id, note);
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function mergeMethodology(
  base: UploadedMethodology[],
  incoming: UploadedMethodology[],
): UploadedMethodology[] {
  const byId = new Map<string, UploadedMethodology>();
  for (const doc of base) byId.set(doc.id, doc);
  for (const doc of incoming) byId.set(doc.id, doc);
  return [...byId.values()].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

function mergeApiKeys(base: ApiKeys, incoming: ApiKeys): ApiKeys {
  return {
    openaiApiKey: incoming.openaiApiKey || base.openaiApiKey || '',
    stravaClientId: incoming.stravaClientId || base.stravaClientId || '',
    stravaClientSecret: incoming.stravaClientSecret || base.stravaClientSecret || '',
  };
}

function pickRicherDay(base: DayData, incoming: DayData): DayData {
  const baseActivities = base.activities?.length ?? 0;
  const incomingActivities = incoming.activities?.length ?? 0;
  if (incomingActivities > baseActivities) return incoming;
  if (baseActivities > incomingActivities) return base;
  return incoming;
}

function pickStravaTokens(
  base: StravaTokensSnapshot | null | undefined,
  incoming: StravaTokensSnapshot | null | undefined,
): StravaTokensSnapshot | null {
  if (!base) return incoming ?? null;
  if (!incoming) return base;
  return incoming.expiresAt >= base.expiresAt ? incoming : base;
}

/** Sloučí dva snapshoty – canonical (starší účet) + data z nového zařízení. */
export function mergeUserDataSnapshots(
  canonical: UserDataSnapshot,
  incoming: UserDataSnapshot,
): UserDataSnapshot {
  const days: Record<string, DayData> = { ...canonical.days };
  for (const [date, day] of Object.entries(incoming.days ?? {})) {
    days[date] = days[date] ? pickRicherDay(days[date], day) : day;
  }

  const userMetrics =
    !isDefaultUserMetrics(canonical.userMetrics)
      ? canonical.userMetrics
      : !isDefaultUserMetrics(incoming.userMetrics)
        ? incoming.userMetrics
        : canonical.userMetrics;

  const coachNotes = mergeCoachNotes(canonical.coachNotes, incoming.coachNotes);
  const uploadedMethodology = mergeMethodology(
    canonical.uploadedMethodology,
    incoming.uploadedMethodology,
  );
  const apiKeys = mergeApiKeys(
    { ...EMPTY_API_KEYS, ...canonical.apiKeys },
    { ...EMPTY_API_KEYS, ...incoming.apiKeys },
  );

  const canonicalTime = new Date(canonical.updatedAt).getTime();
  const incomingTime = new Date(incoming.updatedAt).getTime();

  return {
    days,
    userMetrics,
    coachNotes,
    uploadedMethodology,
    apiKeys,
    stravaConnected: canonical.stravaConnected || incoming.stravaConnected,
    stravaTokens: pickStravaTokens(canonical.stravaTokens, incoming.stravaTokens),
    lastStravaSyncAt:
      canonical.lastStravaSyncAt && incoming.lastStravaSyncAt
        ? canonical.lastStravaSyncAt > incoming.lastStravaSyncAt
          ? canonical.lastStravaSyncAt
          : incoming.lastStravaSyncAt
        : canonical.lastStravaSyncAt ?? incoming.lastStravaSyncAt,
    lastStravaActivityAt: Math.max(
      canonical.lastStravaActivityAt ?? 0,
      incoming.lastStravaActivityAt ?? 0,
    ) || undefined,
    updatedAt: new Date(Math.max(canonicalTime, incomingTime)).toISOString(),
  };
}

export function cloudHasSettingsLocalMissing(
  cloud: UserDataSnapshot,
  local: Pick<UserDataSnapshot, 'userMetrics' | 'coachNotes' | 'uploadedMethodology' | 'apiKeys'>,
): boolean {
  if (!hasMeaningfulSettingsData(cloud)) {
    const cloudHasApiKey = Boolean(cloud.apiKeys?.openaiApiKey?.trim());
    const localHasApiKey = Boolean(local.apiKeys?.openaiApiKey?.trim());
    if (cloudHasApiKey && !localHasApiKey) return true;
    return false;
  }

  const localHasSettings = hasMeaningfulSettingsData(local);
  if (!localHasSettings) return true;

  const cloudHasApiKey = Boolean(cloud.apiKeys?.openaiApiKey?.trim());
  const localHasApiKey = Boolean(local.apiKeys?.openaiApiKey?.trim());
  if (cloudHasApiKey && !localHasApiKey) return true;

  if (cloud.coachNotes.length > local.coachNotes.length) return true;
  if (cloud.uploadedMethodology.length > local.uploadedMethodology.length) return true;
  if (!isDefaultUserMetrics(cloud.userMetrics) && isDefaultUserMetrics(local.userMetrics)) {
    return true;
  }

  return false;
}
