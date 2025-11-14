/**
 * Review operation schema tests
 */

import { describe, it, expect } from 'vitest';
import { ReviewRequestSchema, ReviewClaimSchema, ReviewCompleteSchema } from '../review.js';

// ============================================================================
// ReviewRequestSchema Tests
// ============================================================================

describe('ReviewRequestSchema', () => {
  it('accepts valid payload with canonical fields', () => {
    const result = ReviewRequestSchema.parse({
      scope: ['src/**/*.ts', 'lib/**/*.js'],
      summary: 'Review for security issues',
      from: 'requester-1',
    });

    expect(result.scope).toEqual(['src/**/*.ts', 'lib/**/*.js']);
    expect(result.summary).toBe('Review for security issues');
    expect(result.from).toBe('requester-1');
  });

  it('accepts scope without optional fields', () => {
    const result = ReviewRequestSchema.parse({
      scope: ['src/auth.ts'],
    });

    expect(result.scope).toEqual(['src/auth.ts']);
    expect(result.summary).toBeUndefined();
    expect(result.from).toBeUndefined();
  });

  it('normalizes scope variants (paths, p)', () => {
    const result1 = ReviewRequestSchema.parse({
      paths: ['file1.ts', 'file2.ts'],
    });
    expect(result1.scope).toEqual(['file1.ts', 'file2.ts']);

    const result2 = ReviewRequestSchema.parse({
      p: ['file3.ts'],
    });
    expect(result2.scope).toEqual(['file3.ts']);
  });

  it('normalizes summary variants (note)', () => {
    const result = ReviewRequestSchema.parse({
      scope: ['test.ts'],
      note: 'Check for bugs',
    });
    expect(result.summary).toBe('Check for bugs');
  });

  it('normalizes from variants (agent)', () => {
    const result = ReviewRequestSchema.parse({
      scope: ['test.ts'],
      agent: 'Agent1',
    });
    expect(result.from).toBe('Agent1');
  });

  it('prefers canonical fields over variants', () => {
    const result = ReviewRequestSchema.parse({
      scope: ['canonical.ts'],
      paths: ['variant1.ts'],
      p: ['variant2.ts'],
      summary: 'Canonical summary',
      note: 'Variant note',
      from: 'CanonicalAgent',
      agent: 'VariantAgent',
    });

    expect(result.scope).toEqual(['canonical.ts']);
    expect(result.summary).toBe('Canonical summary');
    expect(result.from).toBe('CanonicalAgent');
  });

  it('throws on missing scope', () => {
    expect(() => ReviewRequestSchema.parse({ summary: 'Test' })).toThrow('scope required');
  });

  it('throws on empty scope array', () => {
    expect(() => ReviewRequestSchema.parse({ scope: [] })).toThrow('scope required');
  });

  it('throws on empty payload', () => {
    expect(() => ReviewRequestSchema.parse({})).toThrow('scope required');
  });
});

// ============================================================================
// ReviewClaimSchema Tests
// ============================================================================

describe('ReviewClaimSchema', () => {
  it('accepts valid payload with canonical fields', () => {
    const result = ReviewClaimSchema.parse({
      jobId: 'rev_abc123',
      agent: 'reviewer-1',
    });

    expect(result.jobId).toBe('rev_abc123');
    expect(result.agent).toBe('reviewer-1');
  });

  it('accepts jobId without agent (session-aware)', () => {
    const result = ReviewClaimSchema.parse({
      jobId: 'rev_abc123',
    });

    expect(result.jobId).toBe('rev_abc123');
    expect(result.agent).toBeUndefined();
  });

  it('normalizes jobId variants (id, job)', () => {
    const result1 = ReviewClaimSchema.parse({ id: 'rev_123' });
    expect(result1.jobId).toBe('rev_123');

    const result2 = ReviewClaimSchema.parse({ job: 'rev_456' });
    expect(result2.jobId).toBe('rev_456');
  });

  it('normalizes agent variants (agent, from)', () => {
    const result1 = ReviewClaimSchema.parse({
      jobId: 'rev_123',
      agent: 'Agent1',
    });
    expect(result1.agent).toBe('Agent1');

    const result2 = ReviewClaimSchema.parse({
      jobId: 'rev_123',
      from: 'Agent2',
    });
    expect(result2.agent).toBe('Agent2');
  });

  it('prefers canonical field over variants', () => {
    const result = ReviewClaimSchema.parse({
      jobId: 'rev_canonical',
      id: 'rev_variant1',
      job: 'rev_variant2',
      agent: 'CanonicalAgent',
      from: 'VariantAgent',
    });

    expect(result.jobId).toBe('rev_canonical');
    expect(result.agent).toBe('CanonicalAgent');
  });

  it('throws on missing jobId', () => {
    expect(() => ReviewClaimSchema.parse({ agent: 'reviewer' })).toThrow('jobId required');
  });

  it('throws on empty payload', () => {
    expect(() => ReviewClaimSchema.parse({})).toThrow('jobId required');
  });
});

// ============================================================================
// ReviewCompleteSchema Tests
// ============================================================================

