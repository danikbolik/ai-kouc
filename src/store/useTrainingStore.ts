import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  addCoachNote as appendCoachNote,
  deleteCoachNote as removeCoachNote,
  updateCoachNote as patchCoachNote,
} from '../lib/coachNotesStore';
import {
  buildApiKeyHeaders,
  EMPTY_API_KEYS,
  type ApiKeys,
} from '../lib/apiKeyHeaders';
import {
  applyCalendarActionsToDays,
  createEmptyPlannedWorkout,
  mergeActivitiesForDay,
  normalizePlannedWorkout,
} from '../lib/calendarActions';
import {
  emptyDay,
  legacySessionsToDay,
  normalizeAllDays,
  normalizeDayData,
} from '../lib/dayData';
import { getTodayDate } from '../lib/dates';
import {
  collectLockedSessions,
  getHistorySummary,
} from '../lib/planAdaptation';
import { createStravaDayData } from '../lib/strava';
import type { CoachNote, CoachNoteInput } from '../types/coachNotes';
import type { RecalculateRequest, CalendarAction } from '../types/api';
import {
  DEFAULT_PACE_ZONES,
  DEFAULT_USER_METRICS,
  type UploadedMethodology,
  type UserMetrics,
} from '../types/settings';
import type { Activity, DayData, PlannedWorkout, WorkoutSession } from '../types/training';

import type { UserDataSnapshot } from '../types/userData';

type CalendarView = 'month' | '2weeks' | 'week';
type ActiveTab = 'calendar' | 'chat';
type CloudSyncStatus = 'idle' | 'loading' | 'syncing' | 'error' | 'offline';

interface TrainingState {
  days: Record<string, DayData>;
  selectedDate: string;
  selectedSessionId: string | null;
  isDetailModalOpen: boolean;
  isEditModalOpen: boolean;
  editSessionId: string | null;
  isRecalculating: boolean;
  stravaConnected: boolean;
  isStravaSyncing: boolean;
  stravaError: string | null;
  calendarRevision: number;
  calendarAnchorDate: string;
  currentView: CalendarView;
  activeTab: ActiveTab;
  isSettingsOpen: boolean;
  apiKeys: ApiKeys;
  userMetrics: UserMetrics;
  uploadedMethodology: UploadedMethodology[];
  coachNotes: CoachNote[];
  cloudSyncStatus: CloudSyncStatus;
}

interface TrainingActions {
  setSelectedDate: (date: string) => void;
  setCalendarAnchorDate: (date: string) => void;
  setCurrentView: (view: CalendarView) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setSettingsOpen: (isOpen: boolean) => void;
  openDetailModal: (date: string, sessionId?: string) => void;
  closeDetailModal: () => void;
  openEditModal: (date: string, sessionId?: string | null) => void;
  closeEditModal: () => void;
  upsertPlannedWorkout: (date: string, workout: PlannedWorkout) => void;
  deletePlannedWorkout: (date: string, workoutId: string) => void;
  upsertSession: (date: string, session: WorkoutSession) => void;
  deleteSession: (date: string, sessionId: string) => void;
  applyCalendarActions: (actions: CalendarAction[]) => number;
  toggleLockWorkout: (date: string, sessionId: string) => void;
  updateFeedback: (date: string, feedback: Partial<DayData['feedback']>) => void;
  recalculatePlan: (fromDate: string) => Promise<void>;
  setStravaConnected: (connected: boolean) => void;
  setStravaError: (error: string | null) => void;
  syncStravaActivities: () => Promise<void>;
  disconnectStrava: () => Promise<void>;
  setApiKeys: (keys: Partial<ApiKeys>) => void;
  setUserMetrics: (metrics: Partial<UserMetrics>) => void;
  addUploadedMethodology: (document: UploadedMethodology) => void;
  removeUploadedMethodology: (id: string) => void;
  connectStrava: () => void;
  addCoachNote: (input: CoachNoteInput) => void;
  updateCoachNote: (id: string, updates: Partial<Pick<CoachNote, 'text' | 'category' | 'date'>>) => void;
  deleteCoachNote: (id: string) => void;
  addCoachNotesFromAi: (inputs: CoachNoteInput[]) => void;
  hydrateFromCloud: (snapshot: UserDataSnapshot) => void;
  setCloudSyncStatus: (status: CloudSyncStatus) => void;
}

