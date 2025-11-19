/**
 * AgentPanel Component - Shows active agents with status
 */

import { Box, Text } from 'ink';

import type { Agent } from '../../server/types/models.js';

import { calculateTimeAgo, getAgentStatus } from '../utils/time-utils.js';

import { Panel } from './Panel.js';

export interface AgentPanelProps {
  agents: Agent[];

  shortcutKey?: string;
}

export function AgentPanel({ agents, shortcutKey }: AgentPanelProps) {
  // Use the robust agent status utility to determine actual status

  const getEnhancedStatus = (agent: Agent) => {
    const statusInfo = getAgentStatus(agent.lastSeen);

    return statusInfo;
  };

  const getTimeSince = (lastSeen: number | undefined): string => {
    return calculateTimeAgo(lastSeen);
  };

  const activeAgents = agents.filter((a) => {
    const status = getEnhancedStatus(a);

    return status.status !== 'offline';
  });

  const disconnectedAgents = agents.filter((a) => {
    const status = getEnhancedStatus(a);

    return status.status === 'offline';
  });

  const title = `👥 Active Agents (${String(activeAgents.length)} active, ${String(
    disconnectedAgents.length,
  )} stale)`;

  return (
    <Panel
      title={title}
      titleColor="blue"
      borderColor="blue"
      shortcutKey={shortcutKey}
      empty={agents.length === 0}
      emptyMessage="No agents connected"
    >
      {activeAgents.map((agent) => {
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

      {disconnectedAgents.length > 0 && (
        <>
          <Box borderStyle="single" borderColor="gray" marginTop={0} marginBottom={1} />

          <Box marginBottom={1}>
            <Text dimColor>
              {'> '}
              {disconnectedAgents.length} disconnected agents (press 'c' to cleanup)
            </Text>
          </Box>
        </>
      )}
    </Panel>
  );
}
