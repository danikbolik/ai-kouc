import { NextResponse } from 'next/server';

import { isSupportedMethodologyFileName, parseMethodologyBuffer } from '@/lib/methodology/parseServerFile';
import {
  isCloudDbConfigured,
  listMethodologyDocuments,
  migrateLegacyMethodologyFromUserData,
  uploadMethodologyDocument,
} from '@/lib/methodology/repository';
import { isValidUserId } from '@/lib/userData/repository';

function getUserIdFromRequest(request: Request): string | null {
  return request.headers.get('x-user-id');
}

/** Seznam metodických dokumentů uživatele (text pro RAG včetně). */
export async function GET(request: Request) {
  const userId = getUserIdFromRequest(request);

  if (!isValidUserId(userId)) {
    return NextResponse.json(
      { error: 'Chybí nebo je neplatné X-User-Id hlavička.', code: 'INVALID_CLOUD_ID' },
      { status: 400 },
    );
  }

  if (!isCloudDbConfigured()) {
    return NextResponse.json({
      configured: false,
      documents: [],
      message: 'Cloud databáze není nakonfigurována.',
    });
  }

  try {
    await migrateLegacyMethodologyFromUserData(userId);
    const documents = await listMethodologyDocuments(userId);
    return NextResponse.json({ configured: true, documents });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Načtení metodik selhalo.';
    console.error('[API /methodology GET]', { userId, error, detail });
    return NextResponse.json(
      { error: detail, code: 'METHODOLOGY_LIST_FAILED' },
      { status: 500 },
    );
  }
}

/** Nahrání metodického souboru – Storage + parsovaný text do DB pro RAG. */
export async function POST(request: Request) {
  const userId = getUserIdFromRequest(request);

  if (!isValidUserId(userId)) {
    return NextResponse.json(
      { error: 'Chybí nebo je neplatné X-User-Id hlavička.', code: 'INVALID_CLOUD_ID' },
      { status: 400 },
    );
  }

  if (!isCloudDbConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        error: 'Cloud databáze není nakonfigurována.',
        code: 'CLOUD_NOT_CONFIGURED',
      },
      { status: 503 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Chybí soubor v poli "file".', code: 'MISSING_FILE' },
        { status: 400 },
      );
    }

    if (!isSupportedMethodologyFileName(file.name)) {
      return NextResponse.json(
        { error: 'Nepodporovaný formát. Povolené: .pdf, .txt, .md', code: 'UNSUPPORTED_FORMAT' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { fileType, content } = await parseMethodologyBuffer(buffer, file.name);

    const document = await uploadMethodologyDocument(
      userId,
      file.name,
      fileType,
      content,
      buffer,
    );

    return NextResponse.json({ configured: true, document });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Nahrání metodiky selhalo.';
    console.error('[API /methodology POST]', { userId, error, detail });
    return NextResponse.json(
      { error: detail, code: 'METHODOLOGY_UPLOAD_FAILED' },
      { status: 500 },
    );
  }
}
