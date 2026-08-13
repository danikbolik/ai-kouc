import { NextResponse } from 'next/server';

import {
  buildActivitiesByDate,
  fetchAllActivities,
  isStravaConfigured,
} from '@/lib/strava';
import {
  getStravaClientIdFromEnv,
  getStravaClientSecretFromEnv,
} from '@/lib/strava/env';
import { getValidStravaAccessToken, hasStravaConnection } from '@/lib/strava/tokenAccess';

function stravaCredentials() {
  return {
    clientId: getStravaClientIdFromEnv(),
    clientSecret: getStravaClientSecretFromEnv(),
  };
}

export async function GET(request: Request) {
  const credentials = stravaCredentials();

  return NextResponse.json({
    connected: await hasStravaConnection(request),
    configured: isStravaConfigured(credentials),
    fullHistory: true,
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

  try {
    const activities = await fetchAllActivities(accessToken, { perPage: 200 });

    console.log('[Strava sync] Stažené aktivity:', activities.length);

    const activitiesByDate = await buildActivitiesByDate(accessToken, activities);

    const activitiesByDateObject: Record<string, import('@/types/training').Activity[]> =
      {};
    for (const [date, list] of activitiesByDate) {
      activitiesByDateObject[date] = list;
    }

    return NextResponse.json({
      activitiesCount: activities.length,
      fullHistory: true,
      syncedDates: Array.from(activitiesByDate.keys()),
      activitiesByDate: activitiesByDateObject,
    });
  } catch (error) {
    console.error('[Strava sync]', error);
    const message =
      error instanceof Error ? error.message : 'Synchronizace se Stravou selhala.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
