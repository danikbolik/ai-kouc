export interface DynamicReference {
  type: 'book' | 'workout';
  label: string;
  bookTitle?: string;
  chapterOrPage?: string;
  quote?: string;
  date?: string;
  sessionTitle?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  /** Právě probíhá streamování odpovědi */
  isStreaming?: boolean;
  dynamicReferences?: DynamicReference[];
  /** AI vygenerovaný plán čekající na manuální vložení */
  pendingWorkoutPlan?: import('./api').WorkoutPlanItem[];
  /** Plán byl již aplikován do kalendáře */
  planApplied?: boolean;
}
