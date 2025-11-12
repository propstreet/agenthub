/**
 * Unit tests for Coordinator - Focus on P1 bug fix: glob-to-glob overlap detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Coordinator } from './coordinator.js';
import { MessageBus } from './bus.js';
import { StateCache } from './state-cache.js';
import type { ServerConfig } from '../types/models.js';

describe('Coordinator - Glob Overlap Detection (P1 Fix)', () => {
  let coordinator: Coordinator;
  let bus: MessageBus;
  let state: StateCache;
  let config: ServerConfig;

  beforeEach(() => {
    config = {
      port: 3333,
      host: 'localhost',
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
  });

  describe('Overlapping patterns - should detect conflicts', () => {
    it('should detect overlap: src/**/*.ts and src/server/**', () => {
      // Agent 1 opens intent for all TypeScript files in src
      const intent1 = coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/**/*.ts'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      expect(intent1.conflicts).toEqual([]);

      // Agent 2 opens intent for everything in src/server
      // These patterns OVERLAP - both can match src/server/index.ts
      const intent2 = coordinator.openIntent({
        agent: 'agent-2',
        paths: ['src/server/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      // BEFORE FIX: conflicts would be empty (glob-to-glob comparison failed)
      // AFTER FIX: conflicts should detect the overlap
      expect(intent2.conflicts).toContain(intent1.id);
      expect(intent2.conflicts).toHaveLength(1);
    });

    it('should detect overlap: src/server/** and src/server/core/**', () => {
      const intent1 = coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/server/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      const intent2 = coordinator.openIntent({
        agent: 'agent-2',
        paths: ['src/server/core/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      expect(intent2.conflicts).toContain(intent1.id);
    });

    it('should detect overlap: **.ts and src/**', () => {
      const intent1 = coordinator.openIntent({
        agent: 'agent-1',
        paths: ['**.ts'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      const intent2 = coordinator.openIntent({
        agent: 'agent-2',
        paths: ['src/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      expect(intent2.conflicts).toContain(intent1.id);
    });

    it('should detect overlap with identical patterns', () => {
      const intent1 = coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/server/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      const intent2 = coordinator.openIntent({
        agent: 'agent-2',
        paths: ['src/server/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      expect(intent2.conflicts).toContain(intent1.id);
    });

    it('should detect overlap: src/** and src/server/index.ts (specific file)', () => {
      const intent1 = coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      const intent2 = coordinator.openIntent({
        agent: 'agent-2',
        paths: ['src/server/index.ts'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      expect(intent2.conflicts).toContain(intent1.id);
    });
  });

  describe('Non-overlapping patterns - should NOT detect conflicts', () => {
    it('should NOT detect overlap: src/** and dist/**', () => {
      coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      const intent2 = coordinator.openIntent({
        agent: 'agent-2',
        paths: ['dist/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      expect(intent2.conflicts).toEqual([]);
    });

    it('should NOT detect overlap: apps/web/** and apps/api/**', () => {
      coordinator.openIntent({
        agent: 'agent-1',
        paths: ['apps/web/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      const intent2 = coordinator.openIntent({
        agent: 'agent-2',
        paths: ['apps/api/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      expect(intent2.conflicts).toEqual([]);
    });

    it('should NOT detect overlap: src/server/index.ts and src/client/index.ts', () => {
      coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/server/index.ts'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      const intent2 = coordinator.openIntent({
        agent: 'agent-2',
        paths: ['src/client/index.ts'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      expect(intent2.conflicts).toEqual([]);
    });

    it('should NOT conflict with READ intent (different mode)', () => {
      coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/**/*.ts'],
        mode: 'R', // READ mode
        priority: 'n',
        ttlMs: 120000,
      });

      const intent2 = coordinator.openIntent({
        agent: 'agent-2',
        paths: ['src/server/**'],
        mode: 'R', // READ mode
        priority: 'n',
        ttlMs: 120000,
      });

      // READ intents should not conflict with each other
      expect(intent2.conflicts).toEqual([]);
    });
  });

  describe('getActiveIntentsForPath - File path matching', () => {
    it('should match file path against glob patterns', () => {
      coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/**/*.ts'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      const intents = coordinator.getActiveIntentsForPath('src/server/index.ts');

      expect(intents).toHaveLength(1);
      expect(intents[0]?.agent).toBe('agent-1');
    });

    it('should return multiple intents for overlapping patterns', () => {
      coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/**/*.ts'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      coordinator.openIntent({
        agent: 'agent-2',
        paths: ['src/server/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      const intents = coordinator.getActiveIntentsForPath('src/server/index.ts');

      expect(intents).toHaveLength(2);
      expect(intents.map((i) => i.agent).sort()).toEqual(['agent-1', 'agent-2']);
    });

    it('should return empty array when no patterns match', () => {
      coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/**/*.ts'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      const intents = coordinator.getActiveIntentsForPath('dist/bundle.js');

      expect(intents).toEqual([]);
    });
  });

  describe('Intent lifecycle', () => {
    it('should close intent and remove from active list', () => {
      const intent = coordinator.openIntent({
        agent: 'agent-1',
        paths: ['src/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      coordinator.closeIntent({
        id: intent.id,
        status: 'ok',
      });

      // After closing, should not cause conflicts
      const intent2 = coordinator.openIntent({
        agent: 'agent-2',
        paths: ['src/**'],
        mode: 'W',
        priority: 'n',
        ttlMs: 120000,
      });

      expect(intent2.conflicts).toEqual([]);
    });
  });
});
