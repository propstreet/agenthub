import { describe, it, expect } from 'vitest';
import { ExpertRequestSchema, ExpertStatusSchema, ExpertListSchema } from '../expert.js';

describe('Expert Schemas', () => {
  describe('ExpertRequestSchema', () => {
    it('accepts valid payload', () => {
      const raw = {
        question: 'How to optimize?',
        paths: ['src/file.ts'],
        priority: 'h',
      };
      const parsed = ExpertRequestSchema.parse(raw);
      expect(parsed).toEqual({
        question: 'How to optimize?',
        paths: ['src/file.ts'],
        priority: 'h',
      });
    });

    it('normalizes variants', () => {
      const raw = {
        q: 'How to optimize?',
        files: ['src/file.ts'],
        prio: 'h',
      };
      const parsed = ExpertRequestSchema.parse(raw);
      expect(parsed).toEqual({
        question: 'How to optimize?',
        paths: ['src/file.ts'],
        priority: 'h',
      });
    });

    it('throws on missing question', () => {
      expect(() => ExpertRequestSchema.parse({ paths: ['a'] })).toThrow();
    });

    it('throws on missing paths', () => {
      expect(() => ExpertRequestSchema.parse({ question: 'q' })).toThrow();
    });
  });

  describe('ExpertStatusSchema', () => {
    it('accepts valid payload', () => {
      const parsed = ExpertStatusSchema.parse({ requestId: 'exp_123' });
      expect(parsed).toEqual({ requestId: 'exp_123' });
    });

    it('normalizes id variant', () => {
      const parsed = ExpertStatusSchema.parse({ id: 'exp_123' });
      expect(parsed).toEqual({ requestId: 'exp_123' });
    });
  });

  describe('ExpertListSchema', () => {
    it('accepts empty payload', () => {
      const parsed = ExpertListSchema.parse({});
      expect(parsed).toEqual({ limit: 50 });
    });

    it('accepts status filter', () => {
      const parsed = ExpertListSchema.parse({ status: 'completed' });
      expect(parsed).toEqual({ status: 'completed', limit: 50 });
    });

    it('accepts limit alias', () => {
      const parsed = ExpertListSchema.parse({ l: 10 });
      expect(parsed).toEqual({ limit: 10 });
    });
  });
});
