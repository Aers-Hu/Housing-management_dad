import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from "react";
import { apiRequest, getToken, setToken } from "@/utils/api";
import { flushOutbox } from "@/utils/sync";

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
  updateUser: (userData: Partial<UserOut>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserOut | null>(null);
  const [token, setTok] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
            flushOutbox().catch(() => undefined); // 恢复登录后尝试同步离线改动
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

  const login = useCallback(async (newToken: string, newUser: UserOut) => {
    await setToken(newToken);
    setTok(newToken);
    setUser(newUser);
    flushOutbox().catch(() => undefined); // 登录后立即尝试同步
  }, []);

  const logout = useCallback(async () => {
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
