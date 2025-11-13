/**
 * IntentPanel Component - Shows active intents with conflicts
 */

import { Box, Text } from 'ink';
import type { Intent } from '../../server/types/models.js';
import { calculateTTLRemaining } from '../utils/time-utils.js';

export interface IntentPanelProps {
  intents: Intent[];
}

export function IntentPanel({ intents }: IntentPanelProps) {
  const getModeIcon = (mode: Intent['mode']): string => {
    switch (mode) {
      case 'R':
        return '📖';
      case 'W':
        return '✏️';
      case 'B':
        return '🔨';
      case 'T':
        return '🧪';
    }
  };

  const getModeColor = (mode: Intent['mode']): string => {
    switch (mode) {
      case 'R':
        return 'blue';
      case 'W':
        return 'yellow';
      case 'B':
        return 'magenta';
      case 'T':
        return 'cyan';
    }
  };

  const getTTLRemaining = (intent: Intent): string => {
    // Use the robust time calculation utility
    const ttlInfo = calculateTTLRemaining(intent.createdAt, intent.ttlMs, intent.lastBeat);
    return ttlInfo.display;
  };

  const getTTLColor = (intent: Intent): string => {
    const ttlInfo = calculateTTLRemaining(intent.createdAt, intent.ttlMs, intent.lastBeat);
    return ttlInfo.expired ? 'red' : hasConflicts(intent) ? 'yellow' : 'green';
  };

  const hasConflicts = (intent: Intent): boolean => {
    return intent.conflicts !== undefined && intent.conflicts.length > 0;
  };

  const truncate = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) {
      return text.padEnd(maxLength);
    }
    return text.slice(0, maxLength - 1) + '…';
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          ⚡ Active Intents ({intents.length})
        </Text>
      </Box>

      {intents.length === 0 ? (
        <Text dimColor>No active intents</Text>
      ) : (
        <Box flexDirection="column">
          {intents.map((intent) => (
            <Box key={intent.id}>
              <Text dimColor>{truncate(intent.id, 12)} </Text>
              <Text>{truncate(intent.agent, 17)} </Text>
              <Text color={getModeColor(intent.mode)}>
                {getModeIcon(intent.mode)} {intent.mode}
              </Text>
              <Text> </Text>
              <Text dimColor>{truncate(intent.paths[0] ?? '(no paths)', 20)} </Text>
              <Text color={getTTLColor(intent)}>TTL: {getTTLRemaining(intent).padEnd(5)}</Text>
              {hasConflicts(intent) && <Text color="red"> ⚠️{intent.conflicts?.length}</Text>}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
