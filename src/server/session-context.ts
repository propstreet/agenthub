/**
 * Session Context
 * Stores current session ID for request scope using AsyncLocalStorage
 */

import { AsyncLocalStorage } from 'node:async_hooks';

interface SessionContext {
  sessionId: string;
}

// AsyncLocalStorage to track current session ID during request processing
export const sessionStorage = new AsyncLocalStorage<SessionContext>();

/**
 * Get current session ID from async context
 */
export function getCurrentSessionId(): string | undefined {
  return sessionStorage.getStore()?.sessionId;
}

/**
 * Set session ID for current async context
 */
export function setSessionContext(sessionId: string): void {
  const store = sessionStorage.getStore();
  if (store !== undefined) {
    store.sessionId = sessionId;
  }
}

/**
 * Run callback with session context
 */
export function runWithSession<T>(sessionId: string, callback: () => T): T {
  return sessionStorage.run({ sessionId }, callback);
}
