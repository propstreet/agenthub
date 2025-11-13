/**
 * useHubState Hook - Polls state://live for real-time updates
 */

import { useState, useEffect } from 'react';
import type { HubState } from '../types.js';

export interface UseHubStateResult {
  state: HubState | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
}

export function useHubState(hubUrl: string, pollInterval = 500, paused = false): UseHubStateResult {
  const [state, setState] = useState<HubState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();
    let interval: NodeJS.Timeout | null = null;

    const fetchState = async (): Promise<void> => {
      try {
        const response = await fetch(`${hubUrl}/state/live`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as HubState;

        setState(data);
        setError(null);
        setIsLoading(false);
      } catch (err) {
        // Don't set error state on intentional abort
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
          setIsLoading(false);
        }
      }
    };

    // Initial fetch
    void fetchState();

    // Set up polling only if not paused
    if (!paused) {
      interval = setInterval(() => {
        void fetchState();
      }, pollInterval);
    }

    return () => {
      abortController.abort();
      if (interval !== null) {
        clearInterval(interval);
      }
    };
  }, [hubUrl, pollInterval, paused, refreshTrigger]);

  return {
    state,
    error,
    isLoading,
    refresh: () => {
      setRefreshTrigger((prev) => prev + 1);
    },
  };
}
