import { describe, it, expect } from 'vitest';
import { LeaseAnnounceSchema } from '../leases.js';

describe('LeaseAnnounceSchema', () => {
  it('accepts valid payload with all fields', () => {
    const result = LeaseAnnounceSchema.parse({
      agent: 'TestAgent',
      paths: ['src/**/*.ts', 'lib/**/*.ts'],
      mode: 'W',
      ttlMs: 300000,
    });

    expect(result.agent).toBe('TestAgent');
    expect(result.paths).toEqual(['src/**/*.ts', 'lib/**/*.ts']);
    expect(result.mode).toBe('W');
    expect(result.ttlMs).toBe(300000);
  });

  it('applies default mode (R) and ttlMs (600000)', () => {
    const result = LeaseAnnounceSchema.parse({
      agent: 'TestAgent',
      paths: ['src/**/*.ts'],
    });

    expect(result.mode).toBe('R');
    expect(result.ttlMs).toBe(600000); // 10 minutes
  });

  it('accepts payload without agent (session resolution)', () => {
    const result = LeaseAnnounceSchema.parse({
      paths: ['src/**/*.ts'],
    });

    expect(result.agent).toBeUndefined(); // Handler will resolve
    expect(result.paths).toEqual(['src/**/*.ts']);
  });

  it('normalizes paths variant (p → paths)', () => {
    const result = LeaseAnnounceSchema.parse({
      agent: 'TestAgent',
      p: ['dist/**/*.js'],
    });

    expect(result.paths).toEqual(['dist/**/*.js']);
  });

  it('normalizes mode variant (m → mode)', () => {
    const result = LeaseAnnounceSchema.parse({
      agent: 'TestAgent',
      paths: ['src/**/*.ts'],
      m: 'B',
    });

    expect(result.mode).toBe('B');
  });

  it('normalizes ttl variant (ttl → ttlMs)', () => {
    const result = LeaseAnnounceSchema.parse({
      agent: 'TestAgent',
      paths: ['src/**/*.ts'],
      ttl: 120000,
    });

    expect(result.ttlMs).toBe(120000);
  });

  it('normalizes agent variants (agent, from)', () => {
    const result1 = LeaseAnnounceSchema.parse({
      agent: 'Agent1',
      paths: ['src/**/*.ts'],
    });
    expect(result1.agent).toBe('Agent1');

    const result2 = LeaseAnnounceSchema.parse({
      from: 'Agent2',
      paths: ['src/**/*.ts'],
    });
    expect(result2.agent).toBe('Agent2');
  });

  it('prefers full field names over variants', () => {
    const result = LeaseAnnounceSchema.parse({
      agent: 'PrimaryAgent',
      from: 'VariantAgent', // should be ignored
      paths: ['src/**/*.ts'],
      p: ['dist/**/*.js'], // should be ignored
      mode: 'W',
      m: 'R', // should be ignored
      ttlMs: 300000,
      ttl: 120000, // should be ignored
    });

    expect(result.agent).toBe('PrimaryAgent');
    expect(result.paths).toEqual(['src/**/*.ts']);
    expect(result.mode).toBe('W');
    expect(result.ttlMs).toBe(300000);
  });

  it('accepts all valid modes', () => {
    ['R', 'W', 'B', 'T'].forEach((mode) => {
      const result = LeaseAnnounceSchema.parse({
        agent: 'TestAgent',
        paths: ['src/**/*.ts'],
        mode,
      });
      expect(result.mode).toBe(mode);
    });
  });

  it('accepts multiple paths', () => {
    const result = LeaseAnnounceSchema.parse({
      agent: 'TestAgent',
      paths: ['src/**/*.ts', 'lib/**/*.ts', 'test/**/*.test.ts'],
    });

    expect(result.paths).toHaveLength(3);
    expect(result.paths).toContain('src/**/*.ts');
    expect(result.paths).toContain('lib/**/*.ts');
    expect(result.paths).toContain('test/**/*.test.ts');
  });

  it('throws on missing paths', () => {
    expect(() =>
      LeaseAnnounceSchema.parse({
        agent: 'TestAgent',
        mode: 'W',
      }),
    ).toThrow('paths[] required');
  });

  it('throws on empty paths array', () => {
    expect(() =>
      LeaseAnnounceSchema.parse({
        agent: 'TestAgent',
        paths: [],
      }),
    ).toThrow('paths[] required');
  });

  it('throws on zero ttlMs', () => {
    expect(() =>
      LeaseAnnounceSchema.parse({
        agent: 'TestAgent',
        paths: ['src/**/*.ts'],
        ttlMs: 0,
      }),
    ).toThrow('ttlMs must be positive');
  });

  it('throws on negative ttlMs', () => {
    expect(() =>
      LeaseAnnounceSchema.parse({
        agent: 'TestAgent',
        paths: ['src/**/*.ts'],
        ttlMs: -5000,
      }),
    ).toThrow('ttlMs must be positive');
  });
});
