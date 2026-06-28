import { Router } from 'express';
import { Buildings, Rooms, Users, AccessRequests, AccountGrants, PendingChanges, RoomsOccupiedError } from '../db/repo.ts';
import { getUserId } from '../middleware/auth.ts';
import { isAdminUser } from '../auth/admin.ts';
import type { Room, RentRecord, PendingDiffItem, PendingChange } from '../types.ts';

const router = Router();

// ============================================================
// 字段级差异计算：对比主库现有房间与手机端提议，产出人类可读的变动列表。
// 仅列出真正发生变化的字段，供电脑端弹窗展示「变动了什么」。
// ============================================================
function rentRecordsToMap(records?: RentRecord[]): Record<string, RentRecord> {
  const m: Record<string, RentRecord> = {};
  for (const rec of records || []) {
    if (rec && rec.month) m[rec.month] = rec;
  }
  return m;
}

function rentCellText(rec?: RentRecord): string {
  if (!rec) return '未交';
  const paid = rec.paid ? '已交' : '未交';
  const amt = rec.amount ? ` ¥${rec.amount}` : '';
  return `${paid}${amt}`;
}

function computeRoomDiff(existing: Room, proposed: Room): PendingDiffItem[] {
  const diff: PendingDiffItem[] = [];
  const push = (field: string, label: string, before: unknown, after: unknown) => {
    diff.push({ field, label, before: String(before ?? ''), after: String(after ?? '') });
  };

  if ((existing.name ?? '') !== (proposed.name ?? '')) {
    push('name', '房间名称', existing.name || '(默认)', proposed.name || '(默认)');
  }
  if (!!existing.isOccupied !== !!proposed.isOccupied) {
    push('isOccupied', '是否入住', existing.isOccupied ? '已入住' : '空置', proposed.isOccupied ? '已入住' : '空置');
  }
  if ((existing.tenantName ?? '') !== (proposed.tenantName ?? '')) {
    push('tenantName', '租客姓名', existing.tenantName || '(空)', proposed.tenantName || '(空)');
  }
  if ((existing.monthlyRent ?? 0) !== (proposed.monthlyRent ?? 0)) {
    push('monthlyRent', '默认月租', `¥${existing.monthlyRent ?? 0}`, `¥${proposed.monthlyRent ?? 0}`);
  }
  if ((existing.leaseStartDate ?? '') !== (proposed.leaseStartDate ?? '')) {
    push('leaseStartDate', '租期开始', existing.leaseStartDate || '(空)', proposed.leaseStartDate || '(空)');
  }
  if ((existing.leaseMonths ?? 0) !== (proposed.leaseMonths ?? 0)) {
    push('leaseMonths', '租期月数', existing.leaseMonths ?? 0, proposed.leaseMonths ?? 0);
  }
  if ((existing.notes ?? '') !== (proposed.notes ?? '')) {
    push('notes', '注解', existing.notes || '(空)', proposed.notes || '(空)');
  }

  // 交租记录逐月比对
  const beforeMap = rentRecordsToMap(existing.rentRecords);
  const afterMap = rentRecordsToMap(proposed.rentRecords);
  const months = new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)]);
  for (const month of Array.from(months).sort()) {
    const b = beforeMap[month];
    const a = afterMap[month];
    const bText = rentCellText(b);
    const aText = rentCellText(a);
    if (bText !== aText) {
      push(`rent:${month}`, `${month} 交租`, bText, aText);
    }
  }
  return diff;
}

// 列出可访问的楼房（拥有的 + 被授权账号的全部）
router.get('/buildings', (req, res) => {
  const userId = getUserId(req);
  res.json({ buildings: Buildings.listAccessible(userId) });
});

// 获取单个楼房 + 其房间（同步主力接口）
router.get('/buildings/:id', (req, res) => {
  const userId = getUserId(req);
  const level = Buildings.accessLevel(userId, req.params.id);
  if (!level) return res.status(404).json({ error: '楼房不存在或无权访问' });
  const building = Buildings.findById(req.params.id)!;
  const rooms = Rooms.listByBuilding(req.params.id);
  res.json({ building, rooms, permission: level });
});

// 创建楼房（自动归属当前用户）
router.post('/buildings', (req, res) => {
  const userId = getUserId(req);
  const { name, floors, roomsPerFloor } = req.body ?? {};
  if (!name || typeof floors !== 'number' || typeof roomsPerFloor !== 'number') {
    return res.status(400).json({ error: '缺少 name/floors/roomsPerFloor' });
  }
  const building = Buildings.create(userId, name, floors, roomsPerFloor);
  res.status(201).json({ building });
});

