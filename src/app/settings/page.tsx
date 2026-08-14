'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useTrainingStore } from '@/store/useTrainingStore';

function SettingsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSettingsOpen = useTrainingStore((s) => s.setSettingsOpen);
  const setStravaConnected = useTrainingStore((s) => s.setStravaConnected);
  const syncLatestStravaActivities = useTrainingStore((s) => s.syncLatestStravaActivities);

  useEffect(() => {
    if (searchParams.get('strava') === 'connected') {
      setStravaConnected(true);
      void syncLatestStravaActivities({ force: true });
    }

    setSettingsOpen(true);
    router.replace('/');
  }, [searchParams, router, setSettingsOpen, setStravaConnected, syncLatestStravaActivities]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <p className="text-sm text-slate-600">Otevírám nastavení…</p>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <p className="text-sm text-slate-600">Načítám…</p>
        </div>
      }
    >
      <SettingsRedirect />
    </Suspense>
  );
}
