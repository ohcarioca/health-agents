import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/** Standard: 60 req/min per user — for authenticated mutating endpoints */
export const standardRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: true,
  prefix: "@orbita/standard",
});

/** Strict: 10 req/min per identifier — for auth/signup and payment link creation */
export const strictRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: true,
  prefix: "@orbita/strict",
});

/**
 * Check rate limit and return a 429 Response if exceeded.
 * Returns null if within limit.
 *
 * Usage in API routes:
 * ```
 * const limited = await checkRateLimit(userId);
 * if (limited) return limited;
 * ```
 */
export async function checkRateLimit(
  identifier: string,
  type: "standard" | "strict" = "standard",
): Promise<Response | null> {
  // Skip in development or if Redis is not configured
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  const limiter = type === "strict" ? strictRateLimit : standardRateLimit;
  const { success, limit, remaining, reset } = await limiter.limit(identifier);

  if (!success) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(reset),
        "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
      },
    });
  }

  return null;
}
