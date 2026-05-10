import { useEffect, useRef, useCallback } from 'react';

const DEFAULT_EVENTS = ['mousedown', 'touchstart', 'keydown', 'mousemove', 'touchmove'] as const;

interface UseIdleTimeoutOptions {
  timeout: number;
  onIdle: () => void;
  enabled?: boolean;
}

export function useIdleTimeout({
  timeout,
  onIdle,
  enabled = true,
}: UseIdleTimeoutOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onIdleRef.current();
    }, timeout);
  }, [timeout]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      cancel();
      return;
    }

    DEFAULT_EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      DEFAULT_EVENTS.forEach(e => window.removeEventListener(e, reset));
      cancel();
    };
  }, [enabled, reset, cancel]);

  return { reset, cancel };
}
