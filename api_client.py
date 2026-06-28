#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
房屋管家 - 服务器通信客户端

仅用标准库（urllib），不引入第三方依赖，便于 PyInstaller 打包。
负责：配置（服务器地址 + token，存本地）、登录/注册、楼房/房间增删改查，
以及 Python 嵌套数据模型 <-> 服务器扁平模型 的双向转换。
"""

import json
import os
import urllib.request
import urllib.error


# ============================================================
# 本机机器指纹（Windows MachineGuid）
# 管理员账号 GmAersMess 被服务端写死「只准带本机 MachineGuid 的电脑端登录」，
# 这里读取本机注册表里的 MachineGuid，随每个请求带上 X-Machine-Id 头。
# 非 Windows 或读取失败则返回空串（普通账号不受影响，仅管理员账号会被服务端拒）。
# ============================================================
def _read_machine_id():
    try:
        import winreg  # 仅 Windows 有
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                             r"SOFTWARE\Microsoft\Cryptography")
        try:
            val, _ = winreg.QueryValueEx(key, "MachineGuid")
            return str(val).strip()
        finally:
            winreg.CloseKey(key)
    except Exception:
        return ""


MACHINE_ID = _read_machine_id()


# ============================================================
# 异常
# ============================================================
class NetworkError(Exception):
    """网络/服务器不可达"""
    pass


class ApiError(Exception):
    """服务器返回的业务错误"""
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# ============================================================
# 配置（服务器地址 + token，持久化到 app 目录）
# ============================================================
class ClientConfig:
    def __init__(self, app_dir):
        self.path = os.path.join(app_dir, "client_config.json")
        self.server_url = "http://localhost:9091"
        self.token = ""
        self.username = ""
        self.theme = ""  # 主题为客户端本地偏好，服务器不存
        # 本地账号簿：本设备登录过的账号，用于免密切换。
        # 每项 {"username", "token", "server_url"}。token 为 30 天有效的自包含签名。
        self.accounts = []
        self._load()

    def _load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    d = json.load(f)
                self.server_url = d.get("server_url", self.server_url)
                self.token = d.get("token", "")
                self.username = d.get("username", "")
                self.theme = d.get("theme", "")
                accs = d.get("accounts", [])
                if isinstance(accs, list):
                    self.accounts = [a for a in accs if isinstance(a, dict) and a.get("username")]
            except Exception:
                pass

    def save(self):
        try:
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump({
                    "server_url": self.server_url,
                    "token": self.token,
                    "username": self.username,
                    "theme": self.theme,
                    "accounts": self.accounts,
                }, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    # ---- 本地账号簿 ----
    def upsert_account(self, username, token, server_url):
        """登录/注册成功后写入账号簿（同名+同服务器视为同一账号，更新其 token）。"""
        if not username:
            return
        for a in self.accounts:
            if a.get("username") == username and a.get("server_url") == server_url:
                a["token"] = token
                return
        self.accounts.append({"username": username, "token": token, "server_url": server_url})

    def remove_account(self, username, server_url):
        """从账号簿移除某账号。"""
        self.accounts = [
            a for a in self.accounts
            if not (a.get("username") == username and a.get("server_url") == server_url)
        ]

    @staticmethod
    def normalize_url(raw):
        url = (raw or "").strip().rstrip("/")
        if url and not url.startswith(("http://", "https://")):
            url = "http://" + url
        return url


# ============================================================
# HTTP 客户端
# ============================================================
class ApiClient:
    def __init__(self, config: ClientConfig):
        self.cfg = config

    def _api_base(self):
        return self.cfg.server_url.rstrip("/") + "/api/v1"

    def _request(self, method, path, body=None, auth=True, timeout=10):
        url = self._api_base() + path
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        # 标识本机电脑端 + 机器指纹：管理员账号靠这两个头通过服务端设备锁
        req.add_header("X-Client-Type", "desktop")
        if MACHINE_ID:
            req.add_header("X-Machine-Id", MACHINE_ID)
        if auth and self.cfg.token:
            req.add_header("Authorization", "Bearer " + self.cfg.token)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                text = resp.read().decode("utf-8")
                return json.loads(text) if text else None
        except urllib.error.HTTPError as e:
            # 服务器返回了响应，但状态码非 2xx
            try:
                err = json.loads(e.read().decode("utf-8"))
                msg = err.get("error", f"请求失败 ({e.code})")
            except Exception:
                msg = f"请求失败 ({e.code})"
            raise ApiError(e.code, msg)
        except (urllib.error.URLError, TimeoutError, OSError):
            # 连接层失败：断网、服务器没开、超时
            raise NetworkError("无法连接服务器")

    # ---- 认证 ----
    def login(self, username, password):
        data = self._request("POST", "/auth/login",
                             {"username": username, "password": password}, auth=False)
        self.cfg.token = data["token"]
        self.cfg.username = data["user"]["username"]
        self.cfg.upsert_account(self.cfg.username, self.cfg.token, self.cfg.server_url)
        self.cfg.save()
        return data["user"]

    def register(self, username, password):
        data = self._request("POST", "/auth/register",
                             {"username": username, "password": password}, auth=False)
        self.cfg.token = data["token"]
        self.cfg.username = data["user"]["username"]
        self.cfg.upsert_account(self.cfg.username, self.cfg.token, self.cfg.server_url)
        self.cfg.save()
        return data["user"]

    def verify_token(self):
        """校验当前 token 是否有效。返回 user 或抛异常。"""
        data = self._request("GET", "/auth/me")
        return data["user"]

    def logout(self):
        # 仅结束当前会话；账号仍保留在账号簿，30 天内可免密切回
        self.cfg.token = ""
        self.cfg.username = ""
        self.cfg.save()

    def switch_to_account(self, account):
        """切换到账号簿中的某账号：设为当前激活态，并校验其 token 是否仍有效。
        返回 user（有效）；token 失效抛 ApiError；连不上抛 NetworkError。
        校验失败时不污染当前激活态（先备份后恢复）。"""
        prev = (self.cfg.server_url, self.cfg.token, self.cfg.username)
        self.cfg.server_url = account.get("server_url") or self.cfg.server_url
        self.cfg.token = account.get("token", "")
        self.cfg.username = account.get("username", "")
        try:
            user = self.verify_token()
        except (ApiError, NetworkError):
            # 恢复原激活态，避免把界面带到一个无效会话
            self.cfg.server_url, self.cfg.token, self.cfg.username = prev
            raise
        # 校验通过：刷新该账号 token（可能服务端续签）并持久化
        self.cfg.username = user["username"]
        self.cfg.upsert_account(self.cfg.username, self.cfg.token, self.cfg.server_url)
        self.cfg.save()
        return user

    # ---- 楼房/房间（返回服务器原始结构）----
    def list_buildings(self):
        return self._request("GET", "/buildings")["buildings"]

    def get_building(self, bid):
        """返回 {building, rooms, permission}"""
        return self._request("GET", f"/buildings/{bid}")

    def create_building(self, name, floors, rooms_per_floor):
        return self._request("POST", "/buildings",
                             {"name": name, "floors": floors, "roomsPerFloor": rooms_per_floor})["building"]

    def update_building(self, bid, fields):
        return self._request("PUT", f"/buildings/{bid}", fields)["building"]

    def add_floor(self, bid, count):
        """在楼房最高层之上新增一层，count 为该层房间数。"""
        return self._request("POST", f"/buildings/{bid}/floors", {"count": count})["building"]

    def delete_building(self, bid):
        self._request("DELETE", f"/buildings/{bid}")

    def update_room(self, room_sid, body):
        return self._request("PUT", f"/rooms/{room_sid}", body)["room"]

    def add_room(self, building_id, floor, number):
        """在指定楼房楼层新增一个房间。"""
        return self._request("POST", f"/buildings/{building_id}/rooms",
                             {"floor": floor, "number": number})["room"]

    def delete_room(self, room_sid):
        """删除指定房间。"""
        self._request("DELETE", f"/rooms/{room_sid}")

    # ---- 账号级通讯：申请查看 + 授权管理 ----
    def request_access(self, username):
        """申请查看某用户(按用户名)的全部楼房。"""
        return self._request("POST", "/access-requests", {"username": username})["request"]

    def inbox(self):
        """我收到的待处理申请列表（消息状态栏）。"""
        return self._request("GET", "/access-requests/inbox")["requests"]

    def outbox(self):
        """我发出的申请列表（含状态）。"""
        return self._request("GET", "/access-requests/outbox")["requests"]

    def respond_request(self, request_id, approve):
        """同意/拒绝某申请。"""
        action = "approve" if approve else "reject"
        return self._request("POST", f"/access-requests/{request_id}/respond", {"action": action})

    def list_grantees(self):
        """我授权出去的人列表（编辑权限用）。"""
        return self._request("GET", "/grantees")["grantees"]

    def set_grantee_write(self, grantee_id, can_write):
        """设置某被授权人的写权限。"""
        return self._request("PUT", f"/grantees/{grantee_id}", {"canWrite": bool(can_write)})

    def revoke_grantee(self, grantee_id):
        """撤销某被授权人。"""
        self._request("DELETE", f"/grantees/{grantee_id}")

    # ---- 待审改动（手机端离线重放，待 owner 逐条批准）----
    def list_pending_changes(self):
        """列出我名下待审的全部手机端改动（按时间正序）。"""
        return self._request("GET", "/pending-changes")["pendingChanges"]

    def resolve_pending_change(self, change_id, approve):
        """批准/拒绝某条待审改动。approve=True 套用到主库，False 丢弃。"""
        action = "approve" if approve else "reject"
        return self._request("POST", f"/pending-changes/{change_id}/resolve",
                             {"action": action})

    def list_pending_history(self):
        """管理员视角：最近 50 条已裁决的审批历史（按时间倒序）。"""
        return self._request("GET", "/pending-changes/history")["history"]

    def delete_pending_history(self, change_id):
        """管理员：删除单条审批历史。"""
        return self._request("DELETE", f"/pending-changes/history/{change_id}")

    def clear_pending_history(self):
        """管理员：一键清空全部审批历史。"""
        return self._request("DELETE", "/pending-changes/history")


# ============================================================
# 数据模型转换：服务器扁平模型 <-> Python 嵌套模型
# ============================================================

def server_room_to_py(sroom, py_id):
    """
    服务器房间 -> Python 房间。
    py_id 为 Python 网格期望的房间号（如 "0101"），用于 UI 匹配。
    服务器真实 UUID 存入 _sid，其余服务器字段保留备用。
    """
    # rentRecords [{month,paid,amount}] -> rent_paid {month:{paid,amount}}
    rent_paid = {}
    for rec in (sroom.get("rentRecords") or []):
        m = rec.get("month")
        if m:
            rent_paid[m] = {"paid": bool(rec.get("paid", False)),
                            "amount": rec.get("amount", 0) or 0}

    sname = sroom.get("name") or ""
    # 服务器无自定义名时，Python 名 = py_id（保证"非自定义"判定一致）
    py_name = sname if sname else py_id

    return {
        "id": py_id,
        "name": py_name,
        "occupied": bool(sroom.get("isOccupied", False)),
        "tenant_name": sroom.get("tenantName", "") or "",
        "rent_paid": rent_paid,
        "notes": sroom.get("notes", "") or "",
        "lease_start": sroom.get("leaseStartDate", "") or "",
        "lease_months": sroom.get("leaseMonths", 0) or 0,
        # ---- 隐藏字段：回写服务器时用 ----
        "_sid": sroom["id"],
        "_number": sroom.get("number", ""),
        "_floor": sroom.get("floor", 0),
        "_monthly_rent": sroom.get("monthlyRent", 0) or 0,
    }


def py_room_to_server_body(proom):
    """Python 房间 -> 服务器 PUT body。"""
    # rent_paid {month:{paid,amount}} -> rentRecords [{month,paid,amount}]
    rent_records = []
    for month, v in (proom.get("rent_paid") or {}).items():
        if isinstance(v, dict):
            rent_records.append({"month": month,
                                 "paid": bool(v.get("paid", False)),
                                 "amount": v.get("amount", 0) or 0})
        else:
            rent_records.append({"month": month, "paid": bool(v), "amount": 0})

    # 自定义名判定：name != id 视为自定义
    name = proom.get("name", "")
    if name == proom.get("id"):
        name = ""  # 非自定义，服务器存空

    return {
        "floor": proom.get("_floor", 0),
        "number": proom.get("_number", ""),
        "name": name,
        "isOccupied": bool(proom.get("occupied", False)),
        "tenantName": proom.get("tenant_name", ""),
        "monthlyRent": proom.get("_monthly_rent", 0),
        "leaseStartDate": proom.get("lease_start") or None,
        "leaseMonths": proom.get("lease_months") or None,
        "notes": proom.get("notes", ""),
        "rentRecords": rent_records,
    }


def server_building_to_py(sbuilding, srooms):
    """
    服务器楼房 + 房间列表 -> Python 嵌套楼房。
    房间按楼层分组，每层按 number 排序后，重新派生 Python 网格 id：f"{floor:02d}{rn:02d}"。
    """
    floors = sbuilding.get("floors", 0)
    rpf = sbuilding.get("roomsPerFloor", 0)

    # 按楼层分组
    by_floor = {}
    for r in srooms:
        by_floor.setdefault(r.get("floor", 0), []).append(r)
    for f in by_floor:
        by_floor[f].sort(key=lambda x: x.get("number", ""))

    py_rooms = []
    for f in sorted(by_floor.keys()):
        for idx, sroom in enumerate(by_floor[f], start=1):
            py_id = f"{f:02d}{idx:02d}"
            py_rooms.append(server_room_to_py(sroom, py_id))

    # floorLabels (Record<str,str>) -> floor_labels（同形）
    floor_labels = sbuilding.get("floorLabels") or {}

    return {
        "id": sbuilding["id"],
        "name": sbuilding.get("name", ""),
        "floors": floors,
        "rooms_per_floor": rpf,
        "rooms": py_rooms,
        "floor_labels": dict(floor_labels),
    }
