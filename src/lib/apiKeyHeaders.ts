import { isPlaceholderApiKey } from '@/lib/resolveApiKeys';

export interface ApiKeys {
  openaiApiKey: string;
  stravaClientId: string;
  stravaClientSecret: string;
}

export const EMPTY_API_KEYS: ApiKeys = {
  openaiApiKey: '',
  stravaClientId: '',
  stravaClientSecret: '',
};

/** Sestaví HTTP hlavičky s API klíči a user ID pro backend volání */
export function buildApiKeyHeaders(apiKeys: ApiKeys): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (typeof window !== 'undefined') {
    try {
      const userId = localStorage.getItem('ai-coach-user-id');
      if (userId) headers['X-User-Id'] = userId;
    } catch {
      // ignore private browsing restrictions
    }
  }

  const openAiKey = apiKeys.openaiApiKey.trim();
  if (openAiKey && !isPlaceholderApiKey(openAiKey)) {
    headers['x-openai-key'] = openAiKey;
  }
  if (apiKeys.stravaClientId.trim()) {
    headers['x-strava-client-id'] = apiKeys.stravaClientId.trim();
  }
  if (apiKeys.stravaClientSecret.trim()) {
    headers['x-strava-client-secret'] = apiKeys.stravaClientSecret.trim();
  }

  return headers;
}
