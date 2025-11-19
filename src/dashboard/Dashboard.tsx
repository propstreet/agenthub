/**
 * Dashboard Component - Main dashboard layout
 */

import { Box, Text, useInput, useApp } from 'ink';
import { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { AgentPanel } from './components/AgentPanel.js';
import { IntentPanel } from './components/IntentPanel.js';
import { ReviewsPanel } from './components/ReviewsPanel.js';
import { ExpertPanel } from './components/ExpertPanel.js';
import { EventLog } from './components/EventLog.js';
import { MessagesPanel } from './components/MessagesPanel.js';
import { Controls } from './components/Controls.js';
import type { DashboardProps } from './types.js';

export function Dashboard({ state, paused, onTogglePause, onRefresh }: DashboardProps) {
  const { exit } = useApp();
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [viewMode, setViewMode] = useState<'events' | 'messages'>('events');
  const [zoomedPanel, setZoomedPanel] = useState<number | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [terminalWidth, setTerminalWidth] = useState(process.stdout.columns);
  const HUB_URL = process.env['AGENTHUB_URL'] ?? 'http://localhost:3333';

  useEffect(() => {
    const handleResize = () => {
      setTerminalWidth(process.stdout.columns);
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  const isCompact = terminalWidth < 120; // Switch to single column below 120 chars

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

  const triggerCleanup = async (): Promise<void> => {
    try {
      // Assuming a REST endpoint for cleanup exists or using hub_op via fetch
      // Since we don't have a direct REST endpoint for cleanup yet, we might need to add one or use hub_op
      // For now, let's assume we added a helper endpoint /hub/cleanup
      // BUT since we are in dashboard, we probably want to use the same transport.
      // Let's add a specific endpoint in server/index.ts or reuse hub_op if possible.
      // Actually, the roadmap suggested a dashboard command.
      // Let's use a new REST endpoint for admin actions to keep it simple for the dashboard.

      const response = await fetch(`${HUB_URL}/admin/cleanup`, {
        method: 'POST',
      });

      if (!response.ok) {
        setFlashMessage(`❌ Cleanup failed: ${response.statusText}`);
      } else {
        const result = (await response.json()) as { purged: number; message?: string };
        // Use server message if available, fallback to local
        const msg = result.message ?? `✓ Cleanup complete: ${String(result.purged)} agents removed`;
        setFlashMessage(`✓ ${msg}`);
        onRefresh(); // Refresh state immediately
      }
    } catch (error) {
      console.error('[Dashboard] Cleanup error:', error);
      setFlashMessage('❌ Cleanup error - check connection');
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

    // Cleanup (manual agent purge)
    if (input === 'c' || input === 'C') {
      void triggerCleanup();
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

    // Zoom controls
    if (input === '1') setZoomedPanel(zoomedPanel === 1 ? null : 1);
    if (input === '2') setZoomedPanel(zoomedPanel === 2 ? null : 2);
    if (input === '3') setZoomedPanel(zoomedPanel === 3 ? null : 3);
    if (input === '4') setZoomedPanel(zoomedPanel === 4 ? null : 4);
    if (input === '5') setZoomedPanel(zoomedPanel === 5 ? null : 5);
    if (key.escape) setZoomedPanel(null);
  });

  const persistenceEnabled = state.config?.persistence?.enabled === true;
  const expertEnabled = state.expertAvailable === true;

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        timestamp={state.ts}
        paused={paused}
        persistenceEnabled={persistenceEnabled}
        expertEnabled={expertEnabled}
      />

      {/* Flash notification banner */}
      {flashMessage !== null && (
        <Box borderStyle="round" borderColor="green" padding={1} marginTop={1} marginBottom={1}>
          <Text color="green">{flashMessage}</Text>
        </Box>
      )}

      {/* Main Grid Layout */}
      <Box flexDirection="column" marginTop={1}>
        {/* Top Section: State Panels (2 Columns in wide mode, 1 Column in compact) */}
        <Box
          flexDirection={isCompact ? 'column' : 'row'}
          display={zoomedPanel === 5 ? 'none' : 'flex'}
        >
          {/* Column 1: Agents [1] & Reviews [3] */}
          <Box
            flexDirection="column"
            flexGrow={1}
            width={isCompact || zoomedPanel !== null ? '100%' : '50%'}
            marginRight={!isCompact && zoomedPanel === null ? 1 : 0}
            display={
              zoomedPanel !== null && zoomedPanel !== 1 && zoomedPanel !== 3 ? 'none' : 'flex'
            }
          >
            <Box
              marginBottom={1}
              flexGrow={zoomedPanel === 1 ? 1 : 0}
              display={zoomedPanel !== null && zoomedPanel !== 1 ? 'none' : 'flex'}
            >
              <AgentPanel agents={state.agents} shortcutKey="1" />
            </Box>

            <Box
              marginBottom={1}
              flexGrow={zoomedPanel === 3 ? 1 : 0}
              display={zoomedPanel !== null && zoomedPanel !== 3 ? 'none' : 'flex'}
            >
              <ReviewsPanel reviews={state.reviewJobs} shortcutKey="3" />
            </Box>
          </Box>

          {/* Column 2: Intents [2] & Expert [4] */}
          <Box
            flexDirection="column"
            flexGrow={1}
            width={isCompact || zoomedPanel !== null ? '100%' : '50%'}
            marginLeft={!isCompact && zoomedPanel === null ? 1 : 0}
            display={
              zoomedPanel !== null && zoomedPanel !== 2 && zoomedPanel !== 4 ? 'none' : 'flex'
            }
          >
            <Box
              marginBottom={1}
              flexGrow={zoomedPanel === 2 ? 1 : 0}
              display={zoomedPanel !== null && zoomedPanel !== 2 ? 'none' : 'flex'}
            >
              <IntentPanel intents={state.intents} shortcutKey="2" />
            </Box>

            <Box
              marginBottom={1}
              flexGrow={zoomedPanel === 4 ? 1 : 0}
              display={zoomedPanel !== null && zoomedPanel !== 4 ? 'none' : 'flex'}
            >
              <ExpertPanel requests={state.expertRequests} shortcutKey="4" />
            </Box>
          </Box>
        </Box>

        {/* Bottom Section: Events/Messages [5] (Full Width) */}
        <Box
          flexDirection="column"
          flexGrow={1}
          marginTop={zoomedPanel === null ? 0 : 0}
          display={zoomedPanel !== null && zoomedPanel !== 5 ? 'none' : 'flex'}
        >
          {viewMode === 'events' ? (
            <EventLog
              events={state.recentEvents}
              maxEvents={zoomedPanel === 5 ? 50 : 15}
              shortcutKey="5"
            />
          ) : (
            <MessagesPanel
              messages={state.recentMessages}
              maxMessages={zoomedPanel === 5 ? 50 : 15}
              shortcutKey="5"
            />
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
