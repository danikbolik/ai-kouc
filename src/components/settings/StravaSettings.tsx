'use client';

import { useEffect } from 'react';

import { useStravaStatus } from '@/hooks/useStravaStatus';
import { getOrCreateUserId } from '@/lib/userId';
import { useTrainingStore } from '@/store/useTrainingStore';

const STRAVA_RETURN_TO = encodeURIComponent('/settings?strava=connected');

function buildStravaLoginUrl(): string {
  const userId = encodeURIComponent(getOrCreateUserId());
  return `/api/strava/login?returnTo=${STRAVA_RETURN_TO}&userId=${userId}`;
}

export function StravaSettings({ active }: { active: boolean }) {
  const stravaConnected = useTrainingStore((s) => s.stravaConnected);
  const isStravaSyncing = useTrainingStore((s) => s.isStravaSyncing);
  const setStravaConnected = useTrainingStore((s) => s.setStravaConnected);
  const syncStravaActivities = useTrainingStore((s) => s.syncStravaActivities);
  const disconnectStrava = useTrainingStore((s) => s.disconnectStrava);

  const { connected } = useStravaStatus(active);

  useEffect(() => {
    setStravaConnected(connected);
  }, [connected, setStravaConnected]);

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Strava Integrace</h3>
        <p className="mt-1 text-xs text-slate-500">
          Oficiální OAuth2 přihlášení na jeden klik. Synchronizace stáhne kompletní historii běhů
          ze Stravy (paginace po 200 aktivitách) a doplní je do kalendáře.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">Strava</p>
            <p className="text-xs text-slate-500">Synchronizace běžeckých aktivit přes OAuth2</p>
            <span
              className={[
                'mt-2 inline-flex items-center gap-1 text-sm font-medium',
                stravaConnected ? 'text-emerald-600' : 'text-slate-500',
              ].join(' ')}
            >
              {stravaConnected ? '🟢 Připojeno' : '⚪ Nepřipojeno'}
            </span>
          </div>
          <span className="text-2xl" aria-hidden="true">
            🟧
          </span>
        </div>

        <div className="mt-5">
          {!stravaConnected ? (
            <a
              href={buildStravaLoginUrl()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FC4C02] px-6 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#e04400]"
            >
              🟧 Připojit účet Strava
            </a>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-500">
                Synchronizovat kompletní historii běhů — vzdálenost, čas, tempo a tepy se zapíší
                do kalendáře.
              </p>
              <button
                type="button"
                onClick={() => syncStravaActivities()}
                disabled={isStravaSyncing}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {isStravaSyncing
                  ? 'Synchronizuji historii…'
                  : '🔄 Synchronizovat kompletní historii'}
              </button>
              <button
                type="button"
                onClick={disconnectStrava}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Odpojit účet
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
