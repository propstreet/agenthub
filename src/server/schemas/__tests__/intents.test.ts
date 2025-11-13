import { describe, it, expect } from 'vitest';
import {
  IntentOpenSchema,
  IntentCloseSchema,
  IntentRenewSchema,
  IntentVoteSchema,
} from '../intents.js';

describe('IntentOpenSchema', () => {
  it('accepts valid payload', () => {
    const result = IntentOpenSchema.parse({
      agent: 'TestAgent',
      paths: ['src/**/*.ts'],
      mode: 'W',
    });
    expect(result.agent).toBe('TestAgent');
    expect(result.paths).toEqual(['src/**/*.ts']);
    expect(result.mode).toBe('W');
    expect(result.priority).toBe('n');
    expect(result.ttlMs).toBe(120000);
  });

  it('normalizes variants', () => {
    const result = IntentOpenSchema.parse({
      from: 'Agent1',
      p: ['lib/**/*.ts'],
      m: 'R',
      prio: 'h',
      ttl: 60000,
    });
    expect(result.agent).toBe('Agent1');
    expect(result.paths).toEqual(['lib/**/*.ts']);
    expect(result.mode).toBe('R');
    expect(result.priority).toBe('h');
    expect(result.ttlMs).toBe(60000);
  });

  it('throws on missing paths', () => {
    expect(() => IntentOpenSchema.parse({ agent: 'A', mode: 'W' })).toThrow('paths[] required');
  });

  it('throws on missing mode', () => {
    expect(() => IntentOpenSchema.parse({ agent: 'A', paths: ['src/**'] })).toThrow(
      'mode required',
    );
  });
});

describe('IntentCloseSchema', () => {
  it('accepts valid payload', () => {
    const result = IntentCloseSchema.parse({
      id: 'i_abc123',
      status: 'ok',
    });

    expect(result.id).toBe('i_abc123');
    expect(result.status).toBe('ok');
    expect(result.note).toBeUndefined();
  });

  it('normalizes status variant (s → status)', () => {
    const result = IntentCloseSchema.parse({
      id: 'i_abc123',
      s: 'abort',
    });

    expect(result.status).toBe('abort');
  });

  it('normalizes note variant (n → note)', () => {
    const result = IntentCloseSchema.parse({
      id: 'i_abc123',
      status: 'ok',
      n: 'All done',
    });

    expect(result.note).toBe('All done');
  });

  it('includes optional note', () => {
    const result = IntentCloseSchema.parse({
      id: 'i_abc123',
      status: 'abort',
      note: 'Conflict detected',
    });

    expect(result.id).toBe('i_abc123');
    expect(result.status).toBe('abort');
    expect(result.note).toBe('Conflict detected');
  });

  it('prefers full field name over variant', () => {
    const result = IntentCloseSchema.parse({
      id: 'i_abc123',
      status: 'ok',
      s: 'abort', // should be ignored
      note: 'Primary',
      n: 'Variant', // should be ignored
    });

    expect(result.status).toBe('ok');
    expect(result.note).toBe('Primary');
  });

  it('throws on missing id', () => {
    expect(() =>
      IntentCloseSchema.parse({
        status: 'ok',
      }),
    ).toThrow('id required');
  });

  it('throws on missing status', () => {
    expect(() =>
      IntentCloseSchema.parse({
        id: 'i_abc123',
      }),
    ).toThrow('status required');
  });

  it('throws on invalid status value', () => {
    expect(() =>
      IntentCloseSchema.parse({
        id: 'i_abc123',
        status: 'invalid',
      }),
    ).toThrow();
  });

  it('rejects temporary intent IDs (v4 refinement)', () => {
    expect(() =>
      IntentCloseSchema.parse({
        id: 'temp_abc123',
        status: 'ok',
      }),
    ).toThrow('Cannot close temporary intents');
  });

  it('accepts non-temporary intent IDs', () => {
    const result = IntentCloseSchema.parse({
      id: 'i_permanent123',
      status: 'ok',
    });

    expect(result.id).toBe('i_permanent123');
  });
});

