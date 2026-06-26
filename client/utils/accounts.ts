import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// 本地账号簿：本设备登录过的账号，用于免密切换。
// token 为 30 天有效的自包含签名，存下来即可在有效期内免密切换。
// 同名 + 同服务器视为同一账号（更新其 token）。
// ============================================================

const ACCOUNTS_KEY = 'house_accounts';

export interface SavedAccount {
  username: string;
  token: string;
  serverUrl: string;
}

export async function listAccounts(): Promise<SavedAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((a) => a && a.username);
  } catch {
    return [];
  }
}

async function writeAccounts(accounts: SavedAccount[]): Promise<void> {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

// 登录/注册成功后写入（同名+同服务器只更新 token，不重复）
export async function upsertAccount(acc: SavedAccount): Promise<void> {
  if (!acc.username) return;
  const accounts = await listAccounts();
  const idx = accounts.findIndex(
    (a) => a.username === acc.username && a.serverUrl === acc.serverUrl,
  );
  if (idx !== -1) {
    accounts[idx] = { ...accounts[idx], token: acc.token };
  } else {
    accounts.push(acc);
  }
  await writeAccounts(accounts);
}

// 从账号簿移除某账号（不影响服务器账号，只是本机不再保存其登录）
export async function removeAccount(username: string, serverUrl: string): Promise<void> {
  const accounts = await listAccounts();
  await writeAccounts(
    accounts.filter((a) => !(a.username === username && a.serverUrl === serverUrl)),
  );
}
