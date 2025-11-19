/**
 * Controls Component - Shows keyboard shortcuts
 */

import { Box, Text } from 'ink';

export interface ControlsProps {
  paused: boolean;
}

export function Controls({ paused }: ControlsProps) {
  return (
    <Box borderStyle="single" borderColor="gray" padding={1} marginTop={1}>
      {paused && <Text dimColor>[R]efresh </Text>}
      <Text dimColor>[P]ause </Text>
      <Text dimColor>[M]essages </Text>
      <Text dimColor>[B]roadcast </Text>
      <Text dimColor>[C]leanup </Text>
      <Text dimColor>[1-5] Zoom </Text>
      <Text dimColor>[Q]uit</Text>
    </Box>
  );
}
