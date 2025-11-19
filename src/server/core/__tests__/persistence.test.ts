/**
 * Persistence Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { PersistenceManager, type PersistenceConfig } from '../persistence.js';
import type { StateSnapshot } from '../../types/models.js';

const TEST_DIR = '/tmp/agenthub-test-persistence';
const TEST_PATH = `${TEST_DIR}/test-state.json`;

describe('PersistenceManager', () => {
  let config: PersistenceConfig;

  beforeEach(async () => {
    config = {
      enabled: true,
      snapshotPath: TEST_PATH,
      intervalMs: 60000,
      autoRestore: true,
    };

    // Ensure test directory exists
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // Basic Save/Load
  // ============================================================================

  it('saves and loads snapshot successfully', async () => {
    const persistence = new PersistenceManager(config);

    const snapshot: StateSnapshot = {
      agents: [{ name: 'agent1', role: ['coder'], lastSeen: Date.now(), status: 'active' }],
      intents: [],
      leases: [],
      reviewJobs: [],
      expertRequests: [],
      recentMessages: [],
      recentEvents: [],
      ts: Date.now(),
    };

    await persistence.save(snapshot);

    const loaded = await persistence.load();
    expect(loaded).toBeDefined();
    expect(loaded?.agents).toHaveLength(1);
    expect(loaded?.agents[0]?.name).toBe('agent1');
  });

  it('returns undefined when loading non-existent file', async () => {
    const persistence = new PersistenceManager(config);

    const loaded = await persistence.load();
    expect(loaded).toBeUndefined();
  });

  it('returns undefined when persistence is disabled', async () => {
    const disabledConfig = { ...config, enabled: false };
    const persistence = new PersistenceManager(disabledConfig);

    const snapshot: StateSnapshot = {
      agents: [],
      intents: [],
      leases: [],
      reviewJobs: [],
      expertRequests: [],
      recentMessages: [],
      recentEvents: [],
      ts: Date.now(),
    };

    await persistence.save(snapshot);

    const loaded = await persistence.load();
    expect(loaded).toBeUndefined();
  });

  // ============================================================================
  // Atomic Writes
  // ============================================================================

  it('uses atomic write pattern (temp file + rename)', async () => {
    const persistence = new PersistenceManager(config);

    const snapshot: StateSnapshot = {
      agents: [{ name: 'test', role: ['coder'], lastSeen: Date.now(), status: 'active' }],
      intents: [],
      leases: [],
      reviewJobs: [],
      expertRequests: [],
      recentMessages: [],
      recentEvents: [],
      ts: Date.now(),
    };

    await persistence.save(snapshot);

    // Temp file should not exist after save completes
    expect(existsSync(`${TEST_PATH}.tmp`)).toBe(false);

    // Final file should exist
    expect(existsSync(TEST_PATH)).toBe(true);
  });

  // ============================================================================
  // Map Serialization
  // ============================================================================

  it('serializes and deserializes Map objects correctly', async () => {
    const persistence = new PersistenceManager(config);

    // Create snapshot with semaphores (Record<string, number>)
    const snapshot: StateSnapshot = {
      agents: [],
      intents: [],
      leases: [],
      reviewJobs: [],
      expertRequests: [],
      recentMessages: [],
      recentEvents: [],
      semaphores: {
        'file1.ts': 2,
        'file2.ts': 1,
      },
      ts: Date.now(),
    };

    await persistence.save(snapshot);
    const loaded = await persistence.load();

    expect(loaded?.semaphores).toBeDefined();
    expect(loaded?.semaphores?.['file1.ts']).toBe(2);
    expect(loaded?.semaphores?.['file2.ts']).toBe(1);
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  it('handles corrupt JSON gracefully', async () => {
    const persistence = new PersistenceManager(config);

    // Write invalid JSON
    await mkdir(TEST_DIR, { recursive: true });
    await writeFile(TEST_PATH, 'not valid json {{{', 'utf8');

    const loaded = await persistence.load();
    expect(loaded).toBeUndefined();
  });

  it('handles invalid snapshot format', async () => {
    const persistence = new PersistenceManager(config);

    // Write valid JSON but invalid structure
    await mkdir(TEST_DIR, { recursive: true });
    await writeFile(TEST_PATH, JSON.stringify({ invalid: 'structure' }), 'utf8');

    const loaded = await persistence.load();
    expect(loaded).toBeUndefined();
  });

  it('handles missing required arrays in snapshot', async () => {
    const persistence = new PersistenceManager(config);

    // Write snapshot missing required fields
    await mkdir(TEST_DIR, { recursive: true });
    await writeFile(
      TEST_PATH,
      JSON.stringify({
        agents: [],
        // Missing intents, leases, reviewJobs
        recentMessages: [],
        recentEvents: [],
        ts: Date.now(),
      }),
      'utf8',
    );

    const loaded = await persistence.load();
    expect(loaded).toBeUndefined();
  });

  // ============================================================================
  // Auto-Save
  // ============================================================================

  it('starts and stops auto-save correctly', () => {
    const persistence = new PersistenceManager(config);

    // Mock state cache with getSnapshot method
    const mockState = {
      getSnapshot: () =>
        ({
          agents: [],
          intents: [],
          leases: [],
          reviewJobs: [],
          expertRequests: [],
          recentMessages: [],
          recentEvents: [],
          ts: Date.now(),
        }) as StateSnapshot,
    };

    persistence.startAutoSave(mockState as never);

    // Auto-save should be running (we can't easily verify without waiting)
    // Just verify it doesn't throw

    persistence.stopAutoSave();

    // Should be safe to call multiple times
    persistence.stopAutoSave();
  });

  it('does not start auto-save when disabled', () => {
    const disabledConfig = { ...config, enabled: false };
    const persistence = new PersistenceManager(disabledConfig);

    const mockState = {
      getSnapshot: () =>
        ({
          agents: [],
          intents: [],
          leases: [],
          reviewJobs: [],
          expertRequests: [],
          recentMessages: [],
          recentEvents: [],
          ts: Date.now(),
        }) as StateSnapshot,
    };

    persistence.startAutoSave(mockState as never);

    // Should not throw, just no-op
    persistence.stopAutoSave();
  });

  // ============================================================================
  // Validation
  // ============================================================================

  it('validates snapshot has required array fields', async () => {
    const persistence = new PersistenceManager(config);

    const snapshot: StateSnapshot = {
      agents: [{ name: 'test', role: ['coder'], lastSeen: Date.now(), status: 'active' }],
      intents: [],
      leases: [],
      reviewJobs: [],
      expertRequests: [],
      recentMessages: [],
      recentEvents: [],
      ts: Date.now(),
    };

    await persistence.save(snapshot);

    const loaded = await persistence.load();
    expect(loaded).toBeDefined();
    expect(Array.isArray(loaded?.agents)).toBe(true);
    expect(Array.isArray(loaded?.intents)).toBe(true);
    expect(Array.isArray(loaded?.leases)).toBe(true);
    expect(Array.isArray(loaded?.reviewJobs)).toBe(true);
  });

  // ============================================================================
  // Directory Creation
  // ============================================================================

  it('creates directory if it does not exist', async () => {
    const nestedPath = `${TEST_DIR}/nested/dir/state.json`;
    const nestedConfig = { ...config, snapshotPath: nestedPath };
    const persistence = new PersistenceManager(nestedConfig);

    const snapshot: StateSnapshot = {
      agents: [],
      intents: [],
      leases: [],
      reviewJobs: [],
      expertRequests: [],
      recentMessages: [],
      recentEvents: [],
      ts: Date.now(),
    };

    await persistence.save(snapshot);

    expect(existsSync(nestedPath)).toBe(true);
  });

  // ============================================================================
  // Timestamp Preservation
  // ============================================================================

  it('preserves timestamps in snapshot', async () => {
    const persistence = new PersistenceManager(config);

    const now = Date.now();
    const snapshot: StateSnapshot = {
      agents: [{ name: 'test', role: ['coder'], lastSeen: now, status: 'active' }],
      intents: [
        {
          id: 'intent1',
          agent: 'test',
          paths: ['file.ts'],
          mode: 'W',
          priority: 'n',
          status: 'active',
          createdAt: now,
          ttlMs: 120000,
          lastBeat: now,
        },
      ],
      leases: [],
      reviewJobs: [],
      expertRequests: [],
      recentMessages: [],
      recentEvents: [],
      ts: now,
    };

    await persistence.save(snapshot);
    const loaded = await persistence.load();

    expect(loaded?.agents[0]?.lastSeen).toBe(now);
    expect(loaded?.intents[0]?.createdAt).toBe(now);
    expect(loaded?.ts).toBe(now);
  });

  // ============================================================================
  // Large Snapshot
  // ============================================================================

  it('handles large snapshots with many entities', async () => {
    const persistence = new PersistenceManager(config);

    const agents = Array.from({ length: 100 }, (_, i) => ({
      name: `agent${i}`,
      role: ['coder'] as string[],
      lastSeen: Date.now(),
      status: 'active' as const,
    }));

    const snapshot: StateSnapshot = {
      agents,
      intents: [],
      leases: [],
      reviewJobs: [],
      expertRequests: [],
      recentMessages: [],
      recentEvents: [],
      ts: Date.now(),
    };

    await persistence.save(snapshot);
    const loaded = await persistence.load();

    expect(loaded?.agents).toHaveLength(100);
  });

  // ============================================================================
  // JSON Formatting
  // ============================================================================

  it('formats JSON with indentation for readability', async () => {
    const persistence = new PersistenceManager(config);

    const snapshot: StateSnapshot = {
      agents: [{ name: 'test', role: ['coder'], lastSeen: Date.now(), status: 'active' }],
      intents: [],
      leases: [],
      reviewJobs: [],
      expertRequests: [],
      recentMessages: [],
      recentEvents: [],
      ts: Date.now(),
    };

    await persistence.save(snapshot);

    const raw = await readFile(TEST_PATH, 'utf8');
    expect(raw).toContain('\n'); // Should have newlines (formatted)
    expect(raw).toContain('  '); // Should have indentation
  });
});
