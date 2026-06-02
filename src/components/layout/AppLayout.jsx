import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useTheme } from '@/lib/useTheme';
import { useAuth } from '@/lib/AuthContext';
import NotificationCenter from '@/components/NotificationCenter';
import GlobalSearch from '@/components/GlobalSearch';

export default function AppLayout() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        user={user}
        theme={theme}
        toggleTheme={toggleTheme}
        onLogout={() => logout(true)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with search + notifications */}
        <header className="h-12 lg:h-14 border-b border-border bg-card flex items-center gap-3 px-4 lg:px-6 flex-shrink-0">
          <div className="w-8 lg:hidden" /> {/* spacer for mobile menu button */}
          <div className="flex-1">
            <GlobalSearch />
          </div>
          <NotificationCenter />
        </header>
        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-6 max-w-screen-2xl">
            <Outlet context={{ user, theme }} />
          </div>
        </main>
      </div>
    </div>
  );
}
