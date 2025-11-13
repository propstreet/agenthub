/**
 * Dashboard Component - Main dashboard layout
 */

import { Box, Text, useInput, useApp } from 'ink';
import { useState } from 'react';
import { Header } from './components/Header.js';
import { AgentPanel } from './components/AgentPanel.js';
import { IntentPanel } from './components/IntentPanel.js';
import { EventLog } from './components/EventLog.js';
import { Controls } from './components/Controls.js';
import type { DashboardProps } from './types.js';

export function Dashboard({ state, paused, onTogglePause, onRefresh }: DashboardProps) {
  const { exit } = useApp();
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const HUB_URL = process.env['AGENTHUB_URL'] ?? 'http://localhost:3333';

  const sendBroadcast = async (message: string): Promise<void> => {
    try {
      const response = await fetch(`${HUB_URL}/hub/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
          topic: 'supervision',
        }),
      });

      if (!response.ok) {
        console.error('[Dashboard] Broadcast failed:', response.statusText);
      }
    } catch (error) {
      console.error('[Dashboard] Broadcast error:', error);
    }
  };

  useInput((input, key) => {
    // Handle broadcast input mode
    if (broadcastMode) {
      if (key.return) {
        // Send broadcast message
        if (broadcastMessage.trim() !== '') {
          void sendBroadcast(broadcastMessage);
        }
        setBroadcastMode(false);
        setBroadcastMessage('');
      } else if (key.escape) {
        // Cancel broadcast
        setBroadcastMode(false);
        setBroadcastMessage('');
      } else if (key.backspace || key.delete) {
        // Handle backspace
        setBroadcastMessage(broadcastMessage.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        // Add character to message
        setBroadcastMessage(broadcastMessage + input);
      }
      return;
    }

    // Normal mode keybindings
    // Quit
    if (input === 'q' || input === 'Q' || (input === 'c' && key.ctrl)) {
      exit();
    }

    // Refresh (manual refresh when paused)
    if (input === 'r' || input === 'R') {
      if (paused) {
        onRefresh();
      }
    }

    // Pause/Resume toggle
    if (input === 'p' || input === 'P') {
      onTogglePause();
    }

    // Broadcast (replaces Nudge)
    if (input === 'b' || input === 'B') {
      setBroadcastMode(true);
      setBroadcastMessage('');
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header timestamp={state.ts} paused={paused} />

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

      <Controls paused={paused} />

      {broadcastMode && (
        <Box
          borderStyle="round"
          borderColor="yellow"
          padding={1}
          marginTop={1}
          flexDirection="column"
        >
          <Text bold color="yellow">
            📡 Broadcast Message to All Agents
          </Text>
          <Box marginTop={1}>
            <Text>
              {'> '}
              {broadcastMessage}
              <Text inverse> </Text>
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to send, Esc to cancel</Text>
          </Box>
        </Box>
      )}

      {!broadcastMode && (
        <Box marginTop={1}>
          <Text dimColor>Last updated: {new Date(state.ts).toLocaleTimeString()}</Text>
        </Box>
      )}
    </Box>
  );
}
