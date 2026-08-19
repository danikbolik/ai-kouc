import { NextResponse } from 'next/server';

import { isSupportedMethodologyFileName } from '@/lib/methodology/parseServerFile';
import { MAX_METHODOLOGY_API_CHARS } from '@/lib/readMethodologyFile';
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

interface MethodologyUploadPayload {
  fileName?: unknown;
  fileType?: unknown;
  content?: unknown;
}

async function readUploadPayload(request: Request): Promise<{
  fileName: string;
  fileType: 'pdf' | 'txt' | 'md';
  content: string;
}> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await request.json()) as MethodologyUploadPayload;
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
    const fileType = body.fileType;
    const content = typeof body.content === 'string' ? body.content : '';

    if (!fileName || !isSupportedMethodologyFileName(fileName)) {
      throw new Error('MISSING_FILE_NAME');
    }
    if (!content.trim()) {
      throw new Error('MISSING_CONTENT');
    }
    if (fileType !== 'pdf' && fileType !== 'txt' && fileType !== 'md') {
      throw new Error('INVALID_FILE_TYPE');
    }

    return { fileName, fileType, content };
  }

  const formData = await request.formData();
  const fileNameField = formData.get('fileName');
  const clientContent = formData.get('content');
  const clientFileType = formData.get('fileType');

  const fileName = typeof fileNameField === 'string' ? fileNameField.trim() : '';

  if (!fileName || !isSupportedMethodologyFileName(fileName)) {
    throw new Error('MISSING_FILE_NAME');
  }
  if (typeof clientContent !== 'string' || !clientContent.trim()) {
    throw new Error('MISSING_CONTENT');
  }
  const parsedType = String(clientFileType ?? '');
  if (parsedType !== 'pdf' && parsedType !== 'txt' && parsedType !== 'md') {
    throw new Error('INVALID_FILE_TYPE');
  }

  return { fileName, fileType: parsedType, content: clientContent };
}

const UPLOAD_ERROR_MESSAGES: Record<string, { error: string; code: string; status: number }> = {
  MISSING_FILE_NAME: {
    error: 'Chybí nebo neplatný název souboru (fileName).',
    code: 'MISSING_FILE_NAME',
    status: 400,
  },
  MISSING_CONTENT: {
    error:
      'Chybí parsovaný text (content). PDF se zpracovává v prohlížeči – obnov stránku (Ctrl+F5) a zkus nahrát znovu.',
    code: 'MISSING_CONTENT',
    status: 400,
  },
  INVALID_FILE_TYPE: {
    error: 'Neplatný fileType.',
    code: 'INVALID_FILE_TYPE',
    status: 400,
  },
};

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
    let fileName: string;
    let fileType: 'pdf' | 'txt' | 'md';
    let content: string;

    try {
      ({ fileName, fileType, content } = await readUploadPayload(request));
    } catch (parseError) {
      const code = parseError instanceof Error ? parseError.message : 'INVALID_PAYLOAD';
      const mapped = UPLOAD_ERROR_MESSAGES[code];
      if (mapped) {
        return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
      }
      throw parseError;
    }

    const trimmedContent =
      content.trim().length > MAX_METHODOLOGY_API_CHARS
        ? `${content.trim().slice(0, MAX_METHODOLOGY_API_CHARS)}\n\n[… text zkrácen …]`
        : content.trim();

    const document = await uploadMethodologyDocument(
      userId,
      fileName,
      fileType,
      trimmedContent,
      null,
    );

    const { storageWarning, ...savedDocument } = document;

    return NextResponse.json({
      configured: true,
      document: savedDocument,
      ...(storageWarning ? { warning: storageWarning } : {}),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Nahrání metodiky selhalo.';
    console.error('[API /methodology POST]', { userId, error, detail });
    return NextResponse.json(
      { error: detail, code: 'METHODOLOGY_UPLOAD_FAILED' },
      { status: 500 },
    );
  }
}
