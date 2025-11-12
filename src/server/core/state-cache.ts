/**
 * State Cache - In-memory state management
 * Provides snapshot of current system state for dashboard and queries
 */

import type {
  Agent,
  Intent,
  Lease,
  ReviewJob,
  StateSnapshot,
  ServerConfig,
} from '../types/models.js';
import type { MessageBus } from './bus.js';

export class StateCache {
  private agents = new Map<string, Agent>();
  private intents = new Map<string, Intent>();
  private leases = new Map<string, Lease>();
  private reviewJobs = new Map<string, ReviewJob>();
  private semaphores = new Map<string, number>();
  private bus: MessageBus;
  private config: ServerConfig;

  // Session tracking: sessionId → agentName
  // Ensures one agent identity per MCP session
  private sessionToAgent = new Map<string, string>();
  // Reverse lookup: agentName → sessionId
  private agentToSession = new Map<string, string>();

  // Cleanup timer IDs for graceful shutdown
  private cleanupTimers: NodeJS.Timeout[] = [];

  constructor(bus: MessageBus, config: ServerConfig) {
    this.bus = bus;
    this.config = config;

    // Start cleanup intervals
    this.startCleanupTimers();
  }

  // =========================================================================
  // Agent Management
  // =========================================================================

  /**
   * Register or update an agent
   * If sessionId is provided, enforces one agent per session (locked identity)
   */
  registerAgent(name: string, role: string[], version?: string, sessionId?: string): Agent {
    // If session tracking is enabled, enforce one agent per session
    if (sessionId !== undefined) {
      const existingAgentName = this.sessionToAgent.get(sessionId);

      if (existingAgentName !== undefined) {
        // Session already has an agent - update role/version only
        // Name is locked to maintain identity
        const agent = this.agents.get(existingAgentName);
        if (agent === undefined) {
          throw new Error(`Session agent ${existingAgentName} not found`);
        }

        // Update role and version, refresh heartbeat
        agent.role = role;
        if (version !== undefined) {
          agent.version = version;
        }
        agent.lastSeen = Date.now();
        agent.status = 'active';

        console.log(
          `[StateCache] Agent updated: ${existingAgentName} [${role.join(', ')}] (session locked)`,
        );

        return agent;
      }

      // First registration for this session
      // Check if requested name is already taken by another session
      if (this.agents.has(name)) {
        const owningSession = this.agentToSession.get(name);
        if (owningSession !== undefined && owningSession !== sessionId) {
          throw new Error(
            `Agent name "${name}" is already registered by another session. Choose a different name.`,
          );
        }
      }

      // Register new agent with session binding
      this.sessionToAgent.set(sessionId, name);
      this.agentToSession.set(name, sessionId);
    }

    const existing = this.agents.get(name);

    const agent: Agent = {
      name,
      role,
      ...(version !== undefined && { version }),
      lastSeen: Date.now(),
      status: 'active',
    };

    this.agents.set(name, agent);

    if (existing === undefined) {
      const sessionNote = sessionId !== undefined ? ` (session: ${sessionId.substring(0, 8)}...)` : '';
      console.log(`[StateCache] Agent registered: ${name} [${role.join(', ')}]${sessionNote}`);
    }

    return agent;
  }

  /**
   * Update agent heartbeat
   */
  heartbeatAgent(name: string): void {
    const agent = this.agents.get(name);
    if (agent !== undefined) {
      agent.lastSeen = Date.now();
      agent.status = 'active';
    }
  }

