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

// ---- 账号级访问申请 ----
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface AccessRequest {
  id: string;
  requesterId: string;       // 申请人
  ownerId: string;           // 被申请的账号
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
}

// ---- 账号级授权（owner 把整个账号授权给 grantee）----
export interface AccountGrant {
  id: string;
  ownerId: string;
  granteeId: string;
  canWrite: boolean;         // 读默认有；写需 owner 手动开启（含删楼）
  createdAt: string;
}

// 当前用户对某楼房的权限
export type AccessLevel = 'owner' | 'write' | 'read' | null;

// ---- 待审改动（手机端离线重放，待 owner 批准）----
// 单条字段级差异：用于电脑端弹窗展示「变动了什么」
export interface PendingDiffItem {
  field: string;        // 字段名（如 tenantName）
  label: string;        // 人类可读标签（如 "租客姓名"）
  before: string;       // 变动前（已转为可读字符串）
  after: string;        // 变动后（已转为可读字符串）
}

export interface PendingChange {
  id: string;
  ownerId: string;      // 审批人（房间所属楼房的 owner）
  buildingId: string;
  roomId: string;
  submitterId: string;  // 提交改动的用户
  proposed: Room;       // 完整提议的房间状态
  diff: PendingDiffItem[];
  submitterIp?: string;
  deviceModel?: string;
  createdAt: string;
}

// ---- 楼房 + 房间打包（同步用）----
export interface BuildingWithRooms extends Building {
  rooms: Room[];
}
