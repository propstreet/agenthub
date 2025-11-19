/**
 * Filesystem Watcher - Monitors file changes and detects conflicts
 * Uses chokidar for efficient file system monitoring
 */

import { relative, resolve } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { WriteEvent, ServerConfig } from '../types/models.js';
import type { MessageBus } from './bus.js';
import type { Coordinator } from './coordinator.js';
import { logger } from './logger.js';

export class FilesystemWatcher {
  private watcher: FSWatcher | null = null;
  private bus: MessageBus;
  private coordinator: Coordinator;
  private config: ServerConfig;
  private recentWrites = new Map<string, number>();
  private isPaused = false;
  private watchRoot: string | null = null;

  constructor(bus: MessageBus, coordinator: Coordinator, config: ServerConfig) {
    this.bus = bus;
    this.coordinator = coordinator;
    this.config = config;
  }

  /**
   * Start watching the filesystem
   */
  start(rootPath: string): void {
    if (this.watcher !== null) {
      logger.warn('[FilesystemWatcher] Already watching');
      return;
    }

    // Store absolute watch root for path normalization
    this.watchRoot = resolve(rootPath);

    logger.info({ root: this.watchRoot }, '[FilesystemWatcher] Starting watch');

    this.watcher = chokidar.watch(rootPath, {
      // Performance-optimized configuration
      ignored: [
        /(^|[/\\])\../, // dot files
        '**/node_modules/**', // dependencies
        '**/.git/**', // git internals
        '**/dist/**', // build output
        '**/coverage/**', // test coverage
        '**/*.log', // logs
        '**/.vscode/**', // IDE
        '**/.idea/**', // IDE
      ],
      persistent: true,
      ignoreInitial: true, // don't emit events for existing files
      awaitWriteFinish: {
        stabilityThreshold: 100, // wait 100ms after last change
        pollInterval: 50, // check every 50ms
      },
      usePolling: false, // use native fs.watch (faster on most systems)
      depth: 10, // limit recursion depth
    });

    // Listen for file changes
    this.watcher.on('change', (path: string) => {
      if (!this.isPaused) {
        this.handleChange(path);
      }
    });

    this.watcher.on('add', (path: string) => {
      if (!this.isPaused) {
        this.handleAdd(path);
      }
    });

    this.watcher.on('error', (error: unknown) => {
      logger.error({ err: error }, '[FilesystemWatcher] Error');
    });

    this.watcher.on('ready', () => {
      logger.info('[FilesystemWatcher] Ready');
    });
  }

  /**
   * Stop watching the filesystem
   */
  async stop(): Promise<void> {
    if (this.watcher !== null) {
      await this.watcher.close();
      this.watcher = null;
      logger.info('[FilesystemWatcher] Stopped');
    }
  }

  /**
   * Pause/resume watching (for dashboard control)
   */
  pause(): void {
    this.isPaused = true;
    logger.info('[FilesystemWatcher] Paused');
  }

  resume(): void {
    this.isPaused = false;
    logger.info('[FilesystemWatcher] Resumed');
  }

  /**
   * Normalize absolute path to relative POSIX path for intent matching
   * Converts /Users/me/repo/src/file.ts -> src/file.ts
   * Converts C:\Users\me\repo\src\file.ts -> src/file.ts (Windows)
   * Always uses forward slashes for cross-platform glob matching
   */
  private normalizePath(absolutePath: string): string {
    if (this.watchRoot === null) {
      return absolutePath;
    }
    // Convert to relative path, then normalize to POSIX separators
    // This ensures glob patterns work consistently on Windows
    return relative(this.watchRoot, absolutePath).replace(/\\/g, '/');
  }

  /**
   * Handle file change event
   */
  private handleChange(filePath: string): void {
    const now = Date.now();
    const normalizedPath = this.normalizePath(filePath);
    const activeIntents = this.coordinator.getActiveIntentsForPath(normalizedPath);

    // Check for recent concurrent writes (within conflict window)
    const lastWrite = this.recentWrites.get(filePath);
    const isWithinConflictWindow =
      lastWrite !== undefined && now - lastWrite < this.config.timeouts.fsWatcherConflictWindow;

    // Update recent writes
    this.recentWrites.set(filePath, now);
    this.cleanupRecentWrites();

    if (activeIntents.length === 0) {
      // Rogue write - no active intent for this file
      this.emitWriteEvent({
        type: 'WRITE_EVENT',
        subtype: 'rogue-write',
        file: normalizedPath,
        ts: now,
      });

      logger.warn({ file: normalizedPath }, '[FilesystemWatcher] Rogue write detected');
    } else if (activeIntents.length > 1 || isWithinConflictWindow) {
      // Conflict - multiple active intents or rapid succession writes
      this.emitWriteEvent({
        type: 'WRITE_EVENT',
        subtype: 'conflict',
        file: normalizedPath,
        intents: activeIntents.map((i) => i.id),
        ts: now,
      });

      logger.warn(
        { file: normalizedPath, activeIntents: activeIntents.length },
        '[FilesystemWatcher] Conflict detected',
      );

      // Mark all involved intents as needing rebase
      for (const intent of activeIntents) {
        this.coordinator.markNeedsRebase(intent.id);
      }
    } else {
      // Normal tracked write
      const [intent] = activeIntents;
      if (intent !== undefined) {
        this.emitWriteEvent({
          type: 'WRITE_EVENT',
          subtype: 'tracked',
          file: normalizedPath,
          intent: intent.id,
          actor: intent.agent,
          ts: now,
        });

        logger.debug(
          { file: normalizedPath, intentId: intent.id, agent: intent.agent },
          '[FilesystemWatcher] Tracked write',
        );
      }
    }
  }

  /**
   * Handle file addition event
   */
  private handleAdd(filePath: string): void {
    // Treat additions similar to changes
    this.handleChange(filePath);
  }

  /**
   * Emit a write event to the bus
   */
  private emitWriteEvent(event: WriteEvent): void {
    this.bus.emit(event);
  }

  /**
   * Clean up old entries from recent writes map
   */
  private cleanupRecentWrites(): void {
    const now = Date.now();
    const threshold = this.config.timeouts.fsWatcherConflictWindow * 10; // Keep 10x window

    for (const [path, timestamp] of this.recentWrites.entries()) {
      if (now - timestamp > threshold) {
        this.recentWrites.delete(path);
      }
    }
  }

  /**
   * Get watcher status
   */
  getStatus(): {
    isWatching: boolean;
    isPaused: boolean;
    recentWriteCount: number;
  } {
    return {
      isWatching: this.watcher !== null,
      isPaused: this.isPaused,
      recentWriteCount: this.recentWrites.size,
    };
  }
}
