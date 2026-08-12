'use client';

import { useTrainingStore } from '../../store/useTrainingStore';
import { getPeriodLabel } from '../../lib/dates';

interface ControlBarProps {
  viewDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

const VIEW_OPTIONS = [
  { id: 'month' as const, label: 'Měsíc' },
  { id: '2weeks' as const, label: '2 Týdny' },
  { id: 'week' as const, label: 'Týden' },
];

export function ControlBar({ viewDate, onPrev, onNext, onToday }: ControlBarProps) {
  const currentView = useTrainingStore((s) => s.currentView);
  const setCurrentView = useTrainingStore((s) => s.setCurrentView);
  const isStravaSyncing = useTrainingStore((s) => s.isStravaSyncing);
  const syncStravaActivities = useTrainingStore((s) => s.syncStravaActivities);
  const stravaConnected = useTrainingStore((s) => s.stravaConnected);
  const openEditModal = useTrainingStore((s) => s.openEditModal);
  const selectedDate = useTrainingStore((s) => s.selectedDate);

  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Navigace v čase */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          aria-label="Předchozí období"
        >
          ◄
        </button>
        <button
          type="button"
          onClick={onToday}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          Dnes
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          aria-label="Další období"
        >
          ►
        </button>
      </div>

      {/* Indikátor období */}
      <p className="text-center text-sm font-semibold tracking-wide text-slate-800">
        {getPeriodLabel(viewDate)}
      </p>

      {/* Přepínač pohledu + akce */}
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setCurrentView(option.id)}
              className={[
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                currentView === option.id
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>

        {stravaConnected && (
          <button
            type="button"
            onClick={() => syncStravaActivities()}
            disabled={isStravaSyncing}
            title="Synchronizovat kompletní historii Stravy"
            className="shrink-0 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 transition-colors hover:bg-orange-100 disabled:opacity-60"
          >
            {isStravaSyncing ? 'Sync…' : '🔄 Strava'}
          </button>
        )}

        <button
          type="button"
          onClick={() => openEditModal(selectedDate)}
          className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
        >
          + Přidat ručně
        </button>
      </div>
    </div>
  );
}
