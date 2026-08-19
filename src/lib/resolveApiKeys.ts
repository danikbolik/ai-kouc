import type { ApiKeys } from '@/lib/apiKeyHeaders';
import {
  getStravaClientIdFromEnv,
  getStravaClientSecretFromEnv,
} from '@/lib/strava/env';

const PLACEHOLDER_KEY_PATTERNS = [
  /^your[_-]?key/i,
  /^sk-your/i,
  /^xxx+$/i,
  /^test$/i,
  /\*here$/i,
  /^placeholder$/i,
];

/** Detekuje ukázkové / neplatné klíče z šablony (.env.example, Nastavení). */
export function isPlaceholderApiKey(key?: string): boolean {
  const trimmed = key?.trim();
  if (!trimmed) return false;
  return PLACEHOLDER_KEY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Gemini klíč: hlavička x-gemini-key → fallback process.env.GEMINI_API_KEY */
export function resolveGeminiKey(request: Request): string | undefined {
  const headerKey = request.headers.get('x-gemini-key')?.trim();
  if (headerKey && !isPlaceholderApiKey(headerKey)) return headerKey;

  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey && !isPlaceholderApiKey(envKey)) return envKey;

  return undefined;
}

export function isGeminiConfigured(apiKey?: string): boolean {
  const key = apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && !isPlaceholderApiKey(key));
}

/** OpenAI klíč: hlavička x-openai-key → fallback process.env.OPENAI_API_KEY */
export function resolveOpenAiKey(request: Request): string | undefined {
  const headerKey = request.headers.get('x-openai-key')?.trim();
  if (headerKey && !isPlaceholderApiKey(headerKey)) return headerKey;

  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey && !isPlaceholderApiKey(envKey)) return envKey;

  return undefined;
}

export function resolveStravaClientId(request: Request): string | undefined {
  const url = new URL(request.url);
  return (
    url.searchParams.get('client_id')?.trim() ||
    request.headers.get('x-strava-client-id')?.trim() ||
    getStravaClientIdFromEnv()
  );
}

export function resolveStravaCredentials(request: Request): {
  clientId?: string;
  clientSecret?: string;
} {
  const clientId =
    request.headers.get('x-strava-client-id')?.trim() || getStravaClientIdFromEnv();
  const clientSecret =
    request.headers.get('x-strava-client-secret')?.trim() || getStravaClientSecretFromEnv();

  return { clientId, clientSecret };
}

export function resolveStravaCredentialsFromKeys(keys: ApiKeys) {
  return {
    clientId: keys.stravaClientId.trim() || getStravaClientIdFromEnv(),
    clientSecret: keys.stravaClientSecret.trim() || getStravaClientSecretFromEnv(),
  };
}

export function isOpenAiKeyAvailable(request: Request): boolean {
  return Boolean(resolveOpenAiKey(request));
}

export function isStravaKeyAvailable(request: Request): boolean {
  const { clientId, clientSecret } = resolveStravaCredentials(request);
  return Boolean(clientId && clientSecret);
}
