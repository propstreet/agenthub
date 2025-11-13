import { describe, it, expect } from 'vitest';
import { ExpertAskSchema } from '../expert.js';

describe('ExpertAskSchema', () => {
  it('accepts valid payload with all fields', () => {
    const result = ExpertAskSchema.parse({
      question: 'How can I optimize this code?',
      paths: ['src/service.ts', 'src/model.ts'],
      effort: 'high',
      verb: 'low',
    });

    expect(result.prompt).toBe('How can I optimize this code?');
    expect(result.files).toEqual(['src/service.ts', 'src/model.ts']);
    expect(result.effort).toBe('high');
    expect(result.verb).toBe('low');
  });

  it('accepts payload with only required fields (question + paths)', () => {
    const result = ExpertAskSchema.parse({
      question: 'What is wrong here?',
      paths: ['src/test.ts'],
    });

    expect(result.prompt).toBe('What is wrong here?');
    expect(result.files).toEqual(['src/test.ts']);
    expect(result.effort).toBe('high'); // Default
    expect(result.verb).toBe('low'); // Default
  });

  describe('Question field variants', () => {
    it('normalizes q → prompt', () => {
      const result = ExpertAskSchema.parse({
        q: 'Short question',
        paths: ['file.ts'],
      });

      expect(result.prompt).toBe('Short question');
    });

    it('normalizes prompt → prompt', () => {
      const result = ExpertAskSchema.parse({
        prompt: 'Prompt text',
        paths: ['file.ts'],
      });

      expect(result.prompt).toBe('Prompt text');
    });

    it('prefers question over q and prompt', () => {
      const result = ExpertAskSchema.parse({
        question: 'Canonical',
        q: 'Variant1',
        prompt: 'Variant2',
        paths: ['file.ts'],
      });

      expect(result.prompt).toBe('Canonical');
    });

    it('prefers q over prompt when question is missing', () => {
      const result = ExpertAskSchema.parse({
        q: 'Q variant',
        prompt: 'Prompt variant',
        paths: ['file.ts'],
      });

      expect(result.prompt).toBe('Q variant');
    });
  });

  describe('Files field variants', () => {
    it('normalizes p → files', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        p: ['a.ts', 'b.ts'],
      });

      expect(result.files).toEqual(['a.ts', 'b.ts']);
    });

    it('normalizes files → files', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        files: ['x.ts', 'y.ts'],
      });

      expect(result.files).toEqual(['x.ts', 'y.ts']);
    });

    it('prefers paths over p and files', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        paths: ['canonical.ts'],
        p: ['variant1.ts'],
        files: ['variant2.ts'],
      });

      expect(result.files).toEqual(['canonical.ts']);
    });

    it('prefers p over files when paths is missing', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        p: ['p-variant.ts'],
        files: ['files-variant.ts'],
      });

      expect(result.files).toEqual(['p-variant.ts']);
    });
  });

  describe('Default values', () => {
    it('defaults effort to "high" when not provided', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        paths: ['file.ts'],
      });

      expect(result.effort).toBe('high');
    });

    it('defaults verb to "low" when not provided', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        paths: ['file.ts'],
      });

      expect(result.verb).toBe('low');
    });

    it('respects provided effort value', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        paths: ['file.ts'],
        effort: 'minimal',
      });

      expect(result.effort).toBe('minimal');
    });

    it('respects provided verb value', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        paths: ['file.ts'],
        verb: 'high',
      });

      expect(result.verb).toBe('high');
    });
  });

  describe('Validation errors', () => {
    it('throws when question is missing', () => {
      expect(() => {
        ExpertAskSchema.parse({
          paths: ['file.ts'],
        });
      }).toThrow('question required');
    });

    it('throws when question is empty string', () => {
      expect(() => {
        ExpertAskSchema.parse({
          question: '   ',
          paths: ['file.ts'],
        });
      }).toThrow('question required');
    });

    it('throws when paths is missing', () => {
      expect(() => {
        ExpertAskSchema.parse({
          question: 'Test question',
        });
      }).toThrow('paths[] required');
    });

    it('throws when paths is empty array', () => {
      expect(() => {
        ExpertAskSchema.parse({
          question: 'Test question',
          paths: [],
        });
      }).toThrow('paths[] required');
    });

    it('throws when both question and paths are missing', () => {
      expect(() => {
        ExpertAskSchema.parse({});
      }).toThrow('question required');
    });
  });

  describe('Effort enum validation', () => {
    it('accepts "minimal"', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        paths: ['file.ts'],
        effort: 'minimal',
      });

      expect(result.effort).toBe('minimal');
    });

    it('accepts "medium"', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        paths: ['file.ts'],
        effort: 'medium',
      });

      expect(result.effort).toBe('medium');
    });

    it('accepts "high"', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        paths: ['file.ts'],
        effort: 'high',
      });

      expect(result.effort).toBe('high');
    });
  });

  describe('Verb enum validation', () => {
    it('accepts "low"', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        paths: ['file.ts'],
        verb: 'low',
      });

      expect(result.verb).toBe('low');
    });

    it('accepts "medium"', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        paths: ['file.ts'],
        verb: 'medium',
      });

      expect(result.verb).toBe('medium');
    });

    it('accepts "high"', () => {
      const result = ExpertAskSchema.parse({
        question: 'Test',
        paths: ['file.ts'],
        verb: 'high',
      });

      expect(result.verb).toBe('high');
    });
  });
});
