/**
 * MessagesPanel Component - Shows recent inter-agent messages
 */

import { Box, Text } from 'ink';
import type { Msg } from '../../server/types/models.js';

export interface MessagesPanelProps {
  messages: Msg[];
  maxMessages?: number;
}

export function MessagesPanel({ messages, maxMessages = 20 }: MessagesPanelProps) {
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getMessageIcon = (msg: Msg): string => {
    if (msg.to === undefined) return '📢'; // Broadcast
    return '💬'; // Direct message
  };

  const getMessageColor = (msg: Msg): string => {
    if (msg.to === undefined) return 'cyan'; // Broadcast
    return 'white'; // Direct message
  };

  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'chat':
        return 'white';
      case 'review.requested':
        return 'yellow';
      case 'review.claimed':
        return 'blue';
      case 'review.completed':
        return 'green';
      case 'supervision.requested':
        return 'magenta';
      default:
        return 'gray';
    }
  };

  const recentMessages = messages.slice(-maxMessages).reverse();

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          💬 Recent Messages ({messages.length})
        </Text>
      </Box>

      {recentMessages.length === 0 ? (
        <Text dimColor>No messages yet</Text>
      ) : (
        <Box flexDirection="column">
          {recentMessages.map((message, index) => (
            <Box key={`${message.id}-${index.toString()}`} marginBottom={1}>
              {/* Timestamp */}
              <Box width={10}>
                <Text dimColor>{formatTime(message.ts)}</Text>
              </Box>

              {/* Icon + Type */}
              <Box width={20}>
                <Text color={getMessageColor(message)}>
                  {getMessageIcon(message)}{' '}
                  <Text color={getTypeColor(message.type)}>{message.type}</Text>
                </Text>
              </Box>

              {/* From → To */}
              <Box width={25}>
                <Text>
                  <Text color="green">{message.from}</Text>
                  {message.to !== undefined && (
                    <>
                      {' → '}
                      <Text color="blue">{message.to}</Text>
                    </>
                  )}
                  {message.to === undefined && <Text dimColor> (all)</Text>}
                </Text>
              </Box>

              {/* Message text */}
              <Box flexGrow={1}>
                <Text>{message.text.slice(0, 60)}</Text>
                {message.text.length > 60 && <Text dimColor>...</Text>}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
