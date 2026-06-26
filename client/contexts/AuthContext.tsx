import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback, useRef } from "react";
import Toast from "react-native-toast-message";
import { apiRequest, getToken, setToken } from "@/utils/api";
import { getServerUrl, setServerUrl } from "@/utils/config";
import { upsertAccount, type SavedAccount } from "@/utils/accounts";
import { StorageService } from "@/utils/storage";
import { subscribeNetStatus } from "@/utils/netstatus";

// 重放离线队列并以主库为准回收缓存；若有改动进了待审表，提示用户「待服务器端确认」。
async function reconcileAndNotify(): Promise<void> {
  try {
    const { submittedForReview } = await StorageService.reconcileOfflineReplays();
    if (submittedForReview > 0) {
      Toast.show({
        type: 'info',
        text1: '离线改动已提交',
        text2: `${submittedForReview} 处改动待服务器端确认后生效`,
      });
    }
  } catch {
    // 重放/对账失败不影响登录态，下次联网再试
  }
}

interface UserOut {
  id: string;
  username: string;
  createdAt?: string;
}

interface AuthContextType {
  user: UserOut | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: UserOut) => Promise<void>;
  logout: () => Promise<void>;
  switchAccount: (account: SavedAccount) => Promise<void>;
  updateUser: (userData: Partial<UserOut>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserOut | null>(null);
  const [token, setTok] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 记录「是否已登录」给网络监听器读取（避免闭包拿到旧值，也避免未登录时误重放）
  const authedRef = useRef(false);
  authedRef.current = !!token && !!user;

  // 启动时：若本地有 token，校验有效性并恢复登录态；顺带重放离线队列
  useEffect(() => {
    (async () => {
      try {
        const saved = await getToken();
        if (saved) {
          try {
            const data = await apiRequest<{ user: UserOut }>('/auth/me');
            setUser(data.user);
            setTok(saved);
            reconcileAndNotify(); // 恢复登录后重放离线改动并以主库为准回收缓存
          } catch {
            // token 失效或服务器暂时不可达：清登录态，引导重新登录
            setUser(null);
            setTok(null);
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // 网络从「离线」恢复到「在线」时，自动重放离线队列（无需重启 App）。
  // subscribeNetStatus 订阅即回调一次当前值，故用 prevOnline 只在「离线→在线」边沿触发；
  // 且必须已登录才重放——否则 flushOutbox 的请求会以 401 失败、把离线改动误当业务错误丢弃。
  useEffect(() => {
    let prevOnline: boolean | null = null;
    const unsub = subscribeNetStatus((online) => {
      const recovered = prevOnline === false && online === true;
      prevOnline = online;
      if (recovered && authedRef.current) {
        reconcileAndNotify();
      }
    });
    return unsub;
  }, []);

  const login = useCallback(async (newToken: string, newUser: UserOut) => {
    await setToken(newToken);
    setTok(newToken);
    setUser(newUser);
    // 记入本地账号簿，供日后免密切换
    try {
      const serverUrl = await getServerUrl();
      await upsertAccount({ username: newUser.username, token: newToken, serverUrl });
    } catch { /* 账号簿写入失败不影响登录 */ }
    reconcileAndNotify(); // 登录后重放离线改动并以主库为准回收缓存
  }, []);

  // 免密切换到账号簿中的某账号：切服务器地址 + token，校验 /auth/me。
  // 成功则切换登录态并刷新该账号 token；token 失效抛 ApiError，连不上抛 NetworkError（由 UI 提示）。
  const switchAccount = useCallback(async (account: SavedAccount) => {
    const prevToken = await getToken();
    const prevServer = await getServerUrl();
    await setServerUrl(account.serverUrl);
    await setToken(account.token);
    try {
      const data = await apiRequest<{ user: UserOut }>('/auth/me');
      setUser(data.user);
      setTok(account.token);
      await upsertAccount({
        username: data.user.username,
        token: account.token,
        serverUrl: account.serverUrl,
      });
      reconcileAndNotify(); // 切换后重放离线改动并以主库为准回收缓存
    } catch (e) {
      // 校验失败：恢复原会话，避免把界面带到无效账号
      await setServerUrl(prevServer);
      await setToken(prevToken);
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    // 仅结束当前会话；账号仍保留在账号簿，30 天内可免密切回
    await setToken(null);
    setTok(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((userData: Partial<UserOut>) => {
    setUser((prev) => (prev ? { ...prev, ...userData } : prev));
  }, []);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
    switchAccount,
    updateUser,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
