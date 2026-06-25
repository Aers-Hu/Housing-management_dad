import type { Request, Response, NextFunction } from 'express';

// ============================================================
// 轻量内存限流中间件（零依赖）
//
// 用途：给 /auth/login、/auth/register 之类敏感接口挡暴力破解，
// 同时避免 scrypt 这种 CPU 密集操作被疯狂调用拖垮服务器（DoS）。
//
// 策略：固定时间窗内，同一来源(IP)最多 max 次请求，超限返回 429。
// 仅进程内存计数，单进程部署足够；重启即清零（对防爆破无影响）。
// ============================================================

interface RateLimitOptions {
  windowMs: number; // 时间窗（毫秒）
  max: number;      // 窗内最大次数
  message?: string; // 超限提示
}

interface Counter {
  count: number;
  resetAt: number;
}

export function rateLimit(opts: RateLimitOptions) {
  const { windowMs, max, message = '请求过于频繁，请稍后再试' } = opts;
  const buckets = new Map<string, Counter>();

  // 周期清理过期桶，避免内存随 IP 增长无限膨胀
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, c] of buckets) {
      if (now > c.resetAt) buckets.delete(key);
    }
  }, windowMs);
  // 不阻止进程退出
  if (typeof sweep.unref === 'function') sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    // 取来源 IP：优先反向代理头（隧道/nginx 转发后 req.ip 可能是 127.0.0.1）
    const fwd = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]?.trim())
      || req.ip
      || req.socket.remoteAddress
      || 'unknown';

    const now = Date.now();
    const bucket = buckets.get(ip);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count++;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
