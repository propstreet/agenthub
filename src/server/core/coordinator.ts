/**
 * Intent Coordinator - Two-phase coordination protocol
 * Manages intents, leases, and conflict resolution
 */

import { nanoid } from 'nanoid';
import micromatch from 'micromatch';
import type {
  Intent,
  Lease,
  IntentRenewPayload,
  IntentClosePayload,
  IntentOpenResponse,
  ServerConfig,
  Priority,
} from '../types/models.js';
import type {
  ResolvedIntentOpenPayload,
  ResolvedIntentVotePayload,
  ResolvedLeaseAnnouncePayload,
} from '../types/payloads.js';
import type { MessageBus } from './bus.js';
import type { StateCache } from './state-cache.js';

/**
 * Priority ordering (higher number = higher priority)
 */
const PRIORITY_ORDER: Record<Priority, number> = {
  l: 1, // low
  n: 2, // normal
  h: 3, // high
  r: 4, // review
};

export class Coordinator {
  private bus: MessageBus;
  private state: StateCache;
  private config: ServerConfig;
  private voteTimers = new Map<string, NodeJS.Timeout>();

  constructor(bus: MessageBus, state: StateCache, config: ServerConfig) {
    this.bus = bus;
    this.state = state;
    this.config = config;
  }

  // =========================================================================
  // Intent Operations (Two-Phase Protocol)
  // =========================================================================

  /**
   * Phase 1: Open an intent - declare what you plan to do
   * Returns conflicts and broadcasts to other agents for voting
   */
  openIntent(payload: ResolvedIntentOpenPayload): IntentOpenResponse {
    const intent: Intent = {
      id: nanoid(12),
      agent: payload.agent,
      paths: payload.paths,
      mode: payload.mode,
      priority: payload.priority,
      createdAt: Date.now(),
      ttlMs: payload.ttlMs,
      lastBeat: Date.now(),
      status: 'active',
      ...(payload.hunks !== undefined && { hunks: payload.hunks }),
    };

    // Check for conflicts with existing intents
    const conflicts = this.detectConflicts(intent);
    if (conflicts.length > 0) {
      intent.conflicts = conflicts;
    }

    // Add to state cache
    this.state.addIntent(intent);

    // Emit event for other agents to vote
    this.bus.emit({
      type: 'INTENT_EVENT',
      action: 'open',
      intentId: intent.id,
      agent: intent.agent,
      data: {
        paths: intent.paths,
        mode: intent.mode,
        priority: intent.priority,
        conflicts,
      },
      ts: Date.now(),
    });

    // Start vote window timer
    this.startVoteWindow(intent.id);

    console.log(
      `[Coordinator] Intent opened: ${intent.id} by ${intent.agent} (${intent.mode}) on ${intent.paths.join(', ')}`,
    );

    if (conflicts.length > 0) {
      console.warn(`[Coordinator] Conflicts detected: ${conflicts.join(', ')}`);
    }

    return {
      id: intent.id,
      conflicts,
    };
  }

  /**
   * Phase 2: Vote on an intent (ACK/NACK)
   */
  voteIntent(payload: ResolvedIntentVotePayload): { ok: boolean; message?: string } {
    const intent = this.state.getIntent(payload.id);

    if (intent === undefined) {
      return { ok: false, message: 'Intent not found' };
    }

    // Emit vote event
    this.bus.emit({
      type: 'INTENT_EVENT',
      action: 'vote',
      intentId: payload.id,
      agent: payload.agent,
      data: {
        vote: payload.vote,
        reason: payload.reason,
      },
      ts: Date.now(),
    });

    // If NACK, mark intent as needs_rebase
    if (payload.vote === 'nack') {
      this.state.updateIntentStatus(payload.id, 'needs_rebase');

      console.warn(
        `[Coordinator] Intent ${payload.id} received NACK from ${payload.agent}: ${payload.reason ?? 'no reason'}`,
      );

      // Send message to intent owner
      this.bus.send({
        from: 'coordinator',
        to: intent.agent,
        type: 'chat',
        topic: 'INTENT_NACK',
        text: `Intent ${payload.id} received NACK from ${payload.agent}`,
        att: {
          intentId: payload.id,
          voter: payload.agent,
          reason: payload.reason,
        },
      });
    }

    return { ok: true };
  }

