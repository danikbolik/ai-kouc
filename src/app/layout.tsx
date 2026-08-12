import type { Metadata } from 'next';

import { AppProviders } from '../components/providers/AppProviders';

import './globals.css';

export const metadata: Metadata = {
  title: 'AI Coach – Vytrvalostní metodik',
  description: 'Tréninkový AI analytik pro vytrvalostní sport',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
