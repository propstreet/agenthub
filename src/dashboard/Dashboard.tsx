/**
 * Dashboard Component - Main dashboard layout
 */

import { Box, Text, useInput, useApp } from 'ink';
import { Header } from './components/Header.js';
import { AgentPanel } from './components/AgentPanel.js';
import { IntentPanel } from './components/IntentPanel.js';
import { EventLog } from './components/EventLog.js';
import { Controls } from './components/Controls.js';
import type { DashboardProps } from './types.js';

export function Dashboard({ state }: DashboardProps) {
  const { exit } = useApp();

  useInput((input, key) => {
    // Quit
    if (input === 'q' || input === 'Q' || (input === 'c' && key.ctrl)) {
      exit();
    }

    // Refresh (manual refresh trigger - mainly for demonstration)
    if (input === 'r' || input === 'R') {
      // State auto-refreshes via polling, but we could force a refresh here
      console.log('[Dashboard] Manual refresh requested');
    }

    // Pause (would need state management to implement)
    if (input === 'p' || input === 'P') {
      console.log('[Dashboard] Pause/Resume requested');
    }

    // Escalate (would need selection state)
    if (input === 'e' || input === 'E') {
      console.log('[Dashboard] Escalate requested');
    }

    // Nudge (would need agent selection)
    if (input === 'n' || input === 'N') {
      console.log('[Dashboard] Nudge requested');
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header timestamp={state.ts} />

      <Box flexDirection="row" marginTop={1}>
        <Box flexDirection="column" flexGrow={1} marginRight={2}>
          <AgentPanel agents={state.agents} />
          <Box marginTop={1}>
            <IntentPanel intents={state.intents} />
          </Box>
        </Box>

        <Box flexDirection="column" flexGrow={1}>
          <EventLog events={state.recentEvents} maxEvents={15} />
        </Box>
      </Box>

      <Controls />

      <Box marginTop={1}>
        <Text dimColor>Last updated: {new Date(state.ts).toLocaleTimeString()}</Text>
      </Box>
    </Box>
  );
}
