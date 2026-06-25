import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribeNetStatus } from '@/utils/netstatus';

// ============================================================
// 离线提醒条（本地主库版）
//
// 当检测到连不上主库服务器时，在屏幕顶部显示常驻提示：
// 程序仅在本地运行，无法同步与协同编辑。
// 点击可临时收起；下次状态变化（再次离线）会重新出现。
// ============================================================
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    return subscribeNetStatus((value) => {
      setOnline(value);
      if (!value) setDismissed(false); // 一旦离线，重置收起状态，确保提示出现
    });
  }, []);

  if (online || dismissed) return null;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable style={styles.banner} onPress={() => setDismissed(true)}>
        <Text style={styles.icon}>⚠️</Text>
        <View style={styles.textWrap}>
          <Text style={styles.title}>当前仅本地运行</Text>
          <Text style={styles.subtitle}>
            无法同步与协同编辑。如需同步，请联网并确保服务器可用。
          </Text>
        </View>
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 9999,
    elevation: 9999,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8A6D00',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  icon: {
    fontSize: 18,
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    color: '#FFF4D6',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  close: {
    color: '#FFF4D6',
    fontSize: 16,
    marginLeft: 10,
    paddingHorizontal: 4,
  },
});
