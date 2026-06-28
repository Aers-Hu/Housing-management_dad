// ============================================================
// 楼房数据类型
// ============================================================
export interface Building {
  id: string;           // 唯一ID，如 "bld_1718800000000"
  name: string;         // 楼房名称，如 "A栋"、"1号楼"
  floors: number;       // 层数
  roomsPerFloor: number; // 每层房间数
  createdAt: string;    // 创建时间 ISO
  floorLabels?: Record<number, string>; // 楼层号自定义显示，键为内部楼层，值为显示楼层号，如 { 1: "2" } 表示把第1层显示为"2楼"
  ownerId?: string;       // 楼房归属账号
  ownerUsername?: string; // 楼房归属账号的用户名（用于区分他人楼房）
  permission?: 'owner' | 'write' | 'read'; // 当前用户对该楼的权限
}

// 单月房租提交记录
export interface RentRecord {
  month: string;   // 月份标识 "YYYY-MM"
  paid: boolean;   // 是否已提交
}

// 房屋数据类型
export interface Room {
  id: string;            // 唯一ID，如 "room_1718800000000_1"
  buildingId: string;    // 所属楼房ID
  floor: number;         // 楼层
  number: string;        // 房间号，如 "8601"
  name: string;          // 房屋自定义名称（如 "主卧"、"储物间"）
  isOccupied: boolean;   // 是否入住
  tenantName: string;    // 租客姓名
  monthlyRent: number;   // 每月房租
  leaseStartDate?: string;  // 租期开始日期 (YYYY-MM-DD)
  leaseMonths?: number;     // 租期月数
  notes?: string;           // 租客注解，方便房东记录信息
  rentRecords?: RentRecord[]; // 每月房租提交记录
}

// ============================================================
// 工具函数
// ============================================================

// 生成唯一ID
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 根据楼层和序号生成房间号（如 8楼第1间 → 8601）
export function generateRoomNumber(floor: number, index: number, roomsPerFloor: number): string {
  const paddedIndex = String(index + 1).padStart(String(roomsPerFloor).length, '0');
  return `${floor}${paddedIndex}`;
}

// 为新楼房生成所有房间
export function generateBuildingRooms(building: Building, existingRooms?: Room[]): Room[] {
  const rooms: Room[] = [];
  const existingMap = new Map<string, Room>();
  if (existingRooms) {
    for (const r of existingRooms) {
      existingMap.set(`${r.buildingId}_${r.floor}_${r.number}`, r);
    }
  }

  for (let floor = 1; floor <= building.floors; floor++) {
    for (let i = 0; i < building.roomsPerFloor; i++) {
      const number = generateRoomNumber(floor, i, building.roomsPerFloor);
      const key = `${building.id}_${floor}_${number}`;
      const existing = existingMap.get(key);
      if (existing) {
        rooms.push(existing);
      } else {
        rooms.push({
          id: generateId('room'),
          buildingId: building.id,
          floor,
          number,
          name: '',
          isOccupied: false,
          tenantName: '',
          monthlyRent: 0,
        });
      }
    }
  }
  return rooms;
}

// C 策略重算房间（与服务端 repo.ts Buildings.update 对齐）：
//   超出新 floors/roomsPerFloor 范围的房间为「待删」；若其中有租客 → 返回 occupiedFloors（拒绝）；
//   否则删除超出的空房并按每层数量补齐。返回 { rooms } 表示成功。
export function rebuildRoomsCStrategy(
  buildingId: string,
  existingRooms: Room[],
  newFloors: number,
  newRoomsPerFloor: number
): { rooms?: Room[]; occupiedFloors?: number[] } {
  // 按楼层分组（每层按 number 数值升序）
  const byFloor = new Map<number, Room[]>();
  for (const r of existingRooms) {
    const arr = byFloor.get(r.floor) ?? [];
    arr.push(r);
    byFloor.set(r.floor, arr);
  }
  for (const arr of byFloor.values()) {
    arr.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  }

  // 待删房间：整层超范围，或每层超出 roomsPerFloor 的尾部
  const toDelete: Room[] = [];
  for (const [floor, arr] of byFloor) {
    if (floor > newFloors) toDelete.push(...arr);
    else if (arr.length > newRoomsPerFloor) toDelete.push(...arr.slice(newRoomsPerFloor));
  }

  // C 策略：待删房间有租客 → 拒绝
  const occupiedFloors = [...new Set(toDelete.filter((r) => r.isOccupied).map((r) => r.floor))].sort((a, b) => a - b);
  if (occupiedFloors.length > 0) return { occupiedFloors };

  const deletedIds = new Set(toDelete.map((r) => r.id));
  const result: Room[] = existingRooms.filter((r) => !deletedIds.has(r.id));

  // 按每层数量补齐到 roomsPerFloor
  for (let floor = 1; floor <= newFloors; floor++) {
    const kept = (byFloor.get(floor) ?? []).filter((r) => !deletedIds.has(r.id));
    const usedNumbers = new Set(kept.map((r) => r.number));
    let idx = kept.length;
    while (usedNumbers.size < newRoomsPerFloor) {
      let number = generateRoomNumber(floor, idx, newRoomsPerFloor);
      while (usedNumbers.has(number)) {
        idx++;
        number = generateRoomNumber(floor, idx, newRoomsPerFloor);
      }
      usedNumbers.add(number);
      result.push({
        id: generateId('room'),
        buildingId,
        floor,
        number,
        name: '',
        isOccupied: false,
        tenantName: '',
        monthlyRent: 0,
      });
    }
  }
  return { rooms: result };
}