// 修改楼房
router.put('/buildings/:id', (req, res) => {
  const userId = getUserId(req);
  const level = Buildings.accessLevel(userId, req.params.id);
  if (!level) return res.status(404).json({ error: '楼房不存在或无权访问' });
  if (level === 'read') return res.status(403).json({ error: '只读权限，不能修改' });

  const { name, floors, roomsPerFloor, floorLabels } = req.body ?? {};
  try {
    const building = Buildings.update(req.params.id, { name, floors, roomsPerFloor, floorLabels });
    res.json({ building });
  } catch (e) {
    // C 策略：超出范围的房间有租客 → 拒绝缩减，返回 409 + 中文提示
    if (e instanceof RoomsOccupiedError) {
      const floorsText = e.occupiedFloors.join('、');
      return res.status(409).json({
        error: `第 ${floorsText} 层仍有租客，请先处理租客（退租或转移）后再缩减楼层/房间数`,
        occupiedFloors: e.occupiedFloors,
      });
    }
    throw e;
  }
});

// 添加一层：在最高层之上新增一层空房
router.post('/buildings/:id/floors', (req, res) => {
  const userId = getUserId(req);
  const level = Buildings.accessLevel(userId, req.params.id);
  if (!level) return res.status(404).json({ error: '楼房不存在或无权访问' });
  if (level === 'read') return res.status(403).json({ error: '只读权限，不能修改' });

  const { count } = req.body ?? {};
  if (typeof count !== 'number' || count < 1) {
    return res.status(400).json({ error: '缺少有效的 count（每层房间数）' });
  }
  const building = Buildings.addFloor(req.params.id, count);
  res.status(201).json({ building });
});

// 删除楼房（owner 或有写权限者；写=完全控制，含删楼）
router.delete('/buildings/:id', (req, res) => {
  const userId = getUserId(req);
  const level = Buildings.accessLevel(userId, req.params.id);
  if (level !== 'owner' && level !== 'write') {
    return res.status(403).json({ error: '无删除权限' });
  }
  Buildings.delete(req.params.id);
  res.json({ ok: true });
});

// ---- 房间 ----

// 修改房间（租客、租金、备注等）
router.put('/rooms/:id', (req, res) => {
  const userId = getUserId(req);
  const existing = Rooms.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: '房间不存在' });
  const level = Buildings.accessLevel(userId, existing.buildingId);
  if (!level) return res.status(404).json({ error: '无权访问' });
  if (level === 'read') return res.status(403).json({ error: '只读权限，不能修改' });

  // 合并：以 body 覆盖，但 id/buildingId 以服务端为准
  const merged = { ...existing, ...req.body, id: existing.id, buildingId: existing.buildingId };

  // 离线重放（手机端断网期间的改动，重连后重放）：不直接落库，存入待审表，由楼房 owner 逐条批准。
  // 在线实时改动、电脑端改动均不带此头，照旧直接落库。
  const isOfflineReplay = String(req.headers['x-offline-replay'] || '') === '1';
  if (isOfflineReplay) {
    const building = Buildings.findById(existing.buildingId)!;
    const diff = computeRoomDiff(existing, merged as Room);
    // 无实际变化则无需打扰 owner，直接当作已处理
    if (diff.length === 0) {
      return res.status(202).json({ pending: false, reason: 'no-change' });
    }
    // 真实客户端 IP：trust proxy 已开启，req.ip 会取 X-Forwarded-For 首段
    const fwd = req.headers['x-forwarded-for'];
    const submitterIp =
      (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || req.ip || '';
    const rawModel = req.headers['x-device-model'];
    let deviceModel = '';
    if (typeof rawModel === 'string' && rawModel) {
      try { deviceModel = decodeURIComponent(rawModel); } catch { deviceModel = rawModel; }
    }
    const pending = PendingChanges.create({
      ownerId: building.ownerId,
      buildingId: existing.buildingId,
      roomId: existing.id,
      submitterId: userId,
      proposed: merged as Room,
      diff,
      original: existing,   // 改动前快照：管理员翻盘回滚时按字段精准还原
      submitterIp,
      deviceModel,
    });
    return res.status(202).json({ pending: true, id: pending.id });
  }

  const room = Rooms.update(merged);
  res.json({ room });
});

// 新增房间
router.post('/buildings/:id/rooms', (req, res) => {
  const userId = getUserId(req);
  const level = Buildings.accessLevel(userId, req.params.id);
  if (!level) return res.status(404).json({ error: '无权访问' });
  if (level === 'read') return res.status(403).json({ error: '只读权限，不能修改' });

  const { floor, number } = req.body ?? {};
  if (typeof floor !== 'number' || !number) {
    return res.status(400).json({ error: '缺少 floor/number' });
  }
  const room = Rooms.add(req.params.id, floor, number);
  res.status(201).json({ room });
});

