/**
 * useHubState Hook - Polls state://live for real-time updates
 */

import { useState, useEffect } from 'react';
import type { HubState } from '../types.js';

export interface UseHubStateResult {
  state: HubState | null;
  error: string | null;
  isLoading: boolean;
}

export function useHubState(hubUrl: string, pollInterval = 500): UseHubStateResult {
  const [state, setState] = useState<HubState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchState = async (): Promise<void> => {
      try {
        const response = await fetch(`${hubUrl}/state/live`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as HubState;

        if (mounted) {
          setState(data);
          setError(null);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setIsLoading(false);
        }
      }
    };

    // Initial fetch
    void fetchState();

    // Set up polling
    const interval = setInterval(() => {
      void fetchState();
    }, pollInterval);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [hubUrl, pollInterval]);

  return { state, error, isLoading };
}