  /**
   * Renew intent heartbeat (extends TTL)
   */
  renewIntent(payload: IntentRenewPayload): { ok: boolean; message?: string } {
    const intent = this.state.getIntent(payload.id);

    if (intent === undefined) {
      return { ok: false, message: 'Intent not found' };
    }

    // Update heartbeat and TTL
    intent.lastBeat = Date.now();
    intent.ttlMs = payload.ttlMs;

    this.state.heartbeatIntent(payload.id);

    return { ok: true };
  }

  /**
   * Close intent (commit or abort)
   */
  closeIntent(payload: IntentClosePayload): {
    ok: boolean;
    message?: string;
    reviewJobId?: string;
  } {
    const intent = this.state.getIntent(payload.id);

    if (intent === undefined) {
      return { ok: false, message: 'Intent not found' };
    }

    // Mark as ended
    this.state.updateIntentStatus(payload.id, 'ended');

    // Clear vote timer if exists
    const timer = this.voteTimers.get(payload.id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.voteTimers.delete(payload.id);
    }

    // Emit close event
    this.bus.emit({
      type: 'INTENT_EVENT',
      action: 'close',
      intentId: payload.id,
      agent: intent.agent,
      data: {
        status: payload.status,
        note: payload.note,
      },
      ts: Date.now(),
    });

    console.log(
      `[Coordinator] Intent closed: ${payload.id} (${payload.status}) - ${payload.note ?? 'no note'}`,
    );

    // If successful commit and mode was WRITE, emit review job
    let reviewJobId: string | undefined;
    if (payload.status === 'ok' && intent.mode === 'W') {
      reviewJobId = this.emitReviewJob(intent);
    }

    const result: { ok: boolean; reviewJobId?: string } = { ok: true };
    if (reviewJobId !== undefined) {
      result.reviewJobId = reviewJobId;
    }
    return result;
  }

  /**
   * Emit a review job for completed write intent
   */
  private emitReviewJob(intent: Intent): string {
    const jobId = nanoid(12);

    const reviewJob = {
      id: jobId,
      scope: intent.paths,
      origin: intent.agent,
      status: 'pending' as const,
      createdAt: Date.now(),
      summary: `Review changes from ${intent.agent}`,
    };

    this.state.addReviewJob(reviewJob);

    this.bus.emit({
      type: 'REVIEW_EVENT',
      action: 'requested',
      jobId,
      agent: intent.agent,
      ts: Date.now(),
    });

    console.log(`[Coordinator] Review job emitted: ${jobId} for intent ${intent.id}`);

    return jobId;
  }

  // =========================================================================
  // Lease Operations
  // =========================================================================

  /**
   * Announce a lease (advisory lock)
   */
  announceLease(payload: ResolvedLeaseAnnouncePayload): { id: string } {
    const lease: Lease = {
      id: nanoid(12),
      agent: payload.agent,
      paths: payload.paths,
      mode: payload.mode,
      exp: Date.now() + payload.ttlMs,
    };

    this.state.addLease(lease);

    console.log(
      `[Coordinator] Lease announced: ${lease.id} by ${lease.agent} (${lease.mode}) on ${lease.paths.join(', ')} until ${new Date(lease.exp).toISOString()}`,
    );

    return { id: lease.id };
  }

  // =========================================================================
  // Conflict Detection
  // =========================================================================

