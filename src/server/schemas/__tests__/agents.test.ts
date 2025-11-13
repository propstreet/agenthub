import { describe, it, expect } from 'vitest';
import { AgentRegisterSchema } from '../agents.js';

describe('AgentRegisterSchema', () => {
  it('accepts valid payload with all fields', () => {
    const result = AgentRegisterSchema.parse({
      name: 'TestAgent',
      role: ['editor', 'reviewer'],
      version: '1.0.0',
    });

    expect(result.name).toBe('TestAgent');
    expect(result.role).toEqual(['editor', 'reviewer']);
    expect(result.version).toBe('1.0.0');
  });

  it('accepts payload with only role (required field)', () => {
    const result = AgentRegisterSchema.parse({
      role: ['tester'],
    });

    expect(result.name).toBeUndefined();
    expect(result.role).toEqual(['tester']);
    expect(result.version).toBeUndefined();
  });

  it('normalizes role variant (r → role)', () => {
    const result = AgentRegisterSchema.parse({
      r: ['builder'],
    });

    expect(result.role).toEqual(['builder']);
  });

  it('normalizes version variant (v → version)', () => {
    const result = AgentRegisterSchema.parse({
      role: ['editor'],
      v: '2.0.0',
    });

    expect(result.version).toBe('2.0.0');
  });

  it('prefers full field names over variants', () => {
    const result = AgentRegisterSchema.parse({
      role: ['editor'],
      r: ['tester'], // should be ignored
      version: '1.0.0',
      v: '2.0.0', // should be ignored
    });

    expect(result.role).toEqual(['editor']);
    expect(result.version).toBe('1.0.0');
  });

  it('accepts multiple roles', () => {
    const result = AgentRegisterSchema.parse({
      role: ['editor', 'reviewer', 'tester', 'builder'],
    });

    expect(result.role).toHaveLength(4);
    expect(result.role).toContain('editor');
    expect(result.role).toContain('reviewer');
    expect(result.role).toContain('tester');
    expect(result.role).toContain('builder');
  });

  it('throws on missing role', () => {
    expect(() =>
      AgentRegisterSchema.parse({
        name: 'TestAgent',
      }),
    ).toThrow('role[] required');
  });

  it('throws on empty role array', () => {
    expect(() =>
      AgentRegisterSchema.parse({
        role: [],
      }),
    ).toThrow('role[] required');
  });
});
