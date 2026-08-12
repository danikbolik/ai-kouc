'use client';

import { useState } from 'react';

import {
  formatCoachNoteDate,
  sortCoachNotes,
} from '../../lib/coachNotesStore';
import { useTrainingStore } from '../../store/useTrainingStore';
import {
  COACH_NOTE_CATEGORY_LABELS,
  type CoachNoteCategory,
} from '../../types/coachNotes';

const CATEGORIES: CoachNoteCategory[] = ['health', 'schedule', 'goal', 'preference', 'other'];

const CATEGORY_COLORS: Record<CoachNoteCategory, string> = {
  health: 'bg-red-50 text-red-800 ring-red-200',
  schedule: 'bg-blue-50 text-blue-800 ring-blue-200',
  goal: 'bg-amber-50 text-amber-800 ring-amber-200',
  preference: 'bg-purple-50 text-purple-800 ring-purple-200',
  other: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export function CoachNotesPanel() {
  const coachNotes = useTrainingStore((s) => s.coachNotes);
  const addCoachNote = useTrainingStore((s) => s.addCoachNote);
  const updateCoachNote = useTrainingStore((s) => s.updateCoachNote);
  const deleteCoachNote = useTrainingStore((s) => s.deleteCoachNote);

  const [newCategory, setNewCategory] = useState<CoachNoteCategory>('health');
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<CoachNoteCategory>('health');
  const [editText, setEditText] = useState('');

  const sortedNotes = sortCoachNotes(coachNotes);

  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    addCoachNote({ category: newCategory, text });
    setNewText('');
  };

  const startEdit = (id: string) => {
    const note = coachNotes.find((n) => n.id === id);
    if (!note) return;
    setEditingId(id);
    setEditCategory(note.category);
    setEditText(note.text);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const text = editText.trim();
    if (!text) return;
    updateCoachNote(editingId, { category: editCategory, text });
    setEditingId(null);
  };

  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">🧠 Paměť trenéra (Poznámky)</h3>
        <p className="mt-1 text-xs text-slate-500">
          Dlouhodobé informace o tobě, které AI trenér používá při plánování. Poznámky může
          ukládat automaticky z chatu nebo je můžeš spravovat ručně.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Přidat poznámku
        </p>
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as CoachNoteCategory)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {COACH_NOTE_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
        <textarea
          rows={3}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder='Např. "Bolest levé achilovky po sebězích" nebo "Trénuji jen ráno před prací"'
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newText.trim()}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Uložit poznámku
        </button>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Aktivní poznámky ({sortedNotes.length})
        </p>

        {sortedNotes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
            Zatím žádné poznámky. AI je může vytvořit z chatu, nebo je přidej ručně výše.
          </p>
        ) : (
          <ul className="space-y-2">
            {sortedNotes.map((note) => (
              <li
                key={note.id}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as CoachNoteCategory)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {COACH_NOTE_CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </select>
                    <textarea
                      rows={3}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Uložit
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Zrušit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${CATEGORY_COLORS[note.category]}`}
                        >
                          {COACH_NOTE_CATEGORY_LABELS[note.category]}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatCoachNoteDate(note.date)}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-800">{note.text}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(note.id)}
                        className="rounded p-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Upravit"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCoachNote(note.id)}
                        className="rounded p-1.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Smazat"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
