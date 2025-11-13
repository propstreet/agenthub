/**
 * Review operation handlers (g.review)
 */

import { nanoid } from 'nanoid';
import type { HubOpResponse } from '../types/models.js';
import type { MessageBus } from '../core/bus.js';
import type { StateCache } from '../core/state-cache.js';
import { getCurrentSessionId } from '../session-context.js';
import { ReviewRequestSchema, ReviewClaimSchema, ReviewCompleteSchema } from '../schemas/review.js';

export async function handleReviewRequest(
  bus: MessageBus,
  state: StateCache,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    // Parse and normalize payload
    const data = ReviewRequestSchema.parse(payload);

    // Resolve agent from session
    const sessionId = getCurrentSessionId();
    const agentName = sessionId !== undefined ? state.getAgentForSession(sessionId) : data.from;
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

export async function handleReviewClaim(
  state: StateCache,
  bus: MessageBus,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    // Parse and normalize payload
    const data = ReviewClaimSchema.parse(payload);

    // Resolve agent from session
    const sessionId = getCurrentSessionId();
    const agentName = sessionId !== undefined ? state.getAgentForSession(sessionId) : data.agent;

    // Validate agent
    if (agentName === undefined) {
      throw new Error('agent required. Provide agent name or call from authenticated session.');
    }

    // Validate agent ownership if session exists
    if (sessionId !== undefined) {
      state.validateAgentOwnership(agentName, sessionId);
    }

    // Validate agent has reviewer role
    const agent = state.getAgent(agentName);
    if (agent === undefined) {
      throw new Error(`Agent ${agentName} not found`);
    }
    if (!agent.role.includes('reviewer')) {
      throw new Error(
        `Agent ${agentName} does not have 'reviewer' role. Only reviewers can claim jobs.`,
      );
    }

    // Get the review job
    const job = state.getReviewJob(data.jobId);
    if (job === undefined) {
      throw new Error(`Review job ${data.jobId} not found`);
    }

    // Validate job is claimable
    if (job.status !== 'pending') {
      throw new Error(
        `Cannot claim job ${data.jobId}: status is '${job.status}', must be 'pending'`,
      );
    }

    // Update job status to claimed
    state.updateReviewJob(data.jobId, {
      claimedBy: agentName,
      status: 'claimed',
    });

    // Emit review event
    bus.emit({
      type: 'REVIEW_EVENT',
      action: 'claimed',
      jobId: data.jobId,
      agent: agentName,
      ts: Date.now(),
    });

    console.log(`[Review] Job ${data.jobId} claimed by ${agentName}`);

    return {
      ok: true,
      d: { jobId: data.jobId, claimedBy: agentName },
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

export async function handleReviewComplete(
  state: StateCache,
  bus: MessageBus,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    // Parse and normalize payload
    const data = ReviewCompleteSchema.parse(payload);

    // Resolve agent from session
    const sessionId = getCurrentSessionId();
    const agentName = sessionId !== undefined ? state.getAgentForSession(sessionId) : data.agent;

    // Validate agent
    if (agentName === undefined) {
      throw new Error('agent required. Provide agent name or call from authenticated session.');
    }

    // Validate agent ownership if session exists
    if (sessionId !== undefined) {
      state.validateAgentOwnership(agentName, sessionId);
    }

    // Get the review job
    const job = state.getReviewJob(data.jobId);
    if (job === undefined) {
      throw new Error(`Review job ${data.jobId} not found`);
    }

    // Validate job is claimed
    if (job.status !== 'claimed') {
      throw new Error(
        `Cannot complete job ${data.jobId}: status is '${job.status}', must be 'claimed'`,
      );
    }

    // Validate ownership
    if (job.claimedBy !== agentName) {
      const claimedBy = job.claimedBy ?? 'unknown';
      throw new Error(
        `Cannot complete job ${data.jobId}: claimed by '${claimedBy}', not by you ('${agentName}')`,
      );
    }

    // Update job with findings
    state.updateReviewJob(data.jobId, {
      status: 'completed',
      findings: {
        sev: data.severity,
        notes: data.notes,
        ...(data.patch !== undefined && { patch: data.patch }),
        ts: Date.now(),
      },
    });

    // Emit review event
    bus.emit({
      type: 'REVIEW_EVENT',
      action: 'completed',
      jobId: data.jobId,
      agent: agentName,
      ts: Date.now(),
    });

    console.log(
      `[Review] Job ${data.jobId} completed by ${agentName} with severity: ${data.severity}`,
    );

    return {
      ok: true,
      d: {
        jobId: data.jobId,
        severity: data.severity,
        notes: data.notes,
        ...(data.patch !== undefined && { patch: data.patch }),
      },
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