// 删除房间
router.delete('/rooms/:id', (req, res) => {
  const userId = getUserId(req);
  const existing = Rooms.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: '房间不存在' });
  const level = Buildings.accessLevel(userId, existing.buildingId);
  if (!level) return res.status(404).json({ error: '无权访问' });
  if (level === 'read') return res.status(403).json({ error: '只读权限，不能修改' });
  Rooms.delete(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// 账号级通讯：申请查看 + 授权管理
// ============================================================

// 发起申请：申请查看某用户(按用户名)的全部楼房
router.post('/access-requests', (req, res) => {
  const userId = getUserId(req);
  const { username } = req.body ?? {};
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: '请填写要申请的用户名' });
  }
  const target = Users.findByUsername(username.trim());
  if (!target) return res.status(404).json({ error: '该用户不存在' });
  if (target.id === userId) return res.status(400).json({ error: '不能申请查看自己的账号' });
  // 已经被授权则无需再申请
  if (AccountGrants.find(target.id, userId)) {
    return res.status(409).json({ error: '你已有该用户的查看权限' });
  }
  const request = AccessRequests.create(userId, target.id);
  res.status(201).json({ request });
});

// 我收到的待处理申请（消息状态栏）
router.get('/access-requests/inbox', (req, res) => {
  const userId = getUserId(req);
  res.json({ requests: AccessRequests.inboxFor(userId) });
});

// 我发出的申请（含状态）
router.get('/access-requests/outbox', (req, res) => {
  const userId = getUserId(req);
  res.json({ requests: AccessRequests.outboxFor(userId) });
});

// 同意/拒绝某申请（仅被申请的 owner 可操作）
router.post('/access-requests/:id/respond', (req, res) => {
  const userId = getUserId(req);
  const { action } = req.body ?? {}; // 'approve' | 'reject'
  const reqRow = AccessRequests.findById(req.params.id);
  if (!reqRow) return res.status(404).json({ error: '申请不存在' });
  if (reqRow.ownerId !== userId) return res.status(403).json({ error: '无权处理该申请' });
  if (action === 'approve') {
    AccessRequests.setStatus(reqRow.id, 'approved');
    AccountGrants.grant(userId, reqRow.requesterId, false); // 默认只读
    return res.json({ ok: true, status: 'approved' });
  } else if (action === 'reject') {
    AccessRequests.setStatus(reqRow.id, 'rejected');
    return res.json({ ok: true, status: 'rejected' });
  }
  return res.status(400).json({ error: 'action 须为 approve 或 reject' });
});

// 我授权出去的人列表（编辑申请人权限用）
router.get('/grantees', (req, res) => {
  const userId = getUserId(req);
  res.json({ grantees: AccountGrants.granteesOf(userId) });
});

// 编辑某被授权人的写权限
router.put('/grantees/:granteeId', (req, res) => {
  const userId = getUserId(req);
  const { canWrite } = req.body ?? {};
  if (typeof canWrite !== 'boolean') {
    return res.status(400).json({ error: 'canWrite 须为布尔值' });
  }
  if (!AccountGrants.find(userId, req.params.granteeId)) {
    return res.status(404).json({ error: '该授权不存在' });
  }
  AccountGrants.setWrite(userId, req.params.granteeId, canWrite);
  res.json({ ok: true });
});

// 撤销某被授权人
router.delete('/grantees/:granteeId', (req, res) => {
  const userId = getUserId(req);
  AccountGrants.revoke(userId, req.params.granteeId);
  res.json({ ok: true });
});

// ============================================================
// 待审改动：手机端离线重放的房间改动，由楼房 owner 在电脑端逐条审批
// ============================================================

// 列出当前用户名下待审的全部改动（按时间正序，逐条处理）
//   管理员 → 全部楼主的待审（admin_decision 尚未最终裁决）
//   楼主   → 仅自己名下、楼主尚未决定的
router.get('/pending-changes', (req, res) => {
  const userId = getUserId(req);
  const list = isAdminUser(userId)
    ? PendingChanges.listForAdmin()
    : PendingChanges.listForOwner(userId);
  res.json({ pendingChanges: list });
});

