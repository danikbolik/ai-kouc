import { buildIntervalDescription } from './intervalBuilder';
import { parseDate } from './dates';
import {
  formatRaceDetailsForAi,
  formatWarmCoolSegment,
  getPlannedWorkoutTotalDistanceKm,
} from './workoutExtras';
import type { WorkoutPlanItem } from '../types/api';

const CHAT_WEEKDAY_NAMES = [
  'neděle',
  'pondělí',
  'úterý',
  'středa',
  'čtvrtek',
  'pátek',
  'sobota',
] as const;

export const WORKOUT_PLAN_CHAT_FORMAT_EXAMPLE = `Upravil jsem tvůj plán na zbytek týdne a uložil ho do kalendáře:

📅 Pátek 14.8. – Intervaly na dráze (10× 500 m)
• **Parametry:** 4 km rozklus, 10× 500 m @ 3:10 min/km (pauza 90 s), 2 km výklus. Celkem 11 km.
• **Odůvodnění trenéra:** Zachovali jsme tvoji požadovanou rychlost, ale zkrátili počet opakování z 15 na 10, aby nedošlo k nadměrné laktátové kumulaci před víkendem.

📅 Sobota 15.8. – Závod OB (Sprint / Krátká trať)
• **Parametry:** cca 35 min na max, cílová TF 170–175. Zrušena odpolední 2. fáze.
• **Odůvodnění trenéra:** Vynecháváme druhou fázi, abychom po pátečních intervalech a sobotním závodě pošetřili glykogen na nedělní dlouhý OB.`;

export function formatWorkoutDateForChat(dateStr: string): string {
  const date = parseDate(dateStr);
  const weekday = CHAT_WEEKDAY_NAMES[date.getDay()];
  const label = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${label} ${date.getDate()}.${date.getMonth() + 1}.`;
}

export function formatWorkoutPlanItemParameters(item: WorkoutPlanItem): string {
  const parts: string[] = [];

  const warmUp = formatWarmCoolSegment('rozklus', item.warmUp);
  const coolDown = formatWarmCoolSegment('výklus', item.coolDown);
  if (warmUp) parts.push(warmUp);
  if (item.intervals?.length) {
    parts.push(
      item.intervals.map((interval) => buildIntervalDescription(interval)).join('; '),
    );
  } else if (item.description?.trim()) {
    parts.push(item.description.trim());
  }
  if (item.distanceKm && item.distanceKm > 0) {
    parts.push(`${item.distanceKm} km`);
  }
  if (item.targetPace) parts.push(`@${item.targetPace} min/km`);
  if (item.targetHR) parts.push(`cílová TF ${item.targetHR}`);
  if (coolDown) parts.push(coolDown);

  const race = formatRaceDetailsForAi(item.raceDetails);
  if (race) parts.push(race);

  const totalKm = getPlannedWorkoutTotalDistanceKm(item);
  if (totalKm > 0) {
    parts.push(`Celkem ${totalKm} km`);
  }

  if (item.phase !== 'AM') {
    parts.push(`fáze ${item.phase}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'viz popis tréninku';
}

export function formatSingleWorkoutChatBlock(item: WorkoutPlanItem): string {
  const dateLabel = formatWorkoutDateForChat(item.date);
  const params = formatWorkoutPlanItemParameters(item);
  const reasoning =
    item.coachReasoning?.trim() ||
    'Trénink navazuje na mikrocyklus týdne – doplň kontext v odpovědi.';

  return `📅 ${dateLabel} – ${item.title}
• **Parametry:** ${params}
• **Odůvodnění trenéra:** ${reasoning}`;
}

export function buildWorkoutPlanChatSection(workouts: WorkoutPlanItem[]): string {
  if (workouts.length === 0) return '';

  return [...workouts]
    .sort((a, b) => a.date.localeCompare(b.date) || a.phase.localeCompare(b.phase))
    .map(formatSingleWorkoutChatBlock)
    .join('\n\n');
}

export function replyHasStructuredWorkoutPlan(text: string, workoutCount: number): boolean {
  if (workoutCount === 0) return true;
  const emojiCount = text.match(/📅/g)?.length ?? 0;
  return emojiCount >= workoutCount && /[Oo]důvodnění/.test(text) && /[Pp]arametry/.test(text);
}

/** Doplní strukturovaný rozpis plánu do odpovědi, pokud AI neformátovala dle šablony */
export function enrichReplyWithWorkoutPlanFormat(
  replyText: string,
  workouts: WorkoutPlanItem[],
): string {
  if (workouts.length === 0) return replyText;
  if (replyHasStructuredWorkoutPlan(replyText, workouts.length)) return replyText;

  const section = buildWorkoutPlanChatSection(workouts);
  const trimmed = replyText.trim();

  if (!trimmed) {
    return `Upravil jsem tvůj plán a uložil ho do kalendáře:\n\n${section}`;
  }

  return `${trimmed}\n\n${section}`;
}
