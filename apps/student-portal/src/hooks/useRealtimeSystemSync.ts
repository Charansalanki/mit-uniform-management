import { useEffect, useRef } from 'react';

interface UseRealtimeSystemSyncProps {
  apiBaseUrl?: string;
  onSyncTrigger?: (data?: any) => void;
  onSyncInvalidate?: (data?: any) => void;
  pollIntervalMs?: number;
}

// Global Singleton SSE Multiplexer to prevent Chrome 6-connection per host exhaustion
type EventCallback = (eventType: string, data?: any) => void;
let globalEs: EventSource | null = null;
let globalEsUrl: string = '';
const globalListeners = new Set<EventCallback>();
let closeTimeout: any = null;

const SUPPORTED_SSE_EVENTS = [
  'GLOBAL_SYNC_UPDATE',
  'PAYMENT_CONFIG_CHANGED',
  'PAYMENT_STATUS_UPDATED',
  'PAYMENT_VERIFIED',
  'PAYMENT_SUBMITTED',
  'PAYMENT_REJECTED',
  'ALLOCATION_RELEASED',
  'ALLOCATION_ASSIGNED',
  'VENDOR_ASSIGNMENT_CHANGED',
  'STUDENTS_REASSIGNED',
  'VENDOR_REASSIGNED',
  'VENDOR_UPDATED',
  'APPLICATION_STATUS_CHANGED',
  'UG_PG_STATUS_CHANGED',
  'DISTRIBUTION_DETAILS_UPDATED'
];

function deferUntilPageComplete(fn: () => void) {
  if (typeof window === 'undefined') return;
  if (document.readyState === 'complete') {
    setTimeout(fn, 150);
  } else {
    window.addEventListener('load', () => {
      setTimeout(fn, 200);
    }, { once: true });
  }
}

function initGlobalEs(url: string) {
  if (globalEs && globalEsUrl === url && globalEs.readyState !== EventSource.CLOSED) {
    return;
  }
  if (globalEs) {
    try {
      globalEs.close();
    } catch (_) {}
  }

  globalEsUrl = url;
  try {
    globalEs = new EventSource(url);

    SUPPORTED_SSE_EVENTS.forEach((evtName) => {
      globalEs?.addEventListener(evtName, (event: any) => {
        let parsedData: any = undefined;
        try {
          parsedData = event.data ? JSON.parse(event.data) : undefined;
        } catch (_) {
          parsedData = event.data;
        }
        globalListeners.forEach((fn) => {
          try {
            fn(evtName, parsedData);
          } catch (_) {}
        });
      });
    });

    globalEs.onerror = () => {
      // EventSource will auto-retry
    };
  } catch (err) {
    console.warn('[RealtimeSync] Could not open shared EventSource:', err);
  }
}

function subscribeToSharedSse(url: string, callback: EventCallback): () => void {
  globalListeners.add(callback);

  if (closeTimeout) {
    clearTimeout(closeTimeout);
    closeTimeout = null;
  }

  // Defer creating EventSource until page load is complete so Chrome tab stops spinning!
  deferUntilPageComplete(() => {
    if (globalListeners.size > 0) {
      initGlobalEs(url);
    }
  });

  return () => {
    globalListeners.delete(callback);
    if (globalListeners.size === 0) {
      closeTimeout = setTimeout(() => {
        if (globalListeners.size === 0 && globalEs) {
          try {
            globalEs.close();
          } catch (_) {}
          globalEs = null;
          globalEsUrl = '';
        }
      }, 5000);
    }
  };
}

export function useRealtimeSystemSync({
  apiBaseUrl = '',
  onSyncTrigger,
  onSyncInvalidate,
  pollIntervalMs = 5000
}: UseRealtimeSystemSyncProps) {
  const lastVersionRef = useRef<number | null>(null);
  const callbackRef = useRef(onSyncInvalidate || onSyncTrigger);
  callbackRef.current = onSyncInvalidate || onSyncTrigger;

  useEffect(() => {
    let isMounted = true;

    const urlPrefix =
      apiBaseUrl ||
      (typeof window !== 'undefined' && window.location.port === '5173'
        ? 'http://localhost:4000'
        : '');

    const checkDatabaseSyncVersion = async () => {
      // Battery & CPU optimization for background tabs
      if (typeof document !== 'undefined' && document.hidden) return;

      // If active SSE stream is already healthy, minimize HTTP polling
      if (globalEs && globalEs.readyState === EventSource.OPEN && Math.random() > 0.15) {
        return;
      }

      try {
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

    // Subscribe to the shared singleton SSE stream
    const unsubscribeSse = subscribeToSharedSse(
      `${urlPrefix}/api/sse/payment-config`,
      (evtName, data) => {
        if (data && typeof data.syncVersion === 'number') {
          lastVersionRef.current = data.syncVersion;
        }
        callbackRef.current?.(data);
      }
    );

    // Immediate refresh when user switches back to tab
    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        checkDatabaseSyncVersion();
        callbackRef.current?.();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      unsubscribeSse();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [apiBaseUrl, pollIntervalMs]);

  return {
    syncVersion: lastVersionRef.current
  };
}

export default useRealtimeSystemSync;
