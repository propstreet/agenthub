/**
 * State Cache - In-memory state management
 * Provides snapshot of current system state for dashboard and queries
 */

import type {
  Agent,
  Intent,
  Lease,
  ReviewJob,
  ExpertRequest,
  StateSnapshot,
  ServerConfig,
} from '../types/models.js';
import type { MessageBus } from './bus.js';
import { nanoid } from 'nanoid';
import { logger } from './logger.js';

export class StateCache {
  private agents = new Map<string, Agent>();
  private intents = new Map<string, Intent>();
  private leases = new Map<string, Lease>();
  private reviewJobs = new Map<string, ReviewJob>();
  private expertRequests = new Map<string, ExpertRequest>();
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
        // Session already has an agent - verify name matches if provided
        if (name !== existingAgentName) {
          throw new Error(
            `Session already registered as agent "${existingAgentName}". ` +
              `Agent names are immutable to maintain identity consistency. ` +
              `You can update roles/version but cannot change the agent name.`,
          );
        }

        // Update existing agent's role/version only
        const agent = this.agents.get(existingAgentName);
        if (agent === undefined) {
          throw new Error(`Session agent ${existingAgentName} not found in state`);
        }

        // Update role and version, refresh heartbeat
        agent.role = role;
        if (version !== undefined) {
          agent.version = version;
        }
        agent.lastSeen = Date.now();
        agent.status = 'active';

        logger.info({ agent: existingAgentName, role }, '[StateCache] Agent updated');

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
      logger.info({ agent: name, role, sessionId }, '[StateCache] Agent registered');
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
    // 1. Cleanup active intents owned by this agent
    const intents = this.getIntentsByAgent(name);
    for (const intent of intents) {
      this.intents.delete(intent.id);
      // Notify? Maybe not necessary if agent is gone
    }

    // 2. Cleanup leases owned by this agent
    const leases = this.getLeasesByAgent(name);
    for (const lease of leases) {
      this.leases.delete(lease.id);
    }

    // 3. Cleanup expert requests owned by this agent
    const expertReqs = this.getExpertRequestsForAgent(name);
    for (const req of expertReqs) {
      // We don't cancel at Azure here synchronously to avoid blocking,
      // but ExpertWorker might eventually clean them up if we mark them or delete them.
      // Deleting them from state is sufficient for now.
      this.expertRequests.delete(req.id);
    }

    // 4. Cleanup review jobs originated by this agent (no one to review for)
    // Only delete pending/claimed ones? Completed ones are history.
    // Let's delete pending/claimed.
    for (const [id, job] of this.reviewJobs) {
      if (job.origin === name && (job.status === 'pending' || job.status === 'claimed')) {
        this.reviewJobs.delete(id);
      }
    }

