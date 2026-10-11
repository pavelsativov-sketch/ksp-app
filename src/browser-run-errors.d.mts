export interface BrowserAcquireFailure {
  code: "BROWSER_RUN_QUOTA_EXCEEDED" | "BROWSER_RUN_RATE_LIMITED" | "BROWSER_RUN_UNAVAILABLE";
  status: 429 | 503;
  error: string;
}

export declare function classifyBrowserAcquireError(error: unknown, dailyBrowserSecondsUsed?: number): BrowserAcquireFailure;
