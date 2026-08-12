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
  const syncStravaActivities = useTrainingStore((s) => s.syncStravaActivities);
  const setSettingsOpen = useTrainingStore((s) => s.setSettingsOpen);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stravaStatus = params.get('strava');

    if (stravaStatus === 'connected') {
      setStravaConnected(true);
      setSettingsOpen(true);
      void syncStravaActivities();

      params.delete('strava');
      const newUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [setStravaConnected, syncStravaActivities, setSettingsOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />
      <SettingsDrawer />

      {activeTab === 'calendar' && (
        <main className="flex flex-1 flex-col">
          <CalendarView />
        </main>
      )}

      {activeTab === 'chat' && (
        <main className="flex h-[calc(100vh-4rem)] flex-1 flex-col">
          <ChatView />
        </main>
      )}
    </div>
  );
}
