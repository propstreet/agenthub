/**
 * Dashboard Component Tests
 * Tests dashboard rendering with ink-testing-library
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Dashboard } from './Dashboard.js';
import type { HubState, DashboardProps } from './types.js';

describe('Dashboard', () => {
  const mockState: HubState = {
    agents: [
      {
        name: 'agent-1',
        role: ['editor'],
        lastSeen: Date.now() - 5000, // 5 seconds ago
        status: 'active',
      },
      {
        name: 'agent-2',
        role: ['reviewer'],
        lastSeen: Date.now() - 120000, // 2 minutes ago
        status: 'idle',
      },
    ],
    intents: [
      {
        id: 'i_abc123',
        agent: 'agent-1',
        paths: ['src/**/*.ts'],
        mode: 'W',
        priority: 'n',
        createdAt: Date.now() - 60000,
        ttlMs: 120000,
        lastBeat: Date.now(),
        status: 'active',
      },
    ],
    leases: [],
    reviewJobs: [],
    expertRequests: [],
    recentMessages: [],
    recentEvents: [
      {
        type: 'WRITE_EVENT',
        subtype: 'tracked',
        file: 'src/server/index.ts',
        ts: Date.now() - 10000,
        actor: 'agent-1',
      },
      {
        type: 'WRITE_EVENT',
        subtype: 'conflict',
        file: 'src/shared/utils.ts',
        ts: Date.now() - 5000,
      },
    ],
    semaphores: {},
    ts: Date.now(),
  };

  const emptyState: HubState = {
    agents: [],
    intents: [],
    leases: [],
    reviewJobs: [],
    expertRequests: [],
    recentMessages: [],
    recentEvents: [],
    semaphores: {},
    ts: Date.now(),
  };

  const mockProps: DashboardProps = {
    state: mockState,
    paused: false,
    onTogglePause: () => undefined,
    onRefresh: () => undefined,
    persistenceEnabled: false,
    expertEnabled: false,
  };

  it('renders dashboard header', () => {
    const { lastFrame } = render(<Dashboard {...mockProps} />);

    // BigText renders "AgentHub" as ASCII art, check for the Dashboard title instead
    // Text is split across lines in v2 layout
    expect(lastFrame()).toContain('Multi-Agent Coordination');
    expect(lastFrame()).toContain('Dashboard');
    expect(lastFrame()).toContain('🤖');
  });

  it('displays agent count', () => {
    const { lastFrame } = render(<Dashboard {...mockProps} />);

    // v2 Layout: "Active Agents (2 active, 0 stale)"
    expect(lastFrame()).toContain('Active Agents (2 active');
    expect(lastFrame()).toContain('agent-1');
    expect(lastFrame()).toContain('agent-2');
  });

  it('displays intent information', () => {
    const { lastFrame } = render(<Dashboard {...mockProps} />);

    expect(lastFrame()).toContain('Active Intents (1)');
    expect(lastFrame()).toContain('agent-1');
    expect(lastFrame()).toContain('src/**/*.ts');
  });

  it('displays recent events', () => {
    const { lastFrame } = render(<Dashboard {...mockProps} />);

    expect(lastFrame()).toContain('Recent Events (2)');
    // File paths may be truncated in the UI, check for partial match
    expect(lastFrame()).toContain('src/server/');
    expect(lastFrame()).toContain('tracked');
  });

  it('displays keyboard controls', () => {
    const { lastFrame } = render(<Dashboard {...mockProps} />);

    // Controls show with keyboard hints like [P]ause, [B]roadcast
    expect(lastFrame()).toContain('[P]ause');
    expect(lastFrame()).toContain('[B]roadcast');
    expect(lastFrame()).toContain('[Q]uit');
  });

  it('handles empty state', () => {
    const localEmptyProps: DashboardProps = {
      state: emptyState,
      paused: false,
      onTogglePause: () => undefined,
      onRefresh: () => undefined,
      persistenceEnabled: false,
      expertEnabled: false,
    };

    const { lastFrame } = render(<Dashboard {...localEmptyProps} />);

    expect(lastFrame()).toContain('No agents connected');
    expect(lastFrame()).toContain('No active intents');
    expect(lastFrame()).toContain('No events yet');
  });

  it('updates on state change', () => {
    const { lastFrame, rerender } = render(<Dashboard {...mockProps} />);

    expect(lastFrame()).toContain('Active Intents (1)');

    const updatedState: HubState = {
      ...mockState,
      intents: [
        ...mockState.intents,
        {
          id: 'i_def456',
          agent: 'agent-2',
          paths: ['dist/**'],
          mode: 'B',
          priority: 'n',
          createdAt: Date.now(),
          ttlMs: 120000,
          lastBeat: Date.now(),
          status: 'active',
        },
      ],
    };

    const updatedProps: DashboardProps = {
      ...mockProps,
      state: updatedState,
      persistenceEnabled: false,
    };
    rerender(<Dashboard {...updatedProps} />);

    expect(lastFrame()).toContain('Active Intents (2)');
    // ID is truncated in v2 layout (i_def456 -> i_def4...)
    expect(lastFrame()).toContain('i_def4');
  });

  it('displays agent status correctly', () => {
    const { lastFrame } = render(<Dashboard {...mockProps} />);

    // Active agent should show green indicator
    expect(lastFrame()).toContain('●');

    // Should show time since last seen
    expect(lastFrame()).toContain('ago');
  });

  it('shows conflict indicators', () => {
    const firstIntent = mockState.intents[0];
    if (firstIntent === undefined) {
      throw new Error('Test setup error: no intent found');
    }

    const stateWithConflict: HubState = {
      ...mockState,
      intents: [
        {
          ...firstIntent,
          conflicts: ['i_other123'],
        },
      ],
    };

    const conflictProps: DashboardProps = {
      ...mockProps,
      state: stateWithConflict,
      persistenceEnabled: false,
    };

    const { lastFrame } = render(<Dashboard {...conflictProps} />);

    expect(lastFrame()).toContain('⚠️');
  });
});
