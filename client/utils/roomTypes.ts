// 房屋数据类型
export interface Room {
  id: string;        // 房间ID，如 "801"、"802"
  floor: number;     // 楼层：2-6
  number: string;    // 房间号：801-811（不含804）
  isOccupied: boolean;  // 是否入住
  tenantName: string;   // 租客姓名
  monthlyRent: number;  // 每月房租
  // 租期相关
  leaseStartDate?: string;  // 租期开始日期 (YYYY-MM-DD)
  leaseMonths?: number;     // 租期月数
}

// 计算剩余租期（月）
export function calculateRemainingMonths(leaseStartDate?: string, leaseMonths?: number): number {
  if (!leaseStartDate || !leaseMonths) return 0;
  
  const start = new Date(leaseStartDate);
  const now = new Date();
  
  // 计算已过去的月数
  const monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  
  const remaining = leaseMonths - monthsDiff;
  return Math.max(0, remaining);
}

// 生成所有房间数据
export function generateAllRooms(): Room[] {
  const rooms: Room[] = [];
  const floors = [2, 3, 4, 5, 6];
  const roomSuffixes = ['01', '02', '03', '05', '06', '07', '08', '09', '10', '11'];

  for (const floor of floors) {
    for (const suffix of roomSuffixes) {
      rooms.push({
        id: `${floor}${suffix}`,
        floor,
        number: `${floor}${suffix}`,
        isOccupied: false,
        tenantName: '',
        monthlyRent: 0,
      });
    }
  }
  return rooms;
}

// 按楼层分组
export function groupRoomsByFloor(rooms: Room[]): Map<number, Room[]> {
  const grouped = new Map<number, Room[]>();
  for (const room of rooms) {
    const existing = grouped.get(room.floor) || [];
    grouped.set(room.floor, [...existing, room]);
  }
  return grouped;
}

// 根据ID查找房间
export function findRoomById(rooms: Room[], id: string): Room | undefined {
  return rooms.find(r => r.id === id);
}

// 获取所有空房间
export function getVacantRooms(rooms: Room[]): Room[] {
  return rooms.filter(r => !r.isOccupied);
}
