/**
 * ExpertPanel Component - Shows active and completed expert requests
 */

import { Box, Text } from 'ink';

import type { ExpertRequest } from '../../server/types/models.js';

import { Panel } from './Panel.js';

export interface ExpertPanelProps {
  requests: ExpertRequest[];

  shortcutKey?: string;
}

export function ExpertPanel({ requests, shortcutKey }: ExpertPanelProps) {
  // Split requests into active (pending/queued/in_progress) and completed

  const activeRequests = requests.filter(
    (r) => r.status === 'pending' || r.status === 'queued' || r.status === 'in_progress',
  );

  const completedRequests = requests.filter(
    (r) => r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled',
  );

  const truncate = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) {
      return text;
    }

    return text.slice(0, Math.max(0, maxLength - 1)) + '…';
  };

  const getStatusColor = (status: ExpertRequest['status']): string => {
    switch (status) {
      case 'pending':
        return 'gray';

      case 'queued':
        return 'yellow';

      case 'in_progress':
        return 'cyan';

      case 'completed':
        return 'green';

      case 'failed':
      case 'cancelled':
        return 'red';

      case 'incomplete':
        return 'magenta';

      default:
        return 'white';
    }
  };

  const getStatusIcon = (status: ExpertRequest['status']): string => {
    switch (status) {
      case 'pending':
        return '⏳';

      case 'queued':
        return '🕒';

      case 'in_progress':
        return '⚙️';

      case 'completed':
        return '✅';

      case 'failed':
        return '❌';

      case 'cancelled':
        return '🚫';

      case 'incomplete':
        return '⚠️';

      default:
        return '•';
    }
  };

  const ID_MAX = 10;

  const Q_MAX = 20;

  return (
    <Panel
      title={`🧠 Expert Requests (${String(activeRequests.length)} active, ${String(
        completedRequests.length,
      )} done)`}
      titleColor="cyan"
      borderColor="cyan"
      shortcutKey={shortcutKey}
      empty={activeRequests.length === 0}
      emptyMessage="No active requests"
    >
      {activeRequests.map((req) => {
        const elapsedMs = req.startedAt ? Date.now() - req.startedAt : Date.now() - req.createdAt;

        const seconds = Math.floor(elapsedMs / 1000);

        const duration = req.startedAt ? `${String(seconds)}s` : 'waiting';

        return (
          <Box key={req.id} alignItems="center" marginBottom={0}>
            <Box width={ID_MAX + 2} marginRight={1}>
              <Text dimColor wrap="truncate-end">
                {truncate(req.id, ID_MAX)}
              </Text>
            </Box>

            <Box width={Q_MAX} marginRight={1}>
              <Text wrap="truncate-end">{truncate(req.question, Q_MAX)}</Text>
            </Box>

            <Box flexGrow={1} justifyContent="flex-end">
              <Text color={getStatusColor(req.status)}>
                {getStatusIcon(req.status)} {req.status} ({duration})
              </Text>
            </Box>
          </Box>
        );
      })}
    </Panel>
  );
}
