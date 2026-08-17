import { mergeUserDataSnapshots } from './mergeSnapshots';
import {
  findUserIdByStravaAthleteId,
  getUserData,
  linkStravaAthleteId,
  normalizeSnapshot,
  saveUserData,
} from './repository';
import type { UserDataSnapshot } from '../../types/userData';

export interface AccountLinkResult {
  canonicalUserId: string;
  merged: boolean;
  data: UserDataSnapshot | null;
}

/** Propojí Strava účet napříč zařízeními – vrátí kanonické user_id s daty z PC. */
export async function resolveStravaLinkedAccount(
  deviceUserId: string,
  athleteId: number,
): Promise<AccountLinkResult> {
  const canonicalUserId = await findUserIdByStravaAthleteId(athleteId, deviceUserId);

  if (!canonicalUserId || canonicalUserId === deviceUserId) {
    await linkStravaAthleteId(deviceUserId, athleteId);
    const data = await getUserData(deviceUserId);
    return { canonicalUserId: deviceUserId, merged: false, data };
  }

  const [canonicalData, deviceData] = await Promise.all([
    getUserData(canonicalUserId),
    getUserData(deviceUserId),
  ]);

  const merged = mergeUserDataSnapshots(
    canonicalData ?? normalizeSnapshot(null),
    deviceData ?? normalizeSnapshot(null),
  );

  const saved = await saveUserData(canonicalUserId, merged);
  await linkStravaAthleteId(canonicalUserId, athleteId);

  return { canonicalUserId, merged: true, data: saved };
}

/** Ruční propojení zařízení – sloučí data z deviceUserId do targetUserId. */
export async function linkDeviceToAccount(
  deviceUserId: string,
  targetUserId: string,
): Promise<AccountLinkResult> {
  if (deviceUserId === targetUserId) {
    const data = await getUserData(targetUserId);
    return { canonicalUserId: targetUserId, merged: false, data };
  }

  const [targetData, deviceData] = await Promise.all([
    getUserData(targetUserId),
    getUserData(deviceUserId),
  ]);

  const merged = mergeUserDataSnapshots(
    targetData ?? normalizeSnapshot(null),
    deviceData ?? normalizeSnapshot(null),
  );

  const saved = await saveUserData(targetUserId, merged);

  const athleteId = saved.stravaTokens?.athleteId;
  if (athleteId) {
    await linkStravaAthleteId(targetUserId, athleteId);
  }

  return { canonicalUserId: targetUserId, merged: true, data: saved };
}
