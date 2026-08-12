'use client';

import { formatDurationHhMm, type WeekSummary } from '../../lib/weeklySummary';

interface WeekSummaryCardProps {
  summary: WeekSummary;
  onClick: () => void;
  compact?: boolean;
}

export function WeekSummaryCard({ summary, onClick, compact = false }: WeekSummaryCardProps) {
  const kmLabel =
    summary.plannedKm > 0
      ? `${summary.actualKm} / ${summary.plannedKm} km`
      : `${summary.actualKm} km`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex flex-col rounded-xl border border-slate-200 bg-slate-50 text-left transition-all hover:border-emerald-300 hover:bg-emerald-50/50 hover:shadow-sm',
        compact ? 'min-h-[100px] px-2 py-2' : 'min-h-[140px] px-3 py-3',
      ].join(' ')}
      title="Klikni pro detail týdne"
    >
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        Týden
      </span>
      <span className="mt-1 text-xs font-semibold text-slate-800">{summary.weekLabel}</span>
      <span className="mt-2 text-sm font-bold text-emerald-700">{kmLabel}</span>
      <span className="mt-1 text-[11px] text-slate-600">
        ⏱ {formatDurationHhMm(summary.totalDurationMin)}
      </span>
      {!compact && (
        <span className="mt-1 text-[10px] text-slate-500">
          Plnění {summary.completionPercent}%
        </span>
      )}
    </button>
  );
}
