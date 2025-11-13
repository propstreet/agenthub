import { describe, it, expect } from 'vitest';
import { StateGetSchema } from '../state.js';

describe('StateGetSchema', () => {
  it('accepts valid payload with since', () => {
    const result = StateGetSchema.parse({
      since: 1234567890,
    });

    expect(result.since).toBe(1234567890);
  });

  it('accepts empty payload (all fields optional)', () => {
    const result = StateGetSchema.parse({});

    expect(result.since).toBeUndefined();
  });

  it('accepts since as 0', () => {
    const result = StateGetSchema.parse({
      since: 0,
    });

    expect(result.since).toBe(0);
  });

  it('accepts large timestamps', () => {
    const now = Date.now();
    const result = StateGetSchema.parse({
      since: now,
    });

    expect(result.since).toBe(now);
  });
});
