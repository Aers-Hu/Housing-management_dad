import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as Updates from 'expo-updates';
import Toast from 'react-native-toast-message';

// ============================================================
// OTA 热更新检查（EAS Update）
//   首次进入 App 时：检查是否有新版本
//     - 发现更新 → 提示「正在后台下载」
//     - 下载完成 → 弹窗询问是否立即重启以应用更新
//   仅在已启用 updates 的正式构建中运行（开发/Expo Go 中 isEnabled=false，自动跳过）
// ============================================================
export function useOtaUpdate() {
  const checkedRef = useRef(false);

  useEffect(() => {
    // 避免重复检查（如热重载、re-render）
    if (checkedRef.current) return;
    checkedRef.current = true;

    // 开发模式 / Expo Go 下 updates 不可用，直接跳过
    if (!Updates.isEnabled || __DEV__) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (cancelled || !result.isAvailable) return;

        // 发现新版本 → 提示后台下载中
        Toast.show({
          type: 'info',
          text1: '发现新版本',
          text2: '正在后台下载更新，请稍候…',
          visibilityTime: 4000,
        });

        const fetched = await Updates.fetchUpdateAsync();
        if (cancelled || !fetched.isNew) return;

        // 下载完成 → 询问是否立即重启应用
        Alert.alert(
          '更新已就绪',
          '新版本已下载完成，是否立即重启应用以使用最新功能？',
          [
            { text: '稍后', style: 'cancel' },
            { text: '立即重启', onPress: () => { Updates.reloadAsync(); } },
          ]
        );
      } catch {
        // 检查/下载失败（如离线）静默忽略，不打扰用户
      }
    })();

    return () => { cancelled = true; };
  }, []);
}
