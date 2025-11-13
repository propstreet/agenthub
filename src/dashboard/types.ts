/**
 * Dashboard Types - State models for AgentHub dashboard
 */

import type { StateSnapshot } from '../server/types/models.js';

/**
 * Live state snapshot from state://live resource
 * Re-export StateSnapshot as HubState for dashboard consistency
 */
export type HubState = StateSnapshot;

/**
 * Dashboard component props
 */
export interface DashboardProps {
  state: HubState;
  paused: boolean;
  onTogglePause: () => void;
  onRefresh: () => void;
}
