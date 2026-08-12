'use client';

import { CloudSyncProvider } from './CloudSyncProvider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <CloudSyncProvider>{children}</CloudSyncProvider>;
}
