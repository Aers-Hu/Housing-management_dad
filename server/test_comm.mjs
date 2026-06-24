// 验证账号级"申请查看 + 授权"通讯流程
const BASE = 'http://localhost:9097/api/v1';

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  return { status: r.status, data };
}

let ok = 0, fail = 0;
function check(label, cond) {
  if (cond) { ok++; console.log('  ✅', label); }
  else { fail++; console.log('  ❌', label); }
}

(async () => {
  const ts = Date.now();
  const A = `alice_${ts}`, B = `bob_${ts}`;
  console.log('=== 准备：注册 A(房东) 和 B(申请人) ===');
  const ra = await call('/auth/register', { method: 'POST', body: { username: A, password: 'pass123' } });
  const rb = await call('/auth/register', { method: 'POST', body: { username: B, password: 'pass123' } });
  const tokA = ra.data.token, tokB = rb.data.token;
  check('A、B 注册成功', !!tokA && !!tokB);

  // A 建两栋楼
  await call('/buildings', { method: 'POST', body: { name: 'A栋', floors: 1, roomsPerFloor: 2 }, token: tokA });
  await call('/buildings', { method: 'POST', body: { name: 'B栋', floors: 1, roomsPerFloor: 2 }, token: tokA });

  console.log('=== 1. B 申请查看 A 的账号 ===');
  let r = await call('/access-requests', { method: 'POST', body: { username: A }, token: tokB });
  check('B 发起申请成功', r.status === 201);
  // 申请不存在的用户
  r = await call('/access-requests', { method: 'POST', body: { username: 'nobody_xyz' }, token: tokB });
  check('申请不存在用户被拒(404)', r.status === 404);
  // 申请自己
  r = await call('/access-requests', { method: 'POST', body: { username: B }, token: tokB });
  check('申请自己被拒(400)', r.status === 400);

  console.log('=== 2. A 的消息箱收到申请 ===');
  r = await call('/access-requests/inbox', { token: tokA });
  check('A 收到 1 条待处理申请', r.data.requests.length === 1);
  check('申请带申请人用户名', r.data.requests[0].requesterUsername === B);
  const reqId = r.data.requests[0].id;
  // B 的发件箱
  r = await call('/access-requests/outbox', { token: tokB });
  check('B 发件箱能看到申请(pending)', r.data.requests.length === 1 && r.data.requests[0].status === 'pending');

  console.log('=== 3. B 此时还看不到 A 的楼 ===');
  r = await call('/buildings', { token: tokB });
  check('B 列表为空(未批准)', r.data.buildings.length === 0);

  console.log('=== 4. 非 owner 不能处理申请 ===');
  r = await call(`/access-requests/${reqId}/respond`, { method: 'POST', body: { action: 'approve' }, token: tokB });
  check('B 自己不能批准(403)', r.status === 403);

  console.log('=== 5. A 同意申请 ===');
  r = await call(`/access-requests/${reqId}/respond`, { method: 'POST', body: { action: 'approve' }, token: tokA });
  check('A 同意成功', r.status === 200 && r.data.status === 'approved');

  console.log('=== 6. B 现在能看到 A 的全部楼(只读) ===');
  r = await call('/buildings', { token: tokB });
  check('B 看到 A 的 2 栋楼', r.data.buildings.length === 2);
  check('楼房带 owner 用户名', r.data.buildings[0].ownerUsername === A);
  check('权限为只读 read', r.data.buildings.every(b => b.permission === 'read'));
  const bid = r.data.buildings[0].id;

  console.log('=== 7. 只读的 B 不能改/删 ===');
  const detail = await call(`/buildings/${bid}`, { token: tokB });
  const rid = detail.data.rooms[0].id;
  r = await call(`/rooms/${rid}`, { method: 'PUT', body: { tenantName: '偷改' }, token: tokB });
  check('只读 B 改房间被拒(403)', r.status === 403);
  r = await call(`/buildings/${bid}`, { method: 'DELETE', token: tokB });
  check('只读 B 删楼被拒(403)', r.status === 403);

  console.log('=== 8. A 查看被授权人列表 ===');
  r = await call('/grantees', { token: tokA });
  check('A 的被授权人有 B', r.data.grantees.length === 1 && r.data.grantees[0].granteeUsername === B);
  check('B 默认无写权限', r.data.grantees[0].canWrite === false);
  const granteeId = r.data.grantees[0].granteeId;

  console.log('=== 9. A 给 B 开写权限 ===');
  r = await call(`/grantees/${granteeId}`, { method: 'PUT', body: { canWrite: true }, token: tokA });
  check('A 设置写权限成功', r.status === 200);

  console.log('=== 10. B 现在能改 + 删(写=完全控制) ===');
  r = await call(`/rooms/${rid}`, { method: 'PUT', body: { isOccupied: true, tenantName: '小明', monthlyRent: 1000 }, token: tokB });
  check('B 改房间成功', r.status === 200 && r.data.room.tenantName === '小明');
  r = await call('/buildings', { token: tokB });
  check('B 权限升级为 write', r.data.buildings.every(b => b.permission === 'write'));
  r = await call(`/buildings/${bid}`, { method: 'DELETE', token: tokB });
  check('B 能删楼(写=完全控制)', r.status === 200);

  console.log('=== 11. A 撤销 B 的授权 ===');
  r = await call(`/grantees/${granteeId}`, { method: 'DELETE', token: tokA });
  check('撤销成功', r.status === 200);
  r = await call('/buildings', { token: tokB });
  check('B 重新看不到 A 的楼', r.data.buildings.length === 0);

  console.log(`\n=== 结果: ${ok} 通过, ${fail} 失败 ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e.message); process.exit(1); });
