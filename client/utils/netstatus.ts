// ============================================================
// 在线 / 离线状态（本地主库版）
//
// 不主动轮询，而是由各处 API 调用的「结果」来推断：
//   - 任意请求成功      -> 标记在线
//   - 抛出 NetworkError -> 标记离线（连不上你电脑上的主库）
//
// 离线时各处操作会「短路」走本地（不再盲发请求干等超时），
// 同时调用 scheduleProbe() 在后台低频探测服务器是否恢复，
// 一旦探测成功就自动切回在线，下个操作即恢复同步。
//
// UI（如顶部提醒条）订阅本模块，离线时提示「仅本地运行」。
// 业务错误（ApiError，如权限/校验失败）不影响在线判定。
// ============================================================

import { getApiBase } from './config';

type Listener = (online: boolean) => void;

// 初始假设为在线，首次请求结果会立刻校正
let online = true;
const listeners = new Set<Listener>();

export function isOnline(): boolean {
  return online;
}

// 由 api 层在每次请求后调用：成功传 true，NetworkError 传 false
export function reportOnline(value: boolean): void {
  if (online === value) return;
  online = value;
  for (const fn of listeners) {
    try { fn(online); } catch { /* 监听器自身异常不影响其它 */ }
  }
}

// 订阅状态变化，返回取消订阅函数。订阅时立即回调一次当前值。
export function subscribeNetStatus(fn: Listener): () => void {
  listeners.add(fn);
  try { fn(online); } catch { /* ignore */ }
  return () => { listeners.delete(fn); };
}

// ============================================================
// 后台健康探测：离线时被各操作调用，低频试探主库是否恢复。
// 探测自身用短超时 + 节流，不阻塞调用方（fire-and-forget）。
// ============================================================
let probing = false;
let lastProbeAt = 0;
const PROBE_MIN_INTERVAL_MS = 4000; // 两次探测最小间隔
const PROBE_TIMEOUT_MS = 3000;      // 单次探测超时

export function scheduleProbe(): void {
  if (online) return;                 // 已在线无需探测
  if (probing) return;                // 正在探测，避免并发堆积
  const now = Date.now();
  if (now - lastProbeAt < PROBE_MIN_INTERVAL_MS) return; // 节流
  probing = true;
  lastProbeAt = now;

  (async () => {
    try {
      const base = await getApiBase();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        const resp = await fetch(`${base}/health`, { signal: controller.signal });
        if (resp.ok) reportOnline(true); // 恢复！下个操作自然走在线
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // 还是连不上，保持离线
    } finally {
      probing = false;
    }
  })();
}
