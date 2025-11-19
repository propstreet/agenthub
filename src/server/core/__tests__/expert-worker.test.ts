/**
 * ExpertWorker Unit Tests
 * Tests async expert consultation processing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpertWorker } from '../expert-worker.js';
import { StateCache } from '../state-cache.js';
import { MessageBus } from '../bus.js';
import type { ExpertBridge } from '../expert-bridge.js';
import type { ExpertWorkerConfig } from '../../types/models.js';

/**
 * Mock ExpertBridge for testing
 */
class MockExpertBridge implements Partial<ExpertBridge> {
  private jobs = new Map<
    string,
    {
      status: string;
      output: string;
      callCount: number;
    }
  >();

  async askBackground(): Promise<{ responseId: string; status: string }> {
    const id = `resp_${Math.random().toString(36).substring(2, 11)}`;
    this.jobs.set(id, {
      status: 'queued',
      output: '',
      callCount: 0,
    });
    return Promise.resolve({ responseId: id, status: 'queued' });
  }

  async retrieve(responseId: string): Promise<{
    status: string;
    output_text: string;
    usage?: { input_tokens: number; output_tokens: number; reasoning_tokens?: number };
    incomplete_details?: { reason: string };
  }> {
    const job = this.jobs.get(responseId);
    if (job === undefined) throw new Error('Job not found');

    job.callCount++;

    // Simulate progression: queued → in_progress → completed
    if (job.callCount === 1) {
      job.status = 'in_progress';
    } else if (job.callCount >= 2) {
      job.status = 'completed';
      job.output = 'Expert response: This is the solution to your problem.';
    }

    return Promise.resolve({
      status: job.status,
      output_text: job.output,
      ...(job.status === 'completed' && {
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          reasoning_tokens: 25,
        },
      }),
    });
  }

  async cancel(responseId: string): Promise<void> {
    const job = this.jobs.get(responseId);
    if (job !== undefined) {
      job.status = 'cancelled';
    }
    return Promise.resolve();
  }

  async delete(responseId: string): Promise<void> {
    this.jobs.delete(responseId);
    return Promise.resolve();
  }

  isAvailable(): boolean {
    return true;
  }

  // Helper method for tests
  setJobStatus(responseId: string, status: string, output?: string): void {
    let job = this.jobs.get(responseId);
    if (job === undefined) {
      // Create the job if it doesn't exist
      job = {
        status,
        output: output ?? '',
        callCount: 0,
      };
      this.jobs.set(responseId, job);
    } else {
      job.status = status;
      if (output !== undefined) {
        job.output = output;
      }
    }
  }
}

