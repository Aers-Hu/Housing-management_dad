import { randomUUID } from 'node:crypto';
import { db } from './index.ts';
import { rowToBuilding, rowToRoom, rowToAccessRequest, rowToAccountGrant, rowToUser, rowToPendingChange } from './mappers.ts';
import type { Building, Room, AccessRequest, AccountGrant, User, AccessLevel, PendingChange, PendingDiffItem } from '../types.ts';
import { hashPassword } from '../auth/crypto.ts';
import { ADMIN_USERNAME, ADMIN_PASSWORD, setAdminUserId } from '../auth/admin.ts';

const genId = (prefix: string) => `${prefix}_${randomUUID()}`;

// ============================================================
// 房间号生成（与手机端 roomTypes.generateRoomNumber 对齐）
// ============================================================
function generateRoomNumber(floor: number, index: number, roomsPerFloor: number): string {
  const padded = String(index + 1).padStart(String(roomsPerFloor).length, '0');
  return `${floor}${padded}`;
}

// ============================================================
// Users
// ============================================================
export const Users = {
  create(username: string, passwordHash: string): User {
    const id = genId('usr');
    const createdAt = new Date().toISOString();
    db.prepare(
      'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
    ).run(id, username, passwordHash, createdAt);
    return { id, username, createdAt };
  },
  findByUsername(username: string): (User & { passwordHash: string }) | null {
    const r: any = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!r) return null;
    return { ...rowToUser(r), passwordHash: r.password_hash };
  },
  findById(id: string): User | null {
    const r: any = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return r ? rowToUser(r) : null;
  },
};

