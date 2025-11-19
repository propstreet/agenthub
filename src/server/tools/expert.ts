/**
 * Expert operations - Async GPT-5 Pro consultations
 */

import type { HubOpResponse } from '../types/models.js';
import type { StateCache } from '../core/state-cache.js';
import type { ExpertBridge } from '../core/expert-bridge.js';
import {
  ExpertRequestSchema,
  ExpertStatusSchema,
  ExpertCancelSchema,
  ExpertListSchema,
} from '../schemas/expert.js';
import { getCurrentSessionId } from '../session-context.js';

/**
 * Handle expert.request - Queue async expert consultation
 */
export async function handleExpertRequest(
  state: StateCache,
  expert: ExpertBridge,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    if (!expert.isAvailable()) {
      return {
        ok: false,
        error: 'Expert system is not configured on this server.',
        t: Date.now(),
      };
    }

    const data = ExpertRequestSchema.parse(payload);

    // Get agent name from session
    const sessionId = getCurrentSessionId();
    const agent = sessionId !== undefined ? state.getAgentForSession(sessionId) : undefined;

    // Require agent registration
    if (agent === undefined || sessionId === undefined) {
      return {
        ok: false,
        error: 'Agent required. Register with a.register before using expert.request',
        t: Date.now(),
      };
    }

    // Validate agent ownership
    state.validateAgentOwnership(agent, sessionId);

    // Check pending limit
    const agentRequests = state.getExpertRequestsForAgent(agent);
    const pending = agentRequests.filter(
      (r) => r.status === 'pending' || r.status === 'queued' || r.status === 'in_progress',
    );

    // Use configured limit or fallback to 3
    const expertConfig = state.getExpertConfig();
    const maxPending = expertConfig?.maxPendingPerAgent ?? 3;

    if (pending.length >= maxPending) {
      return {
        ok: false,
        error: `You have ${pending.length} pending expert requests. Wait for completion or cancel existing requests.`,
        t: Date.now(),
      };
    }

    // Create request
    const request = state.createExpertRequest({
      agent,
      question: data.question,
      files: data.paths,
      priority: data.priority,
      requestedBy: agent,
      ...(data.previousResponseId !== undefined && { previousResponseId: data.previousResponseId }),
    });

    console.log(`[expert.request] Created ${request.id} for ${agent}`);

    return {
      ok: true,
      d: {
        requestId: request.id,
        status: request.status,
        message: 'Expert request queued. You will receive answer via message when complete.',
        hint: 'Check status with expert.status or pull messages with m.pull',
        estimatedTime: '10-20 minutes',
        queuePosition: pending.length + 1,
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

/**
 * Handle expert.status - Check request status
 */
export async function handleExpertStatus(
  state: StateCache,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    const data = ExpertStatusSchema.parse(payload);

    // Get agent name from session
    const sessionId = getCurrentSessionId();
    const agent = sessionId !== undefined ? state.getAgentForSession(sessionId) : undefined;

    // Require agent registration
    if (agent === undefined) {
      return {
        ok: false,
        error: 'Agent required. Register with a.register before checking expert status.',
        t: Date.now(),
      };
    }

    const request = state.getExpertRequest(data.requestId);

    if (request === undefined) {
      return {
        ok: false,
        error: `Expert request not found: ${data.requestId}`,
        t: Date.now(),
      };
    }

    // Validate ownership
    if (request.requestedBy !== agent) {
      return {
        ok: false,
        error: `Access denied. Request ${data.requestId} belongs to ${request.requestedBy}.`,
        t: Date.now(),
      };
    }

    const response: Record<string, unknown> = {
      requestId: request.id,
      status: request.status,
      question: request.question,
      files: request.files,
      priority: request.priority,
      createdAt: request.createdAt,
      requestedBy: request.requestedBy,
    };

    if (request.startedAt !== undefined) {
      response['startedAt'] = request.startedAt;
      response['elapsedSeconds'] = Math.floor((Date.now() - request.startedAt) / 1000);
    }

    if (request.completedAt !== undefined) {
      response['completedAt'] = request.completedAt;
      response['duration'] = request.completedAt - request.createdAt;
    }

    if (request.result !== undefined) {
      response['result'] = request.result;
    }

    if (request.error !== undefined) {
      response['error'] = request.error;
    }

    if (request.incompleteReason !== undefined) {
      response['incompleteReason'] = request.incompleteReason;
    }

    if (request.usage !== undefined) {
      response['usage'] = request.usage;
    }

    // Include responseId for follow-up questions
    if (request.responseId !== undefined) {
      response['responseId'] = request.responseId;
      response['followUpHint'] = 'Use responseId as previousResponseId for follow-up questions';
    }

    return {
      ok: true,
      d: response,
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

/**
 * Handle expert.cancel - Cancel pending request
 */
export async function handleExpertCancel(
  state: StateCache,
  expert: ExpertBridge,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    const data = ExpertCancelSchema.parse(payload);

    // Get agent name from session
    const sessionId = getCurrentSessionId();
    const agent = sessionId !== undefined ? state.getAgentForSession(sessionId) : undefined;

    // Require agent registration
    if (agent === undefined) {
      return {
        ok: false,
        error: 'Agent required. Register with a.register before cancelling expert requests.',
        t: Date.now(),
      };
    }

    const request = state.getExpertRequest(data.requestId);

    if (request === undefined) {
      return {
        ok: false,
        error: `Expert request not found: ${data.requestId}`,
        t: Date.now(),
      };
    }

    // Validate ownership
    if (request.requestedBy !== agent) {
      return {
        ok: false,
        error: `Access denied. Request ${data.requestId} belongs to ${request.requestedBy}.`,
        t: Date.now(),
      };
    }

    // Can only cancel pending/queued/in_progress
    if (
      request.status === 'completed' ||
      request.status === 'failed' ||
      request.status === 'cancelled'
    ) {
      return {
        ok: false,
        error: `Cannot cancel request with status: ${request.status}`,
        t: Date.now(),
      };
    }

    // Cancel at Azure if responseId exists
    if (request.responseId !== undefined) {
      await expert.cancel(request.responseId);
    }

    // Update state
    state.updateExpertRequest(request.id, {
      status: 'cancelled',
      completedAt: Date.now(),
    });

    console.log(`[expert.cancel] Cancelled ${request.id}`);

    return {
      ok: true,
      d: {
        requestId: request.id,
        status: 'cancelled',
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

/**
 * Handle expert.list - List expert requests for agent
 */
export async function handleExpertList(
  state: StateCache,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    const data = ExpertListSchema.parse(payload);

    // Get agent name from session
    const sessionId = getCurrentSessionId();
    const agent = sessionId !== undefined ? state.getAgentForSession(sessionId) : undefined;

    // Require agent registration
    if (agent === undefined) {
      return {
        ok: false,
        error: 'Agent required. Register with a.register before using expert.list',
        t: Date.now(),
      };
    }

    let requests = state.getExpertRequestsForAgent(agent);

    // Filter by status
    if (data.status !== undefined) {
      requests = requests.filter((r) => r.status === data.status);
    }

    // Filter by since
    if (data.since !== undefined) {
      const { since } = data;
      requests = requests.filter((r) => r.createdAt >= since);
    }

    // Sort by createdAt desc
    requests.sort((a, b) => b.createdAt - a.createdAt);

    // Limit
    requests = requests.slice(0, data.limit);

    return {
      ok: true,
      d: {
        requests: requests.map((r) => ({
          requestId: r.id,
          status: r.status,
          question: r.question.slice(0, 100), // Truncate
          files: r.files,
          priority: r.priority,
          createdAt: r.createdAt,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          hasResult: r.result !== undefined,
        })),
        total: requests.length,
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
