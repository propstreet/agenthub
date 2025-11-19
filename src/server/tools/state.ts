/**
 * State operation handler (s.get)
 */

import type { HubOpResponse, StateSnapshot } from '../types/models.js';
import type { StateCache } from '../core/state-cache.js';
import { StateGetSchema } from '../schemas/state.js';

export async function handleStateGet(
  state: StateCache,
  payload: unknown,
): Promise<HubOpResponse<StateSnapshot>> {
  try {
    // Use Zod schema for validation
    const data = StateGetSchema.parse(payload);
    const snapshot = state.getSnapshot({
      ...(data.since !== undefined && { since: data.since }),
      ...(data.filter !== undefined && { filter: data.filter }),
    });

    return {
      ok: true,
      d: snapshot as StateSnapshot, // Cast needed because HubOpResponse expects specific type, but Partial is fine for JSON
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
