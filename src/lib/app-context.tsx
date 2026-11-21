import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import type { AppConfig, SessionUser } from '../../shared/types';

const SESSION_CHANNEL = 'photo-shoot-session';

interface AppContextValue {
  config: AppConfig | null;
  neighborhoods: string[];
  user: SessionUser | null;
  ready: boolean;
  setUser: (user: SessionUser | null) => void;
  refreshUser: () => Promise<SessionUser | null>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  /** Updates this tab only. */
  const applyUser = useCallback((next: SessionUser | null) => {
    setUserState(next);
  }, []);

  /** Tells other tabs that the session changed, so each one checks it again. */
  const announce = useCallback(() => {
    channelRef.current?.postMessage({ type: 'session-changed' });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<{ user: SessionUser | null }>('/api/auth/me');
      applyUser(data.user);
      return data.user;
    } catch {
      applyUser(null);
      return null;
    }
  }, [applyUser]);

  const setUser = useCallback(
    (next: SessionUser | null) => {
      applyUser(next);
      announce();
    },
    [applyUser, announce],
  );

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = () => {
      void refreshUser();
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [refreshUser]);

  useEffect(() => {
    // Check the session again when the tab returns to the foreground, or when the page is restored from the
    // back-forward cache. Protected content is not shown again for an account that has since signed out.
    const revalidate = () => {
      if (document.visibilityState === 'visible') void refreshUser();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refreshUser();
    };
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [refreshUser]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<AppConfig & { neighborhoods: string[] }>('/api/config').catch(() => null),
      api.get<{ user: SessionUser | null }>('/api/auth/me').catch(() => ({ user: null })),
    ]).then(([cfg, me]) => {
      if (!active) return;
      if (cfg) {
        setConfig(cfg);
        setNeighborhoods(cfg.neighborhoods ?? []);
      }
      applyUser(me.user);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [applyUser]);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => undefined);
    applyUser(null);
    announce();
  }, [applyUser, announce]);

  const value = useMemo(
    () => ({ config, neighborhoods, user, ready, setUser, refreshUser, logout }),
    [config, neighborhoods, user, ready, setUser, refreshUser, logout],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
