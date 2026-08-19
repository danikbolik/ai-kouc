import { buildApiKeyHeaders } from '@/lib/apiKeyHeaders';
import { isSupportedMethodologyFile, readMethodologyFile } from '@/lib/readMethodologyFile';
import { getOrCreateUserId } from '@/lib/userId';
import type { UploadedMethodology } from '@/types/settings';

function methodologyHeaders(apiKeys: Parameters<typeof buildApiKeyHeaders>[0]): HeadersInit {
  return {
    ...buildApiKeyHeaders(apiKeys),
    'X-User-Id': getOrCreateUserId(),
  };
}

export async function fetchMethodologyDocuments(
  apiKeys: Parameters<typeof buildApiKeyHeaders>[0],
): Promise<{ configured: boolean; documents: UploadedMethodology[]; error?: string }> {
  const response = await fetch('/api/methodology', {
    headers: methodologyHeaders(apiKeys),
  });

  if (!response.ok) {
    try {
      const body = (await response.json()) as { error?: string };
      return { configured: true, documents: [], error: body.error ?? `HTTP ${response.status}` };
    } catch {
      return { configured: true, documents: [], error: `HTTP ${response.status}` };
    }
  }

  return (await response.json()) as {
    configured: boolean;
    documents: UploadedMethodology[];
  };
}

export async function uploadMethodologyDocumentFile(
  file: File,
  apiKeys: Parameters<typeof buildApiKeyHeaders>[0],
): Promise<UploadedMethodology> {
  if (!isSupportedMethodologyFile(file)) {
    throw new Error(`Soubor "${file.name}" není podporovaný (.pdf, .txt, .md).`);
  }

  const { fileType, content } = await readMethodologyFile(file);
  return uploadMethodologyParsedContent(file.name, fileType, content, apiKeys);
}

export async function uploadMethodologyParsedContent(
  fileName: string,
  fileType: UploadedMethodology['fileType'],
  content: string,
  apiKeys: Parameters<typeof buildApiKeyHeaders>[0],
): Promise<UploadedMethodology> {
  const response = await fetch('/api/methodology', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': getOrCreateUserId(),
      ...(buildApiKeyHeaders(apiKeys)['x-openai-key']
        ? { 'x-openai-key': buildApiKeyHeaders(apiKeys)['x-openai-key']! }
        : {}),
    },
    body: JSON.stringify({ fileName, fileType, content }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    document?: UploadedMethodology;
    warning?: string;
  };

  if (!response.ok) {
    const detail = body.error ?? `Nahrání selhalo (${response.status})`;
    throw new Error(body.code ? `${detail} [${body.code}]` : detail);
  }

  if (!body.document) {
    throw new Error('Server nevrátil uložený dokument.');
  }

  if (body.warning) {
    console.warn('[uploadMethodologyParsedContent]', body.warning);
  }

  return body.document;
}

export async function deleteMethodologyDocumentRemote(
  docId: string,
  apiKeys: Parameters<typeof buildApiKeyHeaders>[0],
): Promise<void> {
  const response = await fetch(`/api/methodology/${encodeURIComponent(docId)}`, {
    method: 'DELETE',
    headers: methodologyHeaders(apiKeys),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Smazání selhalo (${response.status})`);
  }
}
