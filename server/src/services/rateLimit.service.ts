import { redis } from '../config/redis';
import { env } from '../config/env';

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  count: number;
  hourWindow: number;
  nextWindowStartMs: number;
}

/**
 * Redis-backed, per-sender hourly rate limiter foundation.
 * Uses atomic INCR with a windowed key: email-rate:{senderId}:{hourWindow}.
 * Extensible to global / per-tenant limits (Phase 3).
 */
export class RateLimitService {
  private readonly windowMs = 3_600_000;

  hourWindow(now = Date.now()): number {
    return Math.floor(now / this.windowMs);
  }

  private key(senderId: string, window: number): string {
    return `email-rate:${senderId}:${window}`;
  }

  nextWindowStartMs(window: number): number {
    return (window + 1) * this.windowMs;
  }

  /** Atomically try to consume one send slot for a sender in the current hour. */
  async tryConsume(senderId: string, limit = env.MAX_EMAILS_PER_HOUR): Promise<RateLimitDecision> {
    const window = this.hourWindow();
    const key = this.key(senderId, window);
    const count = await redis.incr(key);
    if (count === 1) {
      // expire slightly after the hour window to be safe
      await redis.expire(key, Math.ceil(this.windowMs / 1000) + 60);
    }
    if (count > limit) {
      await redis.decr(key);
      return {
        allowed: false,
        limit,
        count: count - 1,
        hourWindow: window,
        nextWindowStartMs: this.nextWindowStartMs(window),
      };
    }
    return {
      allowed: true,
      limit,
      count,
      hourWindow: window,
      nextWindowStartMs: this.nextWindowStartMs(window),
    };
  }

  async current(senderId: string): Promise<{ count: number; limit: number }> {
    const window = this.hourWindow();
    const value = await redis.get(this.key(senderId, window));
    return { count: Number(value || 0), limit: env.MAX_EMAILS_PER_HOUR };
  }
}

export const rateLimitService = new RateLimitService();
