"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

const BATCH_INTERVAL_MS = 30_000;
const MAX_BATCH_SIZE = 10;
const FLUSH_ON_UNLOAD = true;

interface QueuedEvent {
  event: string;
  properties?: Record<string, unknown>;
  page?: string;
  timestamp: string;
}

let eventQueue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let sessionId: string | null = null;

function getSessionId(): string {
  if (sessionId) return sessionId;
  if (typeof window === "undefined") return "server";
  let sid = sessionStorage.getItem("ksp_analytics_session");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("ksp_analytics_session", sid);
  }
  sessionId = sid;
  return sid;
}

async function flushEvents(): Promise<void> {
  if (eventQueue.length === 0) return;
  const events = eventQueue.splice(0, eventQueue.length);
  try {
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    });
  } catch {
    // Silently fail — analytics should never break the app
    eventQueue = events.concat(eventQueue);
  }
}

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushEvents();
  }, BATCH_INTERVAL_MS);
}

function stopFlushTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/**
 * Analytics Tracker — автоматически отслеживает просмотры страниц,
 * клики по кнопкам, отправку форм и ошибки.
 *
 * События батчатся и отправляются каждые 30 секунд или при накоплении
 * 10 событий. Не собирает PII (персональные данные).
 */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const lastPathname = useRef<string | null>(null);

  // Track page views
  useEffect(() => {
    if (pathname === lastPathname.current) return;
    lastPathname.current = pathname;

    const event: QueuedEvent = {
      event: "page_view",
      properties: { page: pathname },
      page: pathname,
      timestamp: new Date().toISOString(),
    };
    eventQueue.push(event);
    startFlushTimer();

    if (eventQueue.length >= MAX_BATCH_SIZE) {
      void flushEvents();
    }
  }, [pathname]);

  // Track button clicks
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const button = target.closest("button, a[href], [role='button']");
      if (!button) return;

      const label =
        button.getAttribute("aria-label") ||
        button.textContent?.trim().slice(0, 100) ||
        button.getAttribute("data-analytics") ||
        "unknown";

      const event: QueuedEvent = {
        event: "button_click",
        properties: { label, page: pathname },
        page: pathname,
        timestamp: new Date().toISOString(),
      };
      eventQueue.push(event);
      startFlushTimer();

      if (eventQueue.length >= MAX_BATCH_SIZE) {
        void flushEvents();
      }
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [pathname]);

  // Track form submissions
  useEffect(() => {
    function handleSubmit(e: SubmitEvent) {
      const form = e.target as HTMLFormElement;
      const formId = form.id || form.getAttribute("data-analytics") || "unknown";

      const event: QueuedEvent = {
        event: "form_submit",
        properties: { formId, page: pathname },
        page: pathname,
        timestamp: new Date().toISOString(),
      };
      eventQueue.push(event);
      startFlushTimer();

      if (eventQueue.length >= MAX_BATCH_SIZE) {
        void flushEvents();
      }
    }

    document.addEventListener("submit", handleSubmit);
    return () => document.removeEventListener("submit", handleSubmit);
  }, [pathname]);

  // Track errors
  useEffect(() => {
    function handleError(e: ErrorEvent) {
      const event: QueuedEvent = {
        event: "error",
        properties: {
          message: e.message?.slice(0, 200) || "Unknown error",
          filename: e.filename?.slice(0, 200),
          page: pathname,
        },
        page: pathname,
        timestamp: new Date().toISOString(),
      };
      eventQueue.push(event);
      startFlushTimer();

      if (eventQueue.length >= MAX_BATCH_SIZE) {
        void flushEvents();
      }
    }

    function handleRejection(e: PromiseRejectionEvent) {
      const event: QueuedEvent = {
        event: "error",
        properties: {
          message: String(e.reason)?.slice(0, 200) || "Unhandled rejection",
          page: pathname,
        },
        page: pathname,
        timestamp: new Date().toISOString(),
      };
      eventQueue.push(event);
      startFlushTimer();

      if (eventQueue.length >= MAX_BATCH_SIZE) {
        void flushEvents();
      }
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [pathname]);

  // Flush on page unload
  useEffect(() => {
    if (!FLUSH_ON_UNLOAD) return;

    function handleBeforeUnload() {
      void flushEvents();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        void flushEvents();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopFlushTimer();
      void flushEvents();
    };
  }, []);

  return null;
}

/**
 * Track a custom event manually.
 */
export function trackEvent(
  event: string,
  properties: Record<string, unknown> = {},
): void {
  const queued: QueuedEvent = {
    event,
    properties,
    page: typeof window !== "undefined" ? window.location.pathname : undefined,
    timestamp: new Date().toISOString(),
  };
  eventQueue.push(queued);
  startFlushTimer();

  if (eventQueue.length >= MAX_BATCH_SIZE) {
    void flushEvents();
  }
}

/**
 * Track a plan creation event.
 */
export function trackPlanCreated(
  planId: string,
  source: "ai" | "template" | "manual" | "clone",
): void {
  trackEvent("plan_created", { planId, source });
}

/**
 * Track an AI generation event.
 */
export function trackAiGeneration(
  type: string,
  success: boolean,
  durationMs: number,
): void {
  trackEvent("ai_generation", { type, success, durationMs });
}

/**
 * Track an export event.
 */
export function trackExport(format: "docx" | "pptx" | "html" | "pdf"): void {
  trackEvent("export", { format });
}