// ============================================================
// 按 diff 涉及的字段，把房间「精准还原/套用」到目标快照的对应字段值。
// 只动这次改过的字段，不碰别人事后改的其它字段（方案 B 安全回滚关键）。
//   target=proposed → 套用提议；target=original → 回滚到改动前
// rent:<month> 这类交租字段，整组 rentRecords 一并以 target 为准。
// ============================================================
function applyFieldsFromSnapshot(current: Room, target: Room, diff: PendingDiffItem[]): Room {
  const next: any = { ...current };
  let touchedRent = false;
  for (const d of diff) {
    if (d.field.startsWith('rent:')) {
      touchedRent = true;
      continue;
    }
    next[d.field] = (target as any)[d.field];
  }
  if (touchedRent) {
    next.rentRecords = (target as any).rentRecords;
  }
  return next as Room;
}

// ============================================================
// 调和：依据「楼主决定 + 管理员决定」算出该提议最终应否落库，并把主库状态对齐。
// 优先级：管理员决定 > 楼主决定。任一方说 approve→应落库；说 reject→不应落库。
// 谁的决定更高优先且已表态，就用谁的；都未表态视为不落库。
// 然后比较「应否落库」与「当前 applied」，必要时套用提议或回滚到原始快照。
// ============================================================
function reconcile(pending: PendingChange, ownerDecision?: 'approve' | 'reject', adminDecision?: 'approve' | 'reject'): boolean {
  // 最终裁决：管理员优先，否则看楼主
  const finalDecision = adminDecision ?? ownerDecision;
  const shouldApply = finalDecision === 'approve';

  const room = Rooms.findById(pending.roomId);
  if (!room) {
    // 房间已被删，无可套用/回滚
    return false;
  }

  if (shouldApply && !pending.applied) {
    // 需要落库但还没落：按字段套用提议
    Rooms.update(applyFieldsFromSnapshot(room, pending.proposed, pending.diff));
    PendingChanges.setApplied(pending.id, true);
  } else if (!shouldApply && pending.applied) {
    // 不该落库但已落（楼主先批了、管理员翻盘拒绝）：按字段回滚到改动前
    if (pending.original) {
      Rooms.update(applyFieldsFromSnapshot(room, pending.original, pending.diff));
    }
    PendingChanges.setApplied(pending.id, false);
  }
  return shouldApply;
}

// 批准 / 拒绝某条待审改动
//   楼主   → 先到先生效（记录保留，管理员仍可翻盘）
//   管理员 → 最终裁决（覆盖楼主），裁决后记录删除
router.post('/pending-changes/:id/resolve', (req, res) => {
  const userId = getUserId(req);
  const { action } = req.body ?? {}; // 'approve' | 'reject'
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'action 须为 approve 或 reject' });
  }
  const pending = PendingChanges.findById(req.params.id);
  if (!pending) return res.status(404).json({ error: '该改动不存在或已处理' });

  const admin = isAdminUser(userId);
  // 权限：管理员可处理任意；楼主只能处理自己名下
  if (!admin && pending.ownerId !== userId) {
    return res.status(403).json({ error: '无权处理该改动' });
  }

  if (admin) {
    // 管理员裁决 = 最终：按「管理员决定」调和主库，标记已裁决（保留为历史）
    const applied = reconcile(pending, pending.ownerDecision, action);
    PendingChanges.markResolved(pending.id, action);
    return res.json({ ok: true, status: action === 'approve' ? 'approved' : 'rejected', applied, byAdmin: true });
  }

  // 楼主决定：先到先生效，记录保留以便管理员翻盘
  const applied = reconcile(pending, action, undefined);
  PendingChanges.setOwnerDecision(pending.id, action);
  return res.json({ ok: true, status: action === 'approve' ? 'approved' : 'rejected', applied, pendingAdmin: true });
});

// 管理员视角：最近 50 条审批历史
router.get('/pending-changes/history', (req, res) => {
  const userId = getUserId(req);
  if (!isAdminUser(userId)) {
    return res.status(403).json({ error: '仅管理员可查看审批历史' });
  }
  res.json({ history: PendingChanges.listHistory() });
});

// 管理员：删除单条审批历史
router.delete('/pending-changes/history/:id', (req, res) => {
  const userId = getUserId(req);
  if (!isAdminUser(userId)) {
    return res.status(403).json({ error: '仅管理员可操作' });
  }
  const record = PendingChanges.findById(req.params.id);
  if (!record) return res.status(404).json({ error: '记录不存在' });
  PendingChanges.delete(req.params.id);
  res.json({ ok: true });
});

// 管理员：一键清空全部审批历史
router.delete('/pending-changes/history', (req, res) => {
  const userId = getUserId(req);
  if (!isAdminUser(userId)) {
    return res.status(403).json({ error: '仅管理员可操作' });
  }
  PendingChanges.clearHistory();
  res.json({ ok: true });
});

export default router;
