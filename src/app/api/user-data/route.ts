import { NextResponse } from 'next/server';

import {
  getUserData,
  isCloudDbConfigured,
  isValidUserId,
  normalizeSnapshot,
  saveUserData,
} from '@/lib/userData/repository';
import type { UserDataSnapshot } from '@/types/userData';

function getUserIdFromRequest(request: Request): string | null {
  return request.headers.get('x-user-id');
}

export async function GET(request: Request) {
  const userId = getUserIdFromRequest(request);

  if (!isValidUserId(userId)) {
    return NextResponse.json(
      { error: 'Chybí nebo je neplatné X-User-Id hlavička.' },
      { status: 400 },
    );
  }

  if (!isCloudDbConfigured()) {
    return NextResponse.json({
      configured: false,
      data: null,
      message: 'Cloud databáze není nakonfigurována. Používá se lokální úložiště.',
    });
  }

  try {
    const data = await getUserData(userId);
    return NextResponse.json({
      configured: true,
      data,
    });
  } catch (error) {
    console.error('[API /user-data GET]', error);
    const detail =
      error instanceof Error ? error.message : 'Nepodařilo se načíst cloud data.';
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return saveFromRequest(request);
}

export async function POST(request: Request) {
  return saveFromRequest(request);
}

async function saveFromRequest(request: Request) {
  const userId = getUserIdFromRequest(request);

  if (!isValidUserId(userId)) {
    return NextResponse.json(
      { error: 'Chybí nebo je neplatné X-User-Id hlavička.' },
      { status: 400 },
    );
  }

  if (!isCloudDbConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        error: 'Cloud databáze není nakonfigurována.',
      },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as Partial<UserDataSnapshot>;
    const saved = await saveUserData(userId, normalizeSnapshot(body));
    return NextResponse.json({
      configured: true,
      data: saved,
    });
  } catch (error) {
    console.error('[API /user-data PUT]', error);
    const detail =
      error instanceof Error ? error.message : 'Nepodařilo se uložit cloud data.';
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
