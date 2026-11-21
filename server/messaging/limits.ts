/** Configurable server-side limits for messaging. Defaults are sized for a demonstration. */

export interface MessagingLimits {
  sendsPerMinute: number;
  conversationStartsPerHour: number;
  streamsPerUser: number;
  reportsPerHour: number;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function limitsFromEnv(env: NodeJS.ProcessEnv): MessagingLimits {
  return {
    sendsPerMinute: positiveInteger(env.MESSAGE_SEND_LIMIT_PER_MINUTE, 30),
    conversationStartsPerHour: positiveInteger(env.CONVERSATION_START_LIMIT_PER_HOUR, 10),
    streamsPerUser: positiveInteger(env.MESSAGE_STREAMS_PER_USER, 5),
    reportsPerHour: positiveInteger(env.REPORTS_PER_HOUR, 10),
  };
}

export type AttemptResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Sliding-window counter keyed by user. Keeps timestamps in memory, so it applies to one server process. */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly clock: () => number;

  constructor(max: number, windowMs: number, clock: () => number = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.clock = clock;
  }

  /** Records one attempt when it is allowed. Otherwise reports how long to wait. */
  attempt(key: string): AttemptResult {
    const now = this.clock();
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      const waitMs = recent[0] + this.windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.sweep(now);
    return { allowed: true };
  }

  private sweep(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= this.windowMs)) this.hits.delete(key);
    }
  }
}

export interface MessagingGuards {
  limits: MessagingLimits;
  sends: SlidingWindowLimiter;
  starts: SlidingWindowLimiter;
  reports: SlidingWindowLimiter;
}

export function createGuards(limits: MessagingLimits, clock?: () => number): MessagingGuards {
  return {
    limits,
    sends: new SlidingWindowLimiter(limits.sendsPerMinute, 60_000, clock),
    starts: new SlidingWindowLimiter(limits.conversationStartsPerHour, 3_600_000, clock),
    reports: new SlidingWindowLimiter(limits.reportsPerHour, 3_600_000, clock),
  };
}
