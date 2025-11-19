/**
 * Generic Panel Wrapper
 * Standardizes border, title, shortcut, and layout for dashboard panels
 */

import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

export interface PanelProps {
  title: string;
  titleColor: string;
  borderColor: string;
  shortcutKey?: string | undefined;
  children: ReactNode;
  empty?: boolean | undefined;
  emptyMessage?: string | undefined;
}

export function Panel({
  title,
  titleColor,
  borderColor,
  shortcutKey,
  children,
  empty = false,
  emptyMessage = 'No items',
}: PanelProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      padding={1}
      width="100%"
    >
      <Box marginBottom={1} flexDirection="row" justifyContent="space-between">
        <Text bold color={titleColor}>
          {title}
        </Text>
        {shortcutKey !== undefined && <Text color="white"> [{shortcutKey}]</Text>}
      </Box>

      {empty ? <Text dimColor>{emptyMessage}</Text> : <Box flexDirection="column">{children}</Box>}
    </Box>
  );
}
