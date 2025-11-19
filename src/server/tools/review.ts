/**
 * Review operation handlers (g.review)
 */

import { nanoid } from 'nanoid';
import type { HubOpResponse } from '../types/models.js';
import type { MessageBus } from '../core/bus.js';
import type { StateCache } from '../core/state-cache.js';
import { getCurrentSessionId } from '../session-context.js';
import {
  ReviewRequestSchema,
  ReviewClaimSchema,
  ReviewCompleteSchema,
  ReviewListSchema,
} from '../schemas/review.js';

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

    // Auto-notify all reviewer-role agents with review.requested message
    // Message comes FROM origin agent (not 'system')
    const reviewers = state.getAgentsByRole('reviewer');
    let notifiedCount = 0;
    for (const reviewer of reviewers) {
      if (reviewer.status === 'active' || reviewer.status === 'idle') {
        bus.send({
          from: origin,
          to: reviewer.name,
          type: 'review.requested',
          topic: 'review',
          text: `Review requested: ${data.scope.slice(0, 2).join(', ')}${data.scope.length > 2 ? '...' : ''}`,
          data: {
            jobId,
            scope: data.scope,
            ...(data.summary !== undefined && { summary: data.summary }),
            origin,
            createdAt: Date.now(),
          },
        });
        notifiedCount++;
      }
    }

    console.log(`[Review] Review job created: ${jobId} for scope: ${data.scope.join(', ')}`);
    console.log(`[Review] Notified ${notifiedCount} reviewers`);

    return {
      ok: true,
      d: { jobId, notifiedReviewers: notifiedCount },
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
      claimedAt: Date.now(),
      claimExpiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    // Emit review event
    bus.emit({
      type: 'REVIEW_EVENT',
      action: 'claimed',
      jobId: data.jobId,
      agent: agentName,
      ts: Date.now(),
    });

    // Notify origin agent that review was claimed
    bus.send({
      from: agentName,
      to: job.origin,
      type: 'review.claimed',
      topic: 'review',
      text: `Review claimed: ${job.scope.slice(0, 2).join(', ')}${job.scope.length > 2 ? '...' : ''}`,
      data: {
        jobId: data.jobId,
        claimedBy: agentName,
        scope: job.scope,
        ts: Date.now(),
      },
    });

    console.log(`[Review] Job ${data.jobId} claimed by ${agentName}, notified ${job.origin}`);

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
    const findings = {
      sev: data.severity,
      notes: data.notes,
      ...(data.patch !== undefined && { patch: data.patch }),
      ts: Date.now(),
    };

    state.updateReviewJob(data.jobId, {
      status: 'completed',
      findings,
    });

    // Emit review event
    bus.emit({
      type: 'REVIEW_EVENT',
      action: 'completed',
      jobId: data.jobId,
      agent: agentName,
      ts: Date.now(),
    });

    // Notify origin agent with review results
    bus.send({
      from: agentName,
      to: job.origin,
      type: 'review.completed',
      topic: 'review',
      text: `Review completed: ${job.scope.slice(0, 2).join(', ')}${job.scope.length > 2 ? '...' : ''} (${data.severity})`,
      data: {
        jobId: data.jobId,
        reviewer: agentName,
        scope: job.scope,
        severity: data.severity,
        notes: data.notes,
        ...(data.patch !== undefined && { patch: data.patch }),
        ts: Date.now(),
      },
    });

    console.log(
      `[Review] Job ${data.jobId} completed by ${agentName} with severity: ${data.severity}, notified ${job.origin}`,
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

export async function handleReviewList(
  state: StateCache,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    // Parse and normalize payload
    const data = ReviewListSchema.parse(payload);

    // Resolve agent from session
    const sessionId = getCurrentSessionId();
    const agentName = sessionId !== undefined ? state.getAgentForSession(sessionId) : undefined;

    // Get all review jobs
    let jobs = state.getAllReviewJobs();

    // Filter by status
    if (data.status !== undefined) {
      jobs = jobs.filter((j) => j.status === data.status);
    }

    // Filter by "mine" (claimed by me)
    if (data.mine === true) {
      if (agentName === undefined) {
        throw new Error('Agent context required for mine=true. Register with a.register first.');
      }
      jobs = jobs.filter((j) => j.claimedBy === agentName);
    }

    // Filter by "unclaimedOnly"
    if (data.unclaimedOnly === true) {
      jobs = jobs.filter((j) => j.status === 'pending');
    }

    // Filter by since
    const { since } = data;
    if (since !== undefined) {
      jobs = jobs.filter((j) => j.createdAt >= since);
    }

    // Sort by createdAt desc (newest first)
    jobs.sort((a, b) => b.createdAt - a.createdAt);

    // Limit
    const total = jobs.length;
    jobs = jobs.slice(0, data.limit);

    return {
      ok: true,
      d: {
        jobs,
        total,
        limit: data.limit,
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
