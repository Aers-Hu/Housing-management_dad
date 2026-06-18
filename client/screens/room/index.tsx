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
  Modal,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { StorageService } from '@/utils/storage';
import { Room, calculateRemainingMonths, getVacantRooms } from '@/utils/roomTypes';

export default function RoomDetailScreen() {
  const router = useSafeRouter();
  const { id } = useSafeSearchParams<{ id: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [isOccupied, setIsOccupied] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [leaseStartDate, setLeaseStartDate] = useState('');
  const [leaseMonths, setLeaseMonths] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [selectedTargetRoom, setSelectedTargetRoom] = useState<string>('');

  const loadRoomData = useCallback(async () => {
    const rooms = await StorageService.loadRooms();
    const found = rooms.find((r) => r.id === id);
    if (found) {
      setRoom(found);
      setAllRooms(rooms);
      setIsOccupied(found.isOccupied);
      setTenantName(found.tenantName || '');
      setMonthlyRent(found.monthlyRent ? String(found.monthlyRent) : '');
      setLeaseStartDate(found.leaseStartDate || '');
      setLeaseMonths(found.leaseMonths ? String(found.leaseMonths) : '');
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
      setTenantName('');
      setMonthlyRent('');
      setLeaseStartDate('');
      setLeaseMonths('');
    }
  };

  const handleNameChange = (text: string) => {
    setTenantName(text);
    setHasChanges(true);
  };

  const handleRentChange = (text: string) => {
    const numeric = text.replace(/\D/g, '');
    setMonthlyRent(numeric);
    setHasChanges(true);
  };

  const handleStartDateChange = (text: string) => {
    setLeaseStartDate(text);
    setHasChanges(true);
  };

  const handleMonthsChange = (text: string) => {
    const numeric = text.replace(/\D/g, '');
    setLeaseMonths(numeric);
    setHasChanges(true);
  };

  const remainingMonths = calculateRemainingMonths(
    leaseStartDate || undefined,
    leaseMonths ? parseInt(leaseMonths, 10) : undefined
  );

  const vacantRooms = getVacantRooms(allRooms).filter(r => r.id !== id);

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
      leaseStartDate: isOccupied ? leaseStartDate : undefined,
      leaseMonths: isOccupied && leaseMonths ? parseInt(leaseMonths, 10) : undefined,
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

  const handleTransfer = async () => {
    if (!room || !selectedTargetRoom) {
      Alert.alert('提示', '请选择目标房间');
      return;
    }

    const targetRoom = allRooms.find(r => r.id === selectedTargetRoom);
    if (!targetRoom) return;

    Alert.alert(
      '确认转移',
      `确定将 ${room.tenantName} 从 ${room.number} 房间转移到 ${targetRoom.number} 房间吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认转移',
          onPress: async () => {
            // 更新目标房间
            const updatedTarget: Room = {
              ...targetRoom,
              isOccupied: true,
              tenantName: room.tenantName,
              monthlyRent: room.monthlyRent,
              leaseStartDate: room.leaseStartDate,
              leaseMonths: room.leaseMonths,
            };
            await StorageService.updateRoom(updatedTarget);

            // 清空原房间
            const clearedRoom: Room = {
              ...room,
              isOccupied: false,
              tenantName: '',
              monthlyRent: 0,
              leaseStartDate: undefined,
              leaseMonths: undefined,
            };
            await StorageService.updateRoom(clearedRoom);

            setTransferModalVisible(false);
            Alert.alert('转移成功', `${room.tenantName} 已转移到 ${targetRoom.number} 房间`, [
              { text: '确定', onPress: () => router.back() },
            ]);
          },
        },
      ]
    );
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
            <>
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
              </View>

              {/* 租期信息 */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>租期信息</Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>租期开始日期</Text>
                  <TextInput
                    style={styles.textInput}
                    value={leaseStartDate}
                    onChangeText={handleStartDateChange}
                    placeholder="格式: 2024-01-01"
                    placeholderTextColor="#B2BEC3"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>租期月数</Text>
                  <TextInput
                    style={styles.textInput}
                    value={leaseMonths}
                    onChangeText={handleMonthsChange}
                    placeholder="请输入租期总月数"
                    placeholderTextColor="#B2BEC3"
                    keyboardType="numeric"
                  />
                </View>

                {leaseStartDate && leaseMonths && (
                  <View style={styles.remainingCard}>
                    <View style={styles.remainingItem}>
                      <Text style={styles.remainingLabel}>总租期</Text>
                      <Text style={styles.remainingValue}>{leaseMonths} 个月</Text>
                    </View>
                    <View style={styles.remainingDivider} />
                    <View style={styles.remainingItem}>
                      <Text style={styles.remainingLabel}>剩余租期</Text>
                      <Text style={[
                        styles.remainingValue,
                        remainingMonths <= 1 ? styles.remainingDanger : remainingMonths <= 3 ? styles.remainingWarning : styles.remainingSuccess
                      ]}>
                        {remainingMonths} 个月
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* 转移功能 */}
              <TouchableOpacity
                style={styles.transferButton}
                onPress={() => setTransferModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.transferButtonText}>转移租客</Text>
              </TouchableOpacity>
            </>
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

        {/* 转移房间 Modal */}
        <Modal
          visible={transferModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setTransferModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>选择目标房间</Text>
                <TouchableOpacity onPress={() => setTransferModalVisible(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {vacantRooms.length === 0 ? (
                <View style={styles.noRoomsContainer}>
                  <Text style={styles.noRoomsText}>暂无可用空房间</Text>
                </View>
              ) : (
                <ScrollView style={styles.roomsList}>
                  {vacantRooms.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={[
                        styles.roomOption,
                        selectedTargetRoom === r.id && styles.roomOptionSelected,
                      ]}
                      onPress={() => setSelectedTargetRoom(r.id)}
                    >
                      <View style={styles.roomOptionInfo}>
                        <Text style={styles.roomOptionNumber}>{r.number}</Text>
                        <Text style={styles.roomOptionFloor}>第 {r.floor} 层</Text>
                      </View>
                      {selectedTargetRoom === r.id && (
                        <Text style={styles.roomOptionCheck}>✓</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <TouchableOpacity
                style={[
                  styles.confirmTransferButton,
                  !selectedTargetRoom && styles.confirmTransferButtonDisabled,
                ]}
                onPress={handleTransfer}
                disabled={!selectedTargetRoom}
              >
                <Text style={styles.confirmTransferText}>确认转移</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  // 剩余租期
  remainingCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(108, 99, 255, 0.08)',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  remainingItem: {
    flex: 1,
    alignItems: 'center',
  },
  remainingDivider: {
    width: 1,
    backgroundColor: '#D1D9E6',
    marginHorizontal: 12,
  },
  remainingLabel: {
    fontSize: 13,
    color: '#636E72',
    marginBottom: 4,
  },
  remainingValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
  },
  remainingSuccess: {
    color: '#00B894',
  },
  remainingWarning: {
    color: '#FDCB6E',
  },
  remainingDanger: {
    color: '#FF6B6B',
  },
  // 转移按钮
  transferButton: {
    backgroundColor: '#FF6584',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  transferButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
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
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#F0F0F3',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
  },
  modalClose: {
    fontSize: 20,
    color: '#636E72',
    padding: 4,
  },
  roomsList: {
    maxHeight: 300,
  },
  roomOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  roomOptionSelected: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderWidth: 2,
    borderColor: '#6C63FF',
  },
  roomOptionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomOptionNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
    marginRight: 12,
  },
  roomOptionFloor: {
    fontSize: 13,
    color: '#636E72',
  },
  roomOptionCheck: {
    fontSize: 18,
    color: '#6C63FF',
    fontWeight: '700',
  },
  noRoomsContainer: {
    padding: 40,
    alignItems: 'center',
  },
  noRoomsText: {
    fontSize: 15,
    color: '#636E72',
  },
  confirmTransferButton: {
    backgroundColor: '#FF6584',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmTransferButtonDisabled: {
    backgroundColor: '#E8E8EB',
  },
  confirmTransferText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
