'use client';

import { useEffect, useRef, useState } from 'react';

import { buildApiKeyHeaders } from '../../lib/apiKeyHeaders';
import {
  extractPersistedSnapshot,
  isCloudSnapshotNewer,
  pickPersistedSlice,
} from '../../lib/userData/snapshot';
import {
  getLocalUpdatedAt,
  getOrCreateUserId,
  setLocalUpdatedAt,
} from '../../lib/userId';
import { useTrainingStore } from '../../store/useTrainingStore';
import type { UserDataSnapshot } from '../../types/userData';

const SYNC_DEBOUNCE_MS = 1500;

async function fetchCloudSnapshot(userId: string): Promise<{
  configured: boolean;
  data: UserDataSnapshot | null;
}> {
  const response = await fetch('/api/user-data', {
    headers: {
      ...buildApiKeyHeaders(useTrainingStore.getState().apiKeys),
      'X-User-Id': userId,
    },
  });

  if (!response.ok) {
    throw new Error(`Cloud load failed (${response.status})`);
  }

  return (await response.json()) as {
    configured: boolean;
    data: UserDataSnapshot | null;
  };
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
      const userId = getOrCreateUserId();
      setCloudSyncStatus('loading');

      try {
        const { configured, data } = await fetchCloudSnapshot(userId);

        if (cancelled) return;

        if (!configured) {
          setCloudSyncStatus('offline');
          skipSyncRef.current = false;
          return;
        }

        const localUpdatedAt = getLocalUpdatedAt();
        const localSlice = pickPersistedSlice(useTrainingStore.getState());
        const hasLocalData =
          Object.keys(localSlice.days).length > 0 ||
          localSlice.coachNotes.length > 0 ||
          localSlice.uploadedMethodology.length > 0;

        if (data && (isCloudSnapshotNewer(data, localUpdatedAt) || !hasLocalData)) {
          hydrateFromCloud(data);
          setLocalUpdatedAt(data.updatedAt);
        } else if (hasLocalData) {
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
