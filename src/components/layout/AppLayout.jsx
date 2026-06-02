import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useTheme } from '@/lib/useTheme';
import { useAuth } from '@/lib/AuthContext';
import NotificationCenter from '@/components/NotificationCenter';
import GlobalSearch from '@/components/GlobalSearch';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function AppLayout() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        user={user}
        theme={theme}
        toggleTheme={toggleTheme}
        onLogout={() => logout(true)}
      />

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <header className="
          h-14 border-b border-border bg-card/80 backdrop-blur-sm
          flex items-center gap-3 px-4 lg:px-5
          flex-shrink-0 z-30
          /* Safe area for devices with notch */
          pt-safe
        ">
          {/* Mobile: spacer for hamburger button */}
          <div className="w-10 flex-shrink-0 lg:hidden" />

          {/* Search — takes remaining space */}
          <div className="flex-1 min-w-0">
            <GlobalSearch />
          </div>

          {/* Notifications */}
          <div className="flex-shrink-0">
            <NotificationCenter />
          </div>
        </header>

        {/* ── Page content ────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto scroll-mobile">
          <div className="
            p-4 lg:p-6
            /* Top: extra space on mobile for hamburger */
            pt-4 lg:pt-6
            /* Bottom safe area so content isn't hidden behind home bar */
            pb-safe
            max-w-screen-2xl mx-auto
          ">
            <ErrorBoundary key={location.pathname}>
              <Outlet context={{ user, theme }} />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
