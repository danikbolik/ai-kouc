'use client';

import { useEffect, useRef, useState } from 'react';

import { buildApiKeyHeaders } from '../../lib/apiKeyHeaders';
import {
  extractPersistedSnapshot,
  pickPersistedSlice,
  shouldPreferCloudSnapshot,
} from '../../lib/userData/snapshot';
import {
  getLocalUpdatedAt,
  getOrCreateUserId,
  setLocalUpdatedAt,
  setUserId,
  syncUserIdFromCookie,
} from '../../lib/userId';
import { useTrainingStore } from '../../store/useTrainingStore';
import type { UserDataSnapshot } from '../../types/userData';

const SYNC_DEBOUNCE_MS = 1500;

interface CloudFetchResult {
  configured: boolean;
  data: UserDataSnapshot | null;
  canonicalUserId?: string;
  error?: string;
  code?: string;
}

export interface LinkCloudAccountResult {
  success: boolean;
  error?: string;
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; code?: string };
    if (body.error && body.code) return `${body.error} (${body.code})`;
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function fetchCloudSnapshot(userId: string): Promise<CloudFetchResult> {
  const response = await fetch('/api/user-data', {
    headers: {
      ...buildApiKeyHeaders(useTrainingStore.getState().apiKeys),
      'X-User-Id': userId,
    },
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as CloudFetchResult;
}

async function pushCloudSnapshot(userId: string, snapshot: UserDataSnapshot): Promise<UserDataSnapshot> {
  const response = await fetch('/api/user-data', {
    method: 'PUT',
    headers: {
      ...buildApiKeyHeaders(useTrainingStore.getState().apiKeys),
      'X-User-Id': userId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(snapshot),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const json = (await response.json()) as { data: UserDataSnapshot };
  return json.data;
}

async function resolveStravaAccount(userId: string): Promise<CloudFetchResult | null> {
  const response = await fetch('/api/user-data/link-account', {
    method: 'POST',
    headers: {
      ...buildApiKeyHeaders(useTrainingStore.getState().apiKeys),
      'X-User-Id': userId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode: 'strava' }),
  });

  if (!response.ok) {
    console.warn('[CloudSyncProvider.resolveStravaAccount]', await parseApiError(response));
    return null;
  }

  return (await response.json()) as CloudFetchResult;
}

function applyCanonicalUserId(canonicalUserId: string | undefined): boolean {
  if (!canonicalUserId) return false;
  const current = getOrCreateUserId();
  if (canonicalUserId === current) return false;
  setUserId(canonicalUserId);
  return true;
}

function hydrateCloudData(data: UserDataSnapshot): void {
  useTrainingStore.getState().hydrateFromCloud(data);
  setLocalUpdatedAt(data.updatedAt);
}

export function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const hydrateFromCloud = useTrainingStore((s) => s.hydrateFromCloud);
  const setCloudSyncStatus = useTrainingStore((s) => s.setCloudSyncStatus);

  const [storeHydrated, setStoreHydrated] = useState(false);

  const skipSyncRef = useRef(true);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const persistApi = useTrainingStore.persist;
    if (!persistApi) {
      setStoreHydrated(true);
      return;
    }

    if (persistApi.hasHydrated()) {
      setStoreHydrated(true);
      return;
    }

    return persistApi.onFinishHydration(() => {
      setStoreHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!storeHydrated) return;

    let cancelled = false;

    async function bootstrap() {
      syncUserIdFromCookie();
      let userId = getOrCreateUserId();
      setCloudSyncStatus('loading', null);

      try {
        if (useTrainingStore.getState().stravaConnected) {
          const resolved = await resolveStravaAccount(userId);
          if (resolved?.canonicalUserId && applyCanonicalUserId(resolved.canonicalUserId)) {
            userId = resolved.canonicalUserId;
          }
          if (resolved?.data && !cancelled) {
            hydrateCloudData(resolved.data);
            setCloudSyncStatus('idle', null);
            skipSyncRef.current = false;
            return;
          }
        }

        const initialUserId = userId;
        const { configured, data, canonicalUserId } = await fetchCloudSnapshot(userId);

        if (cancelled) return;

        if (canonicalUserId && canonicalUserId !== initialUserId) {
          applyCanonicalUserId(canonicalUserId);
          userId = canonicalUserId;
          const refetch = await fetchCloudSnapshot(canonicalUserId);
          if (refetch.data) {
            hydrateCloudData(refetch.data);
            setCloudSyncStatus('idle', null);
            skipSyncRef.current = false;
            return;
          }
        }

        if (!configured) {
          setCloudSyncStatus('offline', null);
          skipSyncRef.current = false;
          return;
        }

        const localUpdatedAt = getLocalUpdatedAt();
        const localSlice = pickPersistedSlice(useTrainingStore.getState());

        if (data && shouldPreferCloudSnapshot(data, localSlice, localUpdatedAt)) {
          hydrateCloudData(data);
        } else {
          const snapshot = extractPersistedSnapshot(localSlice);
          const saved = await pushCloudSnapshot(userId, snapshot);
          setLocalUpdatedAt(saved.updatedAt);
          if (!data) {
            console.info('[CloudSyncProvider] Cloud tabulka prázdná – lokální data odeslána do Supabase.');
          }
        }

        setCloudSyncStatus('idle', null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cloud sync selhal.';
        console.error('[CloudSyncProvider.bootstrap]', message, error);
        if (!cancelled) setCloudSyncStatus('error', message);
      } finally {
        skipSyncRef.current = false;
        if (!cancelled) {
          void useTrainingStore.getState().syncMethodologyFromCloud();
        }
      }
    }

    void bootstrap();

    const scheduleSync = () => {
      if (skipSyncRef.current) return;

      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(async () => {
        const userId = getOrCreateUserId();
        setCloudSyncStatus('syncing', null);

        try {
          const snapshot = extractPersistedSnapshot(pickPersistedSlice(useTrainingStore.getState()));
          const saved = await pushCloudSnapshot(userId, snapshot);
          setLocalUpdatedAt(saved.updatedAt);
          setCloudSyncStatus('idle', null);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Cloud sync selhal.';
          console.error('[CloudSyncProvider.sync]', message, error);
          setCloudSyncStatus('error', message);
        }
      }, SYNC_DEBOUNCE_MS);
    };

    const unsubscribe = useTrainingStore.subscribe((state, prev) => {
      const current = pickPersistedSlice(state);
      const previous = pickPersistedSlice(prev);
      if (JSON.stringify(current) !== JSON.stringify(previous)) {
        scheduleSync();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [hydrateFromCloud, setCloudSyncStatus, storeHydrated]);

  return <>{children}</>;
}

export async function pushLocalDataToCloud(): Promise<{ success: boolean; error?: string }> {
  const userId = getOrCreateUserId();
  useTrainingStore.getState().setCloudSyncStatus('syncing', null);

  try {
    const snapshot = extractPersistedSnapshot(pickPersistedSlice(useTrainingStore.getState()));
    const saved = await pushCloudSnapshot(userId, snapshot);
    setLocalUpdatedAt(saved.updatedAt);
    await useTrainingStore.getState().syncMethodologyFromCloud();
    useTrainingStore.getState().setCloudSyncStatus('idle', null);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Odeslání do cloudu selhalo.';
    useTrainingStore.getState().setCloudSyncStatus('error', message);
    return { success: false, error: message };
  }
}

export async function linkCloudAccountAndHydrate(
  targetUserId: string,
): Promise<LinkCloudAccountResult> {
  const deviceUserId = getOrCreateUserId();
  const response = await fetch('/api/user-data/link-account', {
    method: 'POST',
    headers: {
      ...buildApiKeyHeaders(useTrainingStore.getState().apiKeys),
      'X-User-Id': deviceUserId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode: 'manual', targetUserId }),
  });

  if (!response.ok) {
    const error = await parseApiError(response);
    useTrainingStore.getState().setCloudSyncStatus('error', error);
    return { success: false, error };
  }

  const json = (await response.json()) as CloudFetchResult;
  if (json.canonicalUserId) {
    setUserId(json.canonicalUserId);
  }
  if (json.data) {
    hydrateCloudData(json.data);
  }
  await useTrainingStore.getState().syncMethodologyFromCloud();
  useTrainingStore.getState().setCloudSyncStatus('idle', null);
  return { success: true };
}
