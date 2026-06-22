import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { StorageService } from '@/utils/storage';
import { Building, Room, groupRoomsByFloor, getBuildingStats, getFloorLabel } from '@/utils/roomTypes';
import { useFocusEffect } from 'expo-router';

export default function BuildingScreen() {
  const router = useSafeRouter();
  const { buildingId } = useSafeSearchParams<{ buildingId: string }>();
  const [building, setBuilding] = useState<Building | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ total: 0, occupied: 0, vacant: 0 });

  // 房间命名弹窗
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [namingRoom, setNamingRoom] = useState<Room | null>(null);
  const [roomNewName, setRoomNewName] = useState('');

  // 编辑楼房菜单
  const [editMenuVisible, setEditMenuVisible] = useState(false);

  // 编辑楼层号弹窗
  const [floorLabelModalVisible, setFloorLabelModalVisible] = useState(false);
  const [floorLabelDraft, setFloorLabelDraft] = useState<Record<number, string>>({});

  // 批量命名房间弹窗
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchNameDraft, setBatchNameDraft] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    if (!buildingId) return;

    const buildings = await StorageService.loadBuildings();
    const found = buildings.find(b => b.id === buildingId);
    if (found) {
      setBuilding(found);
      const roomData = await StorageService.loadRooms(found.id);
      setRooms(roomData);
      setStats(getBuildingStats(roomData, found.id));
    }
  }, [buildingId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleBack = () => {
    router.back();
  };

  // 点击房间 → 进入详情
  const handleRoomPress = (roomId: string) => {
    router.push('/room', { buildingId, roomId });
  };

  // 长按房间 → 命名
  const handleRoomLongPress = (room: Room) => {
    setNamingRoom(room);
    setRoomNewName(room.name);
    setNameModalVisible(true);
  };

  // 保存房间名称
  const handleSaveRoomName = async () => {
    if (!namingRoom) return;
    const updated: Room = { ...namingRoom, name: roomNewName.trim() };
    await StorageService.updateRoom(updated);
    setNameModalVisible(false);
    setNamingRoom(null);
    await loadData();
  };

  // 打开编辑楼层号弹窗
  const openFloorLabelModal = () => {
    if (!building) return;
    const draft: Record<number, string> = {};
    for (let f = 1; f <= building.floors; f++) {
      draft[f] = getFloorLabel(building, f);
    }
    setFloorLabelDraft(draft);
    setEditMenuVisible(false);
    setTimeout(() => setFloorLabelModalVisible(true), 250);
  };

  // 保存楼层号
  const handleSaveFloorLabels = async () => {
    if (!building) return;
    const labels: Record<number, string> = {};
    for (const [floorStr, label] of Object.entries(floorLabelDraft)) {
      const floor = Number(floorStr);
      const trimmed = label.trim();
      // 只保存与默认值不同的楼层号
      if (trimmed && trimmed !== String(floor)) {
        labels[floor] = trimmed;
      }
    }
    const updated: Building = { ...building, floorLabels: labels };
    await StorageService.updateBuilding(updated);
    setFloorLabelModalVisible(false);
    await loadData();
  };

  // 打开批量命名弹窗
  const openBatchModal = () => {
    const draft: Record<string, string> = {};
    for (const r of rooms) draft[r.id] = r.name || '';
    setBatchNameDraft(draft);
    setEditMenuVisible(false);
    setTimeout(() => setBatchModalVisible(true), 250);
  };

  // 保存批量命名
  const handleSaveBatchNames = async () => {
    if (!buildingId) return;
    const updates = Object.entries(batchNameDraft).map(([id, name]) => ({ id, name: name.trim() }));
    await StorageService.batchUpdateRooms(buildingId, updates);
    setBatchModalVisible(false);
    await loadData();
  };

  const groupedRooms = groupRoomsByFloor(rooms);
  const floors = [...groupedRooms.keys()].sort((a, b) => b - a);

  if (!building) {
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
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 顶部导航 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backText}>← 返回</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditMenuVisible(true)} style={styles.editBuildingButton}>
            <Text style={styles.editBuildingText}>编辑楼房</Text>
          </TouchableOpacity>
        </View>

        {/* 楼房信息 */}
        <View style={styles.buildingInfoCard}>
          <Text style={styles.buildingName}>{building.name}</Text>
          <Text style={styles.buildingConfig}>
            {building.floors} 层 · 每层 {building.roomsPerFloor} 间 · 共 {stats.total} 间
          </Text>
        </View>

        {/* 统计卡片 */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>总房间</Text>
          </View>
          <View style={[styles.statCard, styles.occupiedCard]}>
            <Text style={[styles.statNumber, styles.occupiedNumber]}>{stats.occupied}</Text>
            <Text style={styles.statLabel}>已入住</Text>
          </View>
          <View style={[styles.statCard, styles.vacantCard]}>
            <Text style={[styles.statNumber, styles.vacantNumber]}>{stats.vacant}</Text>
            <Text style={styles.statLabel}>空房间</Text>
          </View>
        </View>

        {/* 楼层列表 */}
        {floors.map((floor) => {
          const floorRooms = groupedRooms.get(floor) || [];
          return (
            <View key={floor} style={styles.floorSection}>
              <View style={styles.floorHeader}>
                <View style={styles.floorBadge}>
                  <Text style={styles.floorBadgeText}>{getFloorLabel(building, floor)} 楼</Text>
                </View>
                <Text style={styles.floorInfo}>
                  {floorRooms.filter(r => r.isOccupied).length}/{floorRooms.length} 已入住
                </Text>
              </View>

              <View style={styles.roomsGrid}>
                {floorRooms.map((room) => (
                  <TouchableOpacity
                    key={room.id}
                    style={[
                      styles.roomCard,
                      room.isOccupied && styles.roomCardOccupied,
                    ]}
                    onPress={() => handleRoomPress(room.id)}
                    onLongPress={() => handleRoomLongPress(room)}
                    activeOpacity={0.7}
                    delayLongPress={500}
                  >
                    <Text
                      style={[
                        styles.roomNumber,
                        room.isOccupied && styles.roomNumberOccupied,
                      ]}
                      numberOfLines={1}
                    >
                      {room.name ? room.name : room.number}
                    </Text>
                    <View
                      style={[
                        styles.statusDot,
                        room.isOccupied ? styles.statusDotOccupied : styles.statusDotVacant,
                      ]}
                    />
                    <Text
                      style={[
                        styles.tenantName,
                        room.isOccupied && styles.tenantNameOccupied,
                      ]}
                      numberOfLines={1}
                    >
                      {room.isOccupied ? room.tenantName || '已入住' : '空置'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* ========== 房间命名 Modal ========== */}
      <Modal
        visible={nameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNameModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.nameModalContent}>
            <Text style={styles.nameModalTitle}>
              命名房间 {namingRoom?.number}
            </Text>
            <TextInput
              style={styles.nameInput}
              value={roomNewName}
              onChangeText={setRoomNewName}
              placeholder="例如：主卧、储物间"
              placeholderTextColor="#B2BEC3"
              autoFocus
            />
            <View style={styles.nameModalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setNameModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveRoomName}>
                <Text style={styles.saveBtnText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========== 编辑楼房菜单 ========== */}
      <Modal
        visible={editMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setEditMenuVisible(false)}
        >
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>编辑楼房</Text>
            <TouchableOpacity style={styles.actionItem} onPress={openFloorLabelModal}>
              <Text style={styles.actionItemText}>🏢  修改楼层号</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={openBatchModal}>
              <Text style={styles.actionItemText}>✏️  批量命名房间</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionItemCancel]}
              onPress={() => setEditMenuVisible(false)}
            >
              <Text style={styles.actionItemText}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ========== 修改楼层号 Modal ========== */}
      <Modal
        visible={floorLabelModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFloorLabelModalVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.formSheet}>
            <Text style={styles.formTitle}>修改楼层号</Text>
            <Text style={styles.formHint}>设置每一层显示的楼层号（例如把第 1 层显示为「2」）</Text>
            <ScrollView style={styles.editList}>
              {building && Array.from({ length: building.floors }, (_, i) => building.floors - i).map((floor) => (
                <View key={floor} style={styles.editRow}>
                  <Text style={styles.editRowLabel}>第 {floor} 层</Text>
                  <Text style={styles.editRowArrow}>→</Text>
                  <TextInput
                    style={styles.editRowInput}
                    value={floorLabelDraft[floor] ?? ''}
                    onChangeText={(t) => setFloorLabelDraft(prev => ({ ...prev, [floor]: t }))}
                    placeholder={String(floor)}
                    placeholderTextColor="#B2BEC3"
                  />
                  <Text style={styles.editRowSuffix}>楼</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.formButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setFloorLabelModalVisible(false)}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveFloorLabels}>
                <Text style={styles.saveBtnText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========== 批量命名房间 Modal ========== */}
      <Modal
        visible={batchModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBatchModalVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.formSheet}>
            <Text style={styles.formTitle}>批量命名房间</Text>
            <Text style={styles.formHint}>留空则显示原房间号</Text>
            <ScrollView style={styles.editList}>
              {floors.map((floor) => {
                const floorRooms = groupedRooms.get(floor) || [];
                return (
                  <View key={floor}>
                    <Text style={styles.batchFloorTitle}>{getFloorLabel(building, floor)} 楼</Text>
                    {floorRooms.map((room) => (
                      <View key={room.id} style={styles.editRow}>
                        <Text style={styles.editRowLabel}>{room.number}</Text>
                        <Text style={styles.editRowArrow}>→</Text>
                        <TextInput
                          style={styles.editRowInput}
                          value={batchNameDraft[room.id] ?? ''}
                          onChangeText={(t) => setBatchNameDraft(prev => ({ ...prev, [room.id]: t }))}
                          placeholder="房间名称"
                          placeholderTextColor="#B2BEC3"
                        />
                      </View>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.formButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setBatchModalVisible(false)}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveBatchNames}>
                <Text style={styles.saveBtnText}>保存全部</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
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
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backText: {
    fontSize: 16,
    color: '#6C63FF',
    fontWeight: '600',
  },
  editBuildingButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#F0F0F3',
    borderRadius: 12,
  },
  editBuildingText: {
    fontSize: 14,
    color: '#6C63FF',
    fontWeight: '700',
  },
  // 楼房信息
  buildingInfoCard: {
    backgroundColor: '#6C63FF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
  },
  buildingName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  buildingConfig: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  // 统计卡片
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F0F0F3',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  occupiedCard: {},
  vacantCard: {},
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2D3436',
  },
  occupiedNumber: {
    color: '#00B894',
  },
  vacantNumber: {
    color: '#6C63FF',
  },
  statLabel: {
    fontSize: 12,
    color: '#636E72',
    marginTop: 4,
  },
  // 楼层区块
  floorSection: {
    marginBottom: 20,
  },
  floorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  floorBadge: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  floorBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  floorInfo: {
    fontSize: 13,
    color: '#636E72',
  },
  // 房间网格
  roomsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  roomCard: {
    width: '31%',
    backgroundColor: '#F0F0F3',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  roomCardOccupied: {
    backgroundColor: '#E8F8F5',
  },
  roomNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2D3436',
    marginBottom: 2,
    textAlign: 'center',
  },
  roomNumberOccupied: {
    color: '#00B894',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginVertical: 4,
  },
  statusDotOccupied: {
    backgroundColor: '#00B894',
  },
  statusDotVacant: {
    backgroundColor: '#B2BEC3',
  },
  tenantName: {
    fontSize: 11,
    color: '#636E72',
    textAlign: 'center',
  },
  tenantNameOccupied: {
    color: '#00B894',
  },
  bottomPadding: {
    height: 40,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  nameModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  nameModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
    textAlign: 'center',
    marginBottom: 16,
  },
  nameInput: {
    backgroundColor: '#F0F0F3',
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: '#2D3436',
    marginBottom: 20,
  },
  nameModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F0F0F3',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#636E72',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#6C63FF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // 底部弹出层
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  // 操作菜单
  actionSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
    textAlign: 'center',
    marginBottom: 16,
  },
  actionItem: {
    backgroundColor: '#F0F0F3',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 10,
    alignItems: 'center',
  },
  actionItemCancel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8EB',
    marginTop: 4,
  },
  actionItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
  },
  // 表单弹窗
  formSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 34,
    maxHeight: '80%',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3436',
    textAlign: 'center',
    marginBottom: 8,
  },
  formHint: {
    fontSize: 13,
    color: '#636E72',
    textAlign: 'center',
    marginBottom: 16,
  },
  editList: {
    maxHeight: 380,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  editRowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3436',
    width: 64,
  },
  editRowArrow: {
    fontSize: 15,
    color: '#B2BEC3',
    marginHorizontal: 8,
  },
  editRowInput: {
    flex: 1,
    backgroundColor: '#F0F0F3',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#2D3436',
  },
  editRowSuffix: {
    fontSize: 15,
    color: '#636E72',
    marginLeft: 8,
  },
  batchFloorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6C63FF',
    marginTop: 12,
    marginBottom: 8,
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
});
