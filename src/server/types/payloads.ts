/**
 * Core Method Payload Types
 * These types represent fully-resolved payloads AFTER session resolution
 * Used by core methods (bus.send, coordinator methods) which expect required fields
 */

import type { Mode, Priority, Vote } from './models.js';

/**
 * Resolved payload for bus.send()
 * All fields required after session resolution in handler
 */
export interface ResolvedMessageSendPayload {
  from: string; // Required - resolved from session if needed
  to?: string;
  topic: string;
  text: string;
  att?: Record<string, unknown>;
}

/**
 * Resolved payload for coordinator.openIntent()
 * Agent required after session resolution in handler
 */
export interface ResolvedIntentOpenPayload {
  agent: string; // Required - resolved from session if needed
  paths: string[];
  mode: Mode;
  priority: Priority;
  ttlMs: number;
  hunks?: string[];
}

/**
 * Resolved payload for coordinator.voteIntent()
 * Agent required after session resolution in handler
 */
export interface ResolvedIntentVotePayload {
  id: string;
  agent: string; // Required - resolved from session if needed
  vote: Vote;
  reason?: string;
}

/**
 * Resolved payload for coordinator.announceLease()
 * Agent required after session resolution in handler
 */
export interface ResolvedLeaseAnnouncePayload {
  agent: string; // Required - resolved from session if needed
  paths: string[];
  mode: Mode;
  ttlMs: number;
}
