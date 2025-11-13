/**
 * Message Bus - Lightweight pub/sub for agent communication
 * Handles message passing and event emission
 */

import { nanoid } from 'nanoid';
import type { Msg, Event, MessagePullPayload, ServerConfig } from '../types/models.js';
import type { ResolvedMessageSendPayload } from '../types/payloads.js';

export class MessageBus {
  private messages: Msg[] = [];
  private events: Event[] = [];
  private eventListeners = new Map<string, Set<(event: Event) => void>>();
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  /**
   * Send a message from one agent to another (or broadcast)
   */
  send(payload: ResolvedMessageSendPayload): Msg {
    const msg: Msg = {
      id: nanoid(12),
      ts: Date.now(),
      from: payload.from,
      ...(payload.to !== undefined && { to: payload.to }),
      type: payload.type,
      topic: payload.topic,
      text: payload.text,
      ...(payload.data !== undefined && { data: payload.data }),
      ...(payload.att !== undefined && { att: payload.att }),
    };

    this.messages.push(msg);
    this.trimMessages();

    // Emit as event for real-time subscriptions
    this.emit({
      type: 'INTENT_EVENT',
      action: 'open',
      intentId: msg.id,
      agent: msg.from,
      data: { topic: msg.topic, to: msg.to },
      ts: msg.ts,
    });

    return msg;
  }

  /**
   * Pull messages for a specific agent
   */
  pull(payload: MessagePullPayload): Msg[] {
    const { agent, since = 0, limit = 50 } = payload;

    // Filter messages for this agent (direct or broadcast)
    const filtered = this.messages.filter(
      (msg) => msg.ts > since && (msg.to === agent || msg.to === undefined || msg.from === agent),
    );

    // Sort by timestamp (newest first) and limit
    return filtered.sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  /**
   * Get unread message count for an agent (for inbox notifications)
   */
  getMessagesFor(agent: string): Msg[] {
    return this.messages.filter(
      (msg) => msg.to === agent || (msg.to === undefined && msg.from !== agent),
    );
  }

  /**
   * Emit an event to the bus
   */
  emit(event: Event): void {
    this.events.push(event);
    this.trimEvents();

    // Notify subscribers
    const listeners = this.eventListeners.get(event.type);
    if (listeners !== undefined) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error(`Event listener error for ${event.type}:`, error);
        }
      }
    }

    // Also notify wildcard listeners
    const wildcardListeners = this.eventListeners.get('*');
    if (wildcardListeners !== undefined) {
      for (const listener of wildcardListeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('Event listener error (wildcard):', error);
        }
      }
    }
  }

  /**
   * Subscribe to events
   */
  on(eventType: string, listener: (event: Event) => void): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }

    const listeners = this.eventListeners.get(eventType);
    if (listeners === undefined) {
      throw new Error(`Failed to get listeners for event type: ${eventType}`);
    }
    listeners.add(listener);

    // Return unsubscribe function
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.eventListeners.delete(eventType);
      }
    };
  }

  /**
   * Get recent events (for dashboard/debugging)
   */
  getEvents(since?: number, limit = 100): Event[] {
    let filtered = this.events;

    if (since !== undefined) {
      filtered = filtered.filter((e) => e.ts > since);
    }

    return filtered.sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  /**
   * Get messages for inbox resource
   */
  getMessagesForAgent(agent: string, limit = 50): Msg[] {
    return this.messages
      .filter((msg) => msg.to === agent || msg.to === undefined)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);
  }

  /**
   * Get all messages (for state snapshot)
   */
  getAllMessages(limit?: number): Msg[] {
    const sorted = [...this.messages].sort((a, b) => b.ts - a.ts);
    return limit !== undefined ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Trim messages to prevent unbounded growth
   */
  private trimMessages(): void {
    const max = this.config.limits.maxMessages;
    if (this.messages.length > max) {
      // Keep most recent messages
      this.messages = this.messages.sort((a, b) => b.ts - a.ts).slice(0, max);
    }
  }

  /**
   * Trim events to prevent unbounded growth
   */
  private trimEvents(): void {
    const max = this.config.limits.maxEvents;
    if (this.events.length > max) {
      // Keep most recent events
      this.events = this.events.sort((a, b) => b.ts - a.ts).slice(0, max);
    }
  }

  /**
   * Clear all messages (for testing/reset)
   */
  clear(): void {
    this.messages = [];
    this.events = [];
  }

  /**
   * Get statistics
   */
  getStats(): {
    messageCount: number;
    eventCount: number;
    listenerCount: number;
  } {
    let listenerCount = 0;
    for (const listeners of this.eventListeners.values()) {
      listenerCount += listeners.size;
    }

    return {
      messageCount: this.messages.length,
      eventCount: this.events.length,
      listenerCount,
    };
  }
}
