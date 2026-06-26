import AsyncStorage from '@react-native-async-storage/async-storage';
import { Building, Room, generateId, generateBuildingRooms } from './roomTypes';
import { apiRequest, NetworkError } from './api';
import { enqueueRoomUpdate, flushOutbox } from './sync';
import { isOnline, scheduleProbe } from './netstatus';

// ============================================================
// 存储服务（本地主库版：在线为主 + 离线完整可用）
//
// 对外接口与原本地版本完全一致，三个界面无需改动。
// 内部策略：
//   - 读：优先连主库(server)，断网时回退本地缓存
//   - 写（含增删楼房/房间这类结构性操作）：
//       · 已知离线时「短路」直接走本地，不发请求、零等待
//       · 在线时正常推主库；若此刻才发现断网(NetworkError)则降级本地
//   - 离线期间后台低频探测主库是否恢复（scheduleProbe）
//
// 重要语义（与产品约定一致）：
//   离线期间的本地改动「不回传」主库。重新连上主库后，
//   loadBuildings/loadRooms 会以主库数据覆盖本地缓存
//   —— 即「以本机主库为准」，避免手机离线改动覆盖权威数据。
//   （房间内容的轻量改动仍走 sync.ts 的 outbox 重放，幂等安全。）
// ============================================================

const BUILDINGS_KEY = 'house_buildings_data';
const ROOMS_KEY_PREFIX = 'house_rooms_';

// ============================================================
// onlineFirst：统一的「在线优先 / 离线短路」执行器
//   - 已知离线：立即执行 localFn（零等待），并触发后台探测
//   - 在线：执行 onlineFn；若抛 NetworkError 则降级 localFn
//   - 其它错误（ApiError 等）照常抛出
// ============================================================
async function onlineFirst<T>(onlineFn: () => Promise<T>, localFn: () => Promise<T>): Promise<T> {
  if (!isOnline()) {
    scheduleProbe();        // 后台试探主库是否恢复，不阻塞
    return localFn();
  }
  try {
    return await onlineFn();
  } catch (e) {
    if (e instanceof NetworkError) {
      scheduleProbe();
      return localFn();
    }
    throw e;
  }
}

