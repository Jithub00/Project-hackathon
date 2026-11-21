import { useContext, useSyncExternalStore } from 'react';
import { StoreContext } from './store-context';
import type { MessagingState, MessagingStore, ThreadState } from './store';

function useStoreInstance(): MessagingStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('Messaging hooks must be used inside MessagingProvider.');
  return store;
}

export function useMessagingStore(): MessagingStore {
  return useStoreInstance();
}

/** Subscribes to one slice of messaging state. Selectors must return stable references, such as stored objects or primitives. */
export function useMessagingSelector<T>(selector: (state: MessagingState) => T): T {
  const store = useStoreInstance();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}

export function useThread(key: string): ThreadState | undefined {
  return useMessagingSelector((state) => state.threads[key]);
}
