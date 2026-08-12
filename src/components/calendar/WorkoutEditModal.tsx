'use client';

import { useEffect, useState } from 'react';

import { createEmptyPlannedWorkout } from '../../lib/calendarActions';
import { getPlannedWorkouts, normalizeDayData } from '../../lib/dayData';
import { getWeekdayShort } from '../../lib/dates';
import {
  buildIntervalDescription,
  buildIntervalTitle,
  createDefaultInterval,
  estimateIntervalDistanceKm,
} from '../../lib/intervalBuilder';
import { useTrainingStore } from '../../store/useTrainingStore';
import type { ActivityType, PlannedWorkout, WorkoutInterval } from '../../types/training';
import { IntervalBuilder } from './IntervalBuilder';

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'klus', label: 'Klus' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'intervals', label: 'Intervalový trénink' },
  { value: 'longrun', label: 'Dlouhý běh' },
  { value: 'strength', label: 'Síla' },
  { value: 'mobility', label: 'Mobilita' },
  { value: 'rest', label: 'Odpočinek' },
  { value: 'race', label: 'Závod' },
];

const PHASES: PlannedWorkout['phase'][] = ['AM', 'PM', 'EVENING'];

export function WorkoutEditModal() {
  const isOpen = useTrainingStore((s) => s.isEditModalOpen);
  const selectedDate = useTrainingStore((s) => s.selectedDate);
  const editSessionId = useTrainingStore((s) => s.editSessionId);
  const days = useTrainingStore((s) => s.days);
  const closeEditModal = useTrainingStore((s) => s.closeEditModal);
  const upsertPlannedWorkout = useTrainingStore((s) => s.upsertPlannedWorkout);
  const deleteSession = useTrainingStore((s) => s.deleteSession);

  const [form, setForm] = useState<PlannedWorkout>(() => createEmptyPlannedWorkout(selectedDate));
  const [interval, setInterval] = useState<WorkoutInterval>(() => createDefaultInterval());

  useEffect(() => {
    if (!isOpen) return;
    const day = days[selectedDate] ? normalizeDayData(days[selectedDate]) : undefined;
    const workout = editSessionId
      ? getPlannedWorkouts(day).find((w) => w.id === editSessionId)
      : undefined;
    const nextForm = workout ?? createEmptyPlannedWorkout(selectedDate);
    setForm(nextForm);
    setInterval(nextForm.intervals?.[0] ?? createDefaultInterval());
  }, [isOpen, selectedDate, editSessionId, days]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditModal();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeEditModal]);

  const isEditing = Boolean(editSessionId);
  const isIntervalWorkout = form.type === 'intervals';

  const applyIntervalToForm = (nextInterval: WorkoutInterval) => {
    setForm({
      ...form,
      type: 'intervals',
      intervals: [nextInterval],
      title: buildIntervalTitle(nextInterval),
      description: buildIntervalDescription(nextInterval),
      targetPace: nextInterval.targetPace,
      distanceKm: estimateIntervalDistanceKm(nextInterval),
    });
  };

  const handleTypeChange = (type: ActivityType) => {
    if (type === 'intervals') {
      const nextInterval = form.intervals?.[0] ?? interval;
      setInterval(nextInterval);
      applyIntervalToForm(nextInterval);
      return;
    }
    setForm({ ...form, type, intervals: undefined });
  };

  const handleSave = () => {
    const payload =
      form.type === 'intervals'
        ? {
            ...form,
            intervals: [interval],
            title: form.title || buildIntervalTitle(interval),
            description: form.description || buildIntervalDescription(interval),
            distanceKm: form.distanceKm ?? estimateIntervalDistanceKm(interval),
          }
        : form;
    upsertPlannedWorkout(selectedDate, payload);
    closeEditModal();
  };

  const handleDelete = () => {
    if (editSessionId) {
      deleteSession(selectedDate, editSessionId);
    }
    closeEditModal();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Zavřít editor"
        onClick={closeEditModal}
      />

      <div className="relative w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEditing ? 'Upravit trénink' : 'Přidat trénink'}
          </h2>
          <p className="text-sm text-slate-500">
            {getWeekdayShort(selectedDate)} {selectedDate}
          </p>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Název</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Typ</span>
              <select
                value={form.type}
                onChange={(e) => handleTypeChange(e.target.value as ActivityType)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Fáze</span>
              <select
                value={form.phase}
                onChange={(e) =>
                  setForm({ ...form, phase: e.target.value as PlannedWorkout['phase'] })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {PHASES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isIntervalWorkout ? (
            <IntervalBuilder
              interval={interval}
              onChange={(next) => {
                setInterval(next);
                applyIntervalToForm(next);
              }}
              onApplyToWorkout={applyIntervalToForm}
            />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Km</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.distanceKm ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      distanceKm: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Tempo</span>
                <input
                  type="text"
                  placeholder="5:30"
                  value={form.targetPace ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, targetPace: e.target.value || undefined })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">TF</span>
                <input
                  type="number"
                  min="0"
                  value={form.targetHR ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      targetHR: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Popis</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isLocked}
              onChange={(e) => setForm({ ...form, isLocked: e.target.checked })}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Zamknout proti AI přepočtu</span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          {isEditing ? (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Smazat
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeEditModal}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Uložit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
