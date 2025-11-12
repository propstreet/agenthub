/**
 * Lease operation handlers (l.ann)
 */

import type { LeaseAnnouncePayload, HubOpResponse } from '../types/models.js';
import type { Coordinator } from '../core/coordinator.js';

export async function handleLeaseAnnounce(
  coordinator: Coordinator,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    const data = payload as LeaseAnnouncePayload;
    const result = coordinator.announceLease(data);

    return {
      ok: true,
      d: result,
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
