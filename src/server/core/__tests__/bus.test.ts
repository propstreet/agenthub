import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageBus } from '../bus.js';
import type { ServerConfig } from '../../types/models.js';

describe('MessageBus', () => {
  let bus: MessageBus;
  let config: ServerConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    config = {
      port: 3333,
      host: 'localhost',
      logLevel: 'info',
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('send', () => {
    it('should send a direct message', () => {
      const msg = bus.send({
        from: 'agent-1',
        to: 'agent-2',
        type: 'chat',
        topic: 'general',
        text: 'Hello',
      });

      expect(msg.id).toBeDefined();
      expect(msg.from).toBe('agent-1');
      expect(msg.to).toBe('agent-2');
    });

    it('should send a broadcast message', () => {
      const msg = bus.send({
        from: 'agent-1',
        type: 'chat',
        topic: 'general',
        text: 'Broadcast',
      });

      expect(msg.to).toBeUndefined();
    });
  });

  describe('pull with filters', () => {
    beforeEach(() => {
      // Setup messages
      // 1. Direct to agent-1
      bus.send({ from: 'agent-2', to: 'agent-1', type: 'chat', topic: 'general', text: 'Hi' });
      // 2. Broadcast from agent-2
      bus.send({ from: 'agent-2', type: 'supervision.announcement', topic: 'news', text: 'News' });
      // 3. Direct to agent-2 (should not see)
      bus.send({ from: 'agent-1', to: 'agent-2', type: 'chat', topic: 'secret', text: 'Shh' });
      // 4. Broadcast from agent-1 (Self-broadcast)
      bus.send({ from: 'agent-1', type: 'chat', topic: 'status', text: 'My status' });
      // 5. Review request to agent-1
      bus.send({
        from: 'agent-3',
        to: 'agent-1',
        type: 'review.requested',
        topic: 'review',
        text: 'Review me',
      });
    });

    it('should pull messages for agent-1 (default: direct + broadcast - self)', () => {
      const messages = bus.pull({ agent: 'agent-1' });

      // Should see:
      // 1. Direct from agent-2
      // 2. Broadcast from agent-2
      // 5. Review request from agent-3
      // Should NOT see:
      // 3. Direct to agent-2
      // 4. Self-broadcast (default includeSelf=false)

      expect(messages).toHaveLength(3);
      const texts = messages.map((m) => m.text);
      expect(texts).toContain('Hi');
      expect(texts).toContain('News');
      expect(texts).toContain('Review me');
      expect(texts).not.toContain('My status');
    });

    it('should include self-broadcasts when includeSelf=true', () => {
      const messages = bus.pull({ agent: 'agent-1', includeSelf: true });

      expect(messages).toHaveLength(4);
      const texts = messages.map((m) => m.text);
      expect(texts).toContain('My status');
    });

    it('should filter by type (single)', () => {
      const messages = bus.pull({ agent: 'agent-1', type: 'review.requested' });

      expect(messages).toHaveLength(1);
      expect(messages[0]?.text).toBe('Review me');
    });

    it('should filter by types (array)', () => {
      const messages = bus.pull({ agent: 'agent-1', types: ['chat', 'review.requested'] });

      expect(messages).toHaveLength(2);
      const texts = messages.map((m) => m.text);
      expect(texts).toContain('Hi');
      expect(texts).toContain('Review me');
      // 'My status' is chat but self-broadcast filtered by default
      expect(texts).not.toContain('News'); // supervision.announcement
    });

    it('should filter by topic', () => {
      const messages = bus.pull({ agent: 'agent-1', topic: 'news' });

      expect(messages).toHaveLength(1);
      expect(messages[0]?.text).toBe('News');
    });

    it('should respect since timestamp', () => {
      const now = Date.now();
      vi.advanceTimersByTime(1); // Advance time by 1ms
      bus.send({ from: 'agent-2', to: 'agent-1', type: 'chat', topic: 'future', text: 'Future' });

      const messages = bus.pull({ agent: 'agent-1', since: now });

      expect(messages).toHaveLength(1);
      expect(messages[0]?.text).toBe('Future');
    });
  });
});
