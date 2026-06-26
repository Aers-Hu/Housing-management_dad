import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth/crypto.ts';
import { isAdminUser, machineIdMatches, isLoopbackIp } from '../auth/admin.ts';

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
  // 管理员账号设备锁：每个请求都要求来自本机这台电脑的电脑端
  //  - X-Machine-Id 必须等于写死的本机 MachineGuid
  //  - 来源必须是本机回环（127.0.0.1 / ::1）
  // 手机端/其它电脑无法同时满足，token 即便有效也会被拒。
  if (isAdminUser(result.uid)) {
    if (!machineIdMatches(req.headers['x-machine-id']) || !isLoopbackIp(req.ip)) {
      return res.status(403).json({ error: '管理员账号仅限本机电脑端登录使用' });
    }
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
