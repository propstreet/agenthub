/**
 * Header Component - Dashboard title with timestamp
 */

import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';

export interface HeaderProps {
  timestamp: number;
}

export function Header({ timestamp }: HeaderProps) {
  const formattedTime = new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
  });

  const formattedDate = new Date(timestamp).toLocaleDateString('en-US');

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Gradient name="rainbow">
        <BigText text="AgentHub" font="tiny" />
      </Gradient>

      <Box justifyContent="space-between">
        <Text bold color="cyan">
          🤖 Multi-Agent Coordination Dashboard
        </Text>
        <Text dimColor>
          {formattedDate} {formattedTime}
        </Text>
      </Box>

      <Box borderStyle="single" borderColor="cyan" width="100%" height={1} />
    </Box>
  );
}
