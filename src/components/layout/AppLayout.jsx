import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useTheme } from '@/lib/useTheme';
import { base44 } from '@/api/base44Client';

export default function AppLayout() {
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const handleLogout = () => {
    base44.auth.logout('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        user={user}
        theme={theme}
        toggleTheme={toggleTheme}
        onLogout={handleLogout}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6 pt-14 lg:pt-6">
          <Outlet context={{ user, theme }} />
        </div>
      </main>
    </div>
  );
}