'use client';

import { useEffect } from 'react';

import { formatDurationHhMm, type WeekSummary } from '../../lib/weeklySummary';

interface WeeklySummaryModalProps {
  summary: WeekSummary | null;
  onClose: () => void;
}

export function WeeklySummaryModal({ summary, onClose }: WeeklySummaryModalProps) {
  useEffect(() => {
    if (!summary) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [summary, onClose]);

  if (!summary) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Zavřít týdenní souhrn"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Týdenní souhrn</h2>
          <p className="text-sm text-slate-500">
            {summary.weekStart} – {summary.weekEnd}
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-[10px] font-semibold uppercase text-emerald-700">Kilometry</p>
              <p className="mt-1 text-xl font-bold text-emerald-900">
                {summary.actualKm} / {summary.plannedKm} km
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase text-slate-600">Čas</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {formatDurationHhMm(summary.totalDurationMin)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-slate-200 p-2">
              <p className="text-lg font-bold text-slate-900">{summary.trainingDays}</p>
              <p className="text-[10px] text-slate-500">Tréninkové dny</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <p className="text-lg font-bold text-slate-900">{summary.restDays}</p>
              <p className="text-[10px] text-slate-500">Volné dny</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-2">
              <p className="text-lg font-bold text-emerald-700">{summary.completionPercent}%</p>
              <p className="text-[10px] text-slate-500">Plnění plánu</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Rozpad po dnech
            </p>
            <div className="space-y-1.5">
              {summary.days.map((day) => (
                <div
                  key={day.date}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium text-slate-800">
                      {day.weekdayShort} {day.date.slice(8)}.
                    </span>
                    {day.sessionTitles.length > 0 && (
                      <span className="ml-2 text-xs text-slate-500">
                        {day.sessionTitles.join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-semibold text-emerald-700">
                      {day.actualKm} / {day.plannedKm} km
                    </p>
                    {day.durationMin > 0 && (
                      <p className="text-slate-500">{formatDurationHhMm(day.durationMin)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}
