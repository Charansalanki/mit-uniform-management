import { useEffect, useRef } from 'react';

interface UseRealtimeSystemSyncProps {
  apiBaseUrl?: string;
  onSyncTrigger?: (data?: any) => void;
  onSyncInvalidate?: (data?: any) => void;
  pollIntervalMs?: number;
}

export function useRealtimeSystemSync({
  apiBaseUrl = '',
  onSyncTrigger,
  onSyncInvalidate,
  pollIntervalMs = 4000
}: UseRealtimeSystemSyncProps) {
  const lastVersionRef = useRef<number | null>(null);
  const callbackRef = useRef(onSyncInvalidate || onSyncTrigger);
  callbackRef.current = onSyncInvalidate || onSyncTrigger;

  useEffect(() => {
    let isMounted = true;

    const checkDatabaseSyncVersion = async () => {
      // Battery & CPU optimization for low-end mobile devices: don't poll while screen is off or tab hidden
      if (typeof document !== 'undefined' && document.hidden) return;

      // If active SSE stream is already open, skip background polling to save CPU cycles
      if (es && es.readyState === EventSource.OPEN && Math.random() > 0.15) return;

      try {
        const urlPrefix = apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : '';
        const res = await fetch(`${urlPrefix}/api/sync/version?t=${Date.now()}`, {
          cache: 'no-store'
        });
        const data = await res.json();
        if (!isMounted || !data?.success) return;

        if (lastVersionRef.current !== null && data.syncVersion !== lastVersionRef.current) {
          lastVersionRef.current = data.syncVersion;
          callbackRef.current?.(data);
        } else if (lastVersionRef.current === null) {
          lastVersionRef.current = data.syncVersion;
        }
      } catch (e) {
        // Ignore transient network hiccups
      }
    };

    checkDatabaseSyncVersion();
    const interval = setInterval(checkDatabaseSyncVersion, pollIntervalMs);

    // Instant SSE stream listener
    let es: EventSource | null = null;
    try {
      const urlPrefix = apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : '';
      es = new EventSource(`${urlPrefix}/api/sse/payment-config`);
      es.addEventListener('GLOBAL_SYNC_UPDATE', (event) => {
        try {
          const parsed = JSON.parse(event.data);
          lastVersionRef.current = parsed.syncVersion;
          callbackRef.current?.(parsed);
        } catch (err) {
          callbackRef.current?.();
        }
      });
      es.addEventListener('PAYMENT_CONFIG_CHANGED', () => {
        callbackRef.current?.();
      });
      es.addEventListener('PAYMENT_STATUS_UPDATED', () => {
        callbackRef.current?.();
      });
      es.addEventListener('PAYMENT_VERIFIED', () => {
        callbackRef.current?.();
      });
      es.addEventListener('PAYMENT_SUBMITTED', () => {
        callbackRef.current?.();
      });
      es.addEventListener('PAYMENT_REJECTED', () => {
        callbackRef.current?.();
      });
      es.addEventListener('ALLOCATION_RELEASED', () => {
        callbackRef.current?.();
      });
      es.addEventListener('ALLOCATION_ASSIGNED', () => {
        callbackRef.current?.();
      });
      es.addEventListener('VENDOR_ASSIGNMENT_CHANGED', () => {
        callbackRef.current?.();
      });
      es.addEventListener('STUDENTS_REASSIGNED', () => {
        callbackRef.current?.();
      });
      es.addEventListener('VENDOR_REASSIGNED', () => {
        callbackRef.current?.();
      });
      es.addEventListener('VENDOR_UPDATED', () => {
        callbackRef.current?.();
      });
      es.addEventListener('APPLICATION_STATUS_CHANGED', (event) => {
        try {
          const parsed = JSON.parse(event.data);
          callbackRef.current?.(parsed);
        } catch {
          callbackRef.current?.();
        }
      });
      es.addEventListener('DISTRIBUTION_DETAILS_UPDATED', (event) => {
        try {
          const parsed = JSON.parse(event.data);
          callbackRef.current?.(parsed);
        } catch {
          callbackRef.current?.();
        }
      });
    } catch (e) {
      // Fallback handled by checkDatabaseSyncVersion interval
    }

    // Immediate refresh when user switches back to tab / unlocks phone
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkDatabaseSyncVersion();
        callbackRef.current?.();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (es) es.close();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [apiBaseUrl, pollIntervalMs]);

  return {
    syncVersion: lastVersionRef.current
  };
}

export default useRealtimeSystemSync;
