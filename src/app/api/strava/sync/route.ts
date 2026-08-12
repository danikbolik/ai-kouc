import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  buildActivitiesByDate,
  fetchAllActivities,
  isStravaConfigured,
} from '@/lib/strava';
import { getValidStravaAccessToken, hasStravaConnection } from '@/lib/strava/tokenAccess';
import { resolveStravaCredentialsWithCookies } from '@/lib/stravaCredentials';

export async function GET(request: Request) {
  const credentials = await resolveStravaCredentialsWithCookies(request);

  return NextResponse.json({
    connected: await hasStravaConnection(request),
    configured: isStravaConfigured(credentials),
    fullHistory: true,
  });
}

export async function POST(request: Request) {
  const credentials = await resolveStravaCredentialsWithCookies(request);

  if (!isStravaConfigured(credentials)) {
    return NextResponse.json({ error: 'Strava not configured' }, { status: 503 });
  }

  const accessToken = await getValidStravaAccessToken(request, credentials);
  if (!accessToken) {
    return NextResponse.json({ error: 'Strava not connected' }, { status: 401 });
  }

  try {
    const activities = await fetchAllActivities(accessToken, { perPage: 200 });

    console.log('Stažené aktivity ze Stravy (kompletní historie):', activities.length);

    const activitiesByDate = await buildActivitiesByDate(accessToken, activities);

    const activitiesByDateObject: Record<string, import('@/types/training').Activity[]> = {};
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
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
