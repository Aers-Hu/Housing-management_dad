import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * 应用热更新 Hook
 *
 * 启动时静默检查更新，若存在则立即下载并在下次启动时生效。
 * 同时监听 AppState，每次从后台回到前台时也尝试检查一次。
 *
 * 注意：expo-updates 的 ENABLED 必须在原生层开启（AndroidManifest / Expo.plist），
 *       否则所有 API 调用都会抛出错误。
 */
export function useAppUpdate() {
  const isChecking = useRef(false);

  useEffect(() => {
    // ── 启动时检查 ──
    checkAndFetch();

    // ── 从后台返回时检查 ──
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          checkAndFetch();
        }
      },
    );

    return () => subscription.remove();
  }, []);

  async function checkAndFetch() {
    // 防止并发检查
    if (isChecking.current) return;
    isChecking.current = true;

    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        // 下载完成后立即重载，让更新生效
        await Updates.reloadAsync();
      }
    } catch (_error) {
      // 静默失败：热更新不应影响正常使用
      // 常见原因：
      //   - 网络不可达
      //   - 原生层未启用 expo-updates（开发模式下正常）
    } finally {
      isChecking.current = false;
    }
  }
}
