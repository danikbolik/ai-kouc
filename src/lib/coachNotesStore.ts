import {
  COACH_NOTE_CATEGORY_PROMPT_LABELS,
  type CoachNote,
  type CoachNoteCategory,
  type CoachNoteInput,
} from '../types/coachNotes';

export function createCoachNoteId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCoachNote(input: CoachNoteInput): CoachNote {
  return {
    id: createCoachNoteId(),
    date: input.date ?? new Date().toISOString().slice(0, 10),
    category: input.category,
    text: input.text.trim(),
  };
}

export function sortCoachNotes(notes: CoachNote[]): CoachNote[] {
  return [...notes].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function addCoachNote(notes: CoachNote[], input: CoachNoteInput): CoachNote[] {
  const note = createCoachNote(input);
  return sortCoachNotes([...notes, note]);
}

export function updateCoachNote(
  notes: CoachNote[],
  id: string,
  updates: Partial<Pick<CoachNote, 'text' | 'category' | 'date'>>,
): CoachNote[] {
  return sortCoachNotes(
    notes.map((note) =>
      note.id === id
        ? {
            ...note,
            ...updates,
            text: updates.text !== undefined ? updates.text.trim() : note.text,
          }
        : note,
    ),
  );
}

export function deleteCoachNote(notes: CoachNote[], id: string): CoachNote[] {
  return notes.filter((note) => note.id !== id);
}

export function formatCoachNoteDate(date: string): string {
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${Number(day)}.${Number(month)}.${year}`;
}

export function formatCoachNoteForPrompt(note: CoachNote): string {
  const category = COACH_NOTE_CATEGORY_PROMPT_LABELS[note.category];
  return `[${category} ${formatCoachNoteDate(note.date)}] ${note.text}`;
}

export function buildCoachNotesPromptSection(notes: CoachNote[]): string {
  const sorted = sortCoachNotes(notes);

  if (sorted.length === 0) {
    return `Dlouhodobé poznámky o tomto běžci:
(zatím žádné uložené poznámky)

Pokud sportovec zmíní důležitou dlouhodobou informaci (zdraví, zranění, časové možnosti, cíle, preference, vybavení), zavolej nástroj save_coach_note.`;
  }

  const lines = sorted.map((note) => `- ${formatCoachNoteForPrompt(note)}`).join('\n');

  return `Dlouhodobé poznámky o tomto běžci:
${lines}

Při navrhování tréninků a odpovídání VŽDY ber tyto poznámky v úvahu.
Pokud sportovec zmíní novou důležitou dlouhodobou informaci, zavolej nástroj save_coach_note.`;
}

export function isCoachNoteCategory(value: string): value is CoachNoteCategory {
  return ['health', 'schedule', 'goal', 'preference', 'other'].includes(value);
}