// ============================================================
// Buildings
// ============================================================
export const Buildings = {
  // 列出某用户「拥有的 + 被授权账号的全部」楼房，带 owner 用户名和权限标识
  listAccessible(userId: string): (Building & { permission: AccessLevel; ownerUsername: string })[] {
    const owned: any[] = db
      .prepare(
        `SELECT b.*, u.username AS _owner_name FROM buildings b
         JOIN users u ON u.id = b.owner_id
         WHERE b.owner_id = ? ORDER BY b.created_at`
      )
      .all(userId);
    // 被授权账号的全部楼房（账号级 account_grants）
    const granted: any[] = db
      .prepare(
        `SELECT b.*, u.username AS _owner_name, g.can_write AS _can_write FROM buildings b
         JOIN account_grants g ON g.owner_id = b.owner_id
         JOIN users u ON u.id = b.owner_id
         WHERE g.grantee_id = ? ORDER BY b.created_at`
      )
      .all(userId);
    return [
      ...owned.map((r) => ({
        ...rowToBuilding(r),
        permission: 'owner' as const,
        ownerUsername: r._owner_name,
      })),
      ...granted.map((r) => ({
        ...rowToBuilding(r),
        permission: (r._can_write ? 'write' : 'read') as AccessLevel,
        ownerUsername: r._owner_name,
      })),
    ];
  },

  findById(id: string): Building | null {
    const r: any = db.prepare('SELECT * FROM buildings WHERE id = ?').get(id);
    return r ? rowToBuilding(r) : null;
  },

  create(ownerId: string, name: string, floors: number, roomsPerFloor: number): Building {
    const id = genId('bld');
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO buildings (id, owner_id, name, floors, rooms_per_floor, created_at, floor_labels)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`
    ).run(id, ownerId, name, floors, roomsPerFloor, createdAt);

    // 自动生成房间
    const insertRoom = db.prepare(
      `INSERT INTO rooms (id, building_id, floor, number, name, is_occupied, tenant_name, monthly_rent)
       VALUES (?, ?, ?, ?, '', 0, '', 0)`
    );
    for (let floor = 1; floor <= floors; floor++) {
      for (let i = 0; i < roomsPerFloor; i++) {
        insertRoom.run(genId('room'), id, floor, generateRoomNumber(floor, i, roomsPerFloor));
      }
    }
    return rowToBuilding(db.prepare('SELECT * FROM buildings WHERE id = ?').get(id));
  },

  update(
    id: string,
    fields: { name?: string; floors?: number; roomsPerFloor?: number; floorLabels?: Record<string, string> }
  ): Building | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const name = fields.name ?? existing.name;
    const floors = fields.floors ?? existing.floors;
    const roomsPerFloor = fields.roomsPerFloor ?? existing.roomsPerFloor;
    const floorLabels =
      fields.floorLabels !== undefined ? fields.floorLabels : existing.floorLabels;

    db.prepare(
      `UPDATE buildings SET name = ?, floors = ?, rooms_per_floor = ?, floor_labels = ? WHERE id = ?`
    ).run(name, floors, roomsPerFloor, floorLabels ? JSON.stringify(floorLabels) : null, id);

    // 楼层/每层数变化时，补齐缺失房间（保留已有房间数据，不删多余的以防误删租客）
    if (fields.floors !== undefined || fields.roomsPerFloor !== undefined) {
      const existingRooms = Rooms.listByBuilding(id);
      const have = new Set(existingRooms.map((r) => `${r.floor}_${r.number}`));
      const insertRoom = db.prepare(
        `INSERT INTO rooms (id, building_id, floor, number, name, is_occupied, tenant_name, monthly_rent)
         VALUES (?, ?, ?, ?, '', 0, '', 0)`
      );
      for (let floor = 1; floor <= floors; floor++) {
        for (let i = 0; i < roomsPerFloor; i++) {
          const number = generateRoomNumber(floor, i, roomsPerFloor);
          if (!have.has(`${floor}_${number}`)) {
            insertRoom.run(genId('room'), id, floor, number);
          }
        }
      }
    }
    return this.findById(id);
  },

  delete(id: string): void {
    db.prepare('DELETE FROM buildings WHERE id = ?').run(id); // 级联删 rooms
  },

  // 判断用户对某楼房的权限：owner / write / read / null(无权)
  // 账号级：看楼房 owner 是否把整个账号授权给了该用户
  accessLevel(userId: string, buildingId: string): AccessLevel {
    const b = this.findById(buildingId);
    if (!b) return null;
    if (b.ownerId === userId) return 'owner';
    const g: any = db
      .prepare('SELECT can_write FROM account_grants WHERE owner_id = ? AND grantee_id = ?')
      .get(b.ownerId, userId);
    if (!g) return null;
    return g.can_write ? 'write' : 'read';
  },
};

// ============================================================
// Rooms
// ============================================================
export const Rooms = {
  listByBuilding(buildingId: string): Room[] {
    const rows: any[] = db
      .prepare('SELECT * FROM rooms WHERE building_id = ? ORDER BY floor, number')
      .all(buildingId);
    return rows.map(rowToRoom);
  },

  findById(id: string): Room | null {
    const r: any = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    return r ? rowToRoom(r) : null;
  },

  update(room: Room): Room | null {
    const existing = this.findById(room.id);
    if (!existing) return null;
    db.prepare(
      `UPDATE rooms SET
        floor = ?, number = ?, name = ?, is_occupied = ?, tenant_name = ?,
        monthly_rent = ?, lease_start_date = ?, lease_months = ?, notes = ?, rent_records = ?
       WHERE id = ?`
    ).run(
      room.floor,
      room.number,
      room.name ?? '',
      room.isOccupied ? 1 : 0,
      room.tenantName ?? '',
      room.monthlyRent ?? 0,
      room.leaseStartDate ?? null,
      room.leaseMonths ?? null,
      room.notes ?? null,
      room.rentRecords ? JSON.stringify(room.rentRecords) : null,
      room.id
    );
    return this.findById(room.id);
  },

  add(buildingId: string, floor: number, number: string): Room {
    const id = genId('room');
    db.prepare(
      `INSERT INTO rooms (id, building_id, floor, number, name, is_occupied, tenant_name, monthly_rent)
       VALUES (?, ?, ?, ?, '', 0, '', 0)`
    ).run(id, buildingId, floor, number);
    return this.findById(id)!;
  },

  delete(id: string): void {
    db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  },
};

// ============================================================
// AccessRequests（账号级访问申请）
// ============================================================
export const AccessRequests = {
  // 发起申请（同一对 requester→owner 已存在则复用，重置为 pending）
  create(requesterId: string, ownerId: string): AccessRequest {
    const id = genId('req');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO access_requests (id, requester_id, owner_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)
       ON CONFLICT(requester_id, owner_id)
       DO UPDATE SET status = 'pending', updated_at = excluded.updated_at`
    ).run(id, requesterId, ownerId, now, now);
    const r: any = db
      .prepare('SELECT * FROM access_requests WHERE requester_id = ? AND owner_id = ?')
      .get(requesterId, ownerId);
    return rowToAccessRequest(r);
  },

  findById(id: string): AccessRequest | null {
    const r: any = db.prepare('SELECT * FROM access_requests WHERE id = ?').get(id);
    return r ? rowToAccessRequest(r) : null;
  },

  // 我收到的待处理申请（带申请人用户名）
  inboxFor(ownerId: string): (AccessRequest & { requesterUsername: string })[] {
    const rows: any[] = db
      .prepare(
        `SELECT r.*, u.username AS _req_name FROM access_requests r
         JOIN users u ON u.id = r.requester_id
         WHERE r.owner_id = ? AND r.status = 'pending' ORDER BY r.created_at DESC`
      )
      .all(ownerId);
    return rows.map((r) => ({ ...rowToAccessRequest(r), requesterUsername: r._req_name }));
  },

  // 我发出的申请（带被申请账号用户名）
  outboxFor(requesterId: string): (AccessRequest & { ownerUsername: string })[] {
    const rows: any[] = db
      .prepare(
        `SELECT r.*, u.username AS _owner_name FROM access_requests r
         JOIN users u ON u.id = r.owner_id
         WHERE r.requester_id = ? ORDER BY r.created_at DESC`
      )
      .all(requesterId);
    return rows.map((r) => ({ ...rowToAccessRequest(r), ownerUsername: r._owner_name }));
  },

  setStatus(id: string, status: 'approved' | 'rejected'): void {
    db.prepare('UPDATE access_requests SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id);
  },
};

