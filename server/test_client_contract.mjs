// 模拟 client/utils/storage.ts 实际发出的 API 调用序列，
// 验证响应结构与客户端代码的期望完全一致。
const BASE = 'http://localhost:9091/api/v1';
let token = '';

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(`${r.status}: ${data?.error}`);
  return data;
}

let ok = 0, fail = 0;
function check(label, cond) {
  if (cond) { ok++; console.log('  ✅', label); }
  else { fail++; console.log('  ❌', label); }
}

(async () => {
  console.log('=== 模拟登录 ===');
  const reg = await call('/auth/register', { method: 'POST', auth: false, body: { username: 'phoneuser', password: 'pass123' } });
  token = reg.token;
  check('注册返回 token + user', !!reg.token && reg.user.username === 'phoneuser');

  console.log('=== 模拟 addBuilding（POST + GET详情）===');
  const created = await call('/buildings', { method: 'POST', body: { name: '同步测试楼', floors: 2, roomsPerFloor: 3 } });
  check('POST /buildings 返回 {building}', !!created.building?.id);
  const bid = created.building.id;
  const detail = await call(`/buildings/${bid}`);
  check('GET /buildings/:id 返回 {building, rooms}', !!detail.building && Array.isArray(detail.rooms));
  check('自动生成 2×3=6 个房间', detail.rooms.length === 6);

  console.log('=== 模拟 loadBuildings ===');
  const list = await call('/buildings');
  check('GET /buildings 返回 {buildings[]}', Array.isArray(list.buildings) && list.buildings.length === 1);

  console.log('=== 模拟 updateRoom（入住租客）===');
  const rid = detail.rooms[0].id;
  const upd = await call(`/rooms/${rid}`, { method: 'PUT', body: {
    isOccupied: true, tenantName: '王五', monthlyRent: 1800,
    leaseStartDate: '2026-03-01', leaseMonths: 6, notes: '安静',
    rentRecords: [{ month: '2026-03', paid: true, amount: 1800 }],
  }});
  check('PUT /rooms/:id 返回 {room}', !!upd.room);
  check('租客名正确(中文)', upd.room.tenantName === '王五');
  check('每月租金记录保留', upd.room.rentRecords?.[0]?.amount === 1800);

  console.log('=== 模拟 loadRooms 复查持久化 ===');
  const recheck = await call(`/buildings/${bid}`);
  const occupied = recheck.rooms.find(r => r.id === rid);
  check('重新拉取房间，租客数据仍在', occupied.tenantName === '王五' && occupied.isOccupied === true);

  console.log('=== 模拟 updateBuilding（扩到3层）===');
  await call(`/buildings/${bid}`, { method: 'PUT', body: { name: '同步测试楼', floors: 3 } });
  const after = await call(`/buildings/${bid}`);
  check('扩层后房间补到 3×3=9', after.rooms.length === 9);
  check('原租客数据未丢', after.rooms.find(r => r.id === rid)?.tenantName === '王五');

  console.log('=== 模拟 deleteRoom / addRoom ===');
  const added = await call(`/buildings/${bid}/rooms`, { method: 'POST', body: { floor: 1, number: '199' } });
  check('POST 新增房间返回 {room}', added.room?.number === '199');
  await call(`/rooms/${added.room.id}`, { method: 'DELETE' });
  check('DELETE 房间成功', true);

  console.log(`\n=== 结果: ${ok} 通过, ${fail} 失败 ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e.message); process.exit(1); });
