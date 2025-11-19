/**
 * ReviewsPanel Component - Shows active and stale review jobs
 */

import { Box, Text } from 'ink';

import type { ReviewJob } from '../../server/types/models.js';

import { Panel } from './Panel.js';

export interface ReviewsPanelProps {
  reviews: ReviewJob[];

  shortcutKey?: string;
}

export function ReviewsPanel({ reviews, shortcutKey }: ReviewsPanelProps) {
  // Split reviews into active (pending/claimed) and completed

  const activeReviews = reviews.filter((r) => r.status === 'pending' || r.status === 'claimed');

  const completedReviews = reviews.filter((r) => r.status === 'completed' || r.status === 'failed');

  const truncate = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) {
      return text;
    }

    return text.slice(0, Math.max(0, maxLength - 1)) + '…';
  };

  const ID_MAX = 10;

  const ORIGIN_MAX = 14;

  const PATH_MAX = 20;

  return (
    <Panel
      title={`📋 Reviews (${String(activeReviews.length)} active, ${String(
        completedReviews.length,
      )} done)`}
      titleColor="magenta"
      borderColor="magenta"
      shortcutKey={shortcutKey}
      empty={activeReviews.length === 0}
      emptyMessage="No active reviews"
    >
      {activeReviews.map((job) => {
        const isClaimed = job.status === 'claimed';

        const claimedText =
          isClaimed && job.claimedBy ? `Claimed by ${truncate(job.claimedBy, 10)}` : 'Pending';

        let claimTTL = '';

        if (isClaimed && job.claimExpiresAt) {
          const now = Date.now();

          const remaining = Math.max(0, job.claimExpiresAt - now);

          const seconds = Math.floor(remaining / 1000);

          const minutes = Math.floor(seconds / 60);

          claimTTL = `${String(minutes)}m ${String(seconds % 60)}s`;
        }

        return (
          <Box key={job.id} alignItems="center" marginBottom={0}>
            <Box width={ID_MAX + 2} marginRight={1}>
              <Text dimColor wrap="truncate-end">
                {truncate(job.id, ID_MAX)}
              </Text>
            </Box>

            <Box width={ORIGIN_MAX + 2} marginRight={1}>
              <Text wrap="truncate-end">{truncate(job.origin, ORIGIN_MAX)}</Text>
            </Box>

            <Box width={PATH_MAX} marginRight={1}>
              <Text dimColor wrap="truncate-end">
                {truncate(job.scope[0] ?? 'global', PATH_MAX)}
              </Text>
            </Box>

            <Box flexGrow={1} justifyContent="flex-end">
              <Text color={isClaimed ? 'cyan' : 'yellow'}>
                {claimedText}

                {isClaimed && claimTTL ? ` (${claimTTL})` : ''}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Panel>
  );
}
