import { buildApiKeyHeaders } from '@/lib/apiKeyHeaders';
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
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/methodology', {
    method: 'POST',
    headers: {
      'X-User-Id': getOrCreateUserId(),
      ...(buildApiKeyHeaders(apiKeys)['x-openai-key']
        ? { 'x-openai-key': buildApiKeyHeaders(apiKeys)['x-openai-key']! }
        : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Nahrání selhalo (${response.status})`);
  }

  const json = (await response.json()) as { document: UploadedMethodology };
  return json.document;
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
