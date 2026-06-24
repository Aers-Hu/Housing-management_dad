// ============================================================
// 统一数据结构（手机端 Expo + 电脑端 Python 通用）
// 命名统一用驼峰；Python 端读写时做一层 snake_case 转换。
// 字段取两端超集，保证任何一端的现有数据都不丢失。
// ============================================================

// ---- 用户 ----
export interface User {
  id: string;
  username: string;       // 登录名（唯一）
  createdAt: string;      // ISO 时间
  // 注意：passwordHash 只存在数据库，永远不通过 API 返回
}

// ---- 单月租金记录 ----
// 超集设计：同时支持「是否已交」和「当月独立金额」
// - 手机端原本只有统一 monthlyRent + 每月 paid 布尔
// - Python 端每月可有独立 amount
// 两端数据都能装下。amount 为 0 或缺省时，按房间默认 monthlyRent 计。
export interface RentRecord {
  month: string;          // "YYYY-MM"
  paid: boolean;          // 是否已交租
  amount?: number;        // 当月实际金额（缺省时用房间默认 monthlyRent）
}

// ---- 房间 ----
export interface Room {
  id: string;
  buildingId: string;     // 所属楼房
  floor: number;          // 内部楼层号
  number: string;         // 房间号，如 "8601"
  name: string;           // 自定义名称（"主卧"等）
  isOccupied: boolean;    // 是否入住
  tenantName: string;     // 租客姓名
  monthlyRent: number;    // 默认每月房租
  leaseStartDate?: string;// 租期开始 "YYYY-MM-DD"
  leaseMonths?: number;   // 租期月数
  notes?: string;         // 租客注解
  rentRecords?: RentRecord[]; // 每月交租记录
}

// ---- 楼房 ----
export interface Building {
  id: string;
  ownerId: string;        // 归属的主账号
  name: string;           // 楼房名称
  floors: number;         // 层数
  roomsPerFloor: number;  // 每层房间数
  createdAt: string;
  floorLabels?: Record<string, string>; // 楼层显示号自定义，键为内部楼层(字符串)
}

// ---- 授权（主账号+授权模型）----
// owner 把某栋楼授权给另一个账号，权限为只读或可编辑
export type GrantPermission = 'read' | 'edit';

export interface Grant {
  id: string;
  buildingId: string;     // 被授权的楼房
  granteeId: string;      // 被授权的账号
  permission: GrantPermission;
  createdAt: string;
}

// ---- 楼房 + 房间打包（同步用）----
export interface BuildingWithRooms extends Building {
  rooms: Room[];
}
