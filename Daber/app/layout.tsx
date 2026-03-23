import './globals.css';
import React from 'react';
import FooterNav from '@/app/FooterNav';
import { SettingsProvider } from '@/lib/client/settings';
import { ToastProvider } from '@/lib/client/toast';

export const metadata = {
  title: 'Daber · Hebrew Drills',
  description: 'Prompt → answer → evaluation → correction',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0b1020" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body>
        <SettingsProvider>
          <ToastProvider>
            <div className="app-shell">
              <main className="app-main">{children}</main>
              <FooterNav />
            </div>
          </ToastProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
