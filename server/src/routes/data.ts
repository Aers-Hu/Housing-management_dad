import { Router } from 'express';
import { Buildings, Rooms, Grants } from '../db/repo.ts';
import { getUserId } from '../middleware/auth.ts';

const router = Router();

// 获取当前请求的用户ID（步骤2接入真正鉴权前，由 auth 中间件提供默认用户）
// 列出可访问的楼房（拥有的 + 被授权的）
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

// 删除楼房（仅 owner）
router.delete('/buildings/:id', (req, res) => {
  const userId = getUserId(req);
  const level = Buildings.accessLevel(userId, req.params.id);
  if (level !== 'owner') return res.status(403).json({ error: '仅楼房拥有者可删除' });
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

// ---- 授权管理（仅 owner 可操作）----

router.get('/buildings/:id/grants', (req, res) => {
  const userId = getUserId(req);
  const level = Buildings.accessLevel(userId, req.params.id);
  if (level !== 'owner') return res.status(403).json({ error: '仅拥有者可管理授权' });
  res.json({ grants: Grants.listForBuilding(req.params.id) });
});

router.post('/buildings/:id/grants', (req, res) => {
  const userId = getUserId(req);
  const level = Buildings.accessLevel(userId, req.params.id);
  if (level !== 'owner') return res.status(403).json({ error: '仅拥有者可管理授权' });
  const { granteeId, permission } = req.body ?? {};
  if (!granteeId || (permission !== 'read' && permission !== 'edit')) {
    return res.status(400).json({ error: 'granteeId 必填，permission 须为 read/edit' });
  }
  const grant = Grants.upsert(req.params.id, granteeId, permission);
  res.status(201).json({ grant });
});

router.delete('/buildings/:id/grants/:granteeId', (req, res) => {
  const userId = getUserId(req);
  const level = Buildings.accessLevel(userId, req.params.id);
  if (level !== 'owner') return res.status(403).json({ error: '仅拥有者可管理授权' });
  Grants.revoke(req.params.id, req.params.granteeId);
  res.json({ ok: true });
});

export default router;
