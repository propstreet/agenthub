/**
 * EventLog Component - Shows recent file system events
 */

import { Box, Text } from 'ink';
import type { Event, WriteEvent } from '../../server/types/models.js';

export interface EventLogProps {
  events: Event[];
  maxEvents?: number;
}

export function EventLog({ events, maxEvents = 10 }: EventLogProps) {
  // Filter for write events only
  const writeEvents = events.filter((e): e is WriteEvent => e.type === 'WRITE_EVENT');
  const getEventIcon = (subtype: WriteEvent['subtype']): string => {
    switch (subtype) {
      case 'tracked':
        return '✓';
      case 'conflict':
        return '⚠️';
      case 'rogue-write':
        return '❌';
    }
  };

  const getEventColor = (subtype: WriteEvent['subtype']): string => {
    switch (subtype) {
      case 'tracked':
        return 'green';
      case 'conflict':
        return 'yellow';
      case 'rogue-write':
        return 'red';
    }
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const recentEvents = writeEvents.slice(-maxEvents).reverse();

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="green">
          📝 Recent Events ({writeEvents.length})
        </Text>
      </Box>

      {recentEvents.length === 0 ? (
        <Text dimColor>No events yet</Text>
      ) : (
        <Box flexDirection="column">
          {recentEvents.map((event, index) => (
            <Box key={`${event.ts.toString()}-${index.toString()}`} marginBottom={1}>
              <Box width={12}>
                <Text dimColor>{formatTime(event.ts)}</Text>
              </Box>

              <Box width={18}>
                <Text color={getEventColor(event.subtype)}>
                  {getEventIcon(event.subtype)} {event.subtype}
                </Text>
              </Box>

              <Box flexGrow={1}>
                <Text>{event.file}</Text>
              </Box>

              {event.actor !== undefined && (
                <Box width={15}>
                  <Text dimColor>({event.actor})</Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
