#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证 api_client 的登录、CRUD 和模型双向转换。"""
import sys, io, os, tempfile
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api_client import (ClientConfig, ApiClient, server_building_to_py,
                        py_room_to_server_body, server_room_to_py)

ok = 0; fail = 0
def check(label, cond):
    global ok, fail
    if cond: ok += 1; print("  ✅", label)
    else: fail += 1; print("  ❌", label)

tmp = tempfile.mkdtemp()
cfg = ClientConfig(tmp)
cfg.server_url = "http://localhost:9091"
api = ApiClient(cfg)

print("=== 1. 注册/登录 ===")
user = api.register("pyuser", "pass123")
check("注册成功并拿到 token", bool(cfg.token) and user["username"] == "pyuser")
check("token 已持久化", bool(ClientConfig(tmp).token))
check("verify_token 有效", api.verify_token()["username"] == "pyuser")

print("=== 2. 创建楼房 + 转换为 Python 模型 ===")
sb = api.create_building("测试楼", 3, 4)
detail = api.get_building(sb["id"])
pb = server_building_to_py(detail["building"], detail["rooms"])
check("楼房名正确(中文)", pb["name"] == "测试楼")
check("floors/rooms_per_floor 正确", pb["floors"] == 3 and pb["rooms_per_floor"] == 4)
check("房间数 3×4=12", len(pb["rooms"]) == 12)
# Python 网格 id 格式
ids = [r["id"] for r in pb["rooms"]]
check("房间 id 为 Python 格式 0101", "0101" in ids and "0304" in ids)
check("每个房间带 _sid(服务器UUID)", all(r.get("_sid") for r in pb["rooms"]))

print("=== 3. 改房间(入住租客) -> 转回服务器格式 -> PUT ===")
room = pb["rooms"][0]
room["occupied"] = True
room["tenant_name"] = "赵六"
room["notes"] = "长租"
room["lease_start"] = "2026-05-01"
room["lease_months"] = 12
room["rent_paid"] = {"2026-05": {"paid": True, "amount": 1200},
                     "2026-06": {"paid": False, "amount": 1200}}
body = py_room_to_server_body(room)
check("转换后 isOccupied=True", body["isOccupied"] is True)
check("rentRecords 数组化正确", len(body["rentRecords"]) == 2 and
      any(r["month"] == "2026-05" and r["amount"] == 1200 for r in body["rentRecords"]))
saved = api.update_room(room["_sid"], body)
check("PUT 成功，服务器返回租客名", saved["tenantName"] == "赵六")

print("=== 4. 复查持久化(重新拉取+转换) ===")
detail2 = api.get_building(sb["id"])
pb2 = server_building_to_py(detail2["building"], detail2["rooms"])
r0 = next((r for r in pb2["rooms"] if r["_sid"] == room["_sid"]), None)
check("租客数据回读正确", r0 and r0["tenant_name"] == "赵六" and r0["occupied"])
check("rent_paid 还原为字典格式", r0 and r0["rent_paid"].get("2026-05", {}).get("amount") == 1200)
check("lease 信息保留", r0 and r0["lease_months"] == 12 and r0["lease_start"] == "2026-05-01")

print("=== 5. 改楼房(扩到4层) ===")
api.update_building(sb["id"], {"name": "测试楼", "floors": 4})
detail3 = api.get_building(sb["id"])
pb3 = server_building_to_py(detail3["building"], detail3["rooms"])
check("扩层后房间 4×4=16", len(pb3["rooms"]) == 16)
check("原租客未丢", any(r["tenant_name"] == "赵六" for r in pb3["rooms"]))

print("=== 6. 自定义房间名往返 ===")
r1 = pb3["rooms"][1]
r1["name"] = "主卧"
b1 = py_room_to_server_body(r1)
check("自定义名传给服务器", b1["name"] == "主卧")
# 非自定义（name==id）应传空
r2 = pb3["rooms"][2]
b2 = py_room_to_server_body(r2)
check("非自定义名传空字符串", b2["name"] == "")

print(f"\n=== 结果: {ok} 通过, {fail} 失败 ===")
sys.exit(1 if fail else 0)