describe('ReviewCompleteSchema', () => {
  it('accepts valid payload with all fields', () => {
    const result = ReviewCompleteSchema.parse({
      jobId: 'rev_abc123',
      agent: 'reviewer-1',
      severity: 'warning',
      notes: 'Found some issues',
      patch: '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@',
    });

    expect(result.jobId).toBe('rev_abc123');
    expect(result.agent).toBe('reviewer-1');
    expect(result.severity).toBe('warning');
    expect(result.notes).toBe('Found some issues');
    expect(result.patch).toBe('--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@');
  });

  it('accepts payload without optional fields (agent, patch)', () => {
    const result = ReviewCompleteSchema.parse({
      jobId: 'rev_abc123',
      severity: 'info',
      notes: 'All good',
    });

    expect(result.jobId).toBe('rev_abc123');
    expect(result.severity).toBe('info');
    expect(result.notes).toBe('All good');
    expect(result.agent).toBeUndefined();
    expect(result.patch).toBeUndefined();
  });

  it('normalizes jobId variants (id, job)', () => {
    const result1 = ReviewCompleteSchema.parse({
      id: 'rev_123',
      severity: 'info',
      notes: 'Test',
    });
    expect(result1.jobId).toBe('rev_123');

    const result2 = ReviewCompleteSchema.parse({
      job: 'rev_456',
      severity: 'info',
      notes: 'Test',
    });
    expect(result2.jobId).toBe('rev_456');
  });

  it('normalizes agent variants (agent, from)', () => {
    const result1 = ReviewCompleteSchema.parse({
      jobId: 'rev_123',
      agent: 'Agent1',
      severity: 'info',
      notes: 'Test',
    });
    expect(result1.agent).toBe('Agent1');

    const result2 = ReviewCompleteSchema.parse({
      jobId: 'rev_123',
      from: 'Agent2',
      severity: 'info',
      notes: 'Test',
    });
    expect(result2.agent).toBe('Agent2');
  });

  it('normalizes severity variants (severity, sev)', () => {
    const result1 = ReviewCompleteSchema.parse({
      jobId: 'rev_123',
      severity: 'error',
      notes: 'Test',
    });
    expect(result1.severity).toBe('error');

    const result2 = ReviewCompleteSchema.parse({
      jobId: 'rev_123',
      sev: 'critical',
      notes: 'Test',
    });
    expect(result2.severity).toBe('critical');
  });

  it('normalizes notes variants (notes, note, message)', () => {
    const result1 = ReviewCompleteSchema.parse({
      jobId: 'rev_123',
      severity: 'info',
      notes: 'Notes field',
    });
    expect(result1.notes).toBe('Notes field');

    const result2 = ReviewCompleteSchema.parse({
      jobId: 'rev_123',
      severity: 'info',
      note: 'Note field',
    });
    expect(result2.notes).toBe('Note field');

    const result3 = ReviewCompleteSchema.parse({
      jobId: 'rev_123',
      severity: 'info',
      message: 'Message field',
    });
    expect(result3.notes).toBe('Message field');
  });

  it('accepts all valid severity values', () => {
    const severities = ['info', 'warning', 'error', 'critical'] as const;

    severities.forEach((sev) => {
      const result = ReviewCompleteSchema.parse({
        jobId: 'rev_123',
        severity: sev,
        notes: 'Test',
      });
      expect(result.severity).toBe(sev);
    });
  });

  it('trims whitespace from notes and patch', () => {
    const result = ReviewCompleteSchema.parse({
      jobId: 'rev_123',
      severity: 'info',
      notes: '  Trimmed notes  ',
      patch: '  Trimmed patch  ',
    });

    expect(result.notes).toBe('Trimmed notes');
    expect(result.patch).toBe('Trimmed patch');
  });

  it('omits patch if empty or whitespace-only', () => {
    const result1 = ReviewCompleteSchema.parse({
      jobId: 'rev_123',
      severity: 'info',
      notes: 'Test',
      patch: '',
    });
    expect(result1.patch).toBeUndefined();

    const result2 = ReviewCompleteSchema.parse({
      jobId: 'rev_123',
      severity: 'info',
      notes: 'Test',
      patch: '   ',
    });
    expect(result2.patch).toBeUndefined();
  });

  it('prefers canonical fields over variants', () => {
    const result = ReviewCompleteSchema.parse({
      jobId: 'canonical_job',
      id: 'variant_id',
      job: 'variant_job',
      agent: 'CanonicalAgent',
      from: 'VariantAgent',
      severity: 'error',
      sev: 'info',
      notes: 'Canonical notes',
      note: 'Variant note',
      message: 'Variant message',
    });

    expect(result.jobId).toBe('canonical_job');
    expect(result.agent).toBe('CanonicalAgent');
    expect(result.severity).toBe('error');
    expect(result.notes).toBe('Canonical notes');
  });

  it('throws on missing jobId', () => {
    expect(() =>
      ReviewCompleteSchema.parse({
        severity: 'info',
        notes: 'Test',
      }),
    ).toThrow('jobId required');
  });

  it('throws on missing severity', () => {
    expect(() =>
      ReviewCompleteSchema.parse({
        jobId: 'rev_123',
        notes: 'Test',
      }),
    ).toThrow('severity required');
  });

  it('throws on missing notes', () => {
    expect(() =>
      ReviewCompleteSchema.parse({
        jobId: 'rev_123',
        severity: 'info',
      }),
    ).toThrow('notes required');
  });

  it('throws on empty notes (whitespace-only)', () => {
    expect(() =>
      ReviewCompleteSchema.parse({
        jobId: 'rev_123',
        severity: 'info',
        notes: '   ',
      }),
    ).toThrow('notes required');
  });

  it('throws on invalid severity value', () => {
    expect(() =>
      ReviewCompleteSchema.parse({
        jobId: 'rev_123',
        severity: 'invalid',
        notes: 'Test',
      }),
    ).toThrow();
  });
});