describe('IntentRenewSchema', () => {
  it('accepts valid payload', () => {
    const result = IntentRenewSchema.parse({
      id: 'i_abc123',
      ttlMs: 60000,
    });

    expect(result.id).toBe('i_abc123');
    expect(result.ttlMs).toBe(60000);
  });

  it('normalizes ttl variant (ttl → ttlMs)', () => {
    const result = IntentRenewSchema.parse({
      id: 'i_abc123',
      ttl: 30000,
    });

    expect(result.ttlMs).toBe(30000);
  });

  it('prefers ttlMs over ttl variant', () => {
    const result = IntentRenewSchema.parse({
      id: 'i_abc123',
      ttlMs: 60000,
      ttl: 30000, // should be ignored
    });

    expect(result.ttlMs).toBe(60000);
  });

  it('applies default ttlMs (120000ms = 2 minutes)', () => {
    const result = IntentRenewSchema.parse({
      id: 'i_abc123',
    });

    expect(result.ttlMs).toBe(120000);
  });

  it('throws on missing id', () => {
    expect(() =>
      IntentRenewSchema.parse({
        ttlMs: 60000,
      }),
    ).toThrow('id required');
  });

  it('throws on zero ttlMs', () => {
    expect(() =>
      IntentRenewSchema.parse({
        id: 'i_abc123',
        ttlMs: 0,
      }),
    ).toThrow('ttlMs must be positive');
  });

  it('throws on negative ttlMs', () => {
    expect(() =>
      IntentRenewSchema.parse({
        id: 'i_abc123',
        ttlMs: -5000,
      }),
    ).toThrow('ttlMs must be positive');
  });
});

describe('IntentVoteSchema', () => {
  it('accepts valid payload with all fields', () => {
    const result = IntentVoteSchema.parse({
      id: 'i_abc123',
      agent: 'TestAgent',
      vote: 'ack',
      reason: 'Looks good',
    });

    expect(result.id).toBe('i_abc123');
    expect(result.agent).toBe('TestAgent');
    expect(result.vote).toBe('ack');
    expect(result.reason).toBe('Looks good');
  });

  it('accepts payload without optional fields', () => {
    const result = IntentVoteSchema.parse({
      id: 'i_abc123',
      agent: 'TestAgent',
      vote: 'nack',
    });

    expect(result.id).toBe('i_abc123');
    expect(result.agent).toBe('TestAgent');
    expect(result.vote).toBe('nack');
    expect(result.reason).toBeUndefined();
  });

  it('accepts payload without agent (session resolution)', () => {
    const result = IntentVoteSchema.parse({
      id: 'i_abc123',
      vote: 'ack',
    });

    expect(result.id).toBe('i_abc123');
    expect(result.agent).toBeUndefined(); // Handler will resolve
    expect(result.vote).toBe('ack');
  });

  it('normalizes vote variant (v → vote)', () => {
    const result = IntentVoteSchema.parse({
      id: 'i_abc123',
      agent: 'TestAgent',
      v: 'nack',
    });

    expect(result.vote).toBe('nack');
  });

  it('normalizes agent variants (agent, from)', () => {
    const result1 = IntentVoteSchema.parse({
      id: 'i_abc123',
      agent: 'Agent1',
      vote: 'ack',
    });
    expect(result1.agent).toBe('Agent1');

    const result2 = IntentVoteSchema.parse({
      id: 'i_abc123',
      from: 'Agent2',
      vote: 'ack',
    });
    expect(result2.agent).toBe('Agent2');
  });

  it('normalizes reason variant (r → reason)', () => {
    const result = IntentVoteSchema.parse({
      id: 'i_abc123',
      agent: 'TestAgent',
      vote: 'nack',
      r: 'Needs changes',
    });

    expect(result.reason).toBe('Needs changes');
  });

  it('prefers full field names over variants', () => {
    const result = IntentVoteSchema.parse({
      id: 'i_abc123',
      agent: 'PrimaryAgent',
      a: 'VariantAgent', // should be ignored
      vote: 'ack',
      v: 'nack', // should be ignored
      reason: 'Main reason',
      r: 'Variant reason', // should be ignored
    });

    expect(result.agent).toBe('PrimaryAgent');
    expect(result.vote).toBe('ack');
    expect(result.reason).toBe('Main reason');
  });

  it('throws on missing id', () => {
    expect(() =>
      IntentVoteSchema.parse({
        agent: 'TestAgent',
        vote: 'ack',
      }),
    ).toThrow('id required');
  });

  it('throws on missing vote', () => {
    expect(() =>
      IntentVoteSchema.parse({
        id: 'i_abc123',
        agent: 'TestAgent',
      }),
    ).toThrow('vote required');
  });

  it('accepts both ack and nack votes', () => {
    const ackResult = IntentVoteSchema.parse({
      id: 'i_abc123',
      agent: 'TestAgent',
      vote: 'ack',
    });
    expect(ackResult.vote).toBe('ack');

    const nackResult = IntentVoteSchema.parse({
      id: 'i_abc123',
      agent: 'TestAgent',
      vote: 'nack',
    });
    expect(nackResult.vote).toBe('nack');
  });
});
