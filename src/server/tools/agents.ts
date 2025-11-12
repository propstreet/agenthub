/**
 * Agent operation handlers (a.register)
 */

import type { HubOpResponse, Agent } from '../types/models.js';
import type { StateCache } from '../core/state-cache.js';
import { getCurrentSessionId } from '../session-context.js';

export interface AgentRegisterPayload {
  name?: string;
  role: string[];
  version?: string;
}

const ADJECTIVES = [
  'Caffeinated',
  'Distracted',
  'Overzealous',
  'Sleepy',
  'Hyperactive',
  'Anxious',
  'Optimistic',
  'Pessimistic',
  'Confused',
  'Brilliant',
  'Clumsy',
  'Eager',
  'Grumpy',
  'Jolly',
  'Mysterious',
  'Sneaky',
  'Wise',
  'Silly',
  'Brave',
  'Lazy',
];

const NOUNS = [
  'Platypus',
  'Narwhal',
  'Octopus',
  'Penguin',
  'Walrus',
  'Capybara',
  'Axolotl',
  'Quokka',
  'Sloth',
  'Llama',
  'Mantis',
  'Hedgehog',
  'Otter',
  'Puffin',
  'Lemur',
  'Raccoon',
  'Toucan',
  'Pangolin',
  'Meerkat',
  'Wombat',
];

function generateFunnyName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${noun}${num}`;
}

export async function handleAgentRegister(
  state: StateCache,
  payload: unknown,
): Promise<HubOpResponse<Agent>> {
  try {
    const data = payload as AgentRegisterPayload;

    if (!data.role || !Array.isArray(data.role)) {
      return {
        ok: false,
        error: 'Invalid payload: role[] required',
        t: Date.now(),
      };
    }

    // Get session ID from request context
    const sessionId = getCurrentSessionId();

    // Generate funny name if not provided
    // If name is provided, registerAgent will update existing agent (idempotent)
    // If no name provided, generate random one (always creates new agent)
    const agentName = data.name ?? generateFunnyName();

    // Register agent with session binding (enforces one agent per session)
    const agent = state.registerAgent(agentName, data.role, data.version, sessionId);

    return {
      ok: true,
      d: agent,
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
