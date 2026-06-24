import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// 服务器地址配置
// 优先用用户在登录页填写并保存的地址；否则用环境变量；最后兜底 localhost
// ============================================================

const SERVER_URL_KEY = 'house_server_url';
const ENV_DEFAULT = (process.env.EXPO_PUBLIC_API_BASE ?? '').replace(/\/$/, '');

let cachedUrl: string | null = null;

// 规整地址：去尾部斜杠，自动补 http://（用户可能只填 IP:端口）
export function normalizeServerUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  return url;
}

export async function getServerUrl(): Promise<string> {
  if (cachedUrl !== null) return cachedUrl;
  let resolved: string;
  try {
    const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
    resolved = saved || ENV_DEFAULT || 'http://localhost:9091';
  } catch {
    resolved = ENV_DEFAULT || 'http://localhost:9091';
  }
  cachedUrl = resolved;
  return resolved;
}

export async function setServerUrl(raw: string): Promise<void> {
  const url = normalizeServerUrl(raw);
  cachedUrl = url;
  await AsyncStorage.setItem(SERVER_URL_KEY, url);
}

// API 前缀
export async function getApiBase(): Promise<string> {
  const url = await getServerUrl();
  return `${url}/api/v1`;
}