  /**
   * Get agent by name
   */
  getAgent(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  /**
   * Get all agents
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Find agents by role
   */
  getAgentsByRole(role: string): Agent[] {
    return Array.from(this.agents.values()).filter((a) => a.role.includes(role));
  }

  /**
   * Remove agent and cleanup session binding
   */
  removeAgent(name: string): void {
    this.agents.delete(name);

    // Clean up session bindings
    const sessionId = this.agentToSession.get(name);
    if (sessionId !== undefined) {
      this.sessionToAgent.delete(sessionId);
      this.agentToSession.delete(name);
    }
  }

  /**
   * Get agent name for a given session ID
   */
  getAgentForSession(sessionId: string): string | undefined {
    return this.sessionToAgent.get(sessionId);
  }

  /**
   * Get full agent object for a given session ID
   * This is agent-friendly - makes it easy to get your own agent info!
   */
  getAgentBySession(sessionId: string): Agent | undefined {
    const agentName = this.sessionToAgent.get(sessionId);
    if (agentName) {
      return this.agents.get(agentName);
    }
    return undefined;
  }

  /**
   * Validate that an agent belongs to a specific session
   * Throws error if agent doesn't exist or belongs to different session
   */
  validateAgentOwnership(agentName: string, sessionId: string): void {
    const agent = this.agents.get(agentName);
    if (agent === undefined) {
      throw new Error(`Agent "${agentName}" not found. Register with a.register first.`);
    }

    const owningSession = this.agentToSession.get(agentName);
    if (owningSession !== undefined && owningSession !== sessionId) {
      throw new Error(
        `Agent "${agentName}" belongs to another session. You can only act as your own registered agent.`,
      );
    }
  }

  /**
   * Clean up session and associated agent
   */
  cleanupSession(sessionId: string): void {
    const agentName = this.sessionToAgent.get(sessionId);
    if (agentName !== undefined) {
      console.log(`[StateCache] Cleaning up session ${sessionId.substring(0, 8)}... (agent: ${agentName})`);

      this.agents.delete(agentName);
      this.sessionToAgent.delete(sessionId);
      this.agentToSession.delete(agentName);
    }
  }

  // =========================================================================
  // Intent Management
  // =========================================================================

  /**
   * Add intent to cache
   */
  addIntent(intent: Intent): void {
    this.intents.set(intent.id, intent);
    this.trimIntents();
  }

  /**
   * Get intent by ID
   */
  getIntent(id: string): Intent | undefined {
    return this.intents.get(id);
  }

  /**
   * Get all active intents
   */
  getActiveIntents(): Intent[] {
    return Array.from(this.intents.values()).filter((i) => i.status === 'active');
  }

  /**
   * Get intents by agent
   */
  getIntentsByAgent(agent: string): Intent[] {
    return Array.from(this.intents.values()).filter((i) => i.agent === agent);
  }

  /**
   * Update intent status
   */
  updateIntentStatus(id: string, status: Intent['status']): void {
    const intent = this.intents.get(id);
    if (intent !== undefined) {
      intent.status = status;
    }
  }

  /**
   * Update intent heartbeat
   */
  heartbeatIntent(id: string): void {
    const intent = this.intents.get(id);
    if (intent !== undefined) {
      intent.lastBeat = Date.now();
    }
  }

  /**
   * Remove intent
   */
  removeIntent(id: string): void {
    this.intents.delete(id);
  }

  /**
   * Get all intents (including ended)
   */
  getAllIntents(): Intent[] {
    return Array.from(this.intents.values());
  }

  // =========================================================================
  // Lease Management
  // =========================================================================

  /**
   * Add lease to cache
   */
  addLease(lease: Lease): void {
    this.leases.set(lease.id, lease);
    this.trimLeases();
  }

  /**
   * Get lease by ID
   */
  getLease(id: string): Lease | undefined {
    return this.leases.get(id);
  }

  /**
   * Get all active leases (not expired)
   */
  getActiveLeases(): Lease[] {
    const now = Date.now();
    return Array.from(this.leases.values()).filter((l) => l.exp > now);
  }

  /**
   * Get leases by agent
   */
  getLeasesByAgent(agent: string): Lease[] {
    return Array.from(this.leases.values()).filter((l) => l.agent === agent);
  }

  /**
   * Remove lease
   */
  removeLease(id: string): void {
    this.leases.delete(id);
  }

  /**
   * Get all leases
   */
  getAllLeases(): Lease[] {
    return Array.from(this.leases.values());
  }

  // =========================================================================
  // Review Job Management
  // =========================================================================

  /**
   * Add review job
   */
  addReviewJob(job: ReviewJob): void {
    this.reviewJobs.set(job.id, job);
  }

  /**
   * Get review job by ID
   */
  getReviewJob(id: string): ReviewJob | undefined {
    return this.reviewJobs.get(id);
  }

  /**
   * Get pending review jobs
   */
  getPendingReviewJobs(): ReviewJob[] {
    return Array.from(this.reviewJobs.values()).filter((j) => j.status === 'pending');
  }

  /**
   * Update review job
   */
  updateReviewJob(id: string, updates: Partial<ReviewJob>): void {
    const job = this.reviewJobs.get(id);
    if (job !== undefined) {
      Object.assign(job, updates);
    }
  }

  /**
   * Get all review jobs
   */
  getAllReviewJobs(): ReviewJob[] {
    return Array.from(this.reviewJobs.values());
  }

  // =========================================================================
  // Semaphores (generic counters)
  // =========================================================================

  /**
   * Increment semaphore
   */
  incrementSemaphore(key: string, delta = 1): number {
    const current = this.semaphores.get(key) ?? 0;
    const newValue = current + delta;
    this.semaphores.set(key, newValue);
    return newValue;
  }

  /**
   * Get semaphore value
   */
  getSemaphore(key: string): number {
    return this.semaphores.get(key) ?? 0;
  }

  /**
   * Set semaphore value
   */
  setSemaphore(key: string, value: number): void {
    this.semaphores.set(key, value);
  }

  // =========================================================================
  // State Snapshot
  // =========================================================================

  /**
   * Get complete state snapshot (for s.get and state://live)
   */
  getSnapshot(since?: number): StateSnapshot {
    return {
      agents: this.getAllAgents(),
      intents: this.getAllIntents(),
      leases: this.getActiveLeases(),
      reviewJobs: this.getAllReviewJobs(),
      recentMessages: this.bus.getAllMessages(50),
      recentEvents: this.bus.getEvents(since, 100),
      semaphores: Object.fromEntries(this.semaphores),
      ts: Date.now(),
    };
  }

  // =========================================================================
  // Cleanup & Maintenance
  // =========================================================================

  /**
   * Start periodic cleanup timers
   */
  private startCleanupTimers(): void {
    // Clean up expired intents every 30 seconds
    this.cleanupTimers.push(
      setInterval(() => {
        this.cleanupExpiredIntents();
      }, 30_000),
    );

    // Clean up expired leases every 60 seconds
    this.cleanupTimers.push(
      setInterval(() => {
        this.cleanupExpiredLeases();
      }, 60_000),
    );

    // Update agent status every 15 seconds
    this.cleanupTimers.push(
      setInterval(() => {
        this.updateAgentStatus();
      }, 15_000),
    );
  }

  /**
   * Stop all cleanup timers (for graceful shutdown)
   */
  stopCleanupTimers(): void {
    for (const timer of this.cleanupTimers) {
      clearInterval(timer);
    }
    this.cleanupTimers = [];
  }

  /**
   * Clean up expired intents
   */
  private cleanupExpiredIntents(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, intent] of this.intents) {
      const age = now - intent.lastBeat;
      if (age > intent.ttlMs && intent.status === 'active') {
        // Mark as ended instead of deleting immediately
        intent.status = 'ended';
        expired.push(id);

        this.bus.emit({
          type: 'INTENT_EVENT',
          action: 'close',
          intentId: id,
          agent: intent.agent,
          data: { reason: 'expired' },
          ts: now,
        });
      }
    }

