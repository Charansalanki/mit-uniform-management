import { useEffect, useRef } from 'react';

export interface UseAuthenticatedSseOptions {
  streamPath: string | null;        // e.g. '/api/sse/admin', '/api/sse/vendor', `/api/sse/student/${registrationId}`
  jwtToken?: string | null;          // Admin JWT, Vendor JWT, or Student Tracking JWT
  apiBaseUrl?: string;
  eventHandlers?: Record<string, (payload: any) => void>; // { PAYMENT_STATUS_UPDATED: (data) => ..., VENDOR_SESSION_REVOKED: (data) => ... }
}

interface SsePoolEntry {
  es: EventSource;
  handlers: Set<Record<string, (payload: any) => void>>;
  refCount: number;
}

// Global Singleton Pool: Shared across all React components in the same window/tab
const globalSsePool = new Map<string, SsePoolEntry>();

export function useAuthenticatedSse({
  streamPath,
  jwtToken,
  apiBaseUrl = '',
  eventHandlers = {}
}: UseAuthenticatedSseOptions) {
  const handlersRef = useRef(eventHandlers);
  handlersRef.current = eventHandlers;

  useEffect(() => {
    if (!streamPath) return;

    // If stream requires auth (admin, vendor, student), wait until jwtToken is present
    const requiresAuth =
      streamPath.includes('/sse/admin') ||
      streamPath.includes('/sse/vendor') ||
      streamPath.includes('/sse/student/');

    if (requiresAuth && !jwtToken) return;

    // Direct port 4000 connection in dev prevents Vite HTTP proxy socket starvation
    const effectiveBaseUrl =
      apiBaseUrl ||
      (typeof window !== 'undefined' && window.location.port === '5173'
        ? 'http://localhost:4000'
        : '');

    const separator = streamPath.includes('?') ? '&' : '?';
    const fullUrl = jwtToken
      ? `${effectiveBaseUrl}${streamPath}${separator}token=${encodeURIComponent(jwtToken)}`
      : `${effectiveBaseUrl}${streamPath}`;

    const poolKey = `${effectiveBaseUrl}${streamPath}__${jwtToken || 'anon'}`;

    let entry = globalSsePool.get(poolKey);

    const initConnection = () => {
      let currentEntry = globalSsePool.get(poolKey);
      if (currentEntry) {
        currentEntry.handlers.add(handlersRef.current);
        currentEntry.refCount += 1;
        return;
      }

      let esInstance: EventSource | null = null;
      try {
        esInstance = new EventSource(fullUrl);
      } catch (err) {
        console.warn('[SSE Pool] Initialization failed:', err);
        return;
      }

      const activeHandlers = new Set<Record<string, (payload: any) => void>>();
      activeHandlers.add(handlersRef.current);

      const newEntry: SsePoolEntry = {
        es: esInstance,
        handlers: activeHandlers,
        refCount: 1
      };
      globalSsePool.set(poolKey, newEntry);

      // Generic Dispatcher: Dispatches incoming event to all active component subscribers
      const dispatchEventToSubscribers = (eventName: string, data: any) => {
        newEntry.handlers.forEach((h) => {
          try {
            if (typeof h[eventName] === 'function') {
              h[eventName](data);
            }
          } catch (e) {
            console.error(`[SSE Pool] Error dispatching event "${eventName}":`, e);
          }
        });
      };

      // Listen for named SSE events commonly used across system
      const knownEvents = [
        'APPLICATION_STATUS_CHANGED',
        'UG_PG_STATUS_CHANGED',
        'GLOBAL_SYNC_UPDATE',
        'PAYMENT_STATUS_UPDATED',
        'PAYMENT_CONFIG_CHANGED',
        'PAYMENT_VERIFIED',
        'PAYMENT_SUBMITTED',
        'PAYMENT_REJECTED',
        'ALLOCATION_ASSIGNED',
        'ALLOCATION_RELEASED',
        'VENDOR_SESSION_REVOKED',
        'connected',
        'heartbeat'
      ];

      knownEvents.forEach((evt) => {
        esInstance?.addEventListener(evt, (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            dispatchEventToSubscribers(evt, parsed);
          } catch {
            dispatchEventToSubscribers(evt, e.data);
          }
        });
      });

      // Default onmessage handler
      esInstance.onmessage = (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data);
          const type = parsed?.eventName || parsed?.type || parsed?.event;
          if (type) {
            dispatchEventToSubscribers(type, parsed);
          }
        } catch {
          // ignore non-json pings
        }
      };
    };

    if (!entry) {
      if (typeof window !== 'undefined' && document.readyState !== 'complete') {
        window.addEventListener('load', () => setTimeout(initConnection, 200), { once: true });
      } else {
        setTimeout(initConnection, 100);
      }
    } else {
      entry.refCount += 1;
      entry.handlers.add(handlersRef.current);
    }

    const currentHandlers = handlersRef.current;

    return () => {
      const existing = globalSsePool.get(poolKey);
      if (existing) {
        existing.handlers.delete(currentHandlers);
        existing.refCount -= 1;

        if (existing.refCount <= 0) {
          try {
            existing.es.close();
          } catch (_) {}
          globalSsePool.delete(poolKey);
        }
      }
    };
  }, [streamPath, jwtToken, apiBaseUrl]);
}

export default useAuthenticatedSse;

