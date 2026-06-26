import type { Building, Room, AccessRequest, AccountGrant, User, RentRecord, PendingChange } from '../types.ts';

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

export function rowToAccessRequest(r: any): AccessRequest {
  return {
    id: r.id,
    requesterId: r.requester_id,
    ownerId: r.owner_id,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToAccountGrant(r: any): AccountGrant {
  return {
    id: r.id,
    ownerId: r.owner_id,
    granteeId: r.grantee_id,
    canWrite: !!r.can_write,
    createdAt: r.created_at,
  };
}

export function rowToPendingChange(r: any): PendingChange {
  let proposed: any = {};
  let diff: any[] = [];
  let original: any = undefined;
  try { proposed = JSON.parse(r.proposed); } catch { proposed = {}; }
  try { diff = JSON.parse(r.diff); } catch { diff = []; }
  if (r.original) { try { original = JSON.parse(r.original); } catch { original = undefined; } }
  return {
    id: r.id,
    ownerId: r.owner_id,
    buildingId: r.building_id,
    roomId: r.room_id,
    submitterId: r.submitter_id,
    proposed,
    diff,
    submitterIp: r.submitter_ip ?? undefined,
    deviceModel: r.device_model ?? undefined,
    createdAt: r.created_at,
    ownerDecision: r.owner_decision ?? undefined,
    adminDecision: r.admin_decision ?? undefined,
    applied: !!r.applied,
    original,
    resolvedAt: r.resolved_at ?? undefined,
  };
}
