import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useTheme } from '@/lib/useTheme';
import { useAuth } from '@/lib/AuthContext';

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
      {/* pt-14 gives room for the mobile menu button; lg:pt-6 removes it on desktop */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6 pt-14 lg:pt-6 max-w-screen-2xl">
          <Outlet context={{ user, theme }} />
        </div>
      </main>
    </div>
  );
}
