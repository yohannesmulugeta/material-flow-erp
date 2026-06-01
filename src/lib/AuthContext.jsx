import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, DEMO_MODE } from '@/api/supabaseClient';

// Cache the last-good profile in localStorage so reloads while offline don't
// bounce admins to "Pending Approval" while we wait on the network.
const PROFILE_CACHE_KEY = 'mferp.profile.v1';

const AuthContext = createContext(null);

function readCachedProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCachedProfile(p) {
  try {
    if (p) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
    else localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch { /* ignore */ }
}

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const isAuthenticated = !!session && !!user;
  const isLoadingPublicSettings = false; // legacy field kept for App.jsx compat

  const refreshProfile = useCallback(async (uid) => {
    if (!uid) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();
      if (error) throw error;
      setProfile(data);
      writeCachedProfile({ id: data.id, email: data.email, role: data.role, full_name: data.full_name, status: data.status });
      return data;
    } catch (e) {
      // Offline / 401 — fall back to cache so an admin reload doesn't
      // demote them to "Pending Approval" until network returns.
      const cached = readCachedProfile();
      if (cached && cached.id === uid) {
        setProfile(cached);
        return cached;
      }
      // eslint-disable-next-line no-console
      console.warn('[Auth] could not load profile', e?.message);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Safety timeout — if Supabase never responds (wrong URL / no network)
    // unblock the UI after 8 seconds so the user sees an error instead of a spinner.
    const timeout = setTimeout(() => {
      if (mounted && !authChecked) {
        setIsLoadingAuth(false);
        setAuthChecked(true);
        setAuthError({ type: 'timeout', message: 'Could not connect to the server. Check your internet connection.' });
      }
    }, 8000);

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        const sess = data?.session || null;
        setSession(sess);
        setUser(sess?.user || null);
        if (sess?.user) {
          await refreshProfile(sess.user.id);
        } else if (DEMO_MODE) {
          // optional: silently sign in a fixed demo account if creds are set
          const dEmail = import.meta.env.VITE_DEMO_EMAIL;
          const dPass  = import.meta.env.VITE_DEMO_PASSWORD;
          if (dEmail && dPass) {
            try {
              await supabase.auth.signInWithPassword({ email: dEmail, password: dPass });
              const { data: s2 } = await supabase.auth.getSession();
              setSession(s2?.session || null);
              setUser(s2?.session?.user || null);
              if (s2?.session?.user) await refreshProfile(s2.session.user.id);
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('[DemoMode] auto-login failed', e?.message);
            }
          }
        }
      } catch (e) {
        if (mounted) setAuthError({ type: 'unknown', message: e?.message || 'Auth init failed' });
      } finally {
        if (mounted) {
          setIsLoadingAuth(false);
          setAuthChecked(true);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      setSession(sess || null);
      setUser(sess?.user || null);
      if (sess?.user) {
        await refreshProfile(sess.user.id);
      } else {
        setProfile(null);
        writeCachedProfile(null);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      sub?.subscription?.unsubscribe?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshProfile]);

  const logout = useCallback(async (shouldRedirect = true) => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    writeCachedProfile(null);
    if (shouldRedirect) window.location.href = '/login';
  }, []);

  const navigateToLogin = useCallback(() => {
    window.location.href = '/login';
  }, []);

  const checkUserAuth = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      setSession(data?.session || null);
      setUser(data?.session?.user || null);
      if (data?.session?.user) await refreshProfile(data.session.user.id);
      setAuthChecked(true);
    } catch {
      setAuthChecked(true);
    }
  }, [refreshProfile]);

  const checkAppState = checkUserAuth; // legacy alias

  const role = profile?.role || 'unassigned';
  const isRoleAssigned = role && role !== 'unassigned';

  // merged "user" object for pages that still read role/full_name off `user`
  const mergedUser = user ? {
    id: user.id,
    email: user.email,
    full_name: profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0],
    role,
    status: profile?.status || 'active',
    phone: profile?.phone || null,
    ...profile,
  } : null;

  return (
    <AuthContext.Provider value={{
      session,
      user: mergedUser,
      profile,
      role,
      isAuthenticated,
      isRoleAssigned,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      authChecked,
      appPublicSettings: { id: 'material-flow-erp', public_settings: {} },
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
      refreshProfile: () => user && refreshProfile(user.id),
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
