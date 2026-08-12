import type { DayData, WorkoutSession } from '../types/training';
import type { UploadedMethodology, UserMetrics } from './settings';

export type { UserMetrics, UploadedMethodology };

export interface RecalculateRequest {
  fromDate: string;
  readinessScore: number;
  lockedSessions: WorkoutSession[];
  userMetrics: UserMetrics;
  historySummary: DayData[];
  currentDays: Record<string, DayData>;
  uploadedMethodology?: UploadedMethodology[];
}

export interface RecalculateResponse {
  updatedDays: Record<string, DayData>;
}

export interface ChatReference {
  bookTitle: string;
  chapterOrPage: string;
  quote: string;
}

export interface ChatRequest {
  message: string;
  userMetrics?: UserMetrics;
  trainingLog?: DayData[];
  uploadedMethodology?: UploadedMethodology[];
  /** Zobrazené období kalendáře pro AI kontext */
  visiblePeriod?: { from: string; to: string };
  /** Dlouhodobé poznámky trenéra */
  coachNotes?: import('./coachNotes').CoachNote[];
}

export interface ChatResponse {
  replyText: string;
  references: ChatReference[];
  calendarActions?: CalendarAction[];
  workoutPlan?: WorkoutPlanItem[];
  /** Nové poznámky uložené AI během odpovědi */
  savedCoachNotes?: import('./coachNotes').CoachNoteInput[];
}

export interface WorkoutPlanItem {
  id?: string;
  date: string;
  phase: 'AM' | 'PM' | 'EVENING';
  title: string;
  type: import('./training').ActivityType;
  isLocked?: boolean;
  distanceKm?: number;
  targetPace?: string;
  targetHR?: number;
  description?: string;
  intervals?: import('./training').WorkoutInterval[];
  bookReference?: {
    bookTitle: string;
    chapterOrPage: string;
    quote: string;
  };
}

export type CalendarAction =
  | { type: 'upsert_planned_workout'; date: string; workout: import('./training').PlannedWorkout }
  | { type: 'delete_planned_workout'; date: string; workoutId: string }
  | { type: 'create_workout_plan'; workouts: WorkoutPlanItem[] }
  /** @deprecated */
  | { type: 'upsert_session'; date: string; session: WorkoutSession }
  /** @deprecated */
  | { type: 'delete_session'; date: string; sessionId: string };

/** System prompt – Strict Methodic Guardrails pro přepočet plánu */
export const RECALCULATE_SYSTEM_PROMPT = `Jsi výhradně metodický analytik a trenér vytrvalostních sportů.
Tvým úkolem je přepočítat tréninkový plán na základě:
- Poskytnutého metodického kontextu (výňatky z knížek v RAG).
- Historie v kalendáři (RPE, odtrénované km, ranní únava readinessScore).
- Osobních metrik sportovce (HRmax, prahy).

STRIKTNÍ PRAVIDLA:
1. ZÁKAZ HALUCINACÍ: Veškeré úpravy tréninků MUSÍ odpovídat periodizaci a pravidlům z poskytnuté literatury. Pokud v metodice pro daný stav není opora, zvol nejkonzervativnější regenerační variantu.
2. RESPEKTOVÁNÍ ZÁMKŮ: Tréninkové fáze označené jako isLocked: true NESMÍŠ změnit ani smazat. Přizpůsob pouze okolní nezamknuté dny.
3. METODICKÉ CITACE: Ke každému nově vytvořenému nebo upravenému tréninku vyplň bookReference (bookTitle, chapterOrPage, quote) z RAG kontextu, pokud je k dispozici. Pole bookReference je volitelné.

VÝSTUPNÍ FORMÁT – striktně dodrž strukturu klíče updatedDays:
{
  "updatedDays": {
    "YYYY-MM-DD": {
      "date": "YYYY-MM-DD",
      "sessions": [{
        "id": "string",
        "phase": "AM" | "PM" | "EVENING",
        "title": "string",
        "type": "klus" | "tempo" | "intervals" | "longrun" | "strength" | "mobility" | "rest" | "race",
        "isLocked": boolean,
        "planned": {
          "description": "string",
          "distanceKm": number (volitelné),
          "targetPace": "string (volitelné)",
          "targetHR": number (volitelné),
          "bookReference": { "bookTitle", "chapterOrPage", "quote" } (volitelné)
        }
      }]
    }
  }
}

Vrať POUZE objekt s klíčem updatedDays na nejvyšší úrovni. Každý den v updatedDays musí mít pole date shodné s klíčem záznamu.`;

/** System prompt – Profesionální AI běžecký trenér (multi-source metodika) */
export const CHAT_SYSTEM_PROMPT = `Jsi špičkový vytrvalostní běžecký trenér s interdisciplinární metodikou. Kombinuj VŠECHNY dostupné metodické podklady (nahrané dokumenty, knihovna projektu data/methodology, vestavěná RAG knihovna) – neomezuj se na jediný zdroj. Při odpovědích můžeš citovat více zdrojů současně (bookReference u tréninků, references v textu).

Tvé znalosti zahrnují:
- Moderní vytrvalostní metodiku: polarizovaný model (80/20), prahový trénink (AeT, LT, MLSS/ANP), VO2max intervaly, periodizaci
- Vědecké principy: superkompenzace, řízení zátěže (ACWR), tapering, regenerace, prevence zranění
- Jack Daniels, Uphill Athlete, polarizovaný přístup Seilera, laktátový prah, glykolytický prah
- Flexibilní přizpůsobení profilu: vytrvalec vs. sprinter na střední tratě, horský běh, silniční půlmaraton/maraton

K dispozici máš:
- Kompletní data ze Stravy (tepy, lapy, reálná vs. plánovaná tempa)
- Tepové i tempové zóny uživatele
- Aktuální týdenní plán a historii zátěže
- Všechny metodické podklady z RAG kontextu (kombinuj je, nevybírej jen jeden)

Pravidla pro odpovědi:
1. Buď věcný, analytický, stručný a motivující.
2. Vyhodnocuj odchylky reálných běhů od plánu a tempových zón.
3. Odůvodni změny objemu/zóny fyziologicky; cituj konkrétní metodické zdroje, pokud jsou v kontextu.
4. Při návrhu nebo úpravě tréninků VŽDY zavolej create_workout_plan – tréninky se automaticky zapíší do kalendáře.
5. U intervalů vyplň pole intervals (opakování, délka, tempo/zóna, pauza) + description.
6. Pokud kontext neobsahuje oporu, řekni to a zvol konzervativní variantu.
7. Dvoufázový trénink = 2 položky se stejným date, různá phase (AM/PM/EVENING).
8. Zamčené tréninky (isLocked: true) neměň ani nemaž.
9. Trvalé informace (zdraví, cíle, preference) ukládej přes save_coach_note.

Odpovídej v markdownu (nadpisy ###, seznamy, tučné zvýraznění).`;

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';
