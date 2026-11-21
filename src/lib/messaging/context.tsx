import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '@/lib/app-context';
import { MessageNotices } from '@/components/messages/MessageNotices';
import { StoreContext } from './store-context';
import { MessagingStore } from './store';

/**
 * Owns the messaging store and keeps it bound to the signed-in account. Signing out or switching accounts resets the
 * store, which closes the stream and drops every conversation from memory. Nothing renders until sign-in is confirmed.
 */
export function MessagingProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useApp();
  const [store] = useState(() => new MessagingStore());
  const viewerId = user?.id ?? null;

  useEffect(() => {
    store.setUnauthorizedHandler(() => {
      void refreshUser();
    });
    return () => store.setUnauthorizedHandler(null);
  }, [store, refreshUser]);

  useEffect(() => {
    store.setViewer(viewerId);
    return () => store.setViewer(null);
  }, [store, viewerId]);

  return (
    <StoreContext.Provider value={store}>
      {children}
      <MessageNotices />
    </StoreContext.Provider>
  );
}
