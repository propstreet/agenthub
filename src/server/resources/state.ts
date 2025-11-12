/**
 * State resource handler - state://live
 * Returns aggregate live state snapshot
 */

import type { StateCache } from '../core/state-cache.js';

export function handleStateResource(state: StateCache): string {
  const snapshot = state.getSnapshot();

  // Return as formatted JSON
  return JSON.stringify(snapshot, null, 2);
}