// ============================================================
// AccountGrants（账号级授权）
// ============================================================
export const AccountGrants = {
  // 同意申请时创建授权（默认只读）
  grant(ownerId: string, granteeId: string, canWrite = false): AccountGrant {
    const id = genId('agrant');
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO account_grants (id, owner_id, grantee_id, can_write, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(owner_id, grantee_id) DO UPDATE SET can_write = excluded.can_write`
    ).run(id, ownerId, granteeId, canWrite ? 1 : 0, createdAt);
    return this.find(ownerId, granteeId)!;
  },

  find(ownerId: string, granteeId: string): AccountGrant | null {
    const r: any = db
      .prepare('SELECT * FROM account_grants WHERE owner_id = ? AND grantee_id = ?')
      .get(ownerId, granteeId);
    return r ? rowToAccountGrant(r) : null;
  },

  // 我授权出去的人（带被授权人用户名）
  granteesOf(ownerId: string): (AccountGrant & { granteeUsername: string })[] {
    const rows: any[] = db
      .prepare(
        `SELECT g.*, u.username AS _grantee_name FROM account_grants g
         JOIN users u ON u.id = g.grantee_id
         WHERE g.owner_id = ? ORDER BY g.created_at`
      )
      .all(ownerId);
    return rows.map((r) => ({ ...rowToAccountGrant(r), granteeUsername: r._grantee_name }));
  },

  setWrite(ownerId: string, granteeId: string, canWrite: boolean): void {
    db.prepare('UPDATE account_grants SET can_write = ? WHERE owner_id = ? AND grantee_id = ?')
      .run(canWrite ? 1 : 0, ownerId, granteeId);
  },

  revoke(ownerId: string, granteeId: string): void {
    db.prepare('DELETE FROM account_grants WHERE owner_id = ? AND grantee_id = ?')
      .run(ownerId, granteeId);
  },
};

// ============================================================
// PendingChanges（待审改动：手机端离线重放先入此表）
//
// 方案 B（先到先生效，管理员可事后翻盘）下的字段语义：
//   owner_decision : 楼主决定（先到先生效后即记录，记录仍保留以便管理员翻盘）
//   admin_decision : 管理员决定（优先级最高）。管理员一裁决即为最终，
//                    记录保留为历史（最近 50 条）而非删除。
//   applied        : 当前提议是否已落主库（用于判断管理员翻盘时要写入还是回滚）
//   original       : 改动前的房间快照（管理员翻盘回滚时按字段精准还原）
//   resolved_at    : 管理员最终裁决时间（ISO），用于历史排序 + 超 50 条清理
//
// 队列可见性：
//   楼主  → 只看自己名下「楼主尚未决定」的（owner_decision IS NULL）
//   管理员 → 看「尚未最终裁决」的全部楼主待审（admin_decision IS NULL，即全部存活记录）
//   历史  → 管理员已裁决的（admin_decision NOT NULL），最近 50 条
// ============================================================
export const PendingChanges = {
  create(args: {
    ownerId: string;
    buildingId: string;
    roomId: string;
    submitterId: string;
    proposed: Room;
    diff: PendingDiffItem[];
    original: Room;
    submitterIp?: string;
    deviceModel?: string;
  }): PendingChange {
    const id = genId('pend');
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO pending_changes
        (id, owner_id, building_id, room_id, submitter_id, proposed, diff, original, submitter_ip, device_model, created_at, applied)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      id,
      args.ownerId,
      args.buildingId,
      args.roomId,
      args.submitterId,
      JSON.stringify(args.proposed),
      JSON.stringify(args.diff),
      JSON.stringify(args.original),
      args.submitterIp ?? null,
      args.deviceModel ?? null,
      createdAt
    );
    return this.findById(id)!;
  },

  // 楼主视角：自己名下、楼主尚未决定的待审（按时间正序），附楼房名与房间号
  listForOwner(ownerId: string): (PendingChange & { buildingName: string; roomNumber: string })[] {
    return this._listWhere(
      `WHERE p.owner_id = ? AND p.owner_decision IS NULL ORDER BY p.created_at ASC`,
      [ownerId]
    );
  },

  // 管理员视角：全部楼主、尚未最终裁决的待审（按时间正序）
  listForAdmin(): (PendingChange & { buildingName: string; roomNumber: string })[] {
    return this._listWhere(
      `WHERE p.admin_decision IS NULL ORDER BY p.created_at ASC`,
      []
    );
  },

  _listWhere(whereClause: string, params: any[]): (PendingChange & { buildingName: string; roomNumber: string })[] {
    const rows: any[] = db
      .prepare(
        `SELECT p.*, b.name AS _bld_name, r.number AS _room_number
         FROM pending_changes p
         JOIN buildings b ON b.id = p.building_id
         JOIN rooms r     ON r.id = p.room_id
         ${whereClause}`
      )
      .all(...params);
    return rows.map((r) => ({
      ...rowToPendingChange(r),
      buildingName: r._bld_name,
      roomNumber: r._room_number,
    }));
  },

  findById(id: string): PendingChange | null {
    const r: any = db.prepare('SELECT * FROM pending_changes WHERE id = ?').get(id);
    return r ? rowToPendingChange(r) : null;
  },

  // 记录楼主决定（先到先生效后调用，记录保留供管理员翻盘）
  setOwnerDecision(id: string, decision: 'approve' | 'reject'): void {
    db.prepare('UPDATE pending_changes SET owner_decision = ? WHERE id = ?').run(decision, id);
  },

  // 更新「当前是否已落主库」标记
  setApplied(id: string, applied: boolean): void {
    db.prepare('UPDATE pending_changes SET applied = ? WHERE id = ?').run(applied ? 1 : 0, id);
  },

  delete(id: string): void {
    db.prepare('DELETE FROM pending_changes WHERE id = ?').run(id);
  },

  // 管理员最终裁决：标记 admin_decision + resolved_at，然后清理超出 50 条的历史
  markResolved(id: string, decision: 'approve' | 'reject'): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE pending_changes SET admin_decision = ?, resolved_at = ? WHERE id = ?')
      .run(decision, now, id);
    this._pruneHistory();
  },

  // 管理员视角：最近 50 条已裁决历史（按裁决时间倒序），附楼房名与房间号
  listHistory(): (PendingChange & { buildingName: string; roomNumber: string })[] {
    return this._listWhere(
      `WHERE p.admin_decision IS NOT NULL AND p.resolved_at IS NOT NULL
       ORDER BY p.resolved_at DESC LIMIT 50`,
      []
    );
  },

  // 清理：仅保留最近 50 条已裁决记录，删除更早的
  _pruneHistory(): void {
    const cutoff = db.prepare(
      `SELECT resolved_at FROM pending_changes
       WHERE admin_decision IS NOT NULL AND resolved_at IS NOT NULL
       ORDER BY resolved_at DESC LIMIT 1 OFFSET 49`
    ).get() as any;
    if (cutoff && cutoff.resolved_at) {
      db.prepare(
        `DELETE FROM pending_changes
         WHERE admin_decision IS NOT NULL AND resolved_at IS NOT NULL
           AND resolved_at < ?`
      ).run(cutoff.resolved_at);
    }
  },

  // 一键清空全部已裁决历史
  clearHistory(): void {
    db.prepare(
      `DELETE FROM pending_changes WHERE admin_decision IS NOT NULL`
    ).run();
  },
};

// ============================================================
// 管理员账号种入：服务端启动时调用。
//   - 已存在 → 仅回填 adminUserId
//   - 不存在 → 自动创建（密码 scrypt 哈希）
// 这样即便测试清库把它删了，重启服务端也会自动重建。
// ============================================================
export function seedAdmin(): void {
  const existing = Users.findByUsername(ADMIN_USERNAME);
  if (existing) {
    setAdminUserId(existing.id);
    return;
  }
  const user = Users.create(ADMIN_USERNAME, hashPassword(ADMIN_PASSWORD));
  setAdminUserId(user.id);
  console.log(`✅ 已自动种入管理员账号：${ADMIN_USERNAME}`);
}

export { genId };
