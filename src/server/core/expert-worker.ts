/**
 * Expert Worker - Background job processor for async expert consultations
 *
 * Key features:
 * - Priority-aware FIFO queue (r > h > n > l)
 * - Azure background mode with polling
 * - Restart resilience (resumes interrupted jobs)
 * - Message-based result delivery
 * - Automatic retry with backoff
 */

import type { StateCache } from './state-cache.js';
import type { ExpertBridge } from './expert-bridge.js';
import type { MessageBus } from './bus.js';
import type { ExpertRequest, ExpertWorkerConfig } from '../types/models.js';
import { logger } from './logger.js';

export class ExpertWorker {
  private state: StateCache;
  private expert: ExpertBridge;
  private bus: MessageBus;
  private config: ExpertWorkerConfig;

  private isRunning = false;
  private activeJobs = new Set<string>(); // Currently processing requestIds
  private workerPromise: Promise<void> | null = null;

  constructor(
    state: StateCache,
    expert: ExpertBridge,
    bus: MessageBus,
    config: ExpertWorkerConfig,
  ) {
    this.state = state;
    this.expert = expert;
    this.bus = bus;
    this.config = config;
  }

  /**
   * Start worker
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[ExpertWorker] Already running');
      return;
    }

    this.isRunning = true;
    logger.info({ config: this.config }, '[ExpertWorker] Started');

    // Resume interrupted requests
    this.resumeInterruptedRequests();

    // Start main worker loop
    this.workerPromise = this.runWorkerLoop();
  }

  /**
   * Stop worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('[ExpertWorker] Stopping...');
    this.isRunning = false;

    // Wait for worker loop to finish
    if (this.workerPromise !== null) {
      await this.workerPromise;
    }

    // Cancel active jobs at Azure
    for (const requestId of this.activeJobs) {
      const req = this.state.getExpertRequest(requestId);
      if (req?.responseId !== undefined) {
        try {
          await this.expert.cancel(req.responseId);
        } catch (error) {
          logger.error(
            { err: error, responseId: req.responseId },
            '[ExpertWorker] Failed to cancel job',
          );
        }
      }
    }

    logger.info('[ExpertWorker] Stopped');
  }

  /**
   * Main worker loop
   */
  private async runWorkerLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        this.processQueue();
      } catch (error) {
        logger.error({ err: error }, '[ExpertWorker] Queue processing error');
      }

      await this.sleep(this.config.pollingInterval);
    }
  }

  /**
   * Resume interrupted requests from previous session
   */
  private resumeInterruptedRequests(): void {
    const requests = this.state.getExpertRequests();
    const interrupted = requests.filter(
      (r) => (r.status === 'queued' || r.status === 'in_progress') && r.responseId !== undefined,
    );

    if (interrupted.length === 0) {
      logger.debug('[ExpertWorker] No interrupted requests to resume');
      return;
    }

    logger.info({ count: interrupted.length }, '[ExpertWorker] Resuming interrupted request(s)');

    for (const req of interrupted) {
      logger.info(
        { requestId: req.id, responseId: req.responseId },
        '[ExpertWorker] Resuming interrupted request',
      );

      // Don't create new job, just resume polling existing one
      this.activeJobs.add(req.id);

      // Start polling in background (don't await)
      this.pollAzureJob(req.id)
        .catch((err: unknown) => {
          logger.error({ err, requestId: req.id }, '[ExpertWorker] Resume failed');
        })
        .finally(() => {
          this.activeJobs.delete(req.id);
        });
    }
  }

  /**
   * Process queue - pick next pending request and start processing
   */
  private processQueue(): void {
    // Check concurrency limit
    if (this.activeJobs.size >= this.config.maxConcurrent) {
      return;
    }

    // Get next request (priority-aware FIFO)
    const requests = this.state.getExpertRequests();
    const pending = requests
      .filter((r) => r.status === 'pending')
      .sort((a, b) => this.prioritySort(a, b));

    if (pending.length === 0) {
      return;
    }

    const [req] = pending;
    if (req === undefined) {
      // Should never happen, but satisfy TypeScript
      return;
    }

    // Check per-agent limit
    const agentPending = requests.filter(
      (r) =>
        r.requestedBy === req.requestedBy &&
        (r.status === 'pending' || r.status === 'queued' || r.status === 'in_progress'),
    );

    if (agentPending.length > this.config.maxPendingPerAgent) {
      // Mark as failed with clear message
      this.state.updateExpertRequest(req.id, {
        status: 'failed',
        error: `Agent ${req.requestedBy} has too many pending requests (max: ${this.config.maxPendingPerAgent})`,
        completedAt: Date.now(),
      });
      return;
    }

    // Start processing (don't await - runs in background)
    this.processRequest(req.id).catch((err: unknown) => {
      logger.error({ err, requestId: req.id }, '[ExpertWorker] Process request failed');
    });
  }

  /**
   * Priority sort function (r > h > n > l, then by createdAt)
   */
  private prioritySort(a: ExpertRequest, b: ExpertRequest): number {
    const order = { r: 3, h: 2, n: 1, l: 0 };
    const pa = order[a.priority];
    const pb = order[b.priority];
    return pa === pb ? a.createdAt - b.createdAt : pb - pa;
  }

  /**
   * Process a single request - submit to Azure and poll
   */
  private async processRequest(requestId: string): Promise<void> {
    const req = this.state.getExpertRequest(requestId);
    if (req === undefined) {
      logger.warn({ requestId }, '[ExpertWorker] Request not found');
      return;
    }

    try {
      this.activeJobs.add(requestId);

      // Update status to indicate we're starting
      this.state.updateExpertRequest(requestId, {
        startedAt: Date.now(),
      });

      logger.info({ requestId, priority: req.priority }, '[ExpertWorker] Processing request');

      // Submit to Azure in background mode
      const response = await this.expert.askBackground({
        question: req.question,
        paths: req.files,
        priority: req.priority,
        ...(req.previousResponseId !== undefined && { previousResponseId: req.previousResponseId }),
      });

      // Persist responseId (critical for restart resilience!)
      this.state.updateExpertRequest(requestId, {
        responseId: response.responseId,
        status: response.status as ExpertRequest['status'],
      });

      logger.info(
        { requestId, responseId: response.responseId },
        '[ExpertWorker] Started Azure job',
      );

      // Start polling Azure job
      await this.pollAzureJob(requestId);
    } catch (error) {
      this.handleError(requestId, error);
    } finally {
      this.activeJobs.delete(requestId);
    }
  }

  /**
   * Poll Azure job until terminal status
   */
  private async pollAzureJob(requestId: string): Promise<void> {
    let req = this.state.getExpertRequest(requestId);
    if (req?.responseId === undefined) {
      logger.warn({ requestId }, '[ExpertWorker] No responseId for request');
      return;
    }

    let lastProgressSent = 0;

    while (this.isRunning) {
      try {
        // Re-fetch request to get latest status
        req = this.state.getExpertRequest(requestId);
        if (req?.responseId === undefined) {
          logger.warn({ requestId }, '[ExpertWorker] Request disappeared');
          return;
        }

        // Retrieve current status from Azure
        const response = await this.expert.retrieve(req.responseId);

        // Update status
        this.state.updateExpertRequest(requestId, {
          status: response.status as ExpertRequest['status'],
        });

        // Send progress message if enough time elapsed
        const now = Date.now();
        if (now - lastProgressSent > this.config.progressInterval) {
          const elapsedSeconds = Math.floor((now - req.createdAt) / 1000);

          this.bus.send({
            from: 'expert-system',
            to: req.requestedBy,
            type: 'expert.progress',
            topic: 'expert',
            text: `Expert request ${requestId}: ${response.status} (${elapsedSeconds}s elapsed)`,
            data: {
              requestId: req.id,
              status: response.status,
              elapsedSeconds,
            },
          });

          lastProgressSent = now;
        }

        // Check for terminal status
        if (response.status === 'completed') {
          this.completeRequest(requestId, response.output_text, response.usage);
          return;
        }

        if (response.status === 'incomplete') {
          this.handleIncomplete(requestId, response);
          return;
        }

        if (response.status === 'failed') {
          throw new Error('Azure job failed');
        }

        if (response.status === 'cancelled') {
          this.state.updateExpertRequest(requestId, {
            status: 'cancelled',
            completedAt: Date.now(),
          });
          logger.info({ requestId }, '[ExpertWorker] Request was cancelled');
          return;
        }

        // Still processing (queued or in_progress), wait and poll again
        await this.sleep(this.config.retrieveInterval);
      } catch (error) {
        this.handleError(requestId, error);
        return;
      }
    }
  }

  /**
   * Complete request successfully
   */
  private completeRequest(
    requestId: string,
    result: string,
    usage?: { input_tokens: number; output_tokens: number; reasoning_tokens?: number },
  ): void {
    const req = this.state.getExpertRequest(requestId);
    if (req === undefined) {
      return;
    }

    const completedAt = Date.now();
    const duration = completedAt - req.createdAt;

    // Update state
    this.state.updateExpertRequest(requestId, {
      status: 'completed',
      result,
      ...(usage !== undefined && {
        usage: {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          ...(usage.reasoning_tokens !== undefined && {
            reasoningTokens: usage.reasoning_tokens,
          }),
        },
      }),
      completedAt,
    });

    // Send completion message
    this.bus.send({
      from: 'expert-system',
      to: req.requestedBy,
      type: 'expert.completed',
      topic: 'expert',
      text: `[Expert Response]\n\nQuestion: ${req.question}\n\n${result}`,
      data: {
        requestId: req.id,
        question: req.question,
        files: req.files,
        result,
        duration,
        usage,
      },
    });

    logger.info(
      { requestId, length: result.length, durationSeconds: Math.floor(duration / 1000) },
      '[ExpertWorker] Completed request',
    );
  }

  /**
   * Handle incomplete response from Azure
   */
  private handleIncomplete(
    requestId: string,
    response: {
      status: string;
      output_text: string;
      usage?: {
        input_tokens: number;
        output_tokens: number;
        reasoning_tokens?: number;
      };
      incomplete_details?: {
        reason: string;
      };
    },
  ): void {
    const req = this.state.getExpertRequest(requestId);
    if (req === undefined) {
      return;
    }

    const reason = response.incomplete_details?.reason ?? 'unknown';

    logger.warn({ requestId, reason }, '[ExpertWorker] Request incomplete');

    // Handle based on reason
    if (reason === 'max_output_tokens') {
      // Mark as completed with warning
      const warning =
        '\n\n---\n**⚠️ Response Truncated**: Hit token limit. Consider breaking down the question.';

      // Properly handle usage with optional reasoning_tokens
      const usage =
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        response.usage !== null && response.usage !== undefined
          ? {
              input_tokens: response.usage.input_tokens,
              output_tokens: response.usage.output_tokens,
              ...(response.usage.reasoning_tokens !== undefined &&
                response.usage.reasoning_tokens !== 0 && {
                  reasoning_tokens: response.usage.reasoning_tokens,
                }),
            }
          : undefined;

      this.completeRequest(requestId, response.output_text + warning, usage);
    } else if (reason === 'max_duration') {
      // max_duration is not a transient error - the model used its full time allocation
      // Mark as completed with whatever output we have
      const durationWarning =
        '\n\n---\n**⚠️ Time Limit Reached**: Model used maximum processing time. Response may be incomplete.';

      const usage =
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        response.usage !== null && response.usage !== undefined
          ? {
              input_tokens: response.usage.input_tokens,
              output_tokens: response.usage.output_tokens,
              ...(response.usage.reasoning_tokens !== undefined &&
                response.usage.reasoning_tokens !== 0 && {
                  reasoning_tokens: response.usage.reasoning_tokens,
                }),
            }
          : undefined;

      this.completeRequest(requestId, response.output_text + durationWarning, usage);
    } else if (reason === 'content_filter') {
      // Can't retry, mark as failed
      this.state.updateExpertRequest(requestId, {
        status: 'failed',
        error: 'Content filtered by Azure OpenAI',
        incompleteReason: reason,
        completedAt: Date.now(),
      });

      this.bus.send({
        from: 'expert-system',
        to: req.requestedBy,
        type: 'expert.failed',
        topic: 'expert',
        text: 'Expert request failed: Content filtered',
        data: {
          requestId: req.id,
          error: 'content_filter',
          canRetry: false,
        },
      });
    } else {
      // Generic incomplete - mark as incomplete status
      this.state.updateExpertRequest(requestId, {
        status: 'incomplete',
        result: response.output_text,
        incompleteReason: reason,
        completedAt: Date.now(),
      });

      this.bus.send({
        from: 'expert-system',
        to: req.requestedBy,
        type: 'expert.failed',
        topic: 'expert',
        text: `Expert request incomplete: ${reason}`,
        data: {
          requestId: req.id,
          error: reason,
          partialResult: response.output_text,
          canRetry: req.attempt < this.config.retryAttempts,
        },
      });
    }
  }

  /**
   * Handle error during processing
   */
  private handleError(requestId: string, error: unknown): void {
    const req = this.state.getExpertRequest(requestId);
    if (req === undefined) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Determine if error is transient and retryable
    let isTransient = false;

    if (error instanceof Error) {
      // Check for transient error patterns
      const message = error.message.toLowerCase();

      // Network/connection errors
      if (
        message.includes('econnrefused') ||
        message.includes('econnreset') ||
        message.includes('etimedout') ||
        message.includes('socket hang up') ||
        message.includes('network')
      ) {
        isTransient = true;
      }

      // Rate limiting (429) or server errors (5xx)
      if (
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('500') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')
      ) {
        isTransient = true;
      }

      // Azure transient errors
      if (message.includes('temporarily unavailable') || message.includes('timeout')) {
        isTransient = true;
      }

      // Permanent errors - do NOT retry
      if (
        message.includes('400') ||
        message.includes('401') ||
        message.includes('403') ||
        message.includes('404') ||
        message.includes('unsupported value') ||
        message.includes('invalid') ||
        message.includes('content filter')
      ) {
        isTransient = false;
      }
    }

    // Only retry on transient errors
    if (isTransient && req.attempt < this.config.retryAttempts) {
      logger.info(
        { requestId, attempt: req.attempt + 1, error: errorMessage },
        '[ExpertWorker] Retrying transient error',
      );

      // Add exponential backoff for rate limits
      const backoffMs =
        errorMessage.includes('429') || errorMessage.includes('rate limit')
          ? Math.min(1000 * Math.pow(2, req.attempt), 30000) // 1s, 2s, 4s... max 30s
          : 0;

      if (backoffMs > 0) {
        logger.info({ requestId, backoffMs }, '[ExpertWorker] Waiting before retry (rate limit)');
        setTimeout(() => {
          this.state.updateExpertRequest(requestId, {
            status: 'pending',
            attempt: req.attempt + 1,
            // Keep all original parameters unchanged
          });
        }, backoffMs);
      } else {
        this.state.updateExpertRequest(requestId, {
          status: 'pending',
          attempt: req.attempt + 1,
          // Keep all original parameters unchanged
        });
      }

      return;
    }

    // Max retries exhausted or permanent error
    // Increment attempt to reflect that we tried
    this.state.updateExpertRequest(requestId, {
      status: 'failed',
      error: errorMessage,
      attempt: req.attempt + 1, // Track that we made an attempt
      completedAt: Date.now(),
    });

    this.bus.send({
      from: 'expert-system',
      to: req.requestedBy,
      type: 'expert.failed',
      topic: 'expert',
      text: `Expert request failed: ${errorMessage}`,
      data: {
        requestId: req.id,
        error: errorMessage,
        canRetry: false,
      },
    });

    logger.error({ err: error, requestId, error: errorMessage }, '[ExpertWorker] Failed request');
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get worker status
   */
  getStatus(): {
    isRunning: boolean;
    activeJobs: number;
    config: ExpertWorkerConfig;
  } {
    return {
      isRunning: this.isRunning,
      activeJobs: this.activeJobs.size,
      config: this.config,
    };
  }
}
