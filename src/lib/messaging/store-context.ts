import { createContext } from 'react';
import type { MessagingStore } from './store';

/** The messaging store for the current app tree. Provided by MessagingProvider. */
export const StoreContext = createContext<MessagingStore | null>(null);