  /**
   * Detect conflicts with existing active intents
   */
  detectConflicts(intent: Intent): string[] {
    const activeIntents = this.state.getActiveIntents();
    const conflicts: string[] = [];

    for (const existing of activeIntents) {
      // Skip self
      if (existing.id === intent.id) {
        continue;
      }

      // Check for path overlap
      const hasOverlap = this.pathsOverlap(intent.paths, existing.paths);

      if (hasOverlap) {
        // Conflict if:
        // 1. Both are writes, or
        // 2. One is write and other is read/build/test
        const isConflict =
          (intent.mode === 'W' && existing.mode === 'W') || // write-write
          (intent.mode === 'W' && existing.mode !== 'R') || // write-other
          (existing.mode === 'W' && intent.mode !== 'R'); // other-write

        if (isConflict) {
          conflicts.push(existing.id);
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if two path pattern arrays overlap
   * Properly handles glob patterns by extracting and comparing base paths
   */
  private pathsOverlap(patterns1: string[], patterns2: string[]): boolean {
    for (const p1 of patterns1) {
      for (const p2 of patterns2) {
        if (this.globsOverlap(p1, p2)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if two glob patterns can match overlapping files
   * Uses micromatch matchers to test actual path overlap
   */
  private globsOverlap(pattern1: string, pattern2: string): boolean {
    // Exact match
    if (pattern1 === pattern2) {
      return true;
    }

    // Extract base paths (static prefix before wildcards)
    const scan1 = micromatch.scan(pattern1);
    const scan2 = micromatch.scan(pattern2);

    const base1 = this.normalizePathForComparison(scan1.base);
    const base2 = this.normalizePathForComparison(scan2.base);

    // Check if one base is a directory prefix of the other (with proper boundary checking)
    // Only treat as definite overlap if both bases are non-empty and one strictly contains the other
    // (e.g., "src/foo" vs "src/foo/bar" definitely overlap)
    if (base1.length > 0 && base2.length > 0) {
      if (
        base1 !== base2 &&
        (this.isDirectoryPrefix(base1, base2) || this.isDirectoryPrefix(base2, base1))
      ) {
        // One path is strictly within the other - definite overlap
        return true;
      }
    }

    // For equal bases, empty bases, or root-level patterns, we must test actual pattern matching
    // because they might target different files despite sharing a base directory
    // Examples: *.ts vs src/**, or src/**/foo.ts vs src/**/bar.ts

    // If they share no common directory, they definitely don't overlap
    // UNLESS one or both have empty base (root level), in which case we need to test patterns
    const commonPrefix = this.getCommonDirectoryPrefix(base1, base2);
    if (commonPrefix.length === 0 && base1.length > 0 && base2.length > 0) {
      // Both have specific bases that don't overlap (e.g., "src" vs "dist")
      return false;
    }

    // Generate sample paths to test for actual overlap
    // Use the common prefix plus some depth to test matching
    const testPaths = this.generateTestPaths(base1, base2, commonPrefix);

    // Create matchers for both patterns
    const matcher1 = micromatch.matcher(pattern1);
    const matcher2 = micromatch.matcher(pattern2);

    // If any test path matches both patterns, they overlap
    for (const testPath of testPaths) {
      if (matcher1(testPath) && matcher2(testPath)) {
        return true;
      }
    }

    // Conservative: if patterns are very wide (like **/*.ts), assume overlap
    if (this.isWidePattern(pattern1) || this.isWidePattern(pattern2)) {
      return true;
    }

    return false;
  }

  /**
   * Normalize path for comparison (remove leading ./, ensure POSIX separators)
   */
  private normalizePathForComparison(path: string): string {
    return path.replace(/^\.\//, '').replace(/^\.$/, '');
  }

  /**
   * Check if path1 is a directory prefix of path2
   * Ensures proper directory boundary checking (not just string prefix)
   */
  private isDirectoryPrefix(path1: string, path2: string): boolean {
    if (path1 === path2) {
      return true;
    }
    if (path1.length === 0) {
      return true; // Empty/root matches everything
    }
    // Ensure we're checking directory boundaries, not just string prefixes
    // e.g., "apps/web" should NOT be a prefix of "apps/webhooks"
    return path2.startsWith(`${path1}/`);
  }

  /**
   * Get common directory prefix between two paths
   */
  private getCommonDirectoryPrefix(path1: string, path2: string): string[] {
    const parts1 = path1.split('/').filter((p) => p.length > 0);
    const parts2 = path2.split('/').filter((p) => p.length > 0);

    const common: string[] = [];
    const minLength = Math.min(parts1.length, parts2.length);

    for (let i = 0; i < minLength; i++) {
      const part1 = parts1[i];
      const part2 = parts2[i];
      if (part1 !== undefined && part2 !== undefined && part1 === part2) {
        common.push(part1);
      } else {
        break;
      }
    }

    return common;
  }

  /**
   * Generate test paths to check for pattern overlap
   * Only generates paths that could realistically match BOTH patterns
   */
  private generateTestPaths(base1: string, base2: string, commonPrefix: string[]): string[] {
    const paths: string[] = [];
    const commonPath = commonPrefix.join('/');

    // Test paths at the base of each pattern
    if (base1.length > 0) {
      paths.push(`${base1}/file.ts`, `${base1}/index.ts`, `${base1}/test.js`);
    }
    if (base2.length > 0 && base2 !== base1) {
      paths.push(`${base2}/file.ts`, `${base2}/index.ts`, `${base2}/test.js`);
    }

    // Test paths at common prefix (only if there IS a common prefix)
    if (commonPath.length > 0) {
      paths.push(
        `${commonPath}/file.ts`,
        `${commonPath}/sub/file.ts`,
        `${commonPath}/deep/nested/file.ts`,
      );
    }

    // Only add root-level paths if BOTH patterns could match root files
    // (i.e., both have empty base or start with * or **)
    const base1IsRoot = base1.length === 0;
    const base2IsRoot = base2.length === 0;

    if (base1IsRoot && base2IsRoot) {
      // Both patterns can match root files
      paths.push('file.ts', 'index.ts', 'test.js');
    }

    // If patterns have different bases and no common prefix, they likely don't overlap
    // Don't generate irrelevant test paths
    if (commonPath.length === 0 && base1.length > 0 && base2.length > 0 && base1 !== base2) {
      // No common ground - paths will be empty or minimal
      return paths;
    }

    return paths;
  }

  /**
   * Check if pattern is wide (matches from root or very broad)
   */
  private isWidePattern(pattern: string): boolean {
    // Patterns starting with ** are wide
    if (pattern.startsWith('**/') || pattern === '**') {
      return true;
    }
    // Patterns with ** after short base are wide
    const scan = micromatch.scan(pattern);
    if (scan.base.length <= 1 && scan.glob.includes('**')) {
      return true;
    }
    return false;
  }

  /**
   * Get active intents that overlap with a file path
   */
  getActiveIntentsForPath(filePath: string): Intent[] {
    const activeIntents = this.state.getActiveIntents();

    return activeIntents.filter((intent) => {
      // Check if file matches any of the intent's path patterns
      return intent.paths.some((pattern) => micromatch.isMatch(filePath, pattern));
    });
  }

  /**
   * Mark intent as needing rebase
   */
  markNeedsRebase(intentId: string): void {
    const intent = this.state.getIntent(intentId);
    if (intent?.status === 'active') {
      this.state.updateIntentStatus(intentId, 'needs_rebase');

      // Notify agent
      this.bus.send({
        from: 'coordinator',
        to: intent.agent,
        type: 'chat',
        topic: 'NEEDS_REBASE',
        text: `Intent ${intentId} needs rebase due to concurrent changes`,
        att: { intentId },
      });

      console.warn(`[Coordinator] Intent ${intentId} marked as needs_rebase`);
    }
  }

  // =========================================================================
  // Vote Window Management
  // =========================================================================

  /**
   * Start vote window timer for an intent
   */
  private startVoteWindow(intentId: string): void {
    const timeout = setTimeout(() => {
      this.closeVoteWindow(intentId);
    }, this.config.timeouts.intentVoteWindow);

    this.voteTimers.set(intentId, timeout);
  }

  /**
   * Close vote window (no more votes accepted)
   */
  private closeVoteWindow(intentId: string): void {
    this.voteTimers.delete(intentId);

    const intent = this.state.getIntent(intentId);
    if (intent === undefined) {
      return;
    }

    console.log(`[Coordinator] Vote window closed for intent ${intentId}`);
  }

  // =========================================================================
  // Utilities & Cleanup
  // =========================================================================

  /**
   * Clear all vote timers (for graceful shutdown)
   */
  clearVoteTimers(): void {
    for (const timer of this.voteTimers.values()) {
      clearTimeout(timer);
    }
    this.voteTimers.clear();
  }

  /**
   * Check if intent should be allowed based on priority and conflicts
   */
  shouldAllowIntent(intent: Intent): boolean {
    if (intent.conflicts === undefined || intent.conflicts.length === 0) {
      return true;
    }

    const intentPriority = PRIORITY_ORDER[intent.priority];

    // Check if any conflicting intent has higher or equal priority
    for (const conflictId of intent.conflicts) {
      const conflictIntent = this.state.getIntent(conflictId);
      if (conflictIntent !== undefined) {
        const conflictPriority = PRIORITY_ORDER[conflictIntent.priority];
        if (conflictPriority >= intentPriority) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get lease conflicts for a path pattern
   */
  getLeaseConflicts(patterns: string[]): Lease[] {
    const activeLeases = this.state.getActiveLeases();

    return activeLeases.filter((lease) => this.pathsOverlap(patterns, lease.paths));
  }
}
