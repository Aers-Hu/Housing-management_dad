import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, ApiError, NetworkError } from '@/utils/api';
import { getServerUrl, setServerUrl } from '@/utils/config';

export default function LoginScreen() {
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [focused, setFocused] = useState<'username' | 'password' | 'server' | null>(null);

  useEffect(() => {
    getServerUrl().then(setServer);
  }, []);

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      Toast.show({ type: 'error', text1: '请填写用户名和密码' });
      return;
    }
    setSubmitting(true);
    try {
      // 先保存服务器地址（可能被修改过）
      if (server.trim()) await setServerUrl(server);

      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const data = await apiRequest<{ token: string; user: any }>(path, {
        method: 'POST',
        body: { username: username.trim(), password },
        auth: false,
      });
      await login(data.token, data.user);
      Toast.show({ type: 'success', text1: mode === 'login' ? '登录成功' : '注册成功' });
      // 登录态变化后，根布局会自动跳转到主界面
    } catch (e) {
      let msg = '操作失败';
      if (e instanceof NetworkError) msg = '连不上服务器，请检查地址和网络';
      else if (e instanceof ApiError) msg = e.message;
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = (field: 'username' | 'password' | 'server') => [
    styles.input,
    focused === field && styles.inputFocused,
  ];

  return (
    <Screen backgroundColor="#6C63FF" statusBarStyle="light">
      <LinearGradient
        colors={['#6C63FF', '#8472FF', '#A99BFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* 渐变英雄区 */}
        <View style={styles.hero}>
          <View style={styles.logoCircle}>
            <FontAwesome6 name="house" size={38} color="#FFFFFF" />
          </View>
          <Text style={styles.appName}>房屋管家</Text>
          <Text style={styles.heroSubtitle}>
            {mode === 'login' ? '登录后多设备同步数据' : '创建你的账号'}
          </Text>
        </View>

        {/* 悬浮卡片 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{mode === 'login' ? '欢迎回来' : '注册新账号'}</Text>

          <Text style={styles.label}>用户名</Text>
          <View style={inputStyle('username')}>
            <FontAwesome6 name="user" size={14} color="#A99BFF" style={styles.inputIcon} />
            <TextInput
              style={styles.inputText}
              value={username}
              onChangeText={setUsername}
              onFocus={() => setFocused('username')}
              onBlur={() => setFocused(null)}
              placeholder="3-30 位字母、数字或下划线"
              placeholderTextColor="#B2BEC3"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.label}>密码</Text>
          <View style={inputStyle('password')}>
            <FontAwesome6 name="lock" size={14} color="#A99BFF" style={styles.inputIcon} />
            <TextInput
              style={styles.inputText}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              placeholder="至少 6 位"
              placeholderTextColor="#B2BEC3"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          {/* 服务器地址（可折叠，默认隐藏） */}
          <TouchableOpacity onPress={() => setShowServer((v) => !v)} activeOpacity={0.7}>
            <Text style={styles.serverToggle}>
              <FontAwesome6 name={showServer ? 'chevron-down' : 'chevron-right'} size={11} color="#6C63FF" />
              {'  '}服务器设置
            </Text>
          </TouchableOpacity>
          {showServer && (
            <>
              <Text style={styles.label}>服务器地址</Text>
              <View style={inputStyle('server')}>
                <FontAwesome6 name="server" size={13} color="#A99BFF" style={styles.inputIcon} />
                <TextInput
                  style={styles.inputText}
                  value={server}
                  onChangeText={setServer}
                  onFocus={() => setFocused('server')}
                  onBlur={() => setFocused(null)}
                  placeholder="如 http://192.168.1.10:9091"
                  placeholderTextColor="#B2BEC3"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>{mode === 'login' ? '登 录' : '注 册'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMode((m) => (m === 'login' ? 'register' : 'login'))} activeOpacity={0.7}>
            <Text style={styles.switchText}>
              {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 26,
    shadowColor: '#1A1A4A',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    color: '#636E72',
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F6FB',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EDEDF5',
    paddingHorizontal: 14,
  },
  inputFocused: {
    borderColor: '#6C63FF',
    backgroundColor: '#FFFFFF',
  },
  inputIcon: {
    marginRight: 10,
  },
  inputText: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 16,
    color: '#2D3436',
  },
  serverToggle: {
    color: '#6C63FF',
    fontSize: 13,
    marginTop: 16,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#6C63FF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 26,
    shadowColor: '#6C63FF',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 3,
  },
  switchText: {
    color: '#6C63FF',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
    fontWeight: '500',
  },
});
