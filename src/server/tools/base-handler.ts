/**
 * Base handler utilities for session-aware agent resolution
 * Now that we use Zod schemas for validation, this file only provides
 * session resolution helpers
 */

import type { StateCache } from '../core/state-cache.js';
import { getCurrentSessionId } from '../session-context.js';

/**
 * Helper to resolve agent name from session context
 * Used by handlers when schema output has optional agent field
 */
export function resolveAgent(payload: { agent?: string }, state: StateCache): string | undefined {
  // If agent provided in payload, use it
  if (payload.agent !== undefined) {
    return payload.agent;
  }

  // Auto-populate from session if not provided
  const sessionId = getCurrentSessionId();
  if (sessionId !== undefined) {
    const sessionAgent = state.getAgentBySession(sessionId);
    if (sessionAgent !== undefined) {
      return sessionAgent.name;
    }
  }

  return undefined;
}

/**
 * Validate that agent is resolved, throw helpful error if not
 */
export function requireAgent(agent: string | undefined): asserts agent is string {
  if (agent === undefined) {
    throw new Error('Agent required. Provide "agent" field or register with a.register first.');
  }
}
