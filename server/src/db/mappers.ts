import type { Building, Room, Grant, User, RentRecord } from '../types.ts';

// ============================================================
// DB 行(snake_case) <-> API 对象(camelCase) 互转
// ============================================================

export function rowToUser(r: any): User {
  return { id: r.id, username: r.username, createdAt: r.created_at };
}

export function rowToBuilding(r: any): Building {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    floors: r.floors,
    roomsPerFloor: r.rooms_per_floor,
    createdAt: r.created_at,
    floorLabels: r.floor_labels ? JSON.parse(r.floor_labels) : undefined,
  };
}

export function rowToRoom(r: any): Room {
  let rentRecords: RentRecord[] | undefined;
  if (r.rent_records) {
    try { rentRecords = JSON.parse(r.rent_records); } catch { rentRecords = undefined; }
  }
  return {
    id: r.id,
    buildingId: r.building_id,
    floor: r.floor,
    number: r.number,
    name: r.name ?? '',
    isOccupied: !!r.is_occupied,
    tenantName: r.tenant_name ?? '',
    monthlyRent: r.monthly_rent ?? 0,
    leaseStartDate: r.lease_start_date ?? undefined,
    leaseMonths: r.lease_months ?? undefined,
    notes: r.notes ?? undefined,
    rentRecords,
  };
}

export function rowToGrant(r: any): Grant {
  return {
    id: r.id,
    buildingId: r.building_id,
    granteeId: r.grantee_id,
    permission: r.permission,
    createdAt: r.created_at,
  };
}