function bumpDay(
  days: Record<string, DayData>,
  date: string,
  day: DayData,
): Record<string, DayData> {
  const normalized = normalizeDayData(day);
  if (normalized.plannedWorkouts.length === 0 && normalized.activities.length === 0) {
    const next = { ...days };
    delete next[date];
    return next;
  }
  return { ...days, [date]: normalized };
}

export const useTrainingStore = create<TrainingState & TrainingActions>()(
  persist(
    (set, get) => ({
      days: {},
      selectedDate: getTodayDate(),
      selectedSessionId: null,
      isDetailModalOpen: false,
      isEditModalOpen: false,
      editSessionId: null,
      isRecalculating: false,
      stravaConnected: false,
      isStravaSyncing: false,
      stravaError: null,
      calendarRevision: 0,
      calendarAnchorDate: getTodayDate(),
      currentView: 'month',
      activeTab: 'calendar',
      isSettingsOpen: false,
      apiKeys: { ...EMPTY_API_KEYS },
      userMetrics: { ...DEFAULT_USER_METRICS },
      uploadedMethodology: [],
      coachNotes: [],
      cloudSyncStatus: 'loading',

      setSelectedDate: (date) => set({ selectedDate: date }),
      setCalendarAnchorDate: (date) => set({ calendarAnchorDate: date }),
      setCurrentView: (view) => set({ currentView: view }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),

      setApiKeys: (keys) =>
        set((state) => ({ apiKeys: { ...state.apiKeys, ...keys } })),

      setUserMetrics: (metrics) =>
        set((state) => ({ userMetrics: { ...state.userMetrics, ...metrics } })),

      addUploadedMethodology: (document) =>
        set((state) => ({
          uploadedMethodology: [...state.uploadedMethodology, document],
        })),

      removeUploadedMethodology: (id) =>
        set((state) => ({
          uploadedMethodology: state.uploadedMethodology.filter((doc) => doc.id !== id),
        })),

      openDetailModal: (date, sessionId) =>
        set({
          selectedDate: date,
          selectedSessionId: sessionId ?? null,
          isDetailModalOpen: true,
        }),

      closeDetailModal: () =>
        set({ isDetailModalOpen: false, selectedSessionId: null }),

      openEditModal: (date, sessionId = null) =>
        set({
          selectedDate: date,
          editSessionId: sessionId,
          isEditModalOpen: true,
          isDetailModalOpen: false,
        }),

      closeEditModal: () => set({ isEditModalOpen: false, editSessionId: null }),

      upsertPlannedWorkout: (date, workout) =>
        set((state) => {
          const normalized = normalizePlannedWorkout(workout);
          const day = normalizeDayData(state.days[date] ?? emptyDay(date));
          const index = day.plannedWorkouts.findIndex((w) => w.id === normalized.id);
          const plannedWorkouts =
            index >= 0
              ? day.plannedWorkouts.map((w, i) => (i === index ? normalized : w))
              : [...day.plannedWorkouts, normalized];

          return {
            days: bumpDay(state.days, date, { ...day, plannedWorkouts }),
            calendarRevision: state.calendarRevision + 1,
          };
        }),

      deletePlannedWorkout: (date, workoutId) =>
        set((state) => {
          const day = state.days[date];
          if (!day) return state;
          const normalized = normalizeDayData(day);
          return {
            days: bumpDay(state.days, date, {
              ...normalized,
              plannedWorkouts: normalized.plannedWorkouts.filter((w) => w.id !== workoutId),
            }),
            calendarRevision: state.calendarRevision + 1,
          };
        }),

      upsertSession: (date, session) => {
        get().upsertPlannedWorkout(date, {
          id: session.id,
          phase: session.phase,
          title: session.title,
          type: session.type,
          isLocked: session.isLocked ?? false,
          distanceKm: session.planned.distanceKm,
          targetPace: session.planned.targetPace,
          targetHR: session.planned.targetHR,
          description: session.planned.description ?? '',
          bookReference: session.planned.bookReference,
        });
      },

      deleteSession: (date, sessionId) => {
        get().deletePlannedWorkout(date, sessionId);
      },

      applyCalendarActions: (actions) => {
        if (actions.length === 0) return 0;
        set((state) => ({
          days: normalizeAllDays(applyCalendarActionsToDays(state.days, actions)),
          calendarRevision: state.calendarRevision + 1,
        }));
        return actions.length;
      },

      toggleLockWorkout: (date, sessionId) =>
        set((state) => {
          const day = state.days[date];
          if (!day) return state;
          const normalized = normalizeDayData(day);
          return {
            days: {
              ...state.days,
              [date]: {
                ...normalized,
                plannedWorkouts: normalized.plannedWorkouts.map((w) =>
                  w.id === sessionId ? { ...w, isLocked: !w.isLocked } : w,
                ),
              },
            },
            calendarRevision: state.calendarRevision + 1,
          };
        }),

      updateFeedback: (date, feedback) =>
        set((state) => {
          const day = normalizeDayData(state.days[date] ?? emptyDay(date));
          return {
            days: {
              ...state.days,
              [date]: { ...day, feedback: { ...day.feedback, ...feedback } },
            },
          };
        }),

      recalculatePlan: async (fromDate) => {
        const state = get();
        if (state.isRecalculating) return;

        set({ isRecalculating: true });

        try {
          const normalizedDays = normalizeAllDays(state.days);
          const readinessScore = normalizedDays[fromDate]?.feedback?.readinessScore ?? 5;

          const payload: RecalculateRequest = {
            fromDate,
            readinessScore,
            lockedSessions: collectLockedSessions(normalizedDays, fromDate),
            userMetrics: state.userMetrics,
            historySummary: getHistorySummary(normalizedDays, fromDate),
            currentDays: Object.fromEntries(
              Object.entries(normalizedDays).filter(([date]) => date >= fromDate),
            ),
            uploadedMethodology: state.uploadedMethodology,
          };

          const response = await fetch('/api/recalculate', {
            method: 'POST',
            headers: buildApiKeyHeaders(state.apiKeys),
            body: JSON.stringify(payload),
          });

          if (!response.ok) throw new Error(`Recalculate failed: ${response.status}`);

          const data = (await response.json()) as {
            updatedDays: Record<string, DayData & { sessions?: WorkoutSession[] }>;
          };

          set((current) => {
            const merged = { ...normalizeAllDays(current.days) };

            for (const [date, updatedDay] of Object.entries(data.updatedDays)) {
              const existing = merged[date];
              const activities = existing ? normalizeDayData(existing).activities : [];

              if (updatedDay.plannedWorkouts && updatedDay.plannedWorkouts.length > 0) {
                merged[date] = {
                  date,
                  activities,
                  plannedWorkouts: updatedDay.plannedWorkouts,
                  feedback: updatedDay.feedback ?? existing?.feedback,
                };
                continue;
              }

              const fromSessions = legacySessionsToDay(
                date,
                updatedDay.sessions ?? [],
                updatedDay.feedback,
              );

              merged[date] = {
                date,
                activities,
                plannedWorkouts: fromSessions.plannedWorkouts,
                feedback: updatedDay.feedback ?? existing?.feedback,
              };
            }

            return {
              days: merged,
              isRecalculating: false,
              calendarRevision: current.calendarRevision + 1,
            };
          });
        } catch (error) {
          console.error('[recalculatePlan]', error);
          set({ isRecalculating: false });
        }
      },

      addCoachNote: (input) =>
        set((state) => ({
          coachNotes: appendCoachNote(state.coachNotes, input),
        })),

      updateCoachNote: (id, updates) =>
        set((state) => ({
          coachNotes: patchCoachNote(state.coachNotes, id, updates),
        })),

      deleteCoachNote: (id) =>
        set((state) => ({
          coachNotes: removeCoachNote(state.coachNotes, id),
        })),

      addCoachNotesFromAi: (inputs) =>
        set((state) => {
          let notes = state.coachNotes;
          for (const input of inputs) {
            if (!input.text?.trim()) continue;
            notes = appendCoachNote(notes, input);
          }
          return { coachNotes: notes };
        }),

      hydrateFromCloud: (snapshot) =>
        set({
          days: normalizeAllDays(snapshot.days ?? {}),
          userMetrics: {
            ...DEFAULT_USER_METRICS,
            ...snapshot.userMetrics,
            paceZones: snapshot.userMetrics?.paceZones?.length
              ? snapshot.userMetrics.paceZones
              : DEFAULT_PACE_ZONES,
          },
          coachNotes: snapshot.coachNotes ?? [],
          uploadedMethodology: snapshot.uploadedMethodology ?? [],
          apiKeys: {
            ...EMPTY_API_KEYS,
            ...snapshot.apiKeys,
          },
          stravaConnected: snapshot.stravaConnected ?? false,
        }),

      setCloudSyncStatus: (status) => set({ cloudSyncStatus: status }),

      setStravaConnected: (connected) => set({ stravaConnected: connected }),

      setStravaError: (error) => set({ stravaError: error }),

      connectStrava: () => {
        const returnTo = encodeURIComponent('/settings?strava=connected');
        window.location.href = `/api/strava/login?returnTo=${returnTo}`;
      },

      syncStravaActivities: async () => {
        if (get().isStravaSyncing) return;
        set({ isStravaSyncing: true, stravaError: null });

        try {
          const response = await fetch('/api/strava/sync', {
            method: 'POST',
            headers: buildApiKeyHeaders(get().apiKeys),
            body: JSON.stringify({}),
          });

          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? `Strava sync failed (${response.status})`);
          }

          const data = (await response.json()) as {
            activitiesCount: number;
            syncedDates: string[];
            activitiesByDate: Record<string, Activity[]>;
          };

          set((state) => {
            let updatedDays = normalizeAllDays(state.days);

            for (const [date, incomingActivities] of Object.entries(data.activitiesByDate)) {
              const existing = updatedDays[date];
              updatedDays[date] = existing
                ? mergeActivitiesForDay(existing, incomingActivities, date)
                : createStravaDayData(date, incomingActivities);
            }

            return {
              days: updatedDays,
              stravaConnected: true,
              isStravaSyncing: false,
              stravaError: null,
              calendarRevision: state.calendarRevision + 1,
            };
          });
        } catch (error) {
          console.error('[syncStravaActivities]', error);
          set({
            isStravaSyncing: false,
            stravaError:
              error instanceof Error ? error.message : 'Synchronizace se Stravou selhala.',
          });
        }
      },

      disconnectStrava: async () => {
        try {
          await fetch('/api/strava/callback', {
            method: 'DELETE',
            headers: buildApiKeyHeaders(get().apiKeys),
          });
          set({ stravaConnected: false });
        } catch (error) {
          console.error('[disconnectStrava]', error);
        }
      },
    }),
    {
      name: 'training-app-storage',
      partialize: (state) => ({
        days: state.days,
        apiKeys: state.apiKeys,
        userMetrics: state.userMetrics,
        uploadedMethodology: state.uploadedMethodology,
        stravaConnected: state.stravaConnected,
        coachNotes: state.coachNotes,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.days = normalizeAllDays(state.days);
          if (!state.userMetrics.paceZones?.length) {
            state.userMetrics = {
              ...state.userMetrics,
              paceZones: DEFAULT_PACE_ZONES,
            };
          }
        }
      },
    },
  ),
);

export { createEmptyPlannedWorkout };
