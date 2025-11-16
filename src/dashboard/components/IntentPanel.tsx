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
      return text;
    }
    return text.slice(0, Math.max(0, maxLength - 1)) + '…';
  };

  const ID_MAX = 12;
  const AGENT_MAX = 16;
  const PATH_MAX = 28;
  const ICON_WIDTH = 4;
  const MODE_WIDTH = 3;

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
            <Box key={intent.id} alignItems="center">
              <Box width={ID_MAX + 2} marginRight={1}>
                <Text dimColor wrap="truncate-end">
                  {truncate(intent.id, ID_MAX)}
                </Text>
              </Box>
              <Box width={AGENT_MAX + 2} marginRight={1}>
                <Text wrap="truncate-end">{truncate(intent.agent, AGENT_MAX)}</Text>
              </Box>
              <Box width={ICON_WIDTH} marginRight={1} alignItems="center" justifyContent="center">
                <Text color={getModeColor(intent.mode)}>{getModeIcon(intent.mode)}</Text>
              </Box>
              <Box width={MODE_WIDTH} marginRight={1} alignItems="center" justifyContent="center">
                <Text color={getModeColor(intent.mode)}>{intent.mode}</Text>
              </Box>
              <Box width={PATH_MAX} marginRight={1}>
                <Text dimColor wrap="truncate-end">
                  {truncate(intent.paths[0] ?? '(no paths)', PATH_MAX)}
                </Text>
              </Box>
              <Box flexGrow={1} alignItems="center" justifyContent="flex-end" flexDirection="row">
                <Text color={getTTLColor(intent)}>TTL: {getTTLRemaining(intent)}</Text>
                {hasConflicts(intent) && <Text color="red"> ⚠️</Text>}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