// ---- 本地缓存读写 ----
async function cacheGetBuildings(): Promise<Building[]> {
  try {
    const data = await AsyncStorage.getItem(BUILDINGS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}
async function cacheSetBuildings(buildings: Building[]): Promise<void> {
  try { await AsyncStorage.setItem(BUILDINGS_KEY, JSON.stringify(buildings)); } catch {}
}
function roomsKey(buildingId: string) { return ROOMS_KEY_PREFIX + buildingId; }
async function cacheGetRooms(buildingId: string): Promise<Room[]> {
  try {
    const data = await AsyncStorage.getItem(roomsKey(buildingId));
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}
async function cacheSetRooms(buildingId: string, rooms: Room[]): Promise<void> {
  try { await AsyncStorage.setItem(roomsKey(buildingId), JSON.stringify(rooms)); } catch {}
}

// ============================================================
// Building
// ============================================================

async function loadBuildings(): Promise<Building[]> {
  return onlineFirst(
    async () => {
      const data = await apiRequest<{ buildings: Building[] }>('/buildings');
      await cacheSetBuildings(data.buildings);
      return data.buildings;
    },
    () => cacheGetBuildings(), // 离线兜底
  );
}

// 兼容旧接口：整体保存（现在只更新本地缓存，server 由各操作单独同步）
async function saveBuildings(buildings: Building[]): Promise<void> {
  await cacheSetBuildings(buildings);
}

async function addBuilding(name: string, floors: number, roomsPerFloor: number): Promise<Building> {
  // 结构性操作：在线让主库统一生成房间；离线则本地生成（零等待）
  return onlineFirst(
    async () => {
      const data = await apiRequest<{ building: Building }>('/buildings', {
        method: 'POST',
        body: { name, floors, roomsPerFloor },
      });
      const building = data.building;

      // 拉取该楼详情，缓存其房间
      try {
        const detail = await apiRequest<{ building: Building; rooms: Room[] }>(`/buildings/${building.id}`);
        await cacheSetRooms(building.id, detail.rooms);
      } catch {}

      // 更新楼房列表缓存
      const list = await cacheGetBuildings();
      list.push(building);
      await cacheSetBuildings(list);
      return building;
    },
    () => addBuildingLocal(name, floors, roomsPerFloor),
  );
}

// 离线本地建楼：生成楼房与各层房间，写入缓存
async function addBuildingLocal(name: string, floors: number, roomsPerFloor: number): Promise<Building> {
  const building: Building = {
    id: generateId('bld'),
    name,
    floors,
    roomsPerFloor,
    createdAt: new Date().toISOString(),
    permission: 'owner',
  };
  const rooms = generateBuildingRooms(building);
  await cacheSetRooms(building.id, rooms);
  const list = await cacheGetBuildings();
  list.push(building);
  await cacheSetBuildings(list);
  return building;
}

async function updateBuilding(
  building: Building,
  newFloors?: number,
  newRoomsPerFloor?: number
): Promise<void> {
  const body: any = {
    name: building.name,
    floorLabels: building.floorLabels,
  };
  if (newFloors !== undefined) body.floors = newFloors;
  if (newRoomsPerFloor !== undefined) body.roomsPerFloor = newRoomsPerFloor;

  return onlineFirst(
    async () => {
      await apiRequest(`/buildings/${building.id}`, { method: 'PUT', body });

      // 刷新该楼房间缓存（服务端可能补了房间）
      try {
        const detail = await apiRequest<{ building: Building; rooms: Room[] }>(`/buildings/${building.id}`);
        await cacheSetRooms(building.id, detail.rooms);
        // 同步更新楼房列表缓存里的这条
        const list = await cacheGetBuildings();
        const idx = list.findIndex((b) => b.id === building.id);
        if (idx !== -1) list[idx] = detail.building;
        await cacheSetBuildings(list);
      } catch {}
    },
    () => updateBuildingLocal(building, newFloors, newRoomsPerFloor),
  );
}

// 离线本地改楼：更新楼房元数据；层数/每层数变化时按规则重算房间（保留已有房间）
async function updateBuildingLocal(
  building: Building,
  newFloors?: number,
  newRoomsPerFloor?: number
): Promise<void> {
  const list = await cacheGetBuildings();
  const idx = list.findIndex((b) => b.id === building.id);

  const merged: Building = {
    ...(idx !== -1 ? list[idx] : building),
    name: building.name,
    floorLabels: building.floorLabels,
  };
  if (newFloors !== undefined) merged.floors = newFloors;
  if (newRoomsPerFloor !== undefined) merged.roomsPerFloor = newRoomsPerFloor;

  if (idx !== -1) list[idx] = merged; else list.push(merged);
  await cacheSetBuildings(list);

  // 结构变化时重算房间：保留 floor/number 命中的旧房间，缺的补新房
  if (newFloors !== undefined || newRoomsPerFloor !== undefined) {
    const existing = await cacheGetRooms(building.id);
    const rebuilt = generateBuildingRooms(merged, existing);
    await cacheSetRooms(building.id, rebuilt);
  }
}

async function deleteBuilding(buildingId: string): Promise<void> {
  const removeLocal = async () => {
    const list = await cacheGetBuildings();
    await cacheSetBuildings(list.filter((b) => b.id !== buildingId));
    await AsyncStorage.removeItem(roomsKey(buildingId));
  };
  return onlineFirst(
    async () => {
      await apiRequest(`/buildings/${buildingId}`, { method: 'DELETE' });
      await removeLocal();
    },
    removeLocal,
  );
}

// ============================================================
// Room
// ============================================================

async function loadRooms(buildingId: string): Promise<Room[]> {
  return onlineFirst(
    async () => {
      const data = await apiRequest<{ rooms: Room[] }>(`/buildings/${buildingId}`);
      await cacheSetRooms(buildingId, data.rooms);
      return data.rooms;
    },
    () => cacheGetRooms(buildingId), // 离线兜底
  );
}

async function saveRoomsForBuilding(buildingId: string, rooms: Room[]): Promise<void> {
  await cacheSetRooms(buildingId, rooms);
}

// 改房间：乐观更新缓存 → 在线推 server / 离线直接入队（零等待）
async function updateRoom(updatedRoom: Room): Promise<Room[]> {
  // 1. 乐观更新本地缓存
  const rooms = await cacheGetRooms(updatedRoom.buildingId);
  const idx = rooms.findIndex((r) => r.id === updatedRoom.id);
  if (idx !== -1) rooms[idx] = updatedRoom;
  await cacheSetRooms(updatedRoom.buildingId, rooms);

  // 2. 推送 server（离线则短路入队，不发请求）
  await onlineFirst(
    async () => { await apiRequest(`/rooms/${updatedRoom.id}`, { method: 'PUT', body: updatedRoom }); },
    async () => { await enqueueRoomUpdate(updatedRoom); }, // 离线入队，联网后重放
  );
  return rooms;
}

async function batchUpdateRooms(
  buildingId: string,
  updates: { id: string; name: string }[]
): Promise<Room[]> {
  const rooms = await cacheGetRooms(buildingId);
  const updateMap = new Map(updates.map((u) => [u.id, u.name]));
  const changed: Room[] = [];
  for (const room of rooms) {
    if (updateMap.has(room.id)) {
      room.name = updateMap.get(room.id)!;
      changed.push(room);
    }
  }
  await cacheSetRooms(buildingId, rooms); // 乐观更新

  // 逐个推送（离线则短路入队，整批零等待）
  for (const room of changed) {
    await onlineFirst(
      async () => { await apiRequest(`/rooms/${room.id}`, { method: 'PUT', body: room }); },
      async () => { await enqueueRoomUpdate(room); },
    );
  }
  return rooms;
}

async function addRoom(buildingId: string, floor: number, number: string): Promise<Room> {
  const makeLocal = async (): Promise<Room> => {
    const room: Room = {
      id: generateId('room'),
      buildingId,
      floor,
      number,
      name: '',
      isOccupied: false,
      tenantName: '',
      monthlyRent: 0,
    };
    const rooms = await cacheGetRooms(buildingId);
    rooms.push(room);
    await cacheSetRooms(buildingId, rooms);
    return room;
  };
  return onlineFirst(
    async () => {
      const data = await apiRequest<{ room: Room }>(`/buildings/${buildingId}/rooms`, {
        method: 'POST',
        body: { floor, number },
      });
      const rooms = await cacheGetRooms(buildingId);
      rooms.push(data.room);
      await cacheSetRooms(buildingId, rooms);
      return data.room;
    },
    makeLocal,
  );
}

async function deleteRoom(buildingId: string, roomId: string): Promise<void> {
  const removeLocal = async () => {
    const rooms = await cacheGetRooms(buildingId);
    await cacheSetRooms(buildingId, rooms.filter((r) => r.id !== roomId));
  };
  return onlineFirst(
    async () => {
      await apiRequest(`/rooms/${roomId}`, { method: 'DELETE' });
      await removeLocal();
    },
    removeLocal,
  );
}

// 转移租客：本质是两个房间的更新，复用 updateRoom 逻辑（含离线兜底）
async function transferTenant(
  fromRoom: Room,
  toRoomId: string
): Promise<{ fromRoom: Room; toRoom: Room }> {
  const rooms = await cacheGetRooms(fromRoom.buildingId);
  const toIndex = rooms.findIndex((r) => r.id === toRoomId);
  if (toIndex === -1) throw new Error('目标房间不存在');
  const toRoom = rooms[toIndex];
  if (toRoom.isOccupied) throw new Error('目标房间已有人入住');

  const updatedToRoom: Room = {
    ...toRoom,
    isOccupied: true,
    tenantName: fromRoom.tenantName,
    monthlyRent: fromRoom.monthlyRent,
    leaseStartDate: fromRoom.leaseStartDate,
    leaseMonths: fromRoom.leaseMonths,
    notes: fromRoom.notes,
    rentRecords: fromRoom.rentRecords,
  };
  const updatedFromRoom: Room = {
    ...fromRoom,
    isOccupied: false,
    tenantName: '',
    monthlyRent: 0,
    leaseStartDate: undefined,
    leaseMonths: undefined,
    notes: undefined,
    rentRecords: undefined,
  };

  // 两个房间分别走 updateRoom（缓存+server+离线兜底）
  await updateRoom(updatedFromRoom);
  await updateRoom(updatedToRoom);

  return { fromRoom: updatedFromRoom, toRoom: updatedToRoom };
}

// ============================================================
// 离线重放后的对账（以主库为准）
//
// 重连后 flushOutbox 把离线改动重放上去，但服务端不直接落库，而是进「待审表」
// 等服务器端确认。因此这些改动在主库尚未生效。这里在重放后立刻从主库重新拉取
// 受影响楼房的房间，覆盖本地缓存里的「乐观值」——确保：
//   · 审核期间手机显示主库旧值（与主库一致）
//   · 审核被拒后手机不残留「幽灵数据」
//   · 审核通过后下次刷新自然显示新值
// 返回「已提交待确认」的条数，供 UI 提示。
// ============================================================
async function reconcileOfflineReplays(): Promise<{ submittedForReview: number }> {
  const { submittedForReview, affectedBuildingIds } = await flushOutbox();
  for (const bid of affectedBuildingIds) {
    try {
      const data = await apiRequest<{ rooms: Room[] }>(`/buildings/${bid}`);
      await cacheSetRooms(bid, data.rooms); // 以主库为准覆盖乐观值
    } catch {
      // 拉取失败就保持现状，下次 loadRooms 进入该楼时会再纠正
    }
  }
  return { submittedForReview };
}

export const StorageService = {
  // Buildings
  loadBuildings,
  saveBuildings,
  addBuilding,
  updateBuilding,
  deleteBuilding,
  // Rooms
  loadRooms,
  saveRoomsForBuilding,
  updateRoom,
  batchUpdateRooms,
  addRoom,
  deleteRoom,
  transferTenant,
  // 同步对账
  reconcileOfflineReplays,
};
