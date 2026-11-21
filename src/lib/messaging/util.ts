import { useEffect, useState } from 'react';

export function isDocumentVisible(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible';
}

/** True while the window is visible. Used to decide whether an incoming message counts as displayed. */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(isDocumentVisible);
  useEffect(() => {
    const update = () => setVisible(isDocumentVisible());
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);
  return visible;
}

/** Idempotency key for a message. Retries reuse the same key, so the server can recognise them. */
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Date separator text: Today, Yesterday, or a full date. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (localDayKey(date) === localDayKey(now)) return 'Today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (localDayKey(date) === localDayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Inbox row time: a clock time for today, a weekday within the week, otherwise a short date. */
export function listTimeLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (localDayKey(date) === localDayKey(now)) return timeLabel(iso);
  const daysAgo = Math.floor((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (daysAgo < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dayKeyFor(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : localDayKey(date);
}
