/**
 * State operation handler (s.get)
 */

import type { StateGetPayload, HubOpResponse, StateSnapshot } from '../types/models.js';
import type { StateCache } from '../core/state-cache.js';

export async function handleStateGet(
  state: StateCache,
  payload: unknown,
): Promise<HubOpResponse<StateSnapshot>> {
  try {
    const data = payload as StateGetPayload;
    const snapshot = state.getSnapshot(data.since);

    return {
      ok: true,
      d: snapshot,
      t: Date.now(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      t: Date.now(),
    };
  }
}
