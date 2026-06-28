import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { StorageService } from '@/utils/storage';
import { Building, Room, groupRoomsByFloor, getBuildingStats, getFloorLabel, generateRoomNumber, deriveFloorCount, deriveRoomsPerFloor, deriveFloorList } from '@/utils/roomTypes';
import { useFocusEffect } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { NetworkError, ApiError } from '@/utils/api';

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

  // 房间操作菜单（长按弹出：命名 / 删除）
  const [roomActionVisible, setRoomActionVisible] = useState(false);
  const [actionRoom, setActionRoom] = useState<Room | null>(null);

  // 添加房间弹窗
  const [addRoomVisible, setAddRoomVisible] = useState(false);
  const [addRoomFloor, setAddRoomFloor] = useState(0);
  const [addRoomNumber, setAddRoomNumber] = useState('');

  // 编辑楼房菜单
  const [editMenuVisible, setEditMenuVisible] = useState(false);

  // 编辑楼层号弹窗
  const [floorLabelModalVisible, setFloorLabelModalVisible] = useState(false);
  const [floorLabelDraft, setFloorLabelDraft] = useState<Record<number, string>>({});

  // 批量命名房间弹窗
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchNameDraft, setBatchNameDraft] = useState<Record<string, string>>({});

  // 单层标签编辑（双击楼层标题触发）
  const [singleFloorVisible, setSingleFloorVisible] = useState(false);
  const [editingFloor, setEditingFloor] = useState(0);
  const [singleFloorLabel, setSingleFloorLabel] = useState('');
  const lastTapRef = useRef<{ floor: number; time: number }>({ floor: 0, time: 0 });

  // 添加楼层中标志（防重复点击）
  const [addingFloor, setAddingFloor] = useState(false);

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

  // 是否只读（无写权限）
  const readOnly = building?.permission === 'read';

  // 长按房间 → 弹出操作菜单（命名/删除）
  const handleRoomLongPress = (room: Room) => {
    if (readOnly) {
      Alert.alert('权限不足', '你无法修改该用户的数据');
      return;
    }
    setActionRoom(room);
    setRoomActionVisible(true);
  };

  // 保存房间名称
  const handleSaveRoomName = async () => {
    if (!namingRoom) return;
    if (readOnly) {
      Alert.alert('权限不足', '你无法修改该用户的数据');
      return;
    }
    const updated: Room = { ...namingRoom, name: roomNewName.trim() };
    await StorageService.updateRoom(updated);
    setNameModalVisible(false);
    setNamingRoom(null);
    await loadData();
  };

  // 打开命名弹窗（从操作菜单）
  const openRenameFromAction = () => {
    if (!actionRoom) return;
    setNamingRoom(actionRoom);
    setRoomNewName(actionRoom.name);
    setRoomActionVisible(false);
    setTimeout(() => setNameModalVisible(true), 250);
  };

  // 删除房间
  const handleDeleteRoom = () => {
    if (!actionRoom) return;
    const room = actionRoom;
    setRoomActionVisible(false);

    if (room.isOccupied) {
      setTimeout(() => {
        Alert.alert('无法删除', `房间 ${room.number} 当前有租客入住，请先退租后再删除。`);
      }, 300);
      return;
    }

    setTimeout(() => {
      Alert.alert(
        '确认删除',
        `确定要删除 ${room.number}${room.name ? `（${room.name}）` : ''} 房间吗？此操作不可恢复。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '删除',
            style: 'destructive',
            onPress: async () => {
              await StorageService.deleteRoom(room.buildingId, room.id);
              Toast.show({ type: 'success', text1: `已删除 ${room.number} 房间` });
              await loadData();
            },
          },
        ]
      );
    }, 300);
  };

  // 打开添加房间弹窗（为指定楼层）
  const openAddRoom = (floor: number) => {
    if (readOnly) {
      Alert.alert('权限不足', '你无法修改该用户的数据');
      return;
    }
    setAddRoomFloor(floor);
    // 自动生成房间号：取该层已有最大编号 + 1
    const floorRooms = rooms.filter((r) => r.floor === floor);
    const maxNum = floorRooms.reduce((max, r) => {
      const n = parseInt(r.number, 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const nextNum = maxNum > 0 ? String(maxNum + 1) : `${floor}01`;
    setAddRoomNumber(nextNum);
    setAddRoomVisible(true);
  };

  // 确认添加房间
  const handleAddRoom = async () => {
    if (!buildingId || !addRoomFloor) return;
    const number = addRoomNumber.trim();
    if (!number) {
      Alert.alert('提示', '请输入房间号');
      return;
    }
    await StorageService.addRoom(buildingId, addRoomFloor, number);
    setAddRoomVisible(false);
    setAddRoomNumber('');
    Toast.show({ type: 'success', text1: `已在 ${getFloorLabel(building, addRoomFloor)} 楼添加 ${number} 房间` });
    await loadData();
  };

  // 打开编辑楼层号弹窗
  const openFloorLabelModal = () => {
    if (!building) return;
    const draft: Record<number, string> = {};
    // 用真实存在房间的楼层（删空层不再出现）
    for (const f of deriveFloorList(rooms)) {
      draft[f] = getFloorLabel(building, f);
    }
    setFloorLabelDraft(draft);
    setEditMenuVisible(false);
    setTimeout(() => setFloorLabelModalVisible(true), 250);
  };

  // 保存楼层号
  const handleSaveFloorLabels = async () => {
    if (!building) return;
    if (readOnly) {
      Alert.alert('权限不足', '你无法修改该用户的数据');
      return;
    }
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

  // 双击楼层标题 → 编辑该层标签（300ms 内连点两次）
  const onFloorTitleTap = (floor: number) => {
    if (readOnly) return;
    const now = Date.now();
    const last = lastTapRef.current;
    if (last.floor === floor && now - last.time < 300) {
      lastTapRef.current = { floor: 0, time: 0 };
      setEditingFloor(floor);
      setSingleFloorLabel(getFloorLabel(building, floor));
      setSingleFloorVisible(true);
    } else {
      lastTapRef.current = { floor, time: now };
    }
  };

  // 保存单层标签
  const handleSaveSingleFloor = async () => {
    if (!building) return;
    const labels: Record<number, string> = { ...(building.floorLabels ?? {}) };
    const trimmed = singleFloorLabel.trim();
    if (trimmed && trimmed !== String(editingFloor)) {
      labels[editingFloor] = trimmed;
    } else {
      delete labels[editingFloor]; // 留空或与默认相同 → 恢复默认
    }
    const updated: Building = { ...building, floorLabels: labels };
    try {
      await StorageService.updateBuilding(updated);
    } catch (e) {
      Toast.show({ type: 'error', text1: e instanceof NetworkError ? '连不上服务器' : '保存失败' });
      return;
    }
    setSingleFloorVisible(false);
    await loadData();
  };

  // 添加楼层：各层间数一致则沿用，否则提示去编辑楼房设置
  const handleAddFloor = async () => {
    if (!buildingId || readOnly || addingFloor) return;
    const rpf = deriveRoomsPerFloor(rooms);
    if (rpf == null) {
      Alert.alert(
        '每层房间数不一致',
        '当前各层房间数不同，无法确定新层间数。请在新层创建后用「+ 房间」逐间添加，或先统一各层房间数。',
        [
          { text: '取消', style: 'cancel' },
          { text: '加1间空层', onPress: () => doAddFloor(1) },
        ]
      );
      return;
    }
    doAddFloor(rpf);
  };

  const doAddFloor = async (count: number) => {
    if (!buildingId) return;
    setAddingFloor(true);
    try {
      await StorageService.addFloor(buildingId, count);
      await loadData();
      Toast.show({ type: 'success', text1: `已添加一层（${count} 间空房）` });
    } catch (e) {
      if (e instanceof NetworkError) Toast.show({ type: 'error', text1: '连不上服务器' });
      else if (e instanceof ApiError) Alert.alert('添加失败', e.message);
      else Toast.show({ type: 'error', text1: '添加楼层失败' });
    } finally {
      setAddingFloor(false);
    }
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
    if (readOnly) {
      Alert.alert('权限不足', '你无法修改该用户的数据');
      return;
    }
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* 顶部导航 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backText}>← 返回</Text>
          </TouchableOpacity>
          {!readOnly && (
            <TouchableOpacity onPress={() => setEditMenuVisible(true)} style={styles.editBuildingButton}>
              <Text style={styles.editBuildingText}>编辑楼房</Text>
            </TouchableOpacity>
          )}
          {readOnly && <View style={styles.editBuildingButton} />}
        </View>

        {/* 楼房信息 */}
        <View style={styles.buildingInfoCard}>
          <Text style={styles.buildingName}>{building.name}</Text>
          <Text style={styles.buildingConfig}>
            {(() => {
              const fc = deriveFloorCount(rooms);
              const rpf = deriveRoomsPerFloor(rooms);
              const base = rpf != null ? `${fc} 层 · 每层 ${rpf} 间` : `${fc} 层`;
              return `${base} · 共 ${stats.total} 间`;
            })()}
          </Text>
          {readOnly && (
            <View style={styles.readOnlyBadge}>
              <Text style={styles.readOnlyBadgeText}>只读 · 来自 {building.ownerUsername || '其他用户'}</Text>
            </View>
          )}
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
                <TouchableOpacity
                  style={styles.floorBadge}
                  onPress={() => onFloorTitleTap(floor)}
                  activeOpacity={readOnly ? 1 : 0.6}
                >
                  <Text style={styles.floorBadgeText}>{getFloorLabel(building, floor)} 楼</Text>
                </TouchableOpacity>
                <Text style={styles.floorInfo}>
                  {floorRooms.filter(r => r.isOccupied).length}/{floorRooms.length} 已入住
                </Text>
                {!readOnly && (
                  <TouchableOpacity
                    style={styles.addRoomBtn}
                    onPress={() => openAddRoom(floor)}
                    activeOpacity={0.7}
                  >
                    <FontAwesome6 name="plus" size={12} color="#6C63FF" />
                    <Text style={styles.addRoomBtnText}>房间</Text>
                  </TouchableOpacity>
                )}
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

        {!readOnly && (
          <TouchableOpacity
            style={styles.addFloorButton}
            onPress={handleAddFloor}
            activeOpacity={0.8}
            disabled={addingFloor}
          >
            <FontAwesome6 name="layer-group" size={14} color="#6C63FF" />
            <Text style={styles.addFloorButtonText}>
              {addingFloor ? '添加中…' : '+ 添加楼层'}
            </Text>
          </TouchableOpacity>
        )}

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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
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
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ========== 房间操作菜单 Modal（长按弹出） ========== */}
      <Modal
        visible={roomActionVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRoomActionVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setRoomActionVisible(false)}
        >
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>
              {actionRoom?.number}{actionRoom?.name ? ` · ${actionRoom.name}` : ''}
            </Text>
            <TouchableOpacity style={styles.actionItem} onPress={openRenameFromAction}>
              <Text style={styles.actionItemText}>✏️  命名房间</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionItemDanger]}
              onPress={handleDeleteRoom}
            >
              <Text style={[styles.actionItemText, styles.actionItemTextDanger]}>🗑️  删除房间</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionItemCancel]}
              onPress={() => setRoomActionVisible(false)}
            >
              <Text style={styles.actionItemText}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ========== 添加房间 Modal ========== */}
      <Modal
        visible={addRoomVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddRoomVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.nameModalContent}>
              <Text style={styles.nameModalTitle}>
                在 {building ? getFloorLabel(building, addRoomFloor) : addRoomFloor} 楼添加房间
              </Text>
              <Text style={styles.inputLabel}>房间号</Text>
              <TextInput
                style={styles.nameInput}
                value={addRoomNumber}
                onChangeText={setAddRoomNumber}
                placeholder="例如：801"
                placeholderTextColor="#B2BEC3"
                autoFocus
              />
              <View style={styles.nameModalButtons}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => { setAddRoomVisible(false); setAddRoomNumber(''); }}
                >
                  <Text style={styles.cancelBtnText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleAddRoom}>
                  <Text style={styles.saveBtnText}>添加</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.formSheet}>
              <Text style={styles.formTitle}>修改楼层号</Text>
              <Text style={styles.formHint}>设置每一层显示的楼层号（例如把第 1 层显示为「2」）</Text>
              <ScrollView
                style={styles.editList}
                keyboardShouldPersistTaps="handled"
              >
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
          </KeyboardAvoidingView>
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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.formSheet}>
            <Text style={styles.formTitle}>批量命名房间</Text>
            <Text style={styles.formHint}>留空则显示原房间号</Text>
            <ScrollView
                style={styles.editList}
                keyboardShouldPersistTaps="handled"
              >
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
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ========== 单层标签编辑 Modal（双击楼层标题触发）========== */}
      <Modal
        visible={singleFloorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSingleFloorVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.nameModalContent}>
              <Text style={styles.nameModalTitle}>修改第 {editingFloor} 层显示</Text>
              <Text style={{ fontSize: 13, color: '#636E72', marginBottom: 12, lineHeight: 18 }}>
                {'可填「停车层」「B1」等文字；留空恢复默认编号'}
              </Text>
              <TextInput
                style={styles.nameInput}
                value={singleFloorLabel}
                onChangeText={setSingleFloorLabel}
                placeholder={`第 ${editingFloor} 层`}
                placeholderTextColor="#B2BEC3"
                autoFocus
              />
              <View style={styles.nameModalButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setSingleFloorVisible(false)}>
                  <Text style={styles.cancelBtnText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSingleFloor}>
                  <Text style={styles.saveBtnText}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
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
  addFloorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#6C63FF',
    borderStyle: 'dashed',
    backgroundColor: '#F8F7FF',
  },
  addFloorButtonText: {
    fontSize: 15,
    color: '#6C63FF',
    fontWeight: '700',
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
  readOnlyBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  readOnlyBadgeText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
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
  // 楼层添加房间按钮
  addRoomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
  },
  addRoomBtnText: {
    fontSize: 12,
    color: '#6C63FF',
    fontWeight: '700',
  },
  // 输入标签
  inputLabel: {
    fontSize: 13,
    color: '#636E72',
    marginBottom: 8,
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
  actionItemDanger: {
    backgroundColor: '#FFF0F0',
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
