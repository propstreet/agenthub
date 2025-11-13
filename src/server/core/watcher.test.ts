/**
 * Unit tests for Filesystem Watcher - Focus on P1 bug fix: Windows path normalization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FilesystemWatcher } from './watcher.js';
import { Coordinator } from './coordinator.js';
import { MessageBus } from './bus.js';
import { StateCache } from './state-cache.js';
import type { ServerConfig } from '../types/models.js';

describe('FilesystemWatcher - Path Normalization (P1 Fix)', () => {
  let watcher: FilesystemWatcher;
  let coordinator: Coordinator;
  let bus: MessageBus;
  let state: StateCache;
  let config: ServerConfig;

  beforeEach(() => {
    config = {
      port: 3333,
      host: 'localhost',
      logLevel: 'info',
      limits: {
        maxIntents: 50,
        maxLeases: 50,
        maxMessages: 100,
        maxEvents: 100,
        resourcePayloadMaxBytes: 65536,
      },
      timeouts: {
        intentVoteWindow: 1200,
        intentDefaultTTL: 120000,
        leaseDefaultTTL: 600000,
        fsWatcherConflictWindow: 2000,
      },
    };
    bus = new MessageBus(config);
    state = new StateCache(bus, config);
    coordinator = new Coordinator(bus, state, config);
    watcher = new FilesystemWatcher(bus, coordinator, config);
  });

  afterEach(async () => {
    await watcher.stop();
  });

  describe('Path normalization for cross-platform glob matching', () => {
    it('should normalize Unix absolute path to relative POSIX path', () => {
      const watchRoot = '/Users/me/repo';
      watcher.start(watchRoot);

      // Open an intent
      coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/**/*.ts'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      // Simulate chokidar emitting absolute Unix path
      const absolutePath = '/Users/me/repo/src/server/index.ts';

      // Access private method using type assertion
      const normalizedPath = (
        watcher as unknown as { normalizePath: (path: string) => string }
      ).normalizePath(absolutePath);

      // Should normalize to relative POSIX path
      expect(normalizedPath).toBe('src/server/index.ts');

      // Should match the intent pattern
      const intents = coordinator.getActiveIntentsForPath(normalizedPath);
      expect(intents).toHaveLength(1);
      expect(intents[0]?.agent).toBe('agent-1');
    });

    it('should normalize Windows-style backslashes to forward slashes', () => {
      const watchRoot = '/Users/me/repo';
      watcher.start(watchRoot);

      // Open an intent with POSIX pattern (standard for globs)
      coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/**/*.ts'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      // Simulate a path with Windows-style backslashes
      // (On real Windows, chokidar could emit paths with backslashes)
      const pathWithBackslashes = '/Users/me/repo/src\\server\\index.ts';

      // Access private method using type assertion
      const normalizedPath = (
        watcher as unknown as { normalizePath: (path: string) => string }
      ).normalizePath(pathWithBackslashes);

      // BEFORE FIX: Would keep 'src\\server\\index.ts' (backslashes)
      // AFTER FIX: Should be 'src/server/index.ts' (forward slashes)
      expect(normalizedPath).not.toContain('\\');
      expect(normalizedPath).toBe('src/server/index.ts');

      // Should match the intent pattern
      const intents = coordinator.getActiveIntentsForPath(normalizedPath);
      expect(intents).toHaveLength(1);
      expect(intents[0]?.agent).toBe('agent-1');
    });

    it('should normalize mixed Windows path separators', () => {
      const watchRoot = 'C:\\Users\\me\\repo';
      watcher.start(watchRoot);

      // Simulate mixed separators (can happen in some Windows scenarios)
      const absolutePath = 'C:\\Users\\me\\repo/src\\server/index.ts';

      const normalizedPath = (
        watcher as unknown as { normalizePath: (path: string) => string }
      ).normalizePath(absolutePath);

      // Should normalize all separators to forward slash
      expect(normalizedPath).toBe('src/server/index.ts');
      expect(normalizedPath).not.toContain('\\');
    });

    it('should handle deeply nested paths with backslashes', () => {
      const watchRoot = '/Users/me/repo';
      watcher.start(watchRoot);

      coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/server/core/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      // Simulate path with backslashes in nested structure
      const pathWithBackslashes = '/Users/me/repo/src\\server\\core\\deep\\nested\\file.ts';

      const normalizedPath = (
        watcher as unknown as { normalizePath: (path: string) => string }
      ).normalizePath(pathWithBackslashes);

      // Should normalize all backslashes
      expect(normalizedPath).toBe('src/server/core/deep/nested/file.ts');
      expect(normalizedPath).not.toContain('\\');

      const intents = coordinator.getActiveIntentsForPath(normalizedPath);
      expect(intents).toHaveLength(1);
    });

    it('should work with root-level files', () => {
      const watchRoot = '/Users/me/repo';
      watcher.start(watchRoot);

      coordinator.openIntent({
        agent: 'agent-1',
        paths: ['*.ts'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      const absolutePath = '/Users/me/repo/index.ts';

      const normalizedPath = (
        watcher as unknown as { normalizePath: (path: string) => string }
      ).normalizePath(absolutePath);

      expect(normalizedPath).toBe('index.ts');

      const intents = coordinator.getActiveIntentsForPath(normalizedPath);
      expect(intents).toHaveLength(1);
    });

    it('should detect rogue writes correctly with normalized paths', () => {
      const watchRoot = '/Users/me/repo';
      watcher.start(watchRoot);

      // No intents open - any write should be rogue

      const events: { type: string; file?: string; subtype?: string }[] = [];
      bus.on('WRITE_EVENT', (event) => {
        events.push(event);
      });

      // Access private handleChange method using type assertion
      const handleChange = (
        watcher as unknown as { handleChange: (path: string) => void }
      ).handleChange.bind(watcher);

      // Simulate file change
      handleChange('/Users/me/repo/src/server/index.ts');

      // Should detect as rogue write with normalized path
      expect(events).toHaveLength(1);
      expect(events[0]?.subtype).toBe('rogue-write');
      expect(events[0]?.file).toBe('src/server/index.ts');
    });

    it('should detect tracked writes correctly with normalized paths', () => {
      const watchRoot = '/Users/me/repo';
      watcher.start(watchRoot);

      // Open intent
      coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      const events: { type: string; file?: string; subtype?: string }[] = [];
      bus.on('WRITE_EVENT', (event) => {
        events.push(event);
      });

      // Access private handleChange method
      const handleChange = (
        watcher as unknown as { handleChange: (path: string) => void }
      ).handleChange.bind(watcher);

      // Simulate file change
      handleChange('/Users/me/repo/src/server/index.ts');

      // Should detect as tracked write
      expect(events).toHaveLength(1);
      expect(events[0]?.subtype).toBe('tracked');
      expect(events[0]?.file).toBe('src/server/index.ts');
    });
  });

  describe('Edge cases', () => {
    it('should handle watchRoot with trailing slash', () => {
      const watchRoot = '/Users/me/repo/';
      watcher.start(watchRoot);

      const absolutePath = '/Users/me/repo/src/index.ts';

      const normalizedPath = (
        watcher as unknown as { normalizePath: (path: string) => string }
      ).normalizePath(absolutePath);

      expect(normalizedPath).toBe('src/index.ts');
    });

    it('should return original path if watchRoot is not set', () => {
      // Don't call start() so watchRoot is null

      const absolutePath = '/Users/me/repo/src/index.ts';

      const normalizedPath = (
        watcher as unknown as { normalizePath: (path: string) => string }
      ).normalizePath(absolutePath);

      // Should return original since watchRoot is null
      expect(normalizedPath).toBe(absolutePath);
    });
  });
});
