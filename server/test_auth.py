import urllib.request, urllib.error, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
B = 'http://localhost:9091/api/v1'

def call(method, path, body=None, token=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(B + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)

ok = 0; fail = 0
def check(label, cond):
    global ok, fail
    if cond: ok += 1; print(f'  ✅ {label}')
    else: fail += 1; print(f'  ❌ {label}')

print('=== 1. 注册两个账号 ===')
s, a = call('POST', '/auth/register', {'username': 'alice', 'password': 'pass123'})
check('注册 alice 成功', s == 201 and 'token' in a)
tokA = a['token']
s, b = call('POST', '/auth/register', {'username': 'bob', 'password': 'pass456'})
check('注册 bob 成功', s == 201)
tokB = b['token']

print('=== 2. 注册校验 ===')
s, _ = call('POST', '/auth/register', {'username': 'alice', 'password': 'xxxxxx'})
check('重复用户名被拒(409)', s == 409)
s, _ = call('POST', '/auth/register', {'username': 'ab', 'password': 'xxxxxx'})
check('用户名过短被拒(400)', s == 400)
s, _ = call('POST', '/auth/register', {'username': 'charlie', 'password': '123'})
check('密码过短被拒(400)', s == 400)

print('=== 3. 登录 ===')
s, r = call('POST', '/auth/login', {'username': 'alice', 'password': 'pass123'})
check('alice 正确密码登录成功', s == 200 and 'token' in r)
s, r = call('POST', '/auth/login', {'username': 'alice', 'password': 'wrong'})
check('alice 错误密码被拒(401)', s == 401)

print('=== 4. 无 token 访问被拦 ===')
s, _ = call('GET', '/buildings')
check('无 token 访问 /buildings 被拒(401)', s == 401)
s, _ = call('GET', '/buildings', token='forged.token')
check('伪造 token 被拒(401)', s == 401)

print('=== 5. token 有效性 ===')
s, r = call('GET', '/auth/me', token=tokA)
check('alice token 取 /me 成功', s == 200 and r['user']['username'] == 'alice')

print('=== 6. alice 建楼,bob 看不到 ===')
s, r = call('POST', '/buildings', {'name': '海景花园', 'floors': 2, 'roomsPerFloor': 2}, token=tokA)
check('alice 建楼成功', s == 201)
bid = r['building']['id']
s, r = call('GET', '/buildings', token=tokA)
check('alice 能看到自己的楼', s == 200 and len(r['buildings']) == 1)
s, r = call('GET', '/buildings', token=tokB)
check('bob 看不到 alice 的楼(数据隔离)', s == 200 and len(r['buildings']) == 0)
s, r = call('GET', f'/buildings/{bid}', token=tokB)
check('bob 直接访问 alice 的楼被拒(404)', s == 404)

print('=== 7. 授权:alice 给 bob 只读 ===')
s, r = call('GET', '/auth/users/lookup?username=bob', token=tokA)
check('alice 查到 bob 的ID', s == 200)
bobId = r['user']['id']
s, r = call('POST', f'/buildings/{bid}/grants', {'granteeId': bobId, 'permission': 'read'}, token=tokA)
check('alice 授权 bob 只读成功', s == 201)
s, r = call('GET', '/buildings', token=tokB)
check('bob 现在能看到这栋楼', s == 200 and len(r['buildings']) == 1 and r['buildings'][0]['permission'] == 'read')
# bob 尝试改房间(只读应失败)
s, detail = call('GET', f'/buildings/{bid}', token=tokB)
rid = detail['rooms'][0]['id']
s, _ = call('PUT', f'/rooms/{rid}', {'tenantName': '偷改的'}, token=tokB)
check('bob 只读权限改房间被拒(403)', s == 403)

print('=== 8. 升级为可编辑 ===')
s, _ = call('POST', f'/buildings/{bid}/grants', {'granteeId': bobId, 'permission': 'edit'}, token=tokA)
check('alice 把 bob 升级为可编辑', s == 201)
s, r = call('PUT', f'/rooms/{rid}', {'isOccupied': True, 'tenantName': '李四', 'monthlyRent': 2000}, token=tokB)
check('bob 可编辑权限改房间成功', s == 200 and r['room']['tenantName'] == '李四')
# bob 仍不能删楼(仅owner)
s, _ = call('DELETE', f'/buildings/{bid}', token=tokB)
check('bob 不能删楼(仅owner)', s == 403)

print('=== 9. 撤销授权 ===')
s, _ = call('DELETE', f'/buildings/{bid}/grants/{bobId}', token=tokA)
check('alice 撤销 bob 授权', s == 200)
s, r = call('GET', '/buildings', token=tokB)
check('bob 重新看不到这栋楼', s == 200 and len(r['buildings']) == 0)

print(f'\n=== 结果: {ok} 通过, {fail} 失败 ===')
sys.exit(1 if fail else 0)
