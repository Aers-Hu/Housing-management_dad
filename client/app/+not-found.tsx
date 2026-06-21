import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>页面不存在</Text>
      <Link href="/" style={styles.link}>
        返回首页
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  title: {
    fontSize: 16,
    color: '#2D3436',
  },
  link: {
    fontSize: 16,
    color: '#6C63FF',
    marginTop: 24,
  },
});
