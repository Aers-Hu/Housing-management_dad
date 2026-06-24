import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth/crypto.ts';

// ============================================================
// 鉴权中间件：解析 Authorization: Bearer <token>
// ============================================================

// 把解析出的 userId 挂在 res.locals 上
export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const result = token ? verifyToken(token) : null;
  if (!result) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  res.locals.userId = result.uid;
  next();
}

// 取当前用户ID（路由里用）。必须在 authRequired 之后调用。
export function getUserId(req: Request): string {
  const res = (req as any).res as Response;
  const uid = res?.locals?.userId;
  if (!uid) throw new Error('getUserId 调用前必须先经过 authRequired 中间件');
  return uid;
}
