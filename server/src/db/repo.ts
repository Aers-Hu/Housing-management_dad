import { randomUUID } from 'node:crypto';
import { db } from './index.ts';
import { rowToBuilding, rowToRoom, rowToGrant, rowToUser } from './mappers.ts';
import type { Building, Room, Grant, User, GrantPermission } from '../types.ts';

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
  // 列出某用户「拥有的 + 被授权的」楼房
  listAccessible(userId: string): (Building & { permission: GrantPermission | 'owner' })[] {
    const owned: any[] = db
      .prepare('SELECT * FROM buildings WHERE owner_id = ? ORDER BY created_at')
      .all(userId);
    const granted: any[] = db
      .prepare(
        `SELECT b.*, g.permission AS _perm FROM buildings b
         JOIN grants g ON g.building_id = b.id
         WHERE g.grantee_id = ? ORDER BY b.created_at`
      )
      .all(userId);
    return [
      ...owned.map((r) => ({ ...rowToBuilding(r), permission: 'owner' as const })),
      ...granted.map((r) => ({ ...rowToBuilding(r), permission: r._perm as GrantPermission })),
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
    db.prepare('DELETE FROM buildings WHERE id = ?').run(id); // 级联删 rooms / grants
  },

  // 判断用户对某楼房的权限：owner / edit / read / null(无权)
  accessLevel(userId: string, buildingId: string): 'owner' | GrantPermission | null {
    const b = this.findById(buildingId);
    if (!b) return null;
    if (b.ownerId === userId) return 'owner';
    const g: any = db
      .prepare('SELECT permission FROM grants WHERE building_id = ? AND grantee_id = ?')
      .get(buildingId, userId);
    return g ? (g.permission as GrantPermission) : null;
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
// Grants（授权）
// ============================================================
export const Grants = {
  listForBuilding(buildingId: string): Grant[] {
    const rows: any[] = db.prepare('SELECT * FROM grants WHERE building_id = ?').all(buildingId);
    return rows.map(rowToGrant);
  },
  upsert(buildingId: string, granteeId: string, permission: GrantPermission): Grant {
    const id = genId('grant');
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO grants (id, building_id, grantee_id, permission, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(building_id, grantee_id) DO UPDATE SET permission = excluded.permission`
    ).run(id, buildingId, granteeId, permission, createdAt);
    const r: any = db
      .prepare('SELECT * FROM grants WHERE building_id = ? AND grantee_id = ?')
      .get(buildingId, granteeId);
    return rowToGrant(r);
  },
  revoke(buildingId: string, granteeId: string): void {
    db.prepare('DELETE FROM grants WHERE building_id = ? AND grantee_id = ?').run(
      buildingId,
      granteeId
    );
  },
};

export { genId };
