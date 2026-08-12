import { NextResponse } from 'next/server';

import {
  getStravaClientIdFromEnv,
  getStravaClientSecretFromEnv,
} from '@/lib/strava/env';
import { hasStravaConnection } from '@/lib/strava/tokenAccess';
import type { StravaStatusResponse } from '@/types/strava';

/** Server-side kontrola Strava OAuth konfigurace (env proměnné nejsou dostupné v prohlížeči). */
export async function GET(request: Request): Promise<NextResponse<StravaStatusResponse>> {
  const clientId = getStravaClientIdFromEnv() ?? null;
  const clientSecret = getStravaClientSecretFromEnv() ?? null;

  const configured = Boolean(clientId && clientSecret);

  if (!configured) {
    return NextResponse.json({
      configured: false,
      connected: false,
      clientId,
    });
  }

  const connected = await hasStravaConnection(request);

  return NextResponse.json({
    configured: true,
    connected,
    clientId,
  });
}
