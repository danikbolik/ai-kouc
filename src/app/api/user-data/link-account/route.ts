import { NextResponse } from 'next/server';

import { linkDeviceToAccount, resolveStravaLinkedAccount } from '@/lib/userData/accountLinking';
import {
  getUserData,
  isCloudDbConfigured,
  isValidUserId,
} from '@/lib/userData/repository';

function getUserIdFromRequest(request: Request): string | null {
  return request.headers.get('x-user-id');
}

interface LinkAccountBody {
  mode?: 'manual' | 'strava';
  targetUserId?: string;
}

/** Propojí zařízení s existujícím cloud účtem (Strava athlete ID nebo ruční Cloud ID). */
export async function POST(request: Request) {
  const deviceUserId = getUserIdFromRequest(request);

  if (!isValidUserId(deviceUserId)) {
    return NextResponse.json(
      {
        error: 'Chybí nebo je neplatné X-User-Id hlavička.',
        code: 'INVALID_DEVICE_CLOUD_ID',
      },
      { status: 400 },
    );
  }

  if (!isCloudDbConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        error:
          'Cloud databáze není nakonfigurována. Nastav SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY na serveru.',
        code: 'CLOUD_NOT_CONFIGURED',
      },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as LinkAccountBody;

    if (body.mode === 'manual') {
      const targetUserId = body.targetUserId?.trim();
      if (!isValidUserId(targetUserId)) {
        return NextResponse.json(
          { error: 'Neplatné cílové Cloud ID (očekáván UUID).', code: 'INVALID_TARGET_CLOUD_ID' },
          { status: 400 },
        );
      }

      const result = await linkDeviceToAccount(deviceUserId, targetUserId);
      return NextResponse.json({
        configured: true,
        canonicalUserId: result.canonicalUserId,
        merged: result.merged,
        data: result.data,
      });
    }

    const deviceData = await getUserData(deviceUserId);
    const athleteId = deviceData?.stravaTokens?.athleteId;

    if (!athleteId) {
      return NextResponse.json(
        {
          error: 'Strava účet není propojen – nelze synchronizovat napříč zařízeními.',
          code: 'STRAVA_NOT_LINKED',
        },
        { status: 400 },
      );
    }

    const result = await resolveStravaLinkedAccount(deviceUserId, athleteId);
    return NextResponse.json({
      configured: true,
      canonicalUserId: result.canonicalUserId,
      merged: result.merged,
      data: result.data,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Propojení účtu selhalo.';
    console.error('[API /user-data/link-account POST]', {
      deviceUserId,
      error,
      detail,
    });
    return NextResponse.json(
      {
        error: detail,
        code: 'LINK_ACCOUNT_FAILED',
      },
      { status: 500 },
    );
  }
}
