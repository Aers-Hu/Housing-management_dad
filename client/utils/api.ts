import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBase } from './config';

// ============================================================
// HTTP 客户端：自动带 token、统一错误处理、识别"网络不可用"
// ============================================================

const TOKEN_KEY = 'house_auth_token';

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken !== null) return cachedToken;
  cachedToken = (await AsyncStorage.getItem(TOKEN_KEY)) || '';
  return cachedToken || null;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token || '';
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

// 网络/服务器不可达时抛出此类错误，调用方据此走离线兜底
export class NetworkError extends Error {
  constructor(msg = '无法连接服务器') {
    super(msg);
    this.name = 'NetworkError';
  }
}

// 服务器返回的业务错误（4xx/5xx）
export class ApiError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  auth?: boolean; // 是否带 token，默认 true
  timeoutMs?: number;
}

export async function apiRequest<T = any>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = 10000 } = opts;
  const base = await getApiBase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    // fetch 抛错 = 网络层失败（断网、服务器没开、超时）
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }

  let data: any = null;
  const text = await resp.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!resp.ok) {
    const msg = (data && data.error) || `请求失败 (${resp.status})`;
    throw new ApiError(resp.status, msg);
  }
  return data as T;
}
