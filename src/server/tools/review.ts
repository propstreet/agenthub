/**
 * Review operation handlers (g.review)
 */

import { nanoid } from 'nanoid';
import type { ReviewRequestPayload, HubOpResponse } from '../types/models.js';
import type { MessageBus } from '../core/bus.js';
import type { StateCache } from '../core/state-cache.js';
import { getCurrentSessionId } from '../session-context.js';

export async function handleReviewRequest(
  bus: MessageBus,
  state: StateCache,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    const data = payload as ReviewRequestPayload;

    // Get agent name from session (or use 'unknown' if no session)
    const sessionId = getCurrentSessionId();
    const agentName = sessionId !== undefined ? state.getAgentForSession(sessionId) : undefined;
    const origin = agentName ?? 'unknown';

    // Validate agent ownership if session exists
    if (sessionId !== undefined && agentName !== undefined) {
      state.validateAgentOwnership(agentName, sessionId);
    }

    // Create review job
    const jobId = nanoid(12);
    const reviewJob = {
      id: jobId,
      scope: data.scope,
      origin,
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
      agent: origin,
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
