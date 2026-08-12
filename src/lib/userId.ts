const USER_ID_KEY = 'ai-coach-user-id';
const LOCAL_UPDATED_AT_KEY = 'ai-coach-local-updated-at';

export function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return '';

  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }

  document.cookie = `ai_coach_user_id=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
  return id;
}

export function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_ID_KEY);
}

export function getLocalUpdatedAt(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LOCAL_UPDATED_AT_KEY);
}

export function setLocalUpdatedAt(iso: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_UPDATED_AT_KEY, iso);
}

export function buildUserIdHeader(): Record<string, string> {
  const userId = getOrCreateUserId();
  return userId ? { 'X-User-Id': userId } : {};
}
