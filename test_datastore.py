#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证 house_management.DataStore（服务器后端）的对外接口与 UI 用法一致。"""
import sys, io, os, tempfile, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api_client import ClientConfig, ApiClient
import house_management as hm

ok = 0; fail = 0
def check(label, cond):
    global ok, fail
    if cond: ok += 1; print("  ✅", label)
    else: fail += 1; print("  ❌", label)

tmp = tempfile.mkdtemp()
# 让 DataStore 的缓存写到临时目录
hm.get_app_dir = lambda: tmp

cfg = ClientConfig(tmp)
cfg.server_url = "http://localhost:9091"
api = ApiClient(cfg)
api.register("dsuser_%d" % int(time.time() * 1000), "pass123")

dm = hm.DataStore(api)
check("初始 buildings 为空", dm.buildings == [])
check("非离线模式", dm.offline is False)

print("=== add（模拟 BuildingDialog 产出）===")
dm.add({"id": hm.gen_id(), "name": "甲栋", "floors": 2, "rooms_per_floor": 3,
        "rooms": [], "floor_labels": {}})
check("add 后有 1 栋楼", len(dm.buildings) == 1)
b = dm.buildings[0]
check("楼房名正确", b["name"] == "甲栋")
check("房间自动生成 2×3=6", len(b["rooms"]) == 6)
check("房间为 Python 网格 id", b["rooms"][0]["id"] == "0101")

print("=== find + update 房间（模拟 _open_room 的 on_save）===")
i, bld = dm.find(b["id"])
check("find 命中", i == 0 and bld is not None)
rms = bld["rooms"]
target = rms[0]
target["occupied"] = True
target["tenant_name"] = "孙七"
target["notes"] = "现金付"
target["lease_start"] = "2026-04-01"
target["lease_months"] = 6
target["rent_paid"] = {"2026-04": {"paid": True, "amount": 900}}
bld["rooms"] = rms
dm.update(i, bld)
# 重新 find 验证
i2, bld2 = dm.find(b["id"])
r0 = next((r for r in bld2["rooms"] if r["id"] == "0101"), None)
check("房间更新后租客回读正确", r0 and r0["tenant_name"] == "孙七" and r0["occupied"])
check("rent_paid 保留", r0 and r0["rent_paid"].get("2026-04", {}).get("amount") == 900)

print("=== update 自定义房间名 ===")
i3, bld3 = dm.find(b["id"])
r1 = next(r for r in bld3["rooms"] if r["id"] == "0102")
r1["name"] = "储物间"
dm.update(i3, bld3)
i4, bld4 = dm.find(b["id"])
r1b = next(r for r in bld4["rooms"] if r["id"] == "0102")
check("自定义房间名持久化", r1b["name"] == "储物间")

print("=== update 结构（扩到3层）===")
i5, bld5 = dm.find(b["id"])
bld5["floors"] = 3
dm.update(i5, bld5)
i6, bld6 = dm.find(b["id"])
check("扩层后房间 3×3=9", len(bld6["rooms"]) == 9)
check("原租客孙七未丢", any(r["tenant_name"] == "孙七" for r in bld6["rooms"]))

print("=== theme 本地持久化 ===")
dm.theme = "暗夜黑"
check("theme 写入 config", ClientConfig(tmp).theme == "暗夜黑")

print("=== delete ===")
i7, _ = dm.find(b["id"])
dm.delete(i7)
check("delete 后无楼房", len(dm.buildings) == 0)

print(f"\n=== 结果: {ok} 通过, {fail} 失败 ===")
sys.exit(1 if fail else 0)
