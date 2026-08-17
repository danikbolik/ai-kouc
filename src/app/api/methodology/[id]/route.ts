import { NextResponse } from 'next/server';

import { deleteMethodologyDocument, isCloudDbConfigured } from '@/lib/methodology/repository';
import { isValidUserId } from '@/lib/userData/repository';

function getUserIdFromRequest(request: Request): string | null {
  return request.headers.get('x-user-id');
}

/** Smaže metodický dokument ze Storage i DB. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userId = getUserIdFromRequest(request);
  const { id } = await context.params;

  if (!isValidUserId(userId)) {
    return NextResponse.json(
      { error: 'Chybí nebo je neplatné X-User-Id hlavička.', code: 'INVALID_CLOUD_ID' },
      { status: 400 },
    );
  }

  if (!id?.trim()) {
    return NextResponse.json(
      { error: 'Neplatné ID dokumentu.', code: 'INVALID_DOC_ID' },
      { status: 400 },
    );
  }

  if (!isCloudDbConfigured()) {
    return NextResponse.json(
      { configured: false, error: 'Cloud databáze není nakonfigurována.' },
      { status: 503 },
    );
  }

  try {
    const deleted = await deleteMethodologyDocument(userId, id);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Dokument nenalezen.', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }
    return NextResponse.json({ configured: true, deleted: true, id });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Smazání metodiky selhalo.';
    console.error('[API /methodology DELETE]', { userId, id, error, detail });
    return NextResponse.json(
      { error: detail, code: 'METHODOLOGY_DELETE_FAILED' },
      { status: 500 },
    );
  }
}
