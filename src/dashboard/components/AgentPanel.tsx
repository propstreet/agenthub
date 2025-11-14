/**
 * AgentPanel Component - Shows active agents with status
 */

import { Box, Text } from 'ink';
import type { Agent } from '../../server/types/models.js';
import { calculateTimeAgo, getAgentStatus } from '../utils/time-utils.js';

export interface AgentPanelProps {
  agents: Agent[];
}

export function AgentPanel({ agents }: AgentPanelProps) {
  // Use the robust agent status utility to determine actual status
  const getEnhancedStatus = (agent: Agent) => {
    const statusInfo = getAgentStatus(agent.lastSeen);
    return statusInfo;
  };

  const getTimeSince = (lastSeen: number | undefined): string => {
    return calculateTimeAgo(lastSeen);
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">
          👥 Active Agents ({agents.length})
        </Text>
      </Box>

      {agents.length === 0 ? (
        <Text dimColor>No agents connected</Text>
      ) : (
        <Box flexDirection="column">
          {agents.map((agent) => {
            const status = getEnhancedStatus(agent);
            return (
              <Box key={agent.name} marginBottom={1}>
                <Box width={20}>
                  <Text color={status.color}>
                    {status.icon} {agent.name}
                  </Text>
                </Box>

                <Box width={20}>
                  <Text dimColor>{agent.role.join(', ')}</Text>
                </Box>

                <Box width={15}>
                  <Text dimColor>{getTimeSince(agent.lastSeen)}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
