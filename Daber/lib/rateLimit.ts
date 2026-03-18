type Bucket = {
  tokens: number;
  last: number; // ms epoch
  capacity: number;
  refillPerMs: number; // tokens per ms
};

const buckets = new Map<string, Bucket>();

function keyFromReq(req: Request, scope: string): string {
  const xf = req.headers.get('x-forwarded-for') || '';
  const xr = req.headers.get('x-real-ip') || '';
  const ip = (xf.split(',')[0] || xr || 'anon').trim();
  return `${scope}:${ip}`;
}

export function rateLimitGuard(req: Request, scope: string, limitPerMinute: number): Response | null {
  const key = keyFromReq(req, scope);
  const now = Date.now();
  const capacity = Math.max(1, limitPerMinute);
  const refillPerMs = capacity / 60000; // tokens per ms
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: capacity, last: now, capacity, refillPerMs };
    buckets.set(key, b);
  }
  // refill
  const elapsed = Math.max(0, now - b.last);
  if (elapsed > 0) {
    b.tokens = Math.min(b.capacity, b.tokens + elapsed * b.refillPerMs);
    b.last = now;
  }
  if (b.tokens < 1) {
    const retryMs = Math.ceil((1 - b.tokens) / b.refillPerMs);
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(retryMs / 1000)) }
    });
  }
  b.tokens -= 1;
  return null;
}