    if (expired.length > 0) {
      console.log(`[StateCache] Expired ${expired.length} intents`);
    }

    // Remove ended intents older than 5 minutes
    for (const [id, intent] of this.intents) {
      if (intent.status === 'ended' && now - intent.lastBeat > 300_000) {
        this.intents.delete(id);
      }
    }
  }

  /**
   * Clean up expired leases
   */
  private cleanupExpiredLeases(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, lease] of this.leases) {
      if (lease.exp < now) {
        expired.push(id);
        this.leases.delete(id);
      }
    }

    if (expired.length > 0) {
      console.log(`[StateCache] Expired ${expired.length} leases`);
    }
  }

  /**
   * Update agent status based on last seen
   */
  private updateAgentStatus(): void {
    const now = Date.now();
    const idleThreshold = 60_000; // 1 minute
    const disconnectThreshold = 300_000; // 5 minutes

    for (const agent of this.agents.values()) {
      const age = now - agent.lastSeen;

      if (age > disconnectThreshold) {
        agent.status = 'disconnected';
      } else if (age > idleThreshold) {
        agent.status = 'idle';
      } else {
        agent.status = 'active';
      }
    }
  }

  /**
   * Trim intents to max limit
   */
  private trimIntents(): void {
    const max = this.config.limits.maxIntents;
    if (this.intents.size > max) {
      // Remove oldest ended intents first
      const sorted = Array.from(this.intents.entries())
        .filter(([, i]) => i.status === 'ended')
        .sort(([, a], [, b]) => a.lastBeat - b.lastBeat);

      const toRemove = this.intents.size - max;
      for (let i = 0; i < toRemove && i < sorted.length; i++) {
        const entry = sorted[i];
        if (entry !== undefined) {
          this.intents.delete(entry[0]);
        }
      }
    }
  }

  /**
   * Trim leases to max limit
   */
  private trimLeases(): void {
    const max = this.config.limits.maxLeases;
    if (this.leases.size > max) {
      // Remove oldest expired leases
      const sorted = Array.from(this.leases.entries()).sort(([, a], [, b]) => a.exp - b.exp);

      const toRemove = this.leases.size - max;
      for (let i = 0; i < toRemove; i++) {
        const entry = sorted[i];
        if (entry !== undefined) {
          this.leases.delete(entry[0]);
        }
      }
    }
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.agents.clear();
    this.intents.clear();
    this.leases.clear();
    this.reviewJobs.clear();
    this.semaphores.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    agentCount: number;
    intentCount: number;
    leaseCount: number;
    reviewJobCount: number;
  } {
    return {
      agentCount: this.agents.size,
      intentCount: this.intents.size,
      leaseCount: this.leases.size,
      reviewJobCount: this.reviewJobs.size,
    };
  }
}
