import { describe, it, expect } from 'vitest';
import { ModeSchema, PrioritySchema, VoteSchema, CloseStatusSchema } from '../base.js';

describe('Base enum schemas', () => {
  describe('ModeSchema', () => {
    it('accepts valid values', () => {
      expect(ModeSchema.parse('R')).toBe('R');
      expect(ModeSchema.parse('W')).toBe('W');
      expect(ModeSchema.parse('B')).toBe('B');
      expect(ModeSchema.parse('T')).toBe('T');
    });

    it('rejects invalid values', () => {
      expect(() => ModeSchema.parse('X')).toThrow();
      expect(() => ModeSchema.parse('read')).toThrow();
      expect(() => ModeSchema.parse('')).toThrow();
    });
  });

  describe('PrioritySchema', () => {
    it('accepts valid values', () => {
      expect(PrioritySchema.parse('l')).toBe('l');
      expect(PrioritySchema.parse('n')).toBe('n');
      expect(PrioritySchema.parse('h')).toBe('h');
      expect(PrioritySchema.parse('r')).toBe('r');
    });

    it('rejects invalid values', () => {
      expect(() => PrioritySchema.parse('low')).toThrow();
      expect(() => PrioritySchema.parse('HIGH')).toThrow();
      expect(() => PrioritySchema.parse('x')).toThrow();
    });
  });

  describe('VoteSchema', () => {
    it('accepts valid values', () => {
      expect(VoteSchema.parse('ack')).toBe('ack');
      expect(VoteSchema.parse('nack')).toBe('nack');
    });

    it('rejects invalid values', () => {
      expect(() => VoteSchema.parse('yes')).toThrow();
      expect(() => VoteSchema.parse('no')).toThrow();
      expect(() => VoteSchema.parse('ACK')).toThrow();
    });
  });

  describe('CloseStatusSchema', () => {
    it('accepts valid values', () => {
      expect(CloseStatusSchema.parse('ok')).toBe('ok');
      expect(CloseStatusSchema.parse('abort')).toBe('abort');
    });

    it('rejects invalid values', () => {
      expect(() => CloseStatusSchema.parse('success')).toThrow();
      expect(() => CloseStatusSchema.parse('failed')).toThrow();
      expect(() => CloseStatusSchema.parse('OK')).toThrow();
    });
  });
});