// 按楼层分组
export function groupRoomsByFloor(rooms: Room[]): Map<number, Room[]> {
  const grouped = new Map<number, Room[]>();
  for (const room of rooms) {
    const existing = grouped.get(room.floor) || [];
    grouped.set(room.floor, [...existing, room]);
  }
  // 按楼层从高到低排序
  const sorted = new Map<number, Room[]>();
  const floors = [...grouped.keys()].sort((a, b) => b - a);
  for (const floor of floors) {
    sorted.set(floor, grouped.get(floor)!);
  }
  return sorted;
}

// 根据ID查找房间
export function findRoomById(rooms: Room[], id: string): Room | undefined {
  return rooms.find(r => r.id === id);
}

// 获取指定楼房的所有空房间
export function getVacantRooms(rooms: Room[], buildingId: string): Room[] {
  return rooms.filter(r => r.buildingId === buildingId && !r.isOccupied);
}

// 计算剩余租期（月）
export function calculateRemainingMonths(leaseStartDate?: string, leaseMonths?: number): number {
  if (!leaseStartDate || !leaseMonths) return 0;

  const start = new Date(leaseStartDate);
  const now = new Date();

  const monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const remaining = leaseMonths - monthsDiff;
  return Math.max(0, remaining);
}

// 获取楼房房间统计
export function getBuildingStats(rooms: Room[], buildingId: string) {
  const buildingRooms = rooms.filter(r => r.buildingId === buildingId);
  const total = buildingRooms.length;
  const occupied = buildingRooms.filter(r => r.isOccupied).length;
  return { total, occupied, vacant: total - occupied };
}

// ============================================================
// 楼层信息动态推导（统一以真实房间列表为准，不读 building.floors/roomsPerFloor）
// ============================================================

// 有房间的楼层号列表（升序去重）。删空的楼层自然不在其中。
export function deriveFloorList(rooms: Room[]): number[] {
  return [...new Set(rooms.map(r => r.floor).filter(f => f > 0))].sort((a, b) => a - b);
}

// 真实层数 = 有房间的不同楼层个数
export function deriveFloorCount(rooms: Room[]): number {
  return deriveFloorList(rooms).length;
}

// 每层房间数：各有房间楼层的间数若全相同→返回该数字；不同→返回 null（调用方据此隐藏）
export function deriveRoomsPerFloor(rooms: Room[]): number | null {
  const counts = new Map<number, number>();
  for (const r of rooms) {
    if (r.floor > 0) counts.set(r.floor, (counts.get(r.floor) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const vals = new Set(counts.values());
  return vals.size === 1 ? [...vals][0] : null;
}

// 获取楼层的显示标签（优先使用自定义的 floorLabels，否则用内部楼层号）
export function getFloorLabel(building: Building | null | undefined, floor: number): string {
  const custom = building?.floorLabels?.[floor];
  return custom && custom.trim() ? custom.trim() : String(floor);
}

// 根据租期开始日期和总月数，生成每月清单（结合已有记录保留勾选状态）
export function generateRentMonths(
  leaseStartDate?: string,
  leaseMonths?: number,
  existingRecords?: RentRecord[]
): RentRecord[] {
  if (!leaseStartDate || !leaseMonths || leaseMonths < 1) return [];

  const start = new Date(leaseStartDate);
  if (isNaN(start.getTime())) return [];

  const paidMap = new Map<string, boolean>();
  if (existingRecords) {
    for (const r of existingRecords) paidMap.set(r.month, r.paid);
  }

  const records: RentRecord[] = [];
  for (let i = 0; i < leaseMonths; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    records.push({ month, paid: paidMap.get(month) ?? false });
  }
  return records;
}
