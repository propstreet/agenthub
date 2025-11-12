/**
 * Intent operation handlers (i.open, i.vote, i.renew, i.close)
 */

import type {
  IntentOpenPayload,
  IntentVotePayload,
  IntentRenewPayload,
  IntentClosePayload,
  HubOpResponse,
  IntentOpenResponse,
} from '../types/models.js';
import type { Coordinator } from '../core/coordinator.js';

export async function handleIntentOpen(
  coordinator: Coordinator,
  payload: unknown,
): Promise<HubOpResponse<IntentOpenResponse>> {
  try {
    const data = payload as IntentOpenPayload;
    const result = coordinator.openIntent(data);

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

export async function handleIntentVote(
  coordinator: Coordinator,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    const data = payload as IntentVotePayload;
    const result = coordinator.voteIntent(data);

    return {
      ok: result.ok,
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

export async function handleIntentRenew(
  coordinator: Coordinator,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    const data = payload as IntentRenewPayload;
    const result = coordinator.renewIntent(data);

    return {
      ok: result.ok,
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

export async function handleIntentClose(
  coordinator: Coordinator,
  payload: unknown,
): Promise<HubOpResponse> {
  try {
    const data = payload as IntentClosePayload;
    const result = coordinator.closeIntent(data);

    return {
      ok: result.ok,
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
