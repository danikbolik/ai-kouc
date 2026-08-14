import { NextResponse } from 'next/server';

import {
  buildActivitiesByDate,
  fetchActivitiesAfter,
  isStravaConfigured,
  StravaRateLimitError,
} from '@/lib/strava';
import { getLastStravaActivityUnix, stravaStartDateToUnix } from '@/lib/strava/activityTimestamps';
import { STRAVA_SYNC_COOLDOWN_MS } from '@/lib/strava/constants';
import {
  getStravaClientIdFromEnv,
  getStravaClientSecretFromEnv,
} from '@/lib/strava/env';
import { getValidStravaAccessToken, hasStravaConnection } from '@/lib/strava/tokenAccess';
import { getUserData, isValidUserId, saveUserData } from '@/lib/userData/repository';
import type { Activity } from '@/types/training';

function stravaCredentials() {
  return {
    clientId: getStravaClientIdFromEnv(),
    clientSecret: getStravaClientSecretFromEnv(),
  };
}

function getUserIdFromRequest(request: Request): string | null {
  const header = request.headers.get('x-user-id');
  return isValidUserId(header) ? header : null;
}

export async function GET(request: Request) {
  const credentials = stravaCredentials();

  return NextResponse.json({
    connected: await hasStravaConnection(request),
    configured: isStravaConfigured(credentials),
    incremental: true,
  });
}

export async function POST(request: Request) {
  const credentials = stravaCredentials();

  if (!isStravaConfigured(credentials)) {
    return NextResponse.json({ error: 'Strava not configured' }, { status: 503 });
  }

  const accessToken = await getValidStravaAccessToken(request, credentials);
  if (!accessToken) {
    return NextResponse.json(
      {
        error:
          'Strava token vypršel a obnova selhala. Připoj účet Strava znovu v Nastavení.',
      },
      { status: 401 },
    );
  }

  const userId = getUserIdFromRequest(request);

  let thresholdHR: number | undefined;
  let lastActivityAt: number | undefined;
  let force = false;

  try {
    const body = (await request.json()) as {
      thresholdHR?: number;
      lastActivityAt?: number;
      force?: boolean;
    };
    thresholdHR = body.thresholdHR;
    lastActivityAt = body.lastActivityAt;
    force = body.force === true;
  } catch {
    thresholdHR = undefined;
  }

  try {
    if (userId && !force) {
      const userData = await getUserData(userId);
      if (userData?.lastStravaSyncAt) {
        const elapsed = Date.now() - new Date(userData.lastStravaSyncAt).getTime();
        if (elapsed < STRAVA_SYNC_COOLDOWN_MS) {
          const retryAfterMs = STRAVA_SYNC_COOLDOWN_MS - elapsed;
          return NextResponse.json(
            {
              error: `Automatická synchronizace je dostupná za ${Math.ceil(retryAfterMs / 60000)} min.`,
              cooldown: true,
              retryAfterMs,
            },
            { status: 429 },
          );
        }
      }
    }

    let after = lastActivityAt;
    if (after == null && userId) {
      const userData = await getUserData(userId);
      after =
        userData?.lastStravaActivityAt ??
        (userData?.days ? getLastStravaActivityUnix(userData.days) : null) ??
        undefined;
    }

    const activities = await fetchActivitiesAfter(accessToken, {
      after: after ?? undefined,
    });

    console.log(
      `[Strava sync/latest] Stažené aktivity: ${activities.length}${after ? ` (after=${after})` : ''}`,
    );

    const activitiesByDate = await buildActivitiesByDate(accessToken, activities, {
      thresholdHR,
    });

    const activitiesByDateObject: Record<string, Activity[]> = {};
    for (const [date, list] of activitiesByDate) {
      activitiesByDateObject[date] = list;
    }

    let newestActivityAt = after ?? 0;
    for (const activity of activities) {
      const ts = stravaStartDateToUnix(activity.start_date_local);
      if (ts > newestActivityAt) newestActivityAt = ts;
    }

    const syncAt = new Date().toISOString();

    if (userId) {
      const userData = await getUserData(userId);
      if (userData) {
        await saveUserData(userId, {
          ...userData,
          lastStravaSyncAt: syncAt,
          lastStravaActivityAt:
            newestActivityAt > 0 ? newestActivityAt : userData.lastStravaActivityAt,
        });
      }
    }

    return NextResponse.json({
      activitiesCount: activities.length,
      incremental: true,
      after: after ?? null,
      lastStravaSyncAt: syncAt,
      lastStravaActivityAt: newestActivityAt > 0 ? newestActivityAt : null,
      syncedDates: Array.from(activitiesByDate.keys()),
      activitiesByDate: activitiesByDateObject,
    });
  } catch (error) {
    console.error('[Strava sync/latest]', error);

    if (error instanceof StravaRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    const message =
      error instanceof Error ? error.message : 'Synchronizace se Stravou selhala.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
