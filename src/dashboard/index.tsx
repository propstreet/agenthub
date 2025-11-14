#!/usr/bin/env node
/**
 * AgentHub Dashboard Entry Point
 * Polls state://live and renders the dashboard
 */

import { render, Box, Text } from 'ink';
import { useState } from 'react';
import Spinner from 'ink-spinner';
import { Dashboard } from './Dashboard.js';
import { useHubState } from './hooks/useHubState.js';

const HUB_URL = process.env['AGENTHUB_URL'] ?? 'http://localhost:3333';
const POLL_INTERVAL = 500; // 500ms

function App() {
  const [paused, setPaused] = useState(false);
  const { state, error, isLoading, refresh } = useHubState(HUB_URL, POLL_INTERVAL, paused);

  // Error state
  if (error !== null) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="red">
          ❌ Connection Error
        </Text>
        <Text color="red">{error}</Text>
        <Box marginTop={1}>
          <Text dimColor>Is AgentHub running at {HUB_URL}?</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Ctrl+C to exit</Text>
        </Box>
      </Box>
    );
  }

  // Loading state
  if (isLoading || state === null) {
    return (
      <Box padding={1}>
        <Text color="cyan">
          <Spinner type="dots" />
          {' Connecting to AgentHub at '}
          {HUB_URL}
          {'...'}
        </Text>
      </Box>
    );
  }

  // Main dashboard
  return (
    <Dashboard
      state={state}
      paused={paused}
      onTogglePause={() => {
        setPaused(!paused);
        return undefined;
      }}
      onRefresh={refresh}
    />
  );
}

// Render the app
render(<App />);
