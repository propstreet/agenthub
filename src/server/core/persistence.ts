/**
 * Persistence Manager - JSON Snapshot Persistence
 * Provides atomic, crash-safe snapshots of hub state
 */

import { writeFile, readFile, rename, mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StateSnapshot } from '../types/models.js';
import type { StateCache } from './state-cache.js';

export interface PersistenceConfig {
  enabled: boolean;
  snapshotPath: string;
  intervalMs: number;
  autoRestore: boolean;
}

/**
 * Custom JSON replacer for Map serialization
 * Converts Map instances to serializable objects
 */
function mapReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return {
      __type: 'Map',
      entries: Array.from(value.entries()),
    };
  }
  return value;
}

/**
 * Custom JSON reviver for Map deserialization
 * Restores Map instances from serialized objects
 */
function mapReviver(_key: string, value: unknown): unknown {
  if (
    typeof value === 'object' &&
    value !== null &&
    '__type' in value &&
    value.__type === 'Map' &&
    'entries' in value &&
    Array.isArray(value.entries)
  ) {
    return new Map(value.entries as [string, unknown][]);
  }
  return value;
}

export class PersistenceManager {
  private config: PersistenceConfig;
  private autoSaveTimer: NodeJS.Timeout | undefined;

  constructor(config: PersistenceConfig) {
    this.config = config;
  }

  /**
   * Save state snapshot to disk atomically
   * Uses temp file + rename for crash safety
   */
  async save(snapshot: StateSnapshot): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Ensure directory exists
      const dir = dirname(this.config.snapshotPath);
      await mkdir(dir, { recursive: true });

      // Write to temp file first
      const tempPath = `${this.config.snapshotPath}.tmp`;
      const json = JSON.stringify(snapshot, mapReplacer, 2);
      await writeFile(tempPath, json, 'utf8');

      // Atomic rename
      await rename(tempPath, this.config.snapshotPath);

      console.log(`[Persistence] Snapshot saved: ${this.config.snapshotPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Persistence] Failed to save snapshot: ${message}`);
      throw error;
    }
  }

  /**
   * Load state snapshot from disk
   * Returns undefined if file doesn't exist or is invalid
   */
  async load(): Promise<StateSnapshot | undefined> {
    if (!this.config.enabled) {
      return undefined;
    }

    try {
      // Check if file exists
      await access(this.config.snapshotPath);

      // Read and parse JSON
      const json = await readFile(this.config.snapshotPath, 'utf8');
      const parsed = JSON.parse(json, mapReviver) as unknown;

      // Basic validation
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('agents' in parsed) ||
        !('intents' in parsed) ||
        !('leases' in parsed) ||
        !('reviewJobs' in parsed) ||
        !Array.isArray(parsed.agents) ||
        !Array.isArray(parsed.intents) ||
        !Array.isArray(parsed.leases) ||
        !Array.isArray(parsed.reviewJobs)
      ) {
        throw new Error('Invalid snapshot format: missing required arrays');
      }

      const snapshot = parsed as StateSnapshot;

      console.log(
        `[Persistence] Snapshot loaded: ${snapshot.agents.length} agents, ${snapshot.intents.length} intents, ${snapshot.leases.length} leases, ${snapshot.reviewJobs.length} reviews`,
      );

      return snapshot;
    } catch (error) {
      if (error instanceof Error) {
        // ENOENT is expected on first run
        if ('code' in error && error.code === 'ENOENT') {
          console.log('[Persistence] No snapshot found (first run)');
          return undefined;
        }

        console.error(`[Persistence] Failed to load snapshot: ${error.message}`);
      }
      return undefined;
    }
  }

  /**
   * Start automatic periodic snapshots
   */
  startAutoSave(state: StateCache): void {
    if (!this.config.enabled || this.autoSaveTimer !== undefined) {
      return;
    }

    this.autoSaveTimer = setInterval(() => {
      const snapshot = state.getSnapshot() as StateSnapshot;
      this.save(snapshot).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Persistence] Auto-save failed: ${message}`);
      });
    }, this.config.intervalMs);

    console.log(
      `[Persistence] Auto-save enabled: ${this.config.intervalMs}ms interval → ${this.config.snapshotPath}`,
    );
  }

  /**
   * Stop automatic snapshots
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer !== undefined) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
      console.log('[Persistence] Auto-save stopped');
    }
  }
}
