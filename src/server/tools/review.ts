/**
 * Review operation handlers (g.review)
 */

import { nanoid } from 'nanoid';
import type { ReviewRequestPayload, HubOpResponse } from '../types/models.js';
import type { MessageBus } from '../core/bus.js';
import type { StateCache } from '../core/state-cache.js';

export async function handleReviewRequest(
  bus: MessageBus,
  state: StateCache,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    const data = payload as ReviewRequestPayload;

    // Create review job
    const jobId = nanoid(12);
    const reviewJob = {
      id: jobId,
      scope: data.scope,
      origin: 'manual', // TODO: get actual agent name from context
      status: 'pending' as const,
      createdAt: Date.now(),
      ...(data.summary !== undefined && { summary: data.summary }),
    };

    state.addReviewJob(reviewJob);

    // Emit review event for reviewers to claim
    bus.emit({
      type: 'REVIEW_EVENT',
      action: 'requested',
      jobId,
      agent: 'manual',
      ts: Date.now(),
    });

    console.log(`[Review] Review job created: ${jobId} for scope: ${data.scope.join(', ')}`);

    return {
      ok: true,
      d: { jobId },
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
