export type CoachNoteCategory = 'health' | 'schedule' | 'goal' | 'preference' | 'other';

export interface CoachNote {
  id: string;
  date: string;
  category: CoachNoteCategory;
  text: string;
}

export interface CoachNoteInput {
  category: CoachNoteCategory;
  text: string;
  date?: string;
}

export const COACH_NOTE_CATEGORY_LABELS: Record<CoachNoteCategory, string> = {
  health: 'Zdraví',
  schedule: 'Čas / rozvrh',
  goal: 'Cíl',
  preference: 'Preference',
  other: 'Ostatní',
};

export const COACH_NOTE_CATEGORY_PROMPT_LABELS: Record<CoachNoteCategory, string> = {
  health: 'HEALTH',
  schedule: 'SCHEDULE',
  goal: 'GOAL',
  preference: 'PREFERENCE',
  other: 'OTHER',
};
