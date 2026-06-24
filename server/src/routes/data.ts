import { Router } from 'express';
import { Buildings, Rooms, Users, AccessRequests, AccountGrants } from '../db/repo.ts';
import { getUserId } from '../middleware/auth.ts';

const router = Router();

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
  const building = Buildings.update(req.params.id, { name, floors, roomsPerFloor, floorLabels });
  res.json({ building });
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

export default router;
