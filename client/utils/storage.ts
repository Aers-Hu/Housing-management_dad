import AsyncStorage from '@react-native-async-storage/async-storage';
import { Building, Room } from './roomTypes';
import { apiRequest, NetworkError } from './api';
import { enqueueRoomUpdate } from './sync';

// ============================================================
// 存储服务（在线为主 + 离线缓存兜底）
//
// 对外接口与原本地版本完全一致，三个界面无需改动。
// 内部改为：
//   - 读：优先连 server，断网时回退本地缓存
//   - 改房间：乐观更新缓存 + 推 server，断网时进 outbox 队列
//   - 楼房结构变更（增删/改层）：需联网（服务端统一生成房间，避免 ID 冲突）
// 本地缓存沿用原 key，保证离线时仍能展示上次数据。
// ============================================================

const BUILDINGS_KEY = 'house_buildings_data';
const ROOMS_KEY_PREFIX = 'house_rooms_';

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
  try {
    const data = await apiRequest<{ buildings: Building[] }>('/buildings');
    await cacheSetBuildings(data.buildings);
    return data.buildings;
  } catch (e) {
    if (e instanceof NetworkError) return cacheGetBuildings(); // 离线兜底
    throw e;
  }
}

// 兼容旧接口：整体保存（现在只更新本地缓存，server 由各操作单独同步）
async function saveBuildings(buildings: Building[]): Promise<void> {
  await cacheSetBuildings(buildings);
}

async function addBuilding(name: string, floors: number, roomsPerFloor: number): Promise<Building> {
  // 结构性操作需联网（房间由服务端统一生成）
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
}

async function deleteBuilding(buildingId: string): Promise<void> {
  await apiRequest(`/buildings/${buildingId}`, { method: 'DELETE' });
  const list = await cacheGetBuildings();
  await cacheSetBuildings(list.filter((b) => b.id !== buildingId));
  await AsyncStorage.removeItem(roomsKey(buildingId));
}

// ============================================================
// Room
// ============================================================

async function loadRooms(buildingId: string): Promise<Room[]> {
  try {
    const data = await apiRequest<{ rooms: Room[] }>(`/buildings/${buildingId}`);
    await cacheSetRooms(buildingId, data.rooms);
    return data.rooms;
  } catch (e) {
    if (e instanceof NetworkError) return cacheGetRooms(buildingId); // 离线兜底
    throw e;
  }
}

async function saveRoomsForBuilding(buildingId: string, rooms: Room[]): Promise<void> {
  await cacheSetRooms(buildingId, rooms);
}

// 改房间：乐观更新缓存 → 推 server → 断网则入队
async function updateRoom(updatedRoom: Room): Promise<Room[]> {
  // 1. 乐观更新本地缓存
  const rooms = await cacheGetRooms(updatedRoom.buildingId);
  const idx = rooms.findIndex((r) => r.id === updatedRoom.id);
  if (idx !== -1) rooms[idx] = updatedRoom;
  await cacheSetRooms(updatedRoom.buildingId, rooms);

  // 2. 推送 server
  try {
    await apiRequest(`/rooms/${updatedRoom.id}`, { method: 'PUT', body: updatedRoom });
  } catch (e) {
    if (e instanceof NetworkError) {
      await enqueueRoomUpdate(updatedRoom); // 离线入队，联网后重放
    } else {
      throw e;
    }
  }
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

  // 逐个推送（失败的入队）
  for (const room of changed) {
    try {
      await apiRequest(`/rooms/${room.id}`, { method: 'PUT', body: room });
    } catch (e) {
      if (e instanceof NetworkError) await enqueueRoomUpdate(room);
      else throw e;
    }
  }
  return rooms;
}

async function addRoom(buildingId: string, floor: number, number: string): Promise<Room> {
  const data = await apiRequest<{ room: Room }>(`/buildings/${buildingId}/rooms`, {
    method: 'POST',
    body: { floor, number },
  });
  const rooms = await cacheGetRooms(buildingId);
  rooms.push(data.room);
  await cacheSetRooms(buildingId, rooms);
  return data.room;
}

async function deleteRoom(buildingId: string, roomId: string): Promise<void> {
  await apiRequest(`/rooms/${roomId}`, { method: 'DELETE' });
  const rooms = await cacheGetRooms(buildingId);
  await cacheSetRooms(buildingId, rooms.filter((r) => r.id !== roomId));
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
};
