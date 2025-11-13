/**
 * Time calculation utilities for the dashboard
 * Provides robust handling of timestamps with null/undefined safety
 */

/**
 * Calculate time ago from timestamp
 * Returns human-readable string like "just now", "5m ago", "2h ago"
 */
export function calculateTimeAgo(timestamp: number | undefined | null): string {
  if (timestamp === undefined || timestamp === null || isNaN(timestamp)) {
    return 'unknown';
  }

  const now = Date.now();
  const diff = now - timestamp;

  // Handle future times or very recent times
  if (diff < 0 || diff < 1000) {
    return 'just now';
  }

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Calculate TTL remaining from creation time and TTL
 */
export interface TTLInfo {
  remaining: number;
  expired: boolean;
  display: string;
}

export function calculateTTLRemaining(
  createdAt: number | undefined | null,
  ttlMs: number | undefined | null,
  lastBeat?: number | null,
): TTLInfo {
  // Handle missing or invalid inputs
  if (
    createdAt === undefined ||
    createdAt === null ||
    isNaN(createdAt) ||
    ttlMs === undefined ||
    ttlMs === null ||
    isNaN(ttlMs)
  ) {
    return { remaining: 0, expired: true, display: 'N/A' };
  }

  const now = Date.now();
  // Use lastBeat if available (for heartbeat-refreshed TTLs)
  const startTime =
    lastBeat !== undefined && lastBeat !== null && !isNaN(lastBeat) ? lastBeat : createdAt;

  const expiresAt = startTime + ttlMs;
  const remaining = Math.max(0, expiresAt - now);

  if (remaining === 0) {
    return { remaining: 0, expired: true, display: 'EXPIRED' };
  }

  // Format display string
  const seconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  let display: string;
  if (hours > 0) {
    display = `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    display = `${minutes}m ${seconds % 60}s`;
  } else {
    display = `${seconds}s`;
  }

  return { remaining, expired: false, display };
}

/**
 * Get agent status based on last seen time
 */
export interface AgentStatusInfo {
  status: 'active' | 'idle' | 'offline';
  icon: string;
  color: string;
}

export function getAgentStatus(lastSeen: number | undefined | null): AgentStatusInfo {
  if (lastSeen === undefined || lastSeen === null || isNaN(lastSeen)) {
    return { status: 'offline', icon: '✗', color: 'red' };
  }

  const now = Date.now();
  const timeSinceLastSeen = now - lastSeen;

  // Thresholds from PRD
  if (timeSinceLastSeen < 30000) {
    // Less than 30 seconds
    return { status: 'active', icon: '●', color: 'green' };
  } else if (timeSinceLastSeen < 300000) {
    // Less than 5 minutes
    return { status: 'idle', icon: '○', color: 'yellow' };
  } else {
    // More than 5 minutes
    return { status: 'offline', icon: '✗', color: 'red' };
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || isNaN(ms) || ms < 0) {
    return 'N/A';
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Safely get timestamp from date-like value
 */
export function getTimestamp(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  // Already a number
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }

  // Try to parse as date
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return isNaN(parsed) ? null : parsed;
  }

  // Date object
  if (value instanceof Date) {
    const time = value.getTime();
    return isNaN(time) ? null : time;
  }

  return null;
}
