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
}

async function fetchCloudSnapshot(userId: string): Promise<CloudFetchResult> {
  const response = await fetch('/api/user-data', {
    headers: {
      ...buildApiKeyHeaders(useTrainingStore.getState().apiKeys),
      'X-User-Id': userId,
    },
  });

  if (!response.ok) {
    throw new Error(`Cloud load failed (${response.status})`);
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
    throw new Error(`Cloud save failed (${response.status})`);
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

  if (!response.ok) return null;
  return (await response.json()) as CloudFetchResult;
}

function applyCanonicalUserId(canonicalUserId: string | undefined): boolean {
  if (!canonicalUserId) return false;
  const current = getOrCreateUserId();
  if (canonicalUserId === current) return false;
  setUserId(canonicalUserId);
  return true;
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
      setCloudSyncStatus('loading');

      try {
        if (useTrainingStore.getState().stravaConnected) {
          const resolved = await resolveStravaAccount(userId);
          if (resolved?.canonicalUserId && applyCanonicalUserId(resolved.canonicalUserId)) {
            userId = resolved.canonicalUserId;
          }
          if (resolved?.data && !cancelled) {
            hydrateFromCloud(resolved.data);
            setLocalUpdatedAt(resolved.data.updatedAt);
            setCloudSyncStatus('idle');
            skipSyncRef.current = false;
            return;
          }
        }

        const { configured, data, canonicalUserId } = await fetchCloudSnapshot(userId);

        if (cancelled) return;

        if (applyCanonicalUserId(canonicalUserId)) {
          userId = canonicalUserId ?? userId;
        }

        if (!configured) {
          setCloudSyncStatus('offline');
          skipSyncRef.current = false;
          return;
        }

        const localUpdatedAt = getLocalUpdatedAt();
        const localSlice = pickPersistedSlice(useTrainingStore.getState());

        if (data && shouldPreferCloudSnapshot(data, localSlice, localUpdatedAt)) {
          hydrateFromCloud(data);
          setLocalUpdatedAt(data.updatedAt);
        } else if (localSlice) {
          const snapshot = extractPersistedSnapshot(localSlice);
          const saved = await pushCloudSnapshot(userId, snapshot);
          setLocalUpdatedAt(saved.updatedAt);
        }

        setCloudSyncStatus('idle');
      } catch (error) {
        console.error('[CloudSyncProvider.bootstrap]', error);
        if (!cancelled) setCloudSyncStatus('error');
      } finally {
        skipSyncRef.current = false;
      }
    }

    void bootstrap();

    const scheduleSync = () => {
      if (skipSyncRef.current) return;

      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(async () => {
        const userId = getOrCreateUserId();
        setCloudSyncStatus('syncing');

        try {
          const snapshot = extractPersistedSnapshot(pickPersistedSlice(useTrainingStore.getState()));
          const saved = await pushCloudSnapshot(userId, snapshot);
          setLocalUpdatedAt(saved.updatedAt);
          setCloudSyncStatus('idle');
        } catch (error) {
          console.error('[CloudSyncProvider.sync]', error);
          setCloudSyncStatus('error');
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

export async function linkCloudAccountAndHydrate(targetUserId: string): Promise<boolean> {
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

  if (!response.ok) return false;

  const json = (await response.json()) as CloudFetchResult;
  if (json.canonicalUserId) {
    setUserId(json.canonicalUserId);
  }
  if (json.data) {
    useTrainingStore.getState().hydrateFromCloud(json.data);
    setLocalUpdatedAt(json.data.updatedAt);
  }
  return true;
}
