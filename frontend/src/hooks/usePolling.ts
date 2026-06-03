import { useEffect, useRef } from 'react';

/**
 * A polling hook with exponential backoff on errors.
 *
 * Why: the previous implementation polled every 30s with no backoff, so a
 * failing backend would have 200 browser tabs hammering it at 2 req/min
 * forever. This version:
 *
 *   - Starts at `intervalMs` (default 30s)
 *   - On error, multiplies the wait by 1.5 (capped at `maxBackoffMs`)
 *   - On a successful call, resets to `intervalMs`
 *   - Pauses while the tab is hidden
 *   - Cleans up on unmount
 *
 * Usage:
 *   usePolling(async () => {
 *     const res = await api.get('/dashboard/notifications');
 *     setCount(res.data.total);
 *   }, 30000);
 */
export function usePolling(
  fn: () => Promise<void>,
  intervalMs = 30000,
  maxBackoffMs = 5 * 60 * 1000
): void {
  // Keep the latest fn in a ref so the polling effect can re-read it
  // without re-creating the interval.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  // Keep timing in refs so the effect itself can be set up once.
  const currentIntervalRef = useRef(intervalMs);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    const schedule = (delay: number) => {
      if (stoppedRef.current) return;
      timerRef.current = setTimeout(async () => {
        if (stoppedRef.current) return;
        if (document.hidden) {
          // Skip this tick, schedule again at the current interval.
          schedule(currentIntervalRef.current);
          return;
        }
        try {
          await fnRef.current();
          // Success → reset.
          currentIntervalRef.current = intervalMs;
          schedule(intervalMs);
        } catch {
          // Failure → back off. Capped.
          currentIntervalRef.current = Math.min(
            currentIntervalRef.current * 1.5,
            maxBackoffMs
          );
          schedule(currentIntervalRef.current);
        }
      }, delay);
    };

    // Kick off the first call after a short delay so the page can render.
    schedule(intervalMs);

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // We deliberately only set up the effect once; `fn`/`intervalMs` are
    // captured in refs to avoid recreating the timer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
