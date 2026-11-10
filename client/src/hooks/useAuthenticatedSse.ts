import { useEffect, useRef } from 'react';

export interface UseAuthenticatedSseOptions {
  streamPath: string | null;        // e.g. '/api/sse/admin', '/api/sse/vendor', `/api/sse/student/${registrationId}`
  jwtToken?: string | null;          // Admin JWT, Vendor JWT, or Student Tracking JWT
  apiBaseUrl?: string;
  eventHandlers?: Record<string, (payload: any) => void>; // { PAYMENT_STATUS_UPDATED: (data) => ..., VENDOR_SESSION_REVOKED: (data) => ... }
}

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

    const separator = streamPath.includes('?') ? '&' : '?';
    const fullUrl = jwtToken
      ? `${apiBaseUrl}${streamPath}${separator}token=${encodeURIComponent(jwtToken)}`
      : `${apiBaseUrl}${streamPath}`;

    let es: EventSource | null = null;
    try {
      es = new EventSource(fullUrl);
    } catch (err) {
      console.warn('EventSource initialization failed:', err);
      return;
    }

    // Attach listeners for every custom SSE event
    const registeredEvents = Object.keys(handlersRef.current);
    const boundListeners: Record<string, (event: MessageEvent) => void> = {};

    registeredEvents.forEach((eventName) => {
      const listener = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          handlersRef.current[eventName]?.(parsed);
        } catch (err) {
          console.error(`SSE parse error on event "${eventName}":`, err);
        }
      };
      boundListeners[eventName] = listener;
      es.addEventListener(eventName, listener as EventListener);
    });

    // Also handle default un-named message event if needed
    const defaultListener = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type && handlersRef.current[parsed.type]) {
          handlersRef.current[parsed.type](parsed);
        } else if (parsed.eventName && handlersRef.current[parsed.eventName]) {
          handlersRef.current[parsed.eventName](parsed);
        }
      } catch {
        // Ping or non-json comment
      }
    };
    es.onmessage = defaultListener;

    return () => {
      if (es) {
        registeredEvents.forEach((eventName) => {
          if (boundListeners[eventName]) {
            es?.removeEventListener(eventName, boundListeners[eventName] as EventListener);
          }
        });
        es.close();
      }
    };
  }, [streamPath, jwtToken, apiBaseUrl]);
}

