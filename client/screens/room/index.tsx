/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { StorageService } from '@/utils/storage';
import { Room } from '@/utils/roomTypes';

export default function RoomDetailScreen() {
  const router = useSafeRouter();
  const { id } = useSafeSearchParams<{ id: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [isOccupied, setIsOccupied] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const loadRoomData = useCallback(async () => {
    const rooms = await StorageService.loadRooms();
    const found = rooms.find((r) => r.id === id);
    if (found) {
      setRoom(found);
      setIsOccupied(found.isOccupied);
      setTenantName(found.tenantName || '');
      setMonthlyRent(found.monthlyRent ? String(found.monthlyRent) : '');
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadRoomData();
    }
  }, [id, loadRoomData]);

  const handleOccupiedChange = (value: boolean) => {
    setIsOccupied(value);
    setHasChanges(true);
    if (!value) {
      // 取消入住时，清空租客信息
      setTenantName('');
      setMonthlyRent('');
    }
  };

  const handleNameChange = (text: string) => {
    setTenantName(text);
    setHasChanges(true);
  };

  const handleRentChange = (text: string) => {
    // 只允许数字
    const numeric = text.replace(/\D/g, '');
    setMonthlyRent(numeric);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!room) return;

    if (isOccupied && !tenantName.trim()) {
      Alert.alert('提示', '请输入租客姓名');
      return;
    }

    if (isOccupied && !monthlyRent) {
      Alert.alert('提示', '请输入每月房租');
      return;
    }

    const updatedRoom: Room = {
      ...room,
      isOccupied,
      tenantName: tenantName.trim(),
      monthlyRent: isOccupied ? parseInt(monthlyRent, 10) || 0 : 0,
    };

    await StorageService.updateRoom(updatedRoom);
    setHasChanges(false);
    Alert.alert('保存成功', '房屋信息已更新', [
      { text: '确定', onPress: () => router.back() },
    ]);
  };

  const handleBack = () => {
    if (hasChanges) {
      Alert.alert(
        '有未保存的更改',
        '确定要返回吗？',
        [
          { text: '取消', style: 'cancel' },
          { text: '确定', onPress: () => router.back() },
        ]
      );
    } else {
      router.back();
    }
  };

  if (!room) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 顶部导航 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backText}>返回</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>房间 {room.number}</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 房间信息卡片 */}
          <View style={styles.roomInfoCard}>
            <View style={styles.roomIcon}>
              <Text style={styles.roomIconText}>{room.number}</Text>
            </View>
            <View style={styles.roomDetails}>
              <Text style={styles.roomFloor}>第 {room.floor} 层</Text>
              <View
                style={[
                  styles.statusBadge,
                  isOccupied ? styles.statusOccupied : styles.statusVacant,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    isOccupied ? styles.statusTextOccupied : styles.statusTextVacant,
                  ]}
                >
                  {isOccupied ? '已入住' : '空置中'}
                </Text>
              </View>
            </View>
          </View>

          {/* 入住开关 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>入住状态</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                {isOccupied ? '当前已入住' : '当前空置'}
              </Text>
              <Switch
                value={isOccupied}
                onValueChange={handleOccupiedChange}
                trackColor={{ false: '#E8E8EB', true: '#00B894' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* 租客信息区域 */}
          {isOccupied && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>租客信息</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>租客姓名</Text>
                <TextInput
                  style={styles.textInput}
                  value={tenantName}
                  onChangeText={handleNameChange}
                  placeholder="请输入租客姓名"
                  placeholderTextColor="#B2BEC3"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>每月房租 (元)</Text>
                <TextInput
                  style={styles.textInput}
                  value={monthlyRent}
                  onChangeText={handleRentChange}
                  placeholder="请输入每月房租"
                  placeholderTextColor="#B2BEC3"
                  keyboardType="numeric"
                />
              </View>

              {monthlyRent && (
                <View style={styles.rentSummary}>
                  <Text style={styles.rentSummaryText}>
                    年租预估：{parseInt(monthlyRent || '0', 10) * 12} 元
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* 保存按钮 */}
          <TouchableOpacity
            style={[styles.saveButton, hasChanges && styles.saveButtonActive]}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            <Text style={styles.saveButtonText}>
              {hasChanges ? '保存修改' : '保存'}
            </Text>
          </TouchableOpacity>

          <View style={styles.bottomPadding} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#636E72',
  },
  // 头部
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 16,
    color: '#6C63FF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
  },
  placeholder: {
    width: 60,
  },
  // 内容
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  // 房间信息卡片
  roomInfoCard: {
    backgroundColor: '#F0F0F3',
    borderRadius: 24,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 5,
  },
  roomIcon: {
    width: 72,
    height: 72,
    backgroundColor: '#6C63FF',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomIconText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  roomDetails: {
    marginLeft: 20,
    flex: 1,
  },
  roomFloor: {
    fontSize: 14,
    color: '#636E72',
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusOccupied: {
    backgroundColor: 'rgba(0, 184, 148, 0.15)',
  },
  statusVacant: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusTextOccupied: {
    color: '#00B894',
  },
  statusTextVacant: {
    color: '#6C63FF',
  },
  // 区块
  section: {
    backgroundColor: '#F0F0F3',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 16,
  },
  // 开关行
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 15,
    color: '#2D3436',
  },
  // 输入组
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    color: '#636E72',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#E8E8EB',
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: '#2D3436',
  },
  // 租金汇总
  rentSummary: {
    backgroundColor: 'rgba(0, 184, 148, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  rentSummaryText: {
    fontSize: 15,
    color: '#00B894',
    fontWeight: '600',
    textAlign: 'center',
  },
  // 保存按钮
  saveButton: {
    backgroundColor: '#E8E8EB',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonActive: {
    backgroundColor: '#6C63FF',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bottomPadding: {
    height: 40,
  },
});
