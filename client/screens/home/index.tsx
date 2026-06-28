import { useEffect, useState, useCallback, useRef } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { StorageService } from '@/utils/storage';
import { Building, Room, getBuildingStats, deriveFloorCount, deriveRoomsPerFloor } from '@/utils/roomTypes';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { FontAwesome6 } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import {
  requestAccess, getInbox, respondRequest, getGrantees,
  setGranteeWrite, revokeGrantee, type AccessRequestItem, type GranteeItem,
} from '@/utils/comm';
import { NetworkError, ApiError } from '@/utils/api';
import { listAccounts, removeAccount, type SavedAccount } from '@/utils/accounts';

export default function HomeScreen() {
  const router = useSafeRouter();
  const { user, logout, switchAccount } = useAuth();
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  // 切换账号
  const [switchVisible, setSwitchVisible] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [switching, setSwitching] = useState(false);
  // 通讯相关
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [requestUsername, setRequestUsername] = useState('');
  const [inboxVisible, setInboxVisible] = useState(false);
  const [inboxList, setInboxList] = useState<AccessRequestItem[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [granteeVisible, setGranteeVisible] = useState(false);
  const [granteeList, setGranteeList] = useState<GranteeItem[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingStats, setBuildingStats] = useState<Map<string, { total: number; occupied: number; vacant: number; floorCount: number; roomsPerFloor: number | null }>>(new Map());
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
  // 记录打开弹窗时的初始值，保存时只发送真正改动的字段（避免误删未改字段对应的房间）
  const [editInitial, setEditInitial] = useState<{ floors: string; rpf: string }>({ floors: '', rpf: '' });

  // 操作菜单
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);

  const loadData = useCallback(async () => {
    const blds = await StorageService.loadBuildings();
    setBuildings(blds);

    const stats = new Map<string, { total: number; occupied: number; vacant: number; floorCount: number; roomsPerFloor: number | null }>();
    for (const b of blds) {
      const rooms = await StorageService.loadRooms(b.id);
      stats.set(b.id, {
        ...getBuildingStats(rooms, b.id),
        floorCount: deriveFloorCount(rooms),
        roomsPerFloor: deriveRoomsPerFloor(rooms),
      });
    }
    setBuildingStats(stats);

    // 拉取待处理申请数（失败不影响主流程）
    try {
      const reqs = await getInbox();
      setInboxCount(reqs.length);
    } catch {
      // 离线/网络错误，忽略
    }
  }, []);

  // ---- 消息轮询：每 30 秒检查是否有新申请 ----
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevInboxCountRef = useRef(inboxCount);

  // 保持 ref 与最新 inboxCount 同步
  useEffect(() => {
    prevInboxCountRef.current = inboxCount;
  }, [inboxCount]);

  const pollInbox = useCallback(async () => {
    try {
      const reqs = await getInbox();
      const newCount = reqs.length;
      const prevCount = prevInboxCountRef.current;
      if (newCount > prevCount) {
        // 有新申请到达，自动刷新数据并提示
        setInboxCount(newCount);
        await loadData();
        Toast.show({
          type: 'info',
          text1: '收到新的查看申请',
          text2: `您有 ${newCount} 条待处理申请`,
        });
      } else if (newCount !== prevCount) {
        // 数量减少（可能是被处理了），仅更新数字
        setInboxCount(newCount);
      }
    } catch {
      // 离线/网络错误，静默忽略
    }
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      // 启动 30 秒轮询
      pollIntervalRef.current = setInterval(pollInbox, 30000);
      return () => {
        // 离开页面时清除轮询
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }, [loadData, pollInbox])
  );

  // ---- 通讯：申请查看 ----
  const submitRequest = async () => {
    const name = requestUsername.trim();
    if (!name) {
      Toast.show({ type: 'error', text1: '请输入对方用户名' });
      return;
    }
    try {
      await requestAccess(name);
      setRequestModalVisible(false);
      setRequestUsername('');
      Toast.show({ type: 'success', text1: '申请已发送', text2: `等待 ${name} 同意` });
    } catch (e) {
      let msg = '申请失败';
      if (e instanceof NetworkError) msg = '连不上服务器';
      else if (e instanceof ApiError) msg = e.message;
      Toast.show({ type: 'error', text1: msg });
    }
  };

  // ---- 通讯：消息箱 ----
  const openInbox = async () => {
    try {
      const reqs = await getInbox();
      setInboxList(reqs);
      setInboxCount(reqs.length);
      setInboxVisible(true);
    } catch (e) {
      const msg = e instanceof NetworkError ? '连不上服务器' : '加载消息失败';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  const handleRespond = async (item: AccessRequestItem, approve: boolean) => {
    try {
      await respondRequest(item.id, approve);
      const left = inboxList.filter((x) => x.id !== item.id);
      setInboxList(left);
      setInboxCount(left.length);
      if (approve) {
        Toast.show({
          type: 'success',
          text1: '已同意',
          text2: `${item.requesterUsername} 现可查看（默认只读）`,
        });
      } else {
        Toast.show({ type: 'success', text1: '已拒绝' });
      }
      loadData();
    } catch (e) {
      const msg = e instanceof NetworkError ? '连不上服务器' : '操作失败';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  // ---- 通讯：编辑申请人权限 ----
  const openGranteeEditor = async () => {
    setUserMenuVisible(false);
    try {
      const list = await getGrantees();
      setGranteeList(list);
      setGranteeVisible(true);
    } catch (e) {
      const msg = e instanceof NetworkError ? '连不上服务器' : '加载失败';
      Toast.show({ type: 'error', text1: msg });
    }
  };

  // 切换某被授权人写权限：开启前弹窗确认
  const toggleGranteeWrite = (item: GranteeItem) => {
    const target = !item.canWrite;
    const apply = async () => {
      try {
        await setGranteeWrite(item.granteeId, target);
        setGranteeList((prev) =>
          prev.map((g) => (g.granteeId === item.granteeId ? { ...g, canWrite: target } : g))
        );
      } catch (e) {
        const msg = e instanceof NetworkError ? '连不上服务器' : '保存失败';
        Toast.show({ type: 'error', text1: msg });
      }
    };
    if (target) {
      // 开启写权限（管理员）前确认
      Alert.alert(
        '确认授予管理员权限',
        `是否提供给 <${item.granteeUsername}> 管理员权限？\n\n（管理员可修改、甚至删除你的楼房数据）`,
        [
          { text: '取消', style: 'cancel' },
          { text: '确认授予', onPress: apply },
        ]
      );
    } else {
      apply();
    }
  };

  const handleRevokeGrantee = (item: GranteeItem) => {
    Alert.alert('撤销授权', `确定撤销 ${item.granteeUsername} 的查看权限吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '撤销',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeGrantee(item.granteeId);
            setGranteeList((prev) => prev.filter((g) => g.granteeId !== item.granteeId));
          } catch (e) {
            const msg = e instanceof NetworkError ? '连不上服务器' : '撤销失败';
            Toast.show({ type: 'error', text1: msg });
          }
        },
      },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // 进入楼房管理
  const handleBuildingPress = (buildingId: string) => {
    router.push('/building', { buildingId });
  };

  // 退出登录 / 切换账号（都回到登录页；区别仅在确认文案）
  const handleLogout = () => {
    setUserMenuVisible(false);
    Alert.alert('退出登录', '确定要退出当前账号吗？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: () => { logout(); } },
    ]);
  };

  const handleSwitchAccount = async () => {
    setUserMenuVisible(false);
    const accounts = await listAccounts();
    setSavedAccounts(accounts);
    setTimeout(() => setSwitchVisible(true), 250);
  };

  // 免密切换到某账号；token 失效仅提示（不自动跳登录页）
  const doSwitchAccount = async (account: SavedAccount) => {
    if (account.username === user?.username) {
      setSwitchVisible(false);
      return;
    }
    setSwitching(true);
    try {
      await switchAccount(account);
      setSwitchVisible(false);
      Toast.show({ type: 'success', text1: `已切换到 ${account.username}` });
    } catch (e) {
      if (e instanceof NetworkError) {
        Toast.show({ type: 'error', text1: '连不上该账号的服务器，请检查网络' });
      } else if (e instanceof ApiError) {
        Toast.show({
          type: 'error',
          text1: '该账号登录已过期',
          text2: '请退出后用该账号重新登录',
        });
      } else {
        Toast.show({ type: 'error', text1: '切换失败' });
      }
    } finally {
      setSwitching(false);
    }
  };

  // 从本地账号簿移除某账号
  const doRemoveAccount = (account: SavedAccount) => {
    Alert.alert(
      '移除账号',
      `确定把「${account.username}」从本设备账号簿移除吗？\n（不影响服务器账号，只是本机不再保存其登录）`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '移除',
          style: 'destructive',
          onPress: async () => {
            await removeAccount(account.username, account.serverUrl);
            setSavedAccounts(await listAccounts());
          },
        },
      ],
    );
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
    // 用真实推导值填充（删空层/加房后存储字段可能陈旧）
    const st = buildingStats.get(selectedBuilding.id);
    const fStr = String(st?.floorCount ?? selectedBuilding.floors);
    const rStr = String(st?.roomsPerFloor ?? selectedBuilding.roomsPerFloor);
    setEditFloors(fStr);
    setEditRoomsPerFloor(rStr);
    setEditInitial({ floors: fStr, rpf: rStr });
    setActionModalVisible(false);
    setTimeout(() => setEditModalVisible(true), 300);
  };

  // 删除楼房
  const handleDeleteBuilding = () => {
    if (!selectedBuilding) return;
    const b = selectedBuilding;
    setActionModalVisible(false);

    if (b.permission === 'read') {
      setTimeout(() => {
        Alert.alert('权限不足', '你无法修改该用户的数据');
      }, 300);
      return;
    }

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

    if (editingBuilding.permission === 'read') {
      Alert.alert('权限不足', '你无法修改该用户的数据');
      return;
    }

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
    // 只发送真正改动的字段：未改的传 undefined，服务端就不会动对应房间（修复"只改层数误删各层尾部房间"）
    const floorsArg = editFloors !== editInitial.floors ? floors : undefined;
    const rpfArg = editRoomsPerFloor !== editInitial.rpf ? roomsPerFloor : undefined;
    try {
      await StorageService.updateBuilding(updated, floorsArg, rpfArg);
    } catch (e) {
      // C 策略：缩减时被波及房间有租客 → 服务端 409
      if (e instanceof ApiError) {
        Alert.alert('无法修改', e.message);
        return;
      }
      if (e instanceof NetworkError) {
        Toast.show({ type: 'error', text1: '连不上服务器' });
        return;
      }
      Toast.show({ type: 'error', text1: '保存失败' });
      return;
    }
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* 标题 */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>房屋管家</Text>
              <Text style={styles.headerSubtitle}>
                {buildings.length === 0 ? '点击下方按钮添加楼房' : `共管理 ${buildings.length} 栋楼房`}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setUserMenuVisible(true)} style={styles.userChip} activeOpacity={0.7}>
              <FontAwesome6 name="circle-user" size={16} color="#6C63FF" />
              <Text style={styles.userChipText} numberOfLines={1}>
                {user?.username || '未登录'}
              </Text>
              <FontAwesome6 name="chevron-down" size={10} color="#636E72" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 通讯栏：申请查看他人楼房 + 消息 */}
        <View style={styles.commBar}>
          <TouchableOpacity style={styles.commBtn} onPress={() => setRequestModalVisible(true)} activeOpacity={0.7}>
            <FontAwesome6 name="magnifying-glass" size={13} color="#6C63FF" />
            <Text style={styles.commBtnText}>申请查看他人楼房</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.commBtn, inboxCount > 0 && styles.commBtnAlert]}
            onPress={openInbox}
            activeOpacity={0.7}
          >
            <FontAwesome6 name="envelope" size={13} color={inboxCount > 0 ? '#FFFFFF' : '#636E72'} />
            <Text style={[styles.commBtnText, inboxCount > 0 && { color: '#FFFFFF' }]}>
              消息{inboxCount > 0 ? ` (${inboxCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 楼房列表 */}
        {buildings.map((building) => {
          const isMine = !building.permission || building.permission === 'owner';
          return (
          <TouchableOpacity
            key={building.id}
            style={[styles.buildingCard, !isMine && styles.buildingCardOther]}
            onPress={() => handleBuildingPress(building.id)}
            onLongPress={() => handleBuildingLongPress(building)}
            activeOpacity={0.7}
            delayLongPress={500}
          >
            {!isMine && (
              <View style={styles.otherTag}>
                <FontAwesome6 name="users" size={10} color="#E17055" />
                <Text style={styles.otherTagText}>
                  来自 {building.ownerUsername || '?'} · {building.permission === 'read' ? '只读' : '可编辑'}
                </Text>
              </View>
            )}
            <View style={styles.buildingHeader}>
              <View style={styles.buildingIcon}>
                <Text style={styles.buildingIconText}>🏢</Text>
              </View>
              <View style={styles.buildingInfo}>
                <Text style={styles.buildingName}>{building.name}</Text>
                <Text style={styles.buildingConfig}>
                  {(() => {
                    const st = buildingStats.get(building.id);
                    const fc = st?.floorCount ?? 0;
                    const rpf = st?.roomsPerFloor;
                    return rpf != null ? `${fc} 层 · 每层 ${rpf} 间` : `${fc} 层`;
                  })()}
                </Text>
              </View>
              <Text style={styles.buildingArrow}>›</Text>
            </View>
            {renderStatsBar(building.id)}
          </TouchableOpacity>
          );
        })}

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
            {selectedBuilding?.permission !== 'read' && (
              <>
                <TouchableOpacity style={styles.actionItem} onPress={openEditModal}>
                  <Text style={styles.actionItemText}>✏️  修改名称/层数/房间数</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionItem, styles.actionItemDanger]}
                  onPress={handleDeleteBuilding}
                >
                  <Text style={[styles.actionItemText, styles.actionItemTextDanger]}>🗑️  删除楼房</Text>
                </TouchableOpacity>
              </>
            )}
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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
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
            </ScrollView>
          </KeyboardAvoidingView>
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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <View style={styles.formSheet}>
                <Text style={styles.formTitle}>修改楼房</Text>
                <Text style={{ fontSize: 12, color: '#E17055', marginBottom: 12, lineHeight: 17 }}>
                  {'注意：修改层数/每层房间数会把所有楼层重整为统一间数；缩减时若被波及的房间有租客将被拒绝。日常增减建议进入楼房后用「+ 添加楼层」「+ 房间」及删除房间。'}
                </Text>

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
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 用户菜单：切换账号 / 退出登录 */}
      <Modal
        visible={userMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUserMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setUserMenuVisible(false)}
        >
          <View style={styles.actionSheet}>
            <View style={styles.userMenuHeader}>
              <FontAwesome6 name="circle-user" size={28} color="#6C63FF" />
              <Text style={styles.userMenuName}>{user?.username || '未登录'}</Text>
              <Text style={styles.userMenuHint}>当前登录账号</Text>
            </View>
            <TouchableOpacity style={[styles.actionItem, styles.userMenuItem]} onPress={openGranteeEditor}>
              <FontAwesome6 name="user-gear" size={15} color="#2D3436" />
              <Text style={styles.actionItemText}>编辑申请人权限</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionItem, styles.userMenuItem]} onPress={handleSwitchAccount}>
              <FontAwesome6 name="arrows-rotate" size={15} color="#2D3436" />
              <Text style={styles.actionItemText}>切换账号</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.userMenuItem, styles.actionItemDanger]}
              onPress={handleLogout}
            >
              <FontAwesome6 name="right-from-bracket" size={15} color="#E74C3C" />
              <Text style={[styles.actionItemText, styles.actionItemTextDanger]}>退出登录</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionItemCancel]}
              onPress={() => setUserMenuVisible(false)}
            >
              <Text style={styles.actionItemText}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 切换账号：列出本设备登录过的账号，点选免密切换 */}
      <Modal
        visible={switchVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSwitchVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => !switching && setSwitchVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.actionSheet}>
            <View style={styles.userMenuHeader}>
              <FontAwesome6 name="users" size={26} color="#6C63FF" />
              <Text style={styles.userMenuName}>切换账号</Text>
              <Text style={styles.userMenuHint}>30 天内免密切换登录过的账号</Text>
            </View>

            {savedAccounts.length === 0 && (
              <Text style={styles.switchEmpty}>暂无已保存的账号</Text>
            )}

            {savedAccounts.map((acc) => {
              const isCurrent = acc.username === user?.username;
              return (
                <View key={`${acc.username}@${acc.serverUrl}`} style={styles.switchRow}>
                  <TouchableOpacity
                    style={styles.switchRowMain}
                    disabled={isCurrent || switching}
                    onPress={() => doSwitchAccount(acc)}
                  >
                    <FontAwesome6
                      name={isCurrent ? 'circle-check' : 'circle-user'}
                      size={20}
                      color={isCurrent ? '#6C63FF' : '#636E72'}
                    />
                    <View style={styles.switchRowText}>
                      <Text style={[styles.switchRowName, isCurrent && styles.switchRowNameCurrent]}>
                        {acc.username}{isCurrent ? '（当前）' : ''}
                      </Text>
                      <Text style={styles.switchRowServer} numberOfLines={1}>{acc.serverUrl}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.switchRemoveBtn}
                    disabled={switching}
                    onPress={() => doRemoveAccount(acc)}
                  >
                    <FontAwesome6 name="trash-can" size={15} color="#E74C3C" />
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity
              style={[styles.actionItem, styles.userMenuItem]}
              disabled={switching}
              onPress={() => { setSwitchVisible(false); logout(); }}
            >
              <FontAwesome6 name="plus" size={15} color="#6C63FF" />
              <Text style={[styles.actionItemText, { color: '#6C63FF' }]}>登录其他账号</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionItemCancel]}
              disabled={switching}
              onPress={() => setSwitchVisible(false)}
            >
              <Text style={styles.actionItemText}>{switching ? '切换中…' : '取消'}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 申请查看他人楼房 */}
      <Modal
        visible={requestModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRequestModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>申请查看他人楼房</Text>
              <Text style={styles.modalDesc}>输入对方用户名，对方同意后你可查看其全部楼房</Text>
              <TextInput
                style={styles.modalInput}
                value={requestUsername}
                onChangeText={setRequestUsername}
                placeholder="对方的用户名"
                placeholderTextColor="#B2BEC3"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                  onPress={() => { setRequestModalVisible(false); setRequestUsername(''); }}
                >
                  <Text style={styles.modalBtnCancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={submitRequest}>
                  <Text style={styles.modalBtnPrimaryText}>发送申请</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 消息箱：待处理申请 */}
      <Modal
        visible={inboxVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInboxVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitle}>消息 · 待处理申请</Text>
            {inboxList.length === 0 ? (
              <Text style={styles.emptyHint}>暂无待处理申请</Text>
            ) : (
              inboxList.map((item) => (
                <View key={item.id} style={styles.inboxItem}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <FontAwesome6 name="circle-user" size={13} color="#6C63FF" />
                      <Text style={styles.inboxName}>{item.requesterUsername}</Text>
                    </View>
                    <Text style={styles.inboxDesc}>申请查看你的全部楼房</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.inboxBtn, { backgroundColor: '#00B894' }]}
                    onPress={() => handleRespond(item, true)}
                  >
                    <Text style={styles.inboxBtnText}>同意</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.inboxBtn, { backgroundColor: '#E74C3C' }]}
                    onPress={() => handleRespond(item, false)}
                  >
                    <Text style={styles.inboxBtnText}>拒绝</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <TouchableOpacity
              style={[styles.actionItem, styles.actionItemCancel]}
              onPress={() => setInboxVisible(false)}
            >
              <Text style={styles.actionItemText}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 编辑申请人权限 */}
      <Modal
        visible={granteeVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGranteeVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheetCard}>
            <Text style={styles.modalTitle}>编辑申请人权限</Text>
            <Text style={styles.modalDesc}>
              读权限默认开启；开启「写权限」即授予管理员权限（可改可删）
            </Text>
            {granteeList.length === 0 ? (
              <Text style={styles.emptyHint}>还没有人被你授权查看</Text>
            ) : (
              granteeList.map((g) => (
                <View key={g.granteeId} style={styles.granteeItem}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <FontAwesome6 name="circle-user" size={13} color="#6C63FF" />
                      <Text style={styles.inboxName}>{g.granteeUsername}</Text>
                    </View>
                    <Text style={styles.inboxDesc}>✓ 读权限（默认）</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.writeToggle, g.canWrite && styles.writeToggleOn]}
                    onPress={() => toggleGranteeWrite(g)}
                  >
                    <Text style={[styles.writeToggleText, g.canWrite && { color: '#FFFFFF' }]}>
                      {g.canWrite ? '✓ 写权限' : '写权限'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRevokeGrantee(g)} style={styles.revokeBtn}>
                    <Text style={styles.revokeText}>撤销</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <TouchableOpacity
              style={[styles.actionItem, styles.actionItemCancel]}
              onPress={() => setGranteeVisible(false)}
            >
              <Text style={styles.actionItemText}>关闭</Text>
            </TouchableOpacity>
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
  // 通讯栏
  commBar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  commBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8EB',
  },
  commBtnAlert: {
    backgroundColor: '#FDCB6E',
    borderColor: '#FDCB6E',
  },
  commBtnText: {
    fontSize: 13,
    color: '#636E72',
    fontWeight: '600',
  },
  // 他人楼房标识
  buildingCardOther: {
    borderWidth: 1.5,
    borderColor: '#FAB1A0',
  },
  otherTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  otherTagText: {
    fontSize: 12,
    color: '#E17055',
    fontWeight: '600',
  },
  // 通用弹窗
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    marginHorizontal: 32,
    alignSelf: 'center',
    width: '82%',
  },
  sheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    marginTop: 'auto',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 13,
    color: '#636E72',
    marginBottom: 14,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E8EB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2D3436',
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: '#F0F0F3',
  },
  modalBtnCancelText: {
    color: '#636E72',
    fontWeight: '600',
  },
  modalBtnPrimary: {
    backgroundColor: '#6C63FF',
  },
  modalBtnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 14,
    color: '#B2BEC3',
    textAlign: 'center',
    paddingVertical: 30,
  },
  inboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F3',
  },
  inboxName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3436',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inboxDesc: {
    fontSize: 12,
    color: '#636E72',
    marginTop: 2,
  },
  inboxBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  inboxBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  granteeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F3',
  },
  writeToggle: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F0F0F3',
    borderWidth: 1,
    borderColor: '#E8E8EB',
  },
  writeToggleOn: {
    backgroundColor: '#6C63FF',
    borderColor: '#6C63FF',
  },
  writeToggleText: {
    fontSize: 13,
    color: '#636E72',
    fontWeight: '600',
  },
  revokeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  revokeText: {
    fontSize: 13,
    color: '#E74C3C',
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
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8EB',
    maxWidth: 140,
  },
  userChipText: {
    fontSize: 13,
    color: '#2D3436',
    fontWeight: '600',
    flexShrink: 1,
  },
  userMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  userMenuHeader: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F3',
    marginBottom: 8,
  },
  userMenuName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
    marginTop: 8,
  },
  userMenuHint: {
    fontSize: 12,
    color: '#B2BEC3',
    marginTop: 2,
  },
  // 切换账号
  switchEmpty: {
    fontSize: 14,
    color: '#B2BEC3',
    textAlign: 'center',
    paddingVertical: 24,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F3',
  },
  switchRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 12,
  },
  switchRowText: {
    flex: 1,
  },
  switchRowName: {
    fontSize: 16,
    color: '#2D3436',
    fontWeight: '600',
  },
  switchRowNameCurrent: {
    color: '#6C63FF',
  },
  switchRowServer: {
    fontSize: 12,
    color: '#B2BEC3',
    marginTop: 2,
  },
  switchRemoveBtn: {
    padding: 12,
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
