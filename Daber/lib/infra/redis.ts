export type RedisClient = unknown;

export function getRedis(): RedisClient | null {
  const url = process.env.REDIS_URL || '';
  if (!url) return null;
  // Placeholder: no Redis driver wired; return null to fall back to memory backends
  return null;
}

