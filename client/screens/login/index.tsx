import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
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

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <FontAwesome6 name="house" size={52} color="#6C63FF" style={styles.logo} />
            <Text style={styles.appName}>房屋管家</Text>
            <Text style={styles.subtitle}>
              {mode === 'login' ? '登录后多设备同步数据' : '创建账号'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>用户名</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="3-30 位字母、数字或下划线"
              placeholderTextColor="#B2BEC3"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>密码</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="至少 6 位"
              placeholderTextColor="#B2BEC3"
              secureTextEntry
              autoCapitalize="none"
            />

            {/* 服务器地址（可折叠，默认隐藏） */}
            <TouchableOpacity onPress={() => setShowServer((v) => !v)}>
              <Text style={styles.serverToggle}>
                {showServer ? '▼ 收起服务器设置' : '▷ 服务器设置'}
              </Text>
            </TouchableOpacity>
            {showServer && (
              <>
                <Text style={styles.label}>服务器地址</Text>
                <TextInput
                  style={styles.input}
                  value={server}
                  onChangeText={setServer}
                  placeholder="如 http://192.168.1.10:9091"
                  placeholderTextColor="#B2BEC3"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </>
            )}

            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>{mode === 'login' ? '登 录' : '注 册'}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}>
              <Text style={styles.switchText}>
                {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    marginBottom: 8,
  },
  appName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#2D3436',
  },
  subtitle: {
    fontSize: 14,
    color: '#636E72',
    marginTop: 6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  label: {
    fontSize: 14,
    color: '#636E72',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E8EB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2D3436',
  },
  serverToggle: {
    color: '#6C63FF',
    fontSize: 13,
    marginTop: 16,
  },
  button: {
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#6C63FF',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 2,
  },
  switchText: {
    color: '#6C63FF',
    textAlign: 'center',
    marginTop: 18,
    fontSize: 14,
  },
});
