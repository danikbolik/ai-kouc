import { z } from 'zod';

export const activityTypeSchema = z.enum([
  'klus',
  'tempo',
  'intervals',
  'longrun',
  'strength',
  'mobility',
  'rest',
  'race',
]);

export const bookReferenceSchema = z
  .object({
    bookTitle: z.string().optional().nullable(),
    chapterOrPage: z.string().optional().nullable(),
    quote: z.string().optional().nullable(),
  })
  .optional()
  .nullable();

export const plannedSchema = z.object({
  distanceKm: z.coerce.number().optional().nullable(),
  targetPace: z.string().optional().nullable(),
  targetHR: z.coerce.number().optional().nullable(),
  description: z.string().optional().nullable().default(''),
  bookReference: bookReferenceSchema,
});

export const stravaLapSummarySchema = z.object({
  index: z.coerce.number(),
  label: z.string(),
  distanceKm: z.coerce.number(),
  pace: z.string(),
  avgHR: z.coerce.number(),
  durationSec: z.coerce.number(),
});

export const stravaHrZoneSummarySchema = z.object({
  zone: z.enum(['Z1', 'Z2', 'Z3', 'Z4', 'Z5']),
  minHR: z.coerce.number(),
  maxHR: z.coerce.number(),
  timeSec: z.coerce.number(),
  percent: z.coerce.number(),
});

export const actualSchema = z
  .object({
    distanceKm: z.coerce.number(),
    durationMin: z.coerce.number().optional().nullable(),
    avgPace: z.string(),
    avgHR: z.coerce.number(),
    garminSyncStatus: z.enum(['synced', 'pending']).catch('pending'),
    stravaActivityId: z.coerce.number().optional().nullable(),
    laps: z.array(stravaLapSummarySchema).optional().nullable(),
    hrZones: z.array(stravaHrZoneSummarySchema).optional().nullable(),
  })
  .optional()
  .nullable();

export const workoutSessionSchema = z.object({
  id: z.string(),
  phase: z.enum(['AM', 'PM', 'EVENING']).catch('AM'),
  title: z.string(),
  type: activityTypeSchema.catch('klus'),
  isLocked: z.boolean().optional().default(false),
  planned: plannedSchema.default({ description: '' }),
  actual: actualSchema,
});

export const dayFeedbackSchema = z.object({
  rpe: z.coerce.number().min(1).max(10).optional().nullable(),
  readinessScore: z.coerce.number().min(1).max(10).optional().nullable(),
  sleepQuality: z.coerce.number().min(1).max(10).optional().nullable(),
  userComment: z.string().optional().nullable(),
});

export const workoutIntervalSchema = z.object({
  repetitions: z.coerce.number().min(1),
  segmentValue: z.coerce.number().min(1),
  segmentUnit: z.enum(['m', 'km', 'min']),
  targetPace: z.string().optional().nullable(),
  targetZone: z.enum(['Z1', 'Z2', 'Z3', 'Z4', 'Z5']).optional().nullable(),
  recoveryValue: z.coerce.number().optional().nullable(),
  recoveryUnit: z.enum(['min', 'm', 'km']).optional().nullable(),
});

export const workoutPlanItemSchema = z.object({
  id: z.string().optional(),
  date: z.string(),
  phase: z.enum(['AM', 'PM', 'EVENING']),
  title: z.string(),
  type: activityTypeSchema,
  isLocked: z.boolean().optional(),
  distanceKm: z.coerce.number().optional().nullable(),
  targetPace: z.string().optional().nullable(),
  targetHR: z.coerce.number().optional().nullable(),
  description: z.string().optional().nullable().default(''),
  intervals: z.array(workoutIntervalSchema).optional().nullable(),
  bookReference: bookReferenceSchema,
});

export const plannedWorkoutSchema = z.object({
  id: z.string(),
  phase: z.enum(['AM', 'PM', 'EVENING']).catch('AM'),
  title: z.string(),
  type: activityTypeSchema.catch('klus'),
  isLocked: z.boolean().optional().default(false),
  distanceKm: z.coerce.number().optional().nullable(),
  targetPace: z.string().optional().nullable(),
  targetHR: z.coerce.number().optional().nullable(),
  description: z.string().optional().nullable().default(''),
  intervals: z.array(workoutIntervalSchema).optional().nullable(),
  bookReference: bookReferenceSchema,
});

export const activitySchema = z.object({
  id: z.string(),
  stravaActivityId: z.coerce.number().optional().nullable(),
  title: z.string(),
  type: activityTypeSchema.catch('klus'),
  phase: z.enum(['AM', 'PM', 'EVENING']).optional(),
  distanceKm: z.coerce.number(),
  durationMin: z.coerce.number().optional().nullable(),
  avgPace: z.string(),
  avgHR: z.coerce.number(),
  garminSyncStatus: z.enum(['synced', 'pending']).catch('synced'),
  laps: z.array(stravaLapSummarySchema).optional().nullable(),
  hrZones: z.array(stravaHrZoneSummarySchema).optional().nullable(),
});

export const dayDataSchema = z.object({
  date: z.string(),
  activities: z.array(activitySchema).optional().default([]),
  plannedWorkouts: z.array(plannedWorkoutSchema).optional().default([]),
  sessions: z.array(workoutSessionSchema).optional(),
  feedback: dayFeedbackSchema.optional().nullable(),
});

export const recalculateResponseSchema = z.object({
  updatedDays: z.record(z.string(), dayDataSchema),
});

export const chatReferenceSchema = z.object({
  bookTitle: z.string(),
  chapterOrPage: z.string(),
  quote: z.string(),
});

export const calendarActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('upsert_planned_workout'),
    date: z.string(),
    workout: plannedWorkoutSchema,
  }),
  z.object({
    type: z.literal('delete_planned_workout'),
    date: z.string(),
    workoutId: z.string(),
  }),
  z.object({
    type: z.literal('create_workout_plan'),
    workouts: z.array(workoutPlanItemSchema),
  }),
  z.object({
    type: z.literal('upsert_session'),
    date: z.string(),
    session: workoutSessionSchema,
  }),
  z.object({
    type: z.literal('delete_session'),
    date: z.string(),
    sessionId: z.string(),
  }),
]);

export const chatResponseSchema = z.object({
  replyText: z.string(),
  references: z.array(chatReferenceSchema).optional().default([]),
  calendarActions: z.array(calendarActionSchema).optional().default([]),
  workoutPlan: z.array(workoutPlanItemSchema).optional().default([]),
});
