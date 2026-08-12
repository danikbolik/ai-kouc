'use client';

import { useTrainingStore } from '../../store/useTrainingStore';

const TABS = [
  { id: 'calendar' as const, label: 'KALENDÁŘ', icon: '📅' },
  { id: 'chat' as const, label: 'CHAT S METODIKEM', icon: '💬' },
];

export function Header() {
  const activeTab = useTrainingStore((s) => s.activeTab);
  const setActiveTab = useTrainingStore((s) => s.setActiveTab);
  const setSettingsOpen = useTrainingStore((s) => s.setSettingsOpen);
  const isStravaSyncing = useTrainingStore((s) => s.isStravaSyncing);
  const syncStravaActivities = useTrainingStore((s) => s.syncStravaActivities);
  const cloudSyncStatus = useTrainingStore((s) => s.cloudSyncStatus);
  const stravaConnected = useTrainingStore((s) => s.stravaConnected);

  const cloudLabel =
    cloudSyncStatus === 'loading'
      ? '☁️ Načítám…'
      : cloudSyncStatus === 'syncing'
        ? '☁️ Sync…'
        : cloudSyncStatus === 'error'
          ? '☁️ Chyba'
          : cloudSyncStatus === 'offline'
            ? '💾 Lokálně'
            : '☁️ OK';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white shadow-sm">
            AI
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">
              AI Coach
            </h1>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
              Vytrvalostní metodik
            </span>
          </div>
        </div>

        <nav
          className="absolute left-1/2 hidden -translate-x-1/2 md:flex"
          aria-label="Hlavní navigace"
        >
          <div className="flex rounded-xl bg-slate-100 p-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold tracking-wide transition-all',
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-500 hover:text-slate-700',
                  ].join(' ')}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        <nav className="flex flex-1 justify-center md:hidden" aria-label="Hlavní navigace">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    'flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-semibold tracking-wide transition-all',
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-500',
                  ].join(' ')}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  <span className="hidden xs:inline">{tab.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className="hidden rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-medium text-slate-500 sm:inline"
            title="Stav cloud synchronizace"
          >
            {cloudLabel}
          </span>
          {stravaConnected && (
            <button
              type="button"
              onClick={() => syncStravaActivities()}
              disabled={isStravaSyncing}
              title="Synchronizovat kompletní historii Stravy"
              className="hidden items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800 transition-colors hover:bg-orange-100 disabled:opacity-60 sm:flex"
              aria-label="Synchronizovat Strava"
            >
              <span aria-hidden="true">🔄</span>
              {isStravaSyncing ? 'Sync…' : 'Strava'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
            aria-label="Otevřít nastavení"
          >
            <span aria-hidden="true">⚙️</span>
            <span className="hidden sm:inline">Nastavení</span>
          </button>
        </div>
      </div>
    </header>
  );
}
