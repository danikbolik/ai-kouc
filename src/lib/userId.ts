const USER_ID_KEY = 'ai-coach-user-id';
const LOCAL_UPDATED_AT_KEY = 'ai-coach-local-updated-at';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function setUserIdCookie(id: string): void {
  document.cookie = `ai_coach_user_id=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
}

export function isValidUserIdFormat(id: string): boolean {
  return UUID_RE.test(id);
}

export function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return '';

  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }

  setUserIdCookie(id);
  return id;
}

export function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_ID_KEY);
}

/** Nastaví cloud ID (propojení s jiným zařízením) – vynutí stažení dat z cloudu. */
export function setUserId(id: string): void {
  if (typeof window === 'undefined') return;
  if (!isValidUserIdFormat(id)) {
    throw new Error('Neplatné Cloud ID – očekáván UUID formát.');
  }
  localStorage.setItem(USER_ID_KEY, id);
  setUserIdCookie(id);
  localStorage.removeItem(LOCAL_UPDATED_AT_KEY);
}

/** Po Strava OAuth callbacku může cookie obsahovat kanonické ID z jiného zařízení. */
export function syncUserIdFromCookie(): boolean {
  if (typeof window === 'undefined') return false;

  const cookieMatch = document.cookie.match(/ai_coach_user_id=([^;]+)/)?.[1];
  if (!cookieMatch) return false;

  const cookieId = decodeURIComponent(cookieMatch);
  if (!isValidUserIdFormat(cookieId)) return false;

  const localId = localStorage.getItem(USER_ID_KEY);
  if (cookieId === localId) return false;

  localStorage.setItem(USER_ID_KEY, cookieId);
  localStorage.removeItem(LOCAL_UPDATED_AT_KEY);
  return true;
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
