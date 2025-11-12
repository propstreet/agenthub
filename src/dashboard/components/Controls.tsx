/**
 * Controls Component - Shows keyboard shortcuts
 */

import { Box, Text } from 'ink';

export function Controls() {
  return (
    <Box borderStyle="single" borderColor="gray" padding={1} marginTop={1}>
      <Text dimColor>[R]efresh </Text>
      <Text dimColor>[P]ause </Text>
      <Text dimColor>[E]scalate </Text>
      <Text dimColor>[N]udge </Text>
      <Text dimColor>[Q]uit</Text>
    </Box>
  );
}