describe('ExpertWorker', () => {
  let worker: ExpertWorker;
  let state: StateCache;
  let bus: MessageBus;
  let expert: MockExpertBridge;
  let workerConfig: ExpertWorkerConfig;

  beforeEach(() => {
    // Create fresh instances for each test with proper config
    const serverConfig = {
      limits: {
        maxMessages: 100,
        maxMessagesPerAgent: 50,
        maxEvents: 100,
        maxEventsPerType: 50,
      },
    };
    // @ts-expect-error - Mock config for testing
    bus = new MessageBus(serverConfig);
    // @ts-expect-error - Mock config for testing
    state = new StateCache(bus, serverConfig);
    expert = new MockExpertBridge();

    workerConfig = {
      enabled: true,
      maxConcurrent: 2,
      pollingInterval: 50, // Fast for tests
      retrieveInterval: 50, // Fast for tests
      progressInterval: 100, // Fast for tests
      retryAttempts: 2,
      requestTTL: 86400000,
      maxPendingPerAgent: 3,
    };

    // @ts-expect-error - MockExpertBridge is a partial implementation for testing
    worker = new ExpertWorker(state, expert, bus, workerConfig);
  });

  afterEach(async () => {
    // Clean up worker
    await worker.stop();
  });

  describe('Lifecycle', () => {
    it('should start and stop cleanly', async () => {
      worker.start();
      const statusBefore = worker.getStatus();
      expect(statusBefore.isRunning).toBe(true);

      await worker.stop();
      const statusAfter = worker.getStatus();
      expect(statusAfter.isRunning).toBe(false);
    });

    it('should handle multiple start calls gracefully', () => {
      worker.start();
      worker.start(); // Should not throw

      const status = worker.getStatus();
      expect(status.isRunning).toBe(true);
    });
  });

  describe('Request Processing', () => {
    it('should process a pending expert request', async () => {
      // Create a request
      const request = state.createExpertRequest({
        agent: 'test-agent',
        question: 'How to optimize this?',
        files: ['src/file.ts'],
        priority: 'n',
        requestedBy: 'test-agent',
      });

      // Start worker
      worker.start();

      // Wait for processing to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check request was completed
      const updated = state.getExpertRequest(request.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.result).toBe('Expert response: This is the solution to your problem.');
      expect(updated?.usage).toBeDefined();
    });

    it('should send completion message to requesting agent', async () => {
      // Create request
      const request = state.createExpertRequest({
        agent: 'test-agent',
        question: 'Test question',
        files: ['test.ts'],
        priority: 'n',
        requestedBy: 'test-agent',
      });

      // Start worker
      worker.start();

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check message was sent
      const messages = bus.getMessagesFor('test-agent');
      const completionMsg = messages.find((m) => m.type === 'expert.completed');

      expect(completionMsg).toBeDefined();
      const msgData = completionMsg?.data as { requestId: string; result: string };
      expect(msgData.requestId).toBe(request.id);
      expect(msgData.result).toBe('Expert response: This is the solution to your problem.');
    });

    it('should process requests by priority', async () => {
      // Create multiple requests with different priorities
      const lowPrio = state.createExpertRequest({
        agent: 'agent1',
        question: 'Low priority',
        files: ['file1.ts'],
        priority: 'l',
        requestedBy: 'agent1',
      });

      state.createExpertRequest({
        agent: 'agent2',
        question: 'High priority',
        files: ['file2.ts'],
        priority: 'h',
        requestedBy: 'agent2',
      });

      const requiredPrio = state.createExpertRequest({
        agent: 'agent3',
        question: 'Required priority',
        files: ['file3.ts'],
        priority: 'r',
        requestedBy: 'agent3',
      });

      // Set config to process one at a time
      // @ts-expect-error - MockExpertBridge is a partial implementation for testing
      worker = new ExpertWorker(state, expert, bus, {
        ...workerConfig,
        maxConcurrent: 1,
      });

      // Start worker
      worker.start();

      // Wait a bit for first request to be picked up
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that required priority was processed first
      const reqStatus = state.getExpertRequest(requiredPrio.id);
      expect(reqStatus?.status).toMatch(/queued|in_progress|completed/);

      const lowStatus = state.getExpertRequest(lowPrio.id);
      expect(lowStatus?.status).toBe('pending');
    });
  });

  describe('Resume Interrupted Requests', () => {
    it('should resume requests with responseId on restart', async () => {
      // Create request and simulate it was in progress
      const request = state.createExpertRequest({
        agent: 'test-agent',
        question: 'Interrupted request',
        files: ['file.ts'],
        priority: 'n',
        requestedBy: 'test-agent',
      });

      // Simulate interrupted state
      state.updateExpertRequest(request.id, {
        status: 'in_progress',
        responseId: 'resp_existing',
        startedAt: Date.now() - 60000,
      });

      // Pre-populate expert bridge with existing job
      expert.setJobStatus('resp_existing', 'in_progress');

      // Start worker - should resume
      worker.start();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check request was completed
      const updated = state.getExpertRequest(request.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should retry on failure', async () => {
      // Create request
      const request = state.createExpertRequest({
        agent: 'test-agent',
        question: 'Will fail first',
        files: ['file.ts'],
        priority: 'n',
        requestedBy: 'test-agent',
      });

      // Make retrieve throw error on first call
      let callCount = 0;
      const originalRetrieve = expert.retrieve.bind(expert);
      expert.retrieve = (responseId: string) => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('ECONNRESET: Connection reset by peer'));
        }
        return originalRetrieve(responseId);
      };

      // Start worker
      worker.start();

      // Wait for retry and completion
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Check request was retried and completed
      const updated = state.getExpertRequest(request.id);
      expect(updated?.attempt).toBeGreaterThan(0);
      expect(updated?.status).toBe('completed');
    });

    it('should mark as failed after max retries', async () => {
      // Create request
      const request = state.createExpertRequest({
        agent: 'test-agent',
        question: 'Will always fail',
        files: ['file.ts'],
        priority: 'n',
        requestedBy: 'test-agent',
      });

      // Make askBackground always fail
      expert.askBackground = () => {
        return Promise.reject(new Error('Permanent failure'));
      };

      // Start worker with limited retries
      // @ts-expect-error - MockExpertBridge is a partial implementation for testing
      worker = new ExpertWorker(state, expert, bus, {
        ...workerConfig,
        retryAttempts: 1,
      });
      worker.start();

      // Wait for retries to exhaust
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check request failed
      const updated = state.getExpertRequest(request.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.error).toContain('Permanent failure');
      expect(updated?.attempt).toBe(1);
    });
  });

  describe('Concurrency Control', () => {
    it('should respect maxConcurrent limit', async () => {
      // Create 5 requests
      for (let i = 0; i < 5; i++) {
        state.createExpertRequest({
          agent: `agent${i}`,
          question: `Question ${i}`,
          files: [`file${i}.ts`],
          priority: 'n',
          requestedBy: `agent${i}`,
        });
      }

      // Start worker with maxConcurrent = 2
      worker.start();

      // Check after initial processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = worker.getStatus();
      expect(status.activeJobs).toBeLessThanOrEqual(2);
    });

    it('should enforce per-agent pending limit', async () => {
      // Create too many requests for one agent
      for (let i = 0; i < 5; i++) {
        state.createExpertRequest({
          agent: 'greedy-agent',
          question: `Question ${i}`,
          files: [`file${i}.ts`],
          priority: 'n',
          requestedBy: 'greedy-agent',
        });
      }

      // Start worker
      worker.start();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check that some requests were marked as failed due to limit
      const requests = state.getExpertRequestsForAgent('greedy-agent');
      const failedDueToLimit = requests.filter(
        (r) => r.status === 'failed' && r.error?.includes('too many pending') === true,
      );

      expect(failedDueToLimit.length).toBeGreaterThan(0);
    });
  });

  describe('Progress Updates', () => {
    it('should send progress messages during processing', async () => {
      // Create request
      const request = state.createExpertRequest({
        agent: 'test-agent',
        question: 'Long running',
        files: ['file.ts'],
        priority: 'n',
        requestedBy: 'test-agent',
      });

      // Slow down processing to capture progress
      expert.retrieve = () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              status: 'in_progress',
              output_text: '',
            });
          }, 150);
        });
      };

      // Start worker with fast progress interval
      // @ts-expect-error - MockExpertBridge is a partial implementation for testing
      worker = new ExpertWorker(state, expert, bus, {
        ...workerConfig,
        progressInterval: 50,
      });
      worker.start();

      // Wait for progress messages
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check progress messages were sent
      const messages = bus.getMessagesFor('test-agent');
      const progressMsgs = messages.filter((m) => m.type === 'expert.progress');

      expect(progressMsgs.length).toBeGreaterThan(0);
      const progressData = progressMsgs[0]?.data as { requestId: string };
      expect(progressData.requestId).toBe(request.id);
    });
  });

  describe('Cancellation', () => {
    it('should handle request cancellation', async () => {
      // Create request
      const request = state.createExpertRequest({
        agent: 'test-agent',
        question: 'Will be cancelled',
        files: ['file.ts'],
        priority: 'n',
        requestedBy: 'test-agent',
      });

      // Start worker
      worker.start();

      // Wait for request to start processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Cancel the request
      const req = state.getExpertRequest(request.id);
      if (req?.responseId !== undefined) {
        await expert.cancel(req.responseId);
        state.updateExpertRequest(request.id, {
          status: 'cancelled',
          completedAt: Date.now(),
        });
      }

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check request remains cancelled
      const updated = state.getExpertRequest(request.id);
      expect(updated?.status).toBe('cancelled');
    });
  });

  describe('Incomplete Handling', () => {
    it('should handle incomplete response with max_output_tokens', async () => {
      // Create request
      const request = state.createExpertRequest({
        agent: 'test-agent',
        question: 'Will be truncated',
        files: ['file.ts'],
        priority: 'n',
        requestedBy: 'test-agent',
      });

      // Override retrieve to return incomplete
      expert.retrieve = () =>
        Promise.resolve({
          status: 'incomplete',
          output_text: 'Partial response...',
          incomplete_details: { reason: 'max_output_tokens' },
          usage: { input_tokens: 100, output_tokens: 50 },
        });

      // Start worker
      worker.start();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check request was marked as completed with warning
      const updated = state.getExpertRequest(request.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.result).toContain('Partial response');
      expect(updated?.result).toContain('Response Truncated');
    });
  });
});
