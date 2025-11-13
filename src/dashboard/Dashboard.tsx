/**
 * Dashboard Component - Main dashboard layout
 */

import { Box, Text, useInput, useApp } from 'ink';
import { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { AgentPanel } from './components/AgentPanel.js';
import { IntentPanel } from './components/IntentPanel.js';
import { EventLog } from './components/EventLog.js';
import { MessagesPanel } from './components/MessagesPanel.js';
import { Controls } from './components/Controls.js';
import type { DashboardProps } from './types.js';

export function Dashboard({ state, paused, onTogglePause, onRefresh }: DashboardProps) {
  const { exit } = useApp();
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [viewMode, setViewMode] = useState<'events' | 'messages'>('events');
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const HUB_URL = process.env['AGENTHUB_URL'] ?? 'http://localhost:3333';

  // Clear flash message after 3 seconds
  useEffect(() => {
    if (flashMessage !== null) {
      const timer = setTimeout(() => {
        setFlashMessage(null);
      }, 3000);
      return () => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [flashMessage]);

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
        setFlashMessage(`❌ Broadcast failed: ${response.statusText}`);
      } else {
        setFlashMessage(
          `✓ Broadcast sent: "${message.slice(0, 40)}${message.length > 40 ? '...' : ''}"`,
        );
      }
    } catch (error) {
      console.error('[Dashboard] Broadcast error:', error);
      setFlashMessage('❌ Broadcast error - check connection');
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

    // Toggle Messages view
    if (input === 'm' || input === 'M') {
      setViewMode(viewMode === 'events' ? 'messages' : 'events');
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

      {/* Flash notification banner */}
      {flashMessage !== null && (
        <Box borderStyle="round" borderColor="green" padding={1} marginTop={1} marginBottom={1}>
          <Text color="green">{flashMessage}</Text>
        </Box>
      )}

      <Box flexDirection="row" marginTop={1}>
        <Box flexDirection="column" flexGrow={1} marginRight={2}>
          <AgentPanel agents={state.agents} />
          <Box marginTop={1}>
            <IntentPanel intents={state.intents} />
          </Box>
        </Box>

        <Box flexDirection="column" flexGrow={1}>
          {viewMode === 'events' ? (
            <EventLog events={state.recentEvents} maxEvents={15} />
          ) : (
            <MessagesPanel messages={state.recentMessages} maxMessages={15} />
          )}
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
