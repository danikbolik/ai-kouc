'use client';

import { useEffect } from 'react';

import { CalendarView } from '../components/calendar/CalendarView';
import { ChatView } from '../components/chat/ChatView';
import { Header } from '../components/layout/Header';
import { SettingsDrawer } from '../components/layout/SettingsDrawer';
import { useTrainingStore } from '../store/useTrainingStore';

export default function HomePage() {
  const activeTab = useTrainingStore((s) => s.activeTab);
  const setStravaConnected = useTrainingStore((s) => s.setStravaConnected);
  const setStravaError = useTrainingStore((s) => s.setStravaError);
  const syncLatestStravaActivities = useTrainingStore((s) => s.syncLatestStravaActivities);
  const maybeAutoSyncStrava = useTrainingStore((s) => s.maybeAutoSyncStrava);
  const setSettingsOpen = useTrainingStore((s) => s.setSettingsOpen);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stravaStatus = params.get('strava');

    if (stravaStatus === 'connected') {
      setStravaConnected(true);
      setSettingsOpen(true);

      const runSync = () => void syncLatestStravaActivities({ force: true });
      window.setTimeout(runSync, 500);

      params.delete('strava');
      const newUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    }

    if (stravaStatus === 'error') {
      const reason = params.get('reason') ?? 'unknown';
      setStravaError(decodeURIComponent(reason));
      setSettingsOpen(true);
      params.delete('strava');
      params.delete('reason');
      const newUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [setStravaConnected, setStravaError, syncLatestStravaActivities, setSettingsOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void maybeAutoSyncStrava();
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [maybeAutoSyncStrava]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />
      <SettingsDrawer />

      <main className={activeTab === 'calendar' ? 'flex flex-1 flex-col' : 'hidden'}>
        <CalendarView />
      </main>

      <main
        className={
          activeTab === 'chat'
            ? 'flex h-[calc(100vh-4rem)] flex-1 flex-col'
            : 'hidden h-[calc(100vh-4rem)] flex-1 flex-col'
        }
      >
        <ChatView />
      </main>
    </div>
  );
}
