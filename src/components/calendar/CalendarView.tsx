'use client';

import { useMemo, useState } from 'react';

import {
  addDaysToDate,
  addMonthsToDate,
  CZECH_WEEKDAYS,
  getMonthGridDays,
  getTwoWeekDays,
  getTodayDate,
  getWeekDays,
  parseDate,
} from '../../lib/dates';
import {
  chunkDatesIntoWeeks,
  computeWeekSummary,
  type WeekSummary,
} from '../../lib/weeklySummary';
import { useTrainingStore } from '../../store/useTrainingStore';
import { ControlBar } from './ControlBar';
import { DayCard } from './DayCard';
import { TrainingLoadChart } from './TrainingLoadChart';
import { WeekSummaryCard } from './WeekSummaryCard';
import { WeeklySummaryModal } from './WeeklySummaryModal';
import { WorkoutDetailModal } from './WorkoutDetailModal';
import { WorkoutEditModal } from './WorkoutEditModal';

export function CalendarView() {
  const days = useTrainingStore((s) => s.days);
  const userMetrics = useTrainingStore((s) => s.userMetrics);
  const currentView = useTrainingStore((s) => s.currentView);
  const selectedDate = useTrainingStore((s) => s.selectedDate);
  const setSelectedDate = useTrainingStore((s) => s.setSelectedDate);
  const calendarAnchorDate = useTrainingStore((s) => s.calendarAnchorDate);
  const setCalendarAnchorDate = useTrainingStore((s) => s.setCalendarAnchorDate);
  const calendarRevision = useTrainingStore((s) => s.calendarRevision);
  const isRecalculating = useTrainingStore((s) => s.isRecalculating);

  const viewDate = useMemo(() => parseDate(calendarAnchorDate), [calendarAnchorDate]);
  const [selectedWeekSummary, setSelectedWeekSummary] = useState<WeekSummary | null>(null);

  const visibleDates = useMemo(() => {
    switch (currentView) {
      case 'week':
        return getWeekDays(viewDate);
      case '2weeks':
        return getTwoWeekDays(viewDate);
      default:
        return getMonthGridDays(viewDate);
    }
  }, [currentView, viewDate]);

  const weekRows = useMemo(
    () => chunkDatesIntoWeeks(visibleDates),
    [visibleDates, calendarRevision],
  );

  const handlePrev = () => {
    const next =
      currentView === 'month'
        ? addMonthsToDate(viewDate, -1)
        : addDaysToDate(viewDate, currentView === '2weeks' ? -14 : -7);
    const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    setCalendarAnchorDate(key);
  };

  const handleNext = () => {
    const next =
      currentView === 'month'
        ? addMonthsToDate(viewDate, 1)
        : addDaysToDate(viewDate, currentView === '2weeks' ? 14 : 7);
    const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    setCalendarAnchorDate(key);
  };

  const handleToday = () => {
    const today = getTodayDate();
    setCalendarAnchorDate(today);
    setSelectedDate(today);
  };

  const isCompact = currentView !== 'month';

  return (
    <div className="relative flex flex-1 flex-col">
      {isRecalculating && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-6 py-4 shadow-lg">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
            <p className="text-sm font-medium text-slate-700">AI přepočítává tréninkový plán…</p>
          </div>
        </div>
      )}

      <ControlBar viewDate={viewDate} onPrev={handlePrev} onNext={handleNext} onToday={handleToday} />

      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <TrainingLoadChart days={days} userMetrics={userMetrics} lookbackDays={60} />
      </div>

      <WorkoutDetailModal />
      <WorkoutEditModal />
      <WeeklySummaryModal
        summary={selectedWeekSummary}
        onClose={() => setSelectedWeekSummary(null)}
      />

      <div className="flex-1 overflow-auto p-4">
        <div className="mb-2 grid grid-cols-8 gap-2">
          <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Týden
          </div>
          {CZECH_WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400"
            >
              {day}
            </div>
          ))}
        </div>

        <div key={calendarRevision} className="space-y-2">
          {weekRows.map((weekDates) => {
            const summary = computeWeekSummary(weekDates, days);

            return (
              <div key={weekDates[0]} className="grid grid-cols-8 gap-2">
                <WeekSummaryCard
                  summary={summary}
                  compact={isCompact}
                  onClick={() => setSelectedWeekSummary(summary)}
                />
                {weekDates.map((date) => (
                  <DayCard
                    key={date}
                    date={date}
                    dayData={days[date]}
                    viewDate={viewDate}
                    isCompact={isCompact}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