    // 5. Unclaim review jobs claimed by this agent
    for (const [id, job] of this.reviewJobs) {
      if (job.claimedBy === name && job.status === 'claimed') {
        job.status = 'pending';
        delete job.claimedBy;
        delete job.claimedAt;
        delete job.claimExpiresAt;
        logger.info({ jobId: id }, '[StateCache] Unclaimed review job due to reviewer removal');
      }
    }

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
    if (agentName !== undefined) {
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
      logger.debug(
        { sessionId: sessionId.substring(0, 8), agent: agentName },
        '[StateCache] Cleaning up session',
      );

      this.agents.delete(agentName);
      this.sessionToAgent.delete(sessionId);
      this.agentToSession.delete(agentName);
    }
  }

  /**
   * Purge disconnected agents older than threshold
   */
  purgeDisconnectedAgents(olderThanMs: number): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [name, agent] of this.agents) {
      if (agent.status === 'disconnected' && now - agent.lastSeen > olderThanMs) {
        toRemove.push(name);
      }
    }

    for (const name of toRemove) {
      this.removeAgent(name);
    }

    if (toRemove.length > 0) {
      logger.info({ purgedCount: toRemove.length }, '[StateCache] Purged disconnected agents');
    }
  }

  /**
   * Purge stale agents (idle or disconnected) older than threshold
   */
  purgeStaleAgents(olderThanMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [name, agent] of this.agents) {
      const isStale = agent.status === 'disconnected' || agent.status === 'idle';
      if (isStale && now - agent.lastSeen > olderThanMs) {
        toRemove.push(name);
      }
    }

    for (const name of toRemove) {
      this.removeAgent(name);
    }

    if (toRemove.length > 0) {
      logger.info({ purgedCount: toRemove.length }, '[StateCache] Purged stale agents');
    }
  }

  /**
   * Cleanup old completed reviews
   */
  cleanupOldReviews(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, job] of this.reviewJobs) {
      const isDone = job.status === 'completed' || job.status === 'failed';
      if (isDone && now - job.createdAt > olderThanMs) {
        this.reviewJobs.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info({ removed }, '[StateCache] Cleaned up old review jobs');
    }
    return removed;
  }

  /**
   * Cleanup orphaned artifacts (agents that no longer exist)
   * This handles "zombie" data from before cascading cleanup was added
   */
  cleanupOrphanedArtifacts(): {
    intents: number;
    reviews: number;
    expertRequests: number;
    leases: number;
  } {
    const stats = {
      intents: 0,
      reviews: 0,
      expertRequests: 0,
      leases: 0,
    };

    // 1. Intents
    for (const [id, intent] of this.intents) {
      if (!this.agents.has(intent.agent)) {
        this.intents.delete(id);
        stats.intents++;
      }
    }

    // 2. Reviews (orphaned origin)
    for (const [id, job] of this.reviewJobs) {
      if (!this.agents.has(job.origin)) {
        this.reviewJobs.delete(id);
        stats.reviews++;
      }
    }

    // 3. Expert Requests
    for (const [id, req] of this.expertRequests) {
      if (!this.agents.has(req.requestedBy)) {
        this.expertRequests.delete(id);
        stats.expertRequests++;
      }
    }

    // 4. Leases
    for (const [id, lease] of this.leases) {
      if (!this.agents.has(lease.agent)) {
        this.leases.delete(id);
        stats.leases++;
      }
    }

    if (stats.intents > 0 || stats.reviews > 0 || stats.expertRequests > 0 || stats.leases > 0) {
      logger.info(stats, '[StateCache] Cleaned up orphaned artifacts');
    }

    return stats;
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

  /**
   * Get review jobs claimed by a specific agent
   */
  getClaimedReviewJobs(agent: string): ReviewJob[] {
    return Array.from(this.reviewJobs.values()).filter(
      (j) => j.status === 'claimed' && j.claimedBy === agent,
    );
  }

  /**
   * Get completed review jobs since timestamp
   */
  getCompletedReviewJobs(since?: number): ReviewJob[] {
    const jobs = Array.from(this.reviewJobs.values()).filter((j) => j.status === 'completed');
    if (since !== undefined) {
      return jobs.filter((j) => j.createdAt >= since);
    }
    return jobs;
  }

  /**
   * Validate review job ownership
   * @throws Error if job doesn't exist or agent doesn't own it
   */
  validateReviewOwnership(jobId: string, agent: string): void {
    const job = this.reviewJobs.get(jobId);
    if (job === undefined) {
      throw new Error(`Review job ${jobId} not found`);
    }
    if (job.claimedBy !== agent) {
      throw new Error(
        `Review job ${jobId} is not claimed by ${agent} (claimed by: ${job.claimedBy ?? 'none'})`,
      );
    }
  }

  /**
   * Clean up expired review claims
   */
  cleanupExpiredClaims(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, job] of this.reviewJobs) {
      if (
        job.status === 'claimed' &&
        job.claimExpiresAt !== undefined &&
        job.claimExpiresAt < now
      ) {
        // Reset job to pending
        job.status = 'pending';
        delete job.claimedBy;
        delete job.claimedAt;
        delete job.claimExpiresAt;
        expired.push(id);

        // Notify origin that claim expired? Maybe broadcast again?
        // For now just log it.
        logger.info({ jobId: id }, '[StateCache] Claim expired for review job, reset to pending');
      }
    }
  }

  // =========================================================================
  // Expert Request Management
  // =========================================================================

  /**
   * Create expert request
   */
  createExpertRequest(
    data: Omit<ExpertRequest, 'id' | 'createdAt' | 'status' | 'attempt'>,
  ): ExpertRequest {
    const request: ExpertRequest = {
      ...data,
      id: `exp_${nanoid(12)}`,
      status: 'pending',
      createdAt: Date.now(),
      attempt: 0,
    };

    this.expertRequests.set(request.id, request);
    logger.info({ requestId: request.id }, '[StateCache] Expert request created');
    return request;
  }

  /**
   * Get expert request by ID
   */
  getExpertRequest(id: string): ExpertRequest | undefined {
    return this.expertRequests.get(id);
  }

  /**
   * Get all expert requests
   */
  getExpertRequests(): ExpertRequest[] {
    return Array.from(this.expertRequests.values());
  }

  /**
   * Get expert requests for specific agent
   */
  getExpertRequestsForAgent(agent: string): ExpertRequest[] {
    return Array.from(this.expertRequests.values()).filter((r) => r.requestedBy === agent);
  }

  /**
   * Update expert request
   */
  updateExpertRequest(id: string, updates: Partial<ExpertRequest>): void {
    const req = this.expertRequests.get(id);
    if (req !== undefined) {
      Object.assign(req, updates);
    }
  }

  /**
   * Delete expert request
   */
  deleteExpertRequest(id: string): void {
    this.expertRequests.delete(id);
  }

  /**
   * Cleanup old completed expert requests
   */
  cleanupExpertRequests(ttl: number): void {
    const cutoff = Date.now() - ttl;

    for (const [id, req] of this.expertRequests.entries()) {
      if (
        (req.status === 'completed' || req.status === 'failed' || req.status === 'incomplete') &&
        req.completedAt !== undefined &&
        req.completedAt < cutoff
      ) {
        this.expertRequests.delete(id);
        logger.debug({ requestId: id }, '[StateCache] Cleaned up old expert request');
      }
    }
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
   * Get state snapshot (for s.get and state://live)
   * Supports filtering to reduce verbosity
   */
  getSnapshot(options?: { since?: number; filter?: string }): Partial<StateSnapshot> {
    const { since, filter } = options ?? {};
    const ts = Date.now();

    // If strict filter is applied, return only that component
    if (filter !== undefined && filter !== 'all') {
      const partial: Partial<StateSnapshot> = { ts };
      switch (filter) {
        case 'agents':
          partial.agents = this.getAllAgents();
          break;
        case 'intents':
          partial.intents = this.getAllIntents();
          break;
        case 'leases':
          partial.leases = this.getActiveLeases(); // Only active leases for filtered view?
          break;
        case 'reviews':
        case 'reviewJobs':
          partial.reviewJobs = this.getAllReviewJobs();
          break;
        case 'expert':
        case 'expertRequests':
          partial.expertRequests = this.getExpertRequests();
          break;
        case 'messages':
          partial.recentMessages = this.bus.getAllMessages(50);
          break;
        case 'events':
          partial.recentEvents = this.bus.getEvents(since, 100);
          break;
        case 'config':
          partial.config = {
            ...(this.config.persistence !== undefined && { persistence: this.config.persistence }),
          };
          break;
      }
      return partial;
    }

    // Return full snapshot
    return {
      agents: this.getAllAgents(),
      intents: this.getAllIntents(),
      leases: this.getActiveLeases(),
      reviewJobs: this.getAllReviewJobs(),
      expertRequests: this.getExpertRequests(),
      recentMessages: this.bus.getAllMessages(50),
      recentEvents: this.bus.getEvents(since, 100),
      semaphores: Object.fromEntries(this.semaphores),
      config: {
        ...(this.config.persistence !== undefined && { persistence: this.config.persistence }),
      },
      expertAvailable: this.config.azureOpenAI !== undefined,
      ts,
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

    // Clean up expired review claims every 60 seconds
    this.cleanupTimers.push(
      setInterval(() => {
        this.cleanupExpiredClaims();
      }, 60_000),
    );

    // Update agent status every 15 seconds
    this.cleanupTimers.push(
      setInterval(() => {
        this.updateAgentStatus();
      }, 15_000),
    );

    // Clean up old completed expert requests every 5 minutes
    this.cleanupTimers.push(
      setInterval(
        () => {
          const ttl = 24 * 60 * 60 * 1000; // 24 hours
          this.cleanupExpertRequests(ttl);
        },
        5 * 60 * 1000,
      ),
    );

    // Clean up stale agents every hour
    this.cleanupTimers.push(
      setInterval(() => {
        this.purgeStaleAgents();
      }, 3600000),
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
      logger.debug({ expiredCount: expired.length }, '[StateCache] Expired intents');
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
      logger.debug({ expiredCount: expired.length }, '[StateCache] Expired leases');
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
    this.expertRequests.clear();
    this.semaphores.clear();
  }

  /**
   * Restore state from snapshot (for persistence)
   * Filters out expired intents/leases and clears ephemeral session bindings
   */
  restore(snapshot: StateSnapshot): void {
    const now = Date.now();

    // Clear existing state
    this.clear();

    // Restore agents
    snapshot.agents.forEach((agent) => {
      this.agents.set(agent.name, agent);
    });

    // Restore intents (filter expired)
    const validIntents = snapshot.intents.filter((intent) => {
      // Skip expired intents (check createdAt + ttlMs)
      if (intent.createdAt + intent.ttlMs < now) {
        return false;
      }
      // Skip already ended intents
      if (intent.status === 'ended') {
        return false;
      }
      return true;
    });
    validIntents.forEach((intent) => {
      this.intents.set(intent.id, intent);
    });

    // Restore leases (filter expired)
    const validLeases = snapshot.leases.filter((lease) => lease.exp > now);
    validLeases.forEach((lease) => {
      this.leases.set(lease.id, lease);
    });

    // Restore review jobs
    snapshot.reviewJobs.forEach((job) => {
      this.reviewJobs.set(job.id, job);
    });

    // Restore expert requests (if available in snapshot)
    snapshot.expertRequests.forEach((req) => {
      this.expertRequests.set(req.id, req);
    });

    // Restore semaphores if present
    if (snapshot.semaphores !== undefined) {
      Object.entries(snapshot.semaphores).forEach(([key, value]) => {
        this.semaphores.set(key, value);
      });
    }

    // Clear ephemeral session bindings (sessions don't persist across restarts)
    this.sessionToAgent.clear();
    this.agentToSession.clear();

    logger.info(
      {
        agents: this.agents.size,
        intents: this.intents.size,
        totalIntents: snapshot.intents.length,
        expiredIntents: snapshot.intents.length - this.intents.size,
        leases: this.leases.size,
        totalLeases: snapshot.leases.length,
        expiredLeases: snapshot.leases.length - this.leases.size,
        reviews: this.reviewJobs.size,
        expertRequests: this.expertRequests.size,
      },
      '[StateCache] Restored from snapshot',
    );
  }

  /**
   * Get expert configuration
   */
  getExpertConfig(): { maxPendingPerAgent: number } | undefined {
    // If expert worker is disabled or config missing, return undefined
    if (this.config.expertWorker?.enabled !== true) {
      return undefined;
    }
    return {
      maxPendingPerAgent: this.config.expertWorker.maxPendingPerAgent,
    };
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
