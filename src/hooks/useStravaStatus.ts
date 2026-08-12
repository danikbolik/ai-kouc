'use client';

import { useEffect, useState } from 'react';

import { buildUserIdHeader } from '@/lib/userId';
import type { StravaStatusResponse } from '@/types/strava';

const DEFAULT_STATUS: StravaStatusResponse & { loading: boolean } = {
  loading: true,
  configured: false,
  connected: false,
  clientId: null,
};

/** Načte stav Strava OAuth ze serveru — env proměnné nejsou dostupné v prohlížeči. */
export function useStravaStatus(enabled: boolean) {
  const [status, setStatus] = useState(DEFAULT_STATUS);

  useEffect(() => {
    if (!enabled) {
      setStatus(DEFAULT_STATUS);
      return;
    }

    let cancelled = false;
    setStatus((prev) => ({ ...prev, loading: true }));

    fetch('/api/strava/status', { headers: buildUserIdHeader() })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Strava status failed (${res.status})`);
        return res.json() as Promise<StravaStatusResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setStatus({
          loading: false,
          configured: data.configured,
          connected: data.connected,
          clientId: data.clientId,
        });
      })
      .catch((error) => {
        console.error('[useStravaStatus]', error);
        if (cancelled) return;
        setStatus({
          loading: false,
          configured: false,
          connected: false,
          clientId: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return status;
}
