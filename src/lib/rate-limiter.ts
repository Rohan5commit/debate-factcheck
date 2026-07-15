interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();

export function rateLimit(
  key: string,
  maxTokens: number,
  refillRateMs: number
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket) {
    buckets.set(key, { tokens: maxTokens - 1, lastRefill: now });
    return true;
  }

  const elapsed = now - bucket.lastRefill;
  const refill = Math.floor(elapsed / refillRateMs);
  bucket.tokens = Math.min(maxTokens, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens > 0) {
    bucket.tokens--;
    return true;
  }

  return false;
}

export function canMakeRequest(provider: string): boolean {
  const limits: Record<string, { max: number; refillMs: number }> = {
    cerebras: { max: 5, refillMs: 1000 },
    nim: { max: 5, refillMs: 2000 },
    serper: { max: 5, refillMs: 1000 },
  };

  const limit = limits[provider] ?? { max: 5, refillMs: 2000 };
  return rateLimit(provider, limit.max, limit.refillMs);
}
