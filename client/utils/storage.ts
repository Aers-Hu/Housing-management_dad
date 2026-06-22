import AsyncStorage from '@react-native-async-storage/async-storage';
import { Building, Room, generateBuildingRooms, generateId } from './roomTypes';

const BUILDINGS_KEY = 'house_buildings_data';
const ROOMS_KEY_PREFIX = 'house_rooms_';

// ============================================================
// Building CRUD
// ============================================================

async function loadBuildings(): Promise<Building[]> {
  try {
    const data = await AsyncStorage.getItem(BUILDINGS_KEY);
    if (data) return JSON.parse(data);
    return [];
  } catch (error) {
    console.error('Failed to load buildings:', error);
    return [];
  }
}

async function saveBuildings(buildings: Building[]): Promise<void> {
  try {
    await AsyncStorage.setItem(BUILDINGS_KEY, JSON.stringify(buildings));
  } catch (error) {
    console.error('Failed to save buildings:', error);
  }
}

async function addBuilding(name: string, floors: number, roomsPerFloor: number): Promise<Building> {
  const building: Building = {
    id: generateId('bld'),
    name,
    floors,
    roomsPerFloor,
    createdAt: new Date().toISOString(),
  };

  const buildings = await loadBuildings();
  buildings.push(building);
  await saveBuildings(buildings);

  // 自动生成房间
  const rooms = generateBuildingRooms(building);
  await saveRoomsForBuilding(building.id, rooms);

  return building;
}

async function updateBuilding(building: Building, newFloors?: number, newRoomsPerFloor?: number): Promise<void> {
  const buildings = await loadBuildings();
  const idx = buildings.findIndex(b => b.id === building.id);
  if (idx === -1) return;

  const updated = { ...building };
  if (newFloors !== undefined) updated.floors = newFloors;
  if (newRoomsPerFloor !== undefined) updated.roomsPerFloor = newRoomsPerFloor;
  buildings[idx] = updated;
  await saveBuildings(buildings);

  // 如果楼层或房间数变了，重新生成房间（会保留已有房间数据）
  if (newFloors !== undefined || newRoomsPerFloor !== undefined) {
    const existingRooms = await loadRooms(building.id);
    const newRooms = generateBuildingRooms(updated, existingRooms);
    await saveRoomsForBuilding(building.id, newRooms);
  }
}

async function deleteBuilding(buildingId: string): Promise<void> {
  const buildings = await loadBuildings();
  const filtered = buildings.filter(b => b.id !== buildingId);
  await saveBuildings(filtered);

  // 删除关联房间
  await AsyncStorage.removeItem(ROOMS_KEY_PREFIX + buildingId);
}

// ============================================================
// Room CRUD
// ============================================================

function getRoomsKey(buildingId: string): string {
  return ROOMS_KEY_PREFIX + buildingId;
}

async function loadRooms(buildingId: string): Promise<Room[]> {
  try {
    const data = await AsyncStorage.getItem(getRoomsKey(buildingId));
    if (data) return JSON.parse(data);
    return [];
  } catch (error) {
    console.error('Failed to load rooms:', error);
    return [];
  }
}

async function saveRoomsForBuilding(buildingId: string, rooms: Room[]): Promise<void> {
  try {
    await AsyncStorage.setItem(getRoomsKey(buildingId), JSON.stringify(rooms));
  } catch (error) {
    console.error('Failed to save rooms:', error);
  }
}

async function updateRoom(updatedRoom: Room): Promise<Room[]> {
  const rooms = await loadRooms(updatedRoom.buildingId);
  const index = rooms.findIndex(r => r.id === updatedRoom.id);
  if (index !== -1) {
    rooms[index] = updatedRoom;
    await saveRoomsForBuilding(updatedRoom.buildingId, rooms);
  }
  return rooms;
}

// 批量更新多个房间（用于批量命名）
async function batchUpdateRooms(buildingId: string, updates: { id: string; name: string }[]): Promise<Room[]> {
  const rooms = await loadRooms(buildingId);
  const updateMap = new Map(updates.map(u => [u.id, u.name]));
  for (const room of rooms) {
    if (updateMap.has(room.id)) {
      room.name = updateMap.get(room.id)!;
    }
  }
  await saveRoomsForBuilding(buildingId, rooms);
  return rooms;
}

async function addRoom(buildingId: string, floor: number, number: string): Promise<Room> {
  const rooms = await loadRooms(buildingId);
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
  rooms.push(room);
  await saveRoomsForBuilding(buildingId, rooms);
  return room;
}

async function deleteRoom(buildingId: string, roomId: string): Promise<void> {
  const rooms = await loadRooms(buildingId);
  const filtered = rooms.filter(r => r.id !== roomId);
  await saveRoomsForBuilding(buildingId, filtered);
}

// 转移租客
async function transferTenant(
  fromRoom: Room,
  toRoomId: string
): Promise<{ fromRoom: Room; toRoom: Room }> {
  const rooms = await loadRooms(fromRoom.buildingId);
  const toIndex = rooms.findIndex(r => r.id === toRoomId);
  if (toIndex === -1) throw new Error('目标房间不存在');

  const toRoom = rooms[toIndex];
  if (toRoom.isOccupied) throw new Error('目标房间已有人入住');

  // 复制租客信息到目标房间
  const updatedToRoom: Room = {
    ...toRoom,
    isOccupied: true,
    tenantName: fromRoom.tenantName,
    monthlyRent: fromRoom.monthlyRent,
    leaseStartDate: fromRoom.leaseStartDate,
    leaseMonths: fromRoom.leaseMonths,
  };

  // 清空原房间
  const updatedFromRoom: Room = {
    ...fromRoom,
    isOccupied: false,
    tenantName: '',
    monthlyRent: 0,
    leaseStartDate: undefined,
    leaseMonths: undefined,
  };

  rooms[rooms.findIndex(r => r.id === fromRoom.id)] = updatedFromRoom;
  rooms[toIndex] = updatedToRoom;
  await saveRoomsForBuilding(fromRoom.buildingId, rooms);

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
