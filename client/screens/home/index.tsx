import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { StorageService } from '@/utils/storage';
import { Building, Room, getBuildingStats } from '@/utils/roomTypes';
import { useFocusEffect } from 'expo-router';

export default function HomeScreen() {
  const router = useSafeRouter();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingStats, setBuildingStats] = useState<Map<string, { total: number; occupied: number; vacant: number }>>(new Map());
  const [refreshing, setRefreshing] = useState(false);

  // 添加楼房弹窗
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFloors, setNewFloors] = useState('');
  const [newRoomsPerFloor, setNewRoomsPerFloor] = useState('');

  // 编辑楼房弹窗
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [editName, setEditName] = useState('');
  const [editFloors, setEditFloors] = useState('');
  const [editRoomsPerFloor, setEditRoomsPerFloor] = useState('');

  // 操作菜单
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);

  const loadData = useCallback(async () => {
    const blds = await StorageService.loadBuildings();
    setBuildings(blds);

    const stats = new Map<string, { total: number; occupied: number; vacant: number }>();
    for (const b of blds) {
      const rooms = await StorageService.loadRooms(b.id);
      stats.set(b.id, getBuildingStats(rooms, b.id));
    }
    setBuildingStats(stats);
  }, []);

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

  // 进入楼房管理
  const handleBuildingPress = (buildingId: string) => {
    router.push('/building', { buildingId });
  };

  // 长按 → 弹出操作菜单
  const handleBuildingLongPress = (building: Building) => {
    setSelectedBuilding(building);
    setActionModalVisible(true);
  };

  // 打开编辑弹窗
  const openEditModal = () => {
    if (!selectedBuilding) return;
    setEditingBuilding(selectedBuilding);
    setEditName(selectedBuilding.name);
    setEditFloors(String(selectedBuilding.floors));
    setEditRoomsPerFloor(String(selectedBuilding.roomsPerFloor));
    setActionModalVisible(false);
    setTimeout(() => setEditModalVisible(true), 300);
  };

  // 删除楼房
  const handleDeleteBuilding = () => {
    if (!selectedBuilding) return;
    const b = selectedBuilding;
    setActionModalVisible(false);

    setTimeout(() => {
      Alert.alert(
        '确认删除',
        `确定要删除"${b.name}"及其所有房间数据吗？此操作不可恢复。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '删除',
            style: 'destructive',
            onPress: async () => {
              await StorageService.deleteBuilding(b.id);
              await loadData();
            },
          },
        ]
      );
    }, 300);
  };

  // 添加楼房
  const handleAddBuilding = async () => {
    const name = newName.trim();
    const floors = parseInt(newFloors, 10);
    const roomsPerFloor = parseInt(newRoomsPerFloor, 10);

    if (!name) {
      Alert.alert('提示', '请输入楼房名称');
      return;
    }
    if (isNaN(floors) || floors < 1 || floors > 99) {
      Alert.alert('提示', '请输入合理的层数（1-99）');
      return;
    }
    if (isNaN(roomsPerFloor) || roomsPerFloor < 1 || roomsPerFloor > 50) {
      Alert.alert('提示', '请输入合理的每层房间数（1-50）');
      return;
    }

    await StorageService.addBuilding(name, floors, roomsPerFloor);
    setAddModalVisible(false);
    setNewName('');
    setNewFloors('');
    setNewRoomsPerFloor('');
    await loadData();
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingBuilding) return;
    const name = editName.trim();
    const floors = parseInt(editFloors, 10);
    const roomsPerFloor = parseInt(editRoomsPerFloor, 10);

    if (!name) {
      Alert.alert('提示', '请输入楼房名称');
      return;
    }
    if (isNaN(floors) || floors < 1 || floors > 99) {
      Alert.alert('提示', '请输入合理的层数（1-99）');
      return;
    }
    if (isNaN(roomsPerFloor) || roomsPerFloor < 1 || roomsPerFloor > 50) {
      Alert.alert('提示', '请输入合理的每层房间数（1-50）');
      return;
    }

    const updated = { ...editingBuilding, name };
    await StorageService.updateBuilding(updated, floors, roomsPerFloor);
    setEditModalVisible(false);
    setEditingBuilding(null);
    await loadData();
  };

  const renderStatsBar = (buildingId: string) => {
    const stats = buildingStats.get(buildingId);
    if (!stats) return null;
    const occupancyRate = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0;

    return (
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>总房间</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, styles.occupiedValue]}>{stats.occupied}</Text>
          <Text style={styles.statLabel}>已入住</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, styles.vacantValue]}>{stats.vacant}</Text>
          <Text style={styles.statLabel}>空置</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, styles.rateValue]}>{occupancyRate}%</Text>
          <Text style={styles.statLabel}>入住率</Text>
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 标题 */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>房屋管家</Text>
          <Text style={styles.headerSubtitle}>
            {buildings.length === 0 ? '点击下方按钮添加楼房' : `共管理 ${buildings.length} 栋楼房`}
          </Text>
        </View>

        {/* 楼房列表 */}
        {buildings.map((building) => (
          <TouchableOpacity
            key={building.id}
            style={styles.buildingCard}
            onPress={() => handleBuildingPress(building.id)}
            onLongPress={() => handleBuildingLongPress(building)}
            activeOpacity={0.7}
            delayLongPress={500}
          >
            <View style={styles.buildingHeader}>
              <View style={styles.buildingIcon}>
                <Text style={styles.buildingIconText}>🏢</Text>
              </View>
              <View style={styles.buildingInfo}>
                <Text style={styles.buildingName}>{building.name}</Text>
                <Text style={styles.buildingConfig}>
                  {building.floors} 层 · 每层 {building.roomsPerFloor} 间
                </Text>
              </View>
              <Text style={styles.buildingArrow}>›</Text>
            </View>
            {renderStatsBar(building.id)}
          </TouchableOpacity>
        ))}

        {/* 添加按钮 */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setAddModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>+ 添加楼房</Text>
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* ========== 操作菜单 Modal ========== */}
      <Modal
        visible={actionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setActionModalVisible(false)}
        >
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>{selectedBuilding?.name}</Text>
            <TouchableOpacity style={styles.actionItem} onPress={openEditModal}>
              <Text style={styles.actionItemText}>✏️  修改名称/层数/房间数</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionItemDanger]}
              onPress={handleDeleteBuilding}
            >
              <Text style={[styles.actionItemText, styles.actionItemTextDanger]}>🗑️  删除楼房</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionItemCancel]}
              onPress={() => setActionModalVisible(false)}
            >
              <Text style={styles.actionItemText}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ========== 添加楼房 Modal ========== */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.formSheet}>
            <Text style={styles.formTitle}>添加楼房</Text>

            <Text style={styles.inputLabel}>楼房名称</Text>
            <TextInput
              style={styles.textInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="例如：A栋、1号楼"
              placeholderTextColor="#B2BEC3"
            />

            <Text style={styles.inputLabel}>层数</Text>
            <TextInput
              style={styles.textInput}
              value={newFloors}
              onChangeText={setNewFloors}
              placeholder="例如：6"
              placeholderTextColor="#B2BEC3"
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>每层房间数</Text>
            <TextInput
              style={styles.textInput}
              value={newRoomsPerFloor}
              onChangeText={setNewRoomsPerFloor}
              placeholder="例如：10"
              placeholderTextColor="#B2BEC3"
              keyboardType="numeric"
            />

            <View style={styles.formButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setAddModalVisible(false);
                  setNewName('');
                  setNewFloors('');
                  setNewRoomsPerFloor('');
                }}
              >
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={handleAddBuilding}>
                <Text style={styles.confirmButtonText}>确认添加</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========== 编辑楼房 Modal ========== */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.formSheet}>
            <Text style={styles.formTitle}>修改楼房</Text>

            <Text style={styles.inputLabel}>楼房名称</Text>
            <TextInput
              style={styles.textInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="楼房名称"
              placeholderTextColor="#B2BEC3"
            />

            <Text style={styles.inputLabel}>层数</Text>
            <TextInput
              style={styles.textInput}
              value={editFloors}
              onChangeText={setEditFloors}
              placeholder="层数"
              placeholderTextColor="#B2BEC3"
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>每层房间数</Text>
            <TextInput
              style={styles.textInput}
              value={editRoomsPerFloor}
              onChangeText={setEditRoomsPerFloor}
              placeholder="每层房间数"
              placeholderTextColor="#B2BEC3"
              keyboardType="numeric"
            />

            <View style={styles.formButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={handleSaveEdit}>
                <Text style={styles.confirmButtonText}>保存修改</Text>
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
  // 头部
  header: {
    marginBottom: 20,
    paddingTop: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2D3436',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#636E72',
    marginTop: 4,
  },
  // 楼房卡片
  buildingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  buildingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  buildingIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#F0F0F3',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buildingIconText: {
    fontSize: 24,
  },
  buildingInfo: {
    flex: 1,
    marginLeft: 14,
  },
  buildingName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
  },
  buildingConfig: {
    fontSize: 13,
    color: '#636E72',
    marginTop: 2,
  },
  buildingArrow: {
    fontSize: 28,
    color: '#B2BEC3',
    fontWeight: '300',
  },
  // 统计栏
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E8E8EB',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3436',
  },
  occupiedValue: {
    color: '#00B894',
  },
  vacantValue: {
    color: '#6C63FF',
  },
  rateValue: {
    color: '#FDCB6E',
  },
  statLabel: {
    fontSize: 11,
    color: '#636E72',
    marginTop: 2,
  },
  // 添加按钮
  addButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  addButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bottomPadding: {
    height: 40,
  },
  // ========== Modal 通用 ==========
  modalOverlay: {
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
  actionItemDanger: {
    backgroundColor: '#FFF0F0',
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
  actionItemTextDanger: {
    color: '#FF6B6B',
  },
  // 表单弹窗
  formSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 34,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3436',
    textAlign: 'center',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#636E72',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#F0F0F3',
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: '#2D3436',
    marginBottom: 16,
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F0F0F3',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#636E72',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#6C63FF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
