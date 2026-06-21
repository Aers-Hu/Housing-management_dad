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
import { Building, Room, groupRoomsByFloor, getBuildingStats } from '@/utils/roomTypes';
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
                  <Text style={styles.floorBadgeText}>{floor} 楼</Text>
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
                    >
                      {room.number}
                    </Text>
                    {room.name ? (
                      <Text style={styles.roomName} numberOfLines={1}>
                        {room.name}
                      </Text>
                    ) : null}
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
    fontSize: 18,
    fontWeight: '800',
    color: '#2D3436',
    marginBottom: 2,
  },
  roomNumberOccupied: {
    color: '#00B894',
  },
  roomName: {
    fontSize: 10,
    color: '#6C63FF',
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
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
});
