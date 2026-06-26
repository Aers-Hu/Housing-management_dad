#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
楼房管理系统 v2.2 - House Management System
横向滚动 · 楼层重命名 · 租金金额 · 多主题
"""

import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import json, os, sys, copy
import threading
import urllib.request, urllib.error
from datetime import datetime, timedelta
import calendar

from api_client import (ClientConfig, ApiClient, NetworkError, ApiError,
                        server_building_to_py, py_room_to_server_body)

# ============================================================
# IP -> 人类可读地理位置（待审弹窗显示提交来源用）
#
# 三种情况：
# - 回环/隧道地址（127.x / ::1 / ::ffff:127.x）：经 TCP 隧道转发的外网请求会落到这里，
#   拿不到手机真实公网 IP，显示「经隧道接入（无法定位真实位置）」。
# - 真正的私有局域网地址（192.168.x / 10.x / 172.16-31.x，同 WiFi 时常见）：显示「家庭局域网」。
# - 公网地址：调用 ip-api.com 免费接口（免密钥、支持中文）查城市，失败则回退显示原始 IP。
# 结果带内存缓存，避免同一 IP 反复查询。后台线程查，绝不阻塞界面。
# ============================================================
_GEO_CACHE = {}

def _is_loopback_ip(ip):
    """回环/未指定地址：经 TCP 隧道转发的外网请求在服务端会显示为这类地址。"""
    if not ip:
        return True
    ip = ip.strip().lower()
    if ip in ("localhost", "0.0.0.0", "::", "::1"):
        return True
    # IPv4 回环 127.0.0.0/8，含 IPv4-mapped IPv6（::ffff:127.x.x.x）
    v4 = ip[len("::ffff:"):] if ip.startswith("::ffff:") else ip
    if v4.startswith("127."):
        return True
    return False

def _is_private_ip(ip):
    """判断是否为私有/链路本地地址（局域网内，无法地理定位）。不含回环（回环单独判）。"""
    if not ip:
        return False
    ip = ip.strip()
    if ip.startswith("192.168.") or ip.startswith("10.") or ip.startswith("169.254."):
        return True
    if ip.startswith("172."):
        try:
            second = int(ip.split(".")[1])
            if 16 <= second <= 31:
                return True
        except (ValueError, IndexError):
            pass
    # IPv6 私有/链路本地段
    low = ip.lower()
    if low.startswith("fe80:") or low.startswith("fc") or low.startswith("fd"):
        return True
    return False

def resolve_ip_location(ip):
    """把 IP 转为人类可读地址。同步调用（应在后台线程里用）。带缓存。"""
    if ip in _GEO_CACHE:
        return _GEO_CACHE[ip]
    if _is_loopback_ip(ip):
        result = "经隧道接入（无法定位真实位置）"
        _GEO_CACHE[ip] = result
        return result
    if _is_private_ip(ip):
        result = "家庭局域网（同一网络内）"
        _GEO_CACHE[ip] = result
        return result
    try:
        url = f"http://ip-api.com/json/{ip}?lang=zh-CN&fields=status,country,regionName,city,isp"
        req = urllib.request.Request(url, headers={"User-Agent": "house-mgmt"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if data.get("status") == "success":
            parts = [data.get("country", ""), data.get("regionName", ""), data.get("city", "")]
            seen, loc = set(), []
            for p in parts:
                if p and p not in seen:
                    seen.add(p); loc.append(p)
            text = " ".join(loc) if loc else ip
            isp = data.get("isp", "")
            if isp:
                text += f"（{isp}）"
            result = text
        else:
            result = f"{ip}（无法定位）"
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
        result = f"{ip}（定位失败）"
    _GEO_CACHE[ip] = result
    return result

# ============================================================
# 5套主题
# ============================================================
THEMES = {
    "暗夜黑": {
        "icon":"🌙","bg":"#1A1A1E","card":"#252528","card_hover":"#2E2E33",
        "surface":"#1E1E22","topbar":"#16161A","sidebar_bg":"#121215",
        "primary":"#4A9EFF","primary_dim":"#2A5A8F","success":"#4CAF50",
        "danger":"#EF5350","warning":"#FF9800","text":"#E8E8ED",
        "text_secondary":"#9898A0","text_dim":"#686870","border":"#353538",
        "divider":"#2A2A2E","white":"#FFFFFF",
    },
    "极简白": {
        "icon":"☀️","bg":"#F2F2F7","card":"#FFFFFF","card_hover":"#F5F5FA",
        "surface":"#FAFAFA","topbar":"#FFFFFF","sidebar_bg":"#E8E8ED",
        "primary":"#007AFF","primary_dim":"#B3D9FF","success":"#34C759",
        "danger":"#FF3B30","warning":"#FF9500","text":"#1C1C1E",
        "text_secondary":"#6E6E73","text_dim":"#AEAEB2","border":"#D1D1D6",
        "divider":"#E5E5EA","white":"#FFFFFF",
    },
    "森林绿": {
        "icon":"🌿","bg":"#1B1E1C","card":"#252826","card_hover":"#2E322F",
        "surface":"#1E211F","topbar":"#161917","sidebar_bg":"#121413",
        "primary":"#4CAF50","primary_dim":"#2E5A30","success":"#66BB6A",
        "danger":"#EF5350","warning":"#FFB74D","text":"#E8EDE8",
        "text_secondary":"#98A098","text_dim":"#687068","border":"#353835",
        "divider":"#2A2E2A","white":"#FFFFFF",
    },
    "海洋蓝": {
        "icon":"🌊","bg":"#1A1D24","card":"#22262E","card_hover":"#2B3039",
        "surface":"#1C2027","topbar":"#14171D","sidebar_bg":"#101217",
        "primary":"#5C9CEF","primary_dim":"#2A4A7F","success":"#4FC3F7",
        "danger":"#EF5350","warning":"#FFB74D","text":"#E8ECF2",
        "text_secondary":"#98A4B4","text_dim":"#687484","border":"#353A44",
        "divider":"#2A2F38","white":"#FFFFFF",
    },
    "暖橙色": {
        "icon":"🌅","bg":"#1E1B1A","card":"#282422","card_hover":"#332E2B",
        "surface":"#211D1C","topbar":"#191615","sidebar_bg":"#141110",
        "primary":"#FF9800","primary_dim":"#7F4D00","success":"#FFB74D",
        "danger":"#EF5350","warning":"#FFC107","text":"#EDE8E4",
        "text_secondary":"#A09890","text_dim":"#706860","border":"#383530",
        "divider":"#2E2A26","white":"#FFFFFF",
    },
}
DEFAULT_THEME = "暗夜黑"
C = THEMES[DEFAULT_THEME]

FONT_TITLE  = ("Microsoft YaHei UI", 20, "bold")
FONT_HEADER = ("Microsoft YaHei UI", 15, "bold")
FONT_BODY   = ("Microsoft YaHei UI", 11)
FONT_SMALL  = ("Microsoft YaHei UI", 9)
FONT_BTN    = ("Microsoft YaHei UI", 11)


# ============================================================
# 工具
# ============================================================
def get_app_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

def gen_id():
    return datetime.now().strftime("%Y%m%d%H%M%S%f")

def parse_date(s):
    """灵活解析日期，兼容 2026-06-18 和 2026-6-18 等格式"""
    if not s: return None
    parts = s.strip().split('-')
    if len(parts) == 3:
        try: return datetime(int(parts[0]), int(parts[1]), int(parts[2]))
        except: pass
    return None

def normalize_date_str(s):
    """将日期字符串规范化为 YYYY-MM-DD 格式"""
    dt = parse_date(s)
    return dt.strftime("%Y-%m-%d") if dt else s

def fmt_date(s):
    if not s: return ""
    dt = parse_date(s)
    if dt: return dt.strftime("%Y年%m月%d日")
    return s

def remaining_months(start_str, total_months):
    """计算剩余完整月份数（按自然月计算）"""
    if not start_str or total_months <= 0: return -1
    dt = parse_date(start_str)
    if dt:
        try:
            # 按月份计算到期日
            total = dt.month + int(total_months) - 1
            year = dt.year + total // 12
            month = total % 12 + 1
            max_day = calendar.monthrange(year, month)[1]
            end = datetime(year, month, min(dt.day, max_day))
            now = datetime.now()
            if now >= end: return 0
            # 计算从now到end的完整月份差
            months_count = (end.year - now.year) * 12 + (end.month - now.month)
            if end.day < now.day:
                months_count -= 1
            return max(0, months_count)
        except: return -1
    return -1

def end_date_str(start_str, total_months):
    """按月份加减计算到期日，例如 2026-01-01 + 12个月 = 2027-01-01"""
    if not start_str or total_months <= 0: return ""
    dt = parse_date(start_str)
    if dt:
        try:
            # 月份累加
            total = dt.month + int(total_months) - 1
            year = dt.year + total // 12
            month = total % 12 + 1
            # 处理目标月份天数不足的情况（如1月31日 + 1个月 → 2月28/29日）
            max_day = calendar.monthrange(year, month)[1]
            day = min(dt.day, max_day)
            return datetime(year, month, day).strftime("%Y-%m-%d")
        except: return ""
    return ""

def rent_is_paid(rent_paid, month_key):
    """安全获取某月是否已付（兼容 bool/dict/None 格式）"""
    if not rent_paid: return False
    v = rent_paid.get(month_key, False)
    if isinstance(v, dict): return v.get("paid", False)
    return bool(v)

def rent_amount(rent_paid, month_key):
    """安全获取某月租金金额"""
    if not rent_paid: return 0
    v = rent_paid.get(month_key, False)
    if isinstance(v, dict): return v.get("amount", 0)
    return 0

def set_rent(rent_paid, month_key, paid=None, amount=None):
    """设置某月租金（自动处理 None → dict）"""
    if not isinstance(rent_paid, dict):
        # None 或其他非法值 → 初始化为空
        return  # 不能在原地修改，调用方需确保传入的是有效的可变字典
    old = rent_paid.get(month_key, False)
    if isinstance(old, dict):
        entry = dict(old)
    else:
        entry = {"paid": bool(old), "amount": 0}
    if paid is not None: entry["paid"] = paid
    if amount is not None: entry["amount"] = amount
    rent_paid[month_key] = entry

def month_key_from_lease(lease_start, month_index):
    """根据租期开始日期和月份序号生成 YYYY-MM 格式键（与手机端统一）。
    month_index 从 1 开始。
    若 lease_start 无效，回退到纯数字键（兼容旧数据）。"""
    if not lease_start:
        return str(month_index)
    try:
        parts = lease_start.split('-')
        if len(parts) < 2:
            return str(month_index)
        year = int(parts[0])
        month = int(parts[1])
        # 月份累加：以 lease_start 的月份为基准
        total = year * 12 + month - 1 + month_index - 1
        y = total // 12
        m = total % 12 + 1
        return f"{y}-{m:02d}"
    except Exception:
        return str(month_index)


def migrate_rent_paid(rent_paid):
    """迁移旧格式 rent_paid（bool → {paid, amount}），同时处理 None"""
    if not rent_paid:
        return
    for k, v in list(rent_paid.items()):
        if not isinstance(v, dict):
            rent_paid[k] = {"paid": bool(v), "amount": 0}

def migrate_all_data(data):
    """迁移所有房间的旧数据格式，修复 None 值"""
    for b in data.get("buildings", []):
        for r in b.get("rooms", []):
            rp = r.get("rent_paid")
            if rp is None or not isinstance(rp, dict):
                r["rent_paid"] = {}
            else:
                migrate_rent_paid(rp)


# ============================================================
# 组件
# ============================================================
class RoundedBtn(tk.Canvas):
    def __init__(self, parent, text, command=None, width=120, height=36,
                 bg=None, fg=None, font=FONT_BTN, **kw):
        if bg is None: bg = C["primary"]
        if fg is None: fg = C["white"]
        canvas_bg = kw.pop("canvas_bg", C["bg"])
        super().__init__(parent, width=width, height=height,
                         bg=canvas_bg, highlightthickness=0, **kw)
        self.btn_bg, self.fg, self.cmd, self.txt = bg, fg, command, text
        self.w, self.h, self.font = width, height, font
        self._p = False
        for e, cb in [("<Button-1>",self._d),("<Enter>",self._o),
                      ("<Leave>",self._l),("<ButtonRelease-1>",self._u)]:
            self.bind(e, cb)
        self._draw()

    def _draw(self, hover=False, pressed=False):
        self.delete("all")
        c = self.btn_bg
        outline = c
        if pressed:
            # 按下：明显加深/提亮 + 描边，给出强反馈
            c = self._shift(self.btn_bg, 0.18)
            outline = self._ring(self.btn_bg)
        elif hover:
            # 悬停：按底色明暗自适应调整（深色提亮、浅色加深），并加描边圈
            # 避免在深色主题里"越调越暗 → 与背景融为一体 → 看着像消失"
            c = self._shift(self.btn_bg, 0.12)
            outline = self._ring(self.btn_bg)
        self._rr(1,1,self.w-1,self.h-1,8,fill=c,outline=outline,width=2)
        self.create_text(self.w//2, self.h//2, text=self.txt,
                         fill=self.fg, font=self.font)
    def _rr(self,x1,y1,x2,y2,r,**kw):
        return self.create_polygon([x1+r,y1,x2-r,y1,x2,y1,x2,y1+r,
                x2,y2-r,x2,y2,x2-r,y2,x1+r,y2,x1,y2,x1,y2-r,x1,y1+r,x1,y1],
                smooth=True,**kw)
    def _rgb(self, hx):
        hx = hx.lstrip("#")
        return int(hx[0:2],16), int(hx[2:4],16), int(hx[4:6],16)
    def _hex(self, r, g, b):
        clamp = lambda v: max(0, min(255, int(v)))
        return f"#{clamp(r):02x}{clamp(g):02x}{clamp(b):02x}"
    def _lum(self, hx):
        """感知亮度 0~255，用于判断按钮底色是深是浅。"""
        r, g, b = self._rgb(hx)
        return 0.299*r + 0.587*g + 0.114*b
    def _dark(self, hx, f):
        r, g, b = self._rgb(hx)
        return self._hex(r*(1-f), g*(1-f), b*(1-f))
    def _light(self, hx, f):
        r, g, b = self._rgb(hx)
        return self._hex(r+(255-r)*f, g+(255-g)*f, b+(255-b)*f)
    def _shift(self, hx, f):
        """明暗自适应：底色偏暗→提亮，底色偏亮→加深，保证对比变化看得见。"""
        return self._light(hx, f) if self._lum(hx) < 128 else self._dark(hx, f)
    def _ring(self, hx):
        """描边圈颜色：与底色反向，确保边框在任何主题都可见。"""
        return self._light(hx, 0.45) if self._lum(hx) < 128 else self._dark(hx, 0.35)
    def _d(self,e): self._p=True; self._draw(pressed=True)
    def _u(self,e):
        if self._p and self.cmd: self.cmd()
        self._p=False; self._draw()
    def _o(self,e): self._draw(hover=True)
    def _l(self,e): self._draw()  # 不重置_p，避免鼠标微动导致点击失效

    def set_label(self, text=None, bg=None, fg=None):
        """运行时更新按钮文字/颜色并重绘（如消息数变化）。"""
        if text is not None: self.txt = text
        if bg is not None: self.btn_bg = bg
        if fg is not None: self.fg = fg
        self._draw()


class BackBtn(tk.Canvas):
    def __init__(self, parent, command, **kw):
        bg = kw.pop("bg", C["card"])
        super().__init__(parent, width=38, height=38,
                         bg=bg, highlightthickness=0, **kw)
        self.cmd = command
        self.bind("<Button-1>", lambda e: self.cmd())
        self.bind("<Enter>", self._o); self.bind("<Leave>", self._l)
        self._draw(False)
    def _draw(self, h):
        self.delete("all")
        bg = C["border"] if h else C["card"]
        self._rr(0,0,38,38,8,fill=bg,outline=bg)
        self.create_line(22,11,13,19,22,27,fill=C["primary"],
                         width=2.5,capstyle=tk.ROUND,joinstyle=tk.ROUND)
    def _rr(self,x1,y1,x2,y2,r,**kw):
        return self.create_polygon([x1+r,y1,x2-r,y1,x2,y1,x2,y1+r,
                x2,y2-r,x2,y2,x2-r,y2,x1+r,y2,x1,y2,x1,y2-r,x1,y1+r,x1,y1],
                smooth=True,**kw)
    def _o(self,e): self._draw(True)
    def _l(self,e): self._draw(False)


def bind_scroll(widget, canvas):
    """递归为widget及其所有子widget绑定滚轮滚动到指定canvas"""
    widget.bind("<MouseWheel>", lambda e: canvas.yview_scroll(int(-e.delta/120), "units"))
    for child in widget.winfo_children():
        bind_scroll(child, canvas)


def make_entry(parent, var=None, width=None, **kw):
    opts = dict(font=FONT_BODY, relief=tk.FLAT, bd=0, bg=C["card"],
                fg=C["text"], insertbackground=C["primary"],
                highlightbackground=C["border"],
                highlightcolor=C["primary"], highlightthickness=1)
    if width: opts["width"] = width
    opts.update(kw)
    return tk.Entry(parent, textvariable=var, **opts)


# ============================================================
# 数据
# ============================================================
class DataStore:
    """
    服务器后端的数据存储（对外接口与原本地版本一致，UI 代码无需改动）。
    - buildings / find / add / update / delete 走服务器 API
    - theme 为本地偏好，存 client_config.json
    - 断网时回退本地缓存（只读），写操作会提示需联网
    """
    def __init__(self, api):
        self.api = api
        self.cache_path = os.path.join(get_app_dir(), "housing_cache.json")
        self._buildings = []      # Python 嵌套结构列表
        self._snapshots = {}      # bid -> 上次服务器状态的深拷贝（用于 diff）
        self.offline = False      # 当前是否处于离线（缓存）模式
        self.load()

    def load(self):
        """从服务器拉取全部楼房（含房间），转换为 Python 嵌套结构。断网回退缓存。"""
        try:
            slist = self.api.list_buildings()
            blds = []
            for sb in slist:
                detail = self.api.get_building(sb["id"])
                pb = server_building_to_py(detail["building"], detail["rooms"])
                # 附加 owner 信息，用于区分"自己的"和"他人的"楼房
                pb["_owner_username"] = sb.get("ownerUsername", "")
                pb["_permission"] = sb.get("permission", "owner")  # owner/write/read
                blds.append(pb)
            self._buildings = blds
            self.offline = False
            self._refresh_snapshots()
            self._write_cache()
        except NetworkError:
            self._buildings = self._read_cache()
            self._refresh_snapshots()
            self.offline = True
        return self._buildings

    def _refresh_snapshots(self):
        self._snapshots = {b["id"]: copy.deepcopy(b) for b in self._buildings}

    def _write_cache(self):
        try:
            with open(self.cache_path, "w", encoding="utf-8") as f:
                json.dump({"buildings": self._buildings}, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def _read_cache(self):
        if os.path.exists(self.cache_path):
            try:
                with open(self.cache_path, "r", encoding="utf-8") as f:
                    return json.load(f).get("buildings", [])
            except Exception:
                pass
        return []

    def save(self):
        """改动已即时推送服务器，这里仅刷新本地缓存。"""
        self._write_cache()

    @property
    def buildings(self):
        return self._buildings

    @property
    def theme(self):
        return self.api.cfg.theme or DEFAULT_THEME

    @theme.setter
    def theme(self, val):
        self.api.cfg.theme = val
        self.api.cfg.save()

    def add(self, b):
        """新增楼房：POST 到服务器，回填服务器结构。需联网。"""
        sb = self.api.create_building(b.get("name", ""), b.get("floors", 0),
                                      b.get("rooms_per_floor", 0))
        # 若设置了楼层标签，补一次 PUT
        if b.get("floor_labels"):
            self.api.update_building(sb["id"], {
                "name": sb.get("name", ""),
                "floorLabels": b["floor_labels"],
            })
        detail = self.api.get_building(sb["id"])
        pb = server_building_to_py(detail["building"], detail["rooms"])
        self._buildings.append(pb)
        self._snapshots[pb["id"]] = copy.deepcopy(pb)
        self._write_cache()

    def update(self, idx, b):
        """
        更新楼房。区分两类（对比上次服务器快照，因 UI 会原地修改对象）：
        - 结构性变更(名称/层数/每层数/楼层标签)：PUT 楼房，重载该楼
        - 房间内容变更：逐个比对 _sid，只 PUT 变化的房间
        """
        if idx < 0 or idx >= len(self._buildings):
            return
        bid = b["id"]
        old = self._snapshots.get(bid, {})

        structural = (
            b.get("name") != old.get("name") or
            b.get("floors") != old.get("floors") or
            b.get("rooms_per_floor") != old.get("rooms_per_floor") or
            b.get("floor_labels") != old.get("floor_labels")
        )

        if structural:
            self.api.update_building(bid, {
                "name": b.get("name", ""),
                "floors": b.get("floors", 0),
                "roomsPerFloor": b.get("rooms_per_floor", 0),
                "floorLabels": b.get("floor_labels") or {},
            })
        else:
            # 房间内容变更：找出有 _sid 且内容变化的房间，逐个推送
            old_by_sid = {r.get("_sid"): r for r in old.get("rooms", []) if r.get("_sid")}
            for r in b.get("rooms", []):
                sid = r.get("_sid")
                if not sid:
                    continue
                if old_by_sid.get(sid) != r:
                    self.api.update_room(sid, py_room_to_server_body(r))

        # 重载该楼，保证本地结构与服务器一致（含服务端补的房间）
        detail = self.api.get_building(bid)
        pb = server_building_to_py(detail["building"], detail["rooms"])
        self._buildings[idx] = pb
        self._snapshots[bid] = copy.deepcopy(pb)
        self._write_cache()

    def delete(self, idx):
        if idx < 0 or idx >= len(self._buildings):
            return
        bid = self._buildings[idx]["id"]
        self.api.delete_building(bid)
        del self._buildings[idx]
        self._snapshots.pop(bid, None)
        self._write_cache()

    def find(self, bid):
        for i, b in enumerate(self._buildings):
            if b.get("id") == bid: return i, b
        return -1, None

    @staticmethod
    def new_room(rid):
        return {"id": rid, "name": rid, "occupied": False, "tenant_name": "",
                "rent_paid": {}, "notes": "", "lease_start": "", "lease_months": 0}


# ============================================================
# 对话框：编辑楼房（含楼层标签编辑）
# ============================================================
class BuildingDialog(tk.Toplevel):
    def __init__(self, parent, on_save, building=None):
        super().__init__(parent)
        self.cb = on_save; self.building = building; self.result = None
        is_edit = building is not None

        self.title("编辑楼房" if is_edit else "添加楼房")
        self.resizable(False, False)
        self.configure(bg=C["bg"])
        self.transient(parent); self.grab_set()
        self._ui()
        self._center(parent)

    def _center(self, p):
        self.update_idletasks()
        w = self.winfo_reqwidth()
        h = self.winfo_reqheight()
        x = p.winfo_rootx() + (p.winfo_width()-w)//2
        y = p.winfo_rooty() + (p.winfo_height()-h)//2
        self.geometry(f"+{x}+{y}")

    def _ui(self):
        pad_x = 24

        # 标题
        tk.Label(self, text="编辑楼房信息" if self.building else "添加新楼房",
                 font=FONT_TITLE, fg=C["text"], bg=C["bg"]).pack(pady=(20,14))

        # 名称
        tk.Label(self, text="楼房名称", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, padx=pad_x, pady=(8,2))
        self.name_var = tk.StringVar(value=self.building["name"] if self.building else "")
        make_entry(self, self.name_var).pack(fill=tk.X, padx=pad_x, ipady=8)

        # 层数
        tk.Label(self, text="层数", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, padx=pad_x, pady=(14,2))
        f1 = tk.Frame(self, bg=C["bg"]); f1.pack(fill=tk.X, padx=pad_x)
        self.floors_var = tk.IntVar(value=self.building["floors"] if self.building else 5)
        tk.Scale(f1, from_=1, to=30, orient=tk.HORIZONTAL,
                 variable=self.floors_var, bg=C["bg"],
                 troughcolor=C["border"], activebackground=C["primary"],
                 highlightthickness=0, length=380, fg=C["text"],
                 font=FONT_SMALL).pack(side=tk.LEFT)
        tk.Label(f1, textvariable=self.floors_var, font=FONT_BODY,
                 fg=C["primary"], bg=C["bg"], width=3).pack(side=tk.RIGHT)

        # 每层户数
        tk.Label(self, text="每层户数", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, padx=pad_x, pady=(14,2))
        f2 = tk.Frame(self, bg=C["bg"]); f2.pack(fill=tk.X, padx=pad_x)
        self.rooms_var = tk.IntVar(value=self.building["rooms_per_floor"] if self.building else 4)
        tk.Scale(f2, from_=1, to=10, orient=tk.HORIZONTAL,
                 variable=self.rooms_var, bg=C["bg"],
                 troughcolor=C["border"], activebackground=C["primary"],
                 highlightthickness=0, length=380, fg=C["text"],
                 font=FONT_SMALL).pack(side=tk.LEFT)
        tk.Label(f2, textvariable=self.rooms_var, font=FONT_BODY,
                 fg=C["primary"], bg=C["bg"], width=3).pack(side=tk.RIGHT)

        # ---- 修改楼层号（仅编辑模式） ----
        self._floor_labels_frame = tk.Frame(self, bg=C["bg"])

        if self.building:
            tk.Label(self, text="🏷️ 修改楼层号", font=FONT_HEADER,
                     fg=C["text"], bg=C["bg"]).pack(anchor=tk.W, padx=pad_x, pady=(18,4))
            tk.Label(self, text="可为每层设置自定义名称（留空则使用默认编号）",
                     font=FONT_SMALL, fg=C["text_secondary"],
                     bg=C["bg"]).pack(anchor=tk.W, padx=pad_x, pady=(0,6))
            self._floor_labels_frame.pack(fill=tk.X, padx=20, pady=4)
            self._floor_entries = {}
            self._build_floor_label_entries()
        else:
            self._floor_entries = {}

        # ---- 批量修改房屋名字（仅编辑模式） ----
        if self.building:
            tk.Label(self, text="🔧 批量操作", font=FONT_HEADER,
                     fg=C["text"], bg=C["bg"]).pack(anchor=tk.W, padx=pad_x, pady=(18,4))

            # 查找/替换行
            br_frame = tk.Frame(self, bg=C["card"],
                                highlightbackground=C["border"], highlightthickness=1)
            br_frame.pack(fill=tk.X, padx=pad_x, pady=4)
            br_inner = tk.Frame(br_frame, bg=C["card"])
            br_inner.pack(fill=tk.X, padx=12, pady=10)

            tk.Label(br_inner, text="批量修改房屋名字", font=FONT_BODY,
                     fg=C["text"], bg=C["card"]).pack(anchor=tk.W, pady=(0,8))

            row1 = tk.Frame(br_inner, bg=C["card"])
            row1.pack(fill=tk.X, pady=2)
            tk.Label(row1, text="查找：", font=FONT_SMALL,
                     fg=C["text_secondary"], bg=C["card"], width=6).pack(side=tk.LEFT)
            self.br_find_var = tk.StringVar()
            tk.Entry(row1, textvariable=self.br_find_var, font=FONT_SMALL,
                     relief=tk.FLAT, bd=0, bg=C["bg"], fg=C["text"], width=14,
                     insertbackground=C["primary"],
                     highlightbackground=C["border"],
                     highlightcolor=C["primary"],
                     highlightthickness=1).pack(side=tk.LEFT, ipady=4)
            tk.Label(row1, text="  替换为：", font=FONT_SMALL,
                     fg=C["text_secondary"], bg=C["card"]).pack(side=tk.LEFT)
            self.br_repl_var = tk.StringVar()
            tk.Entry(row1, textvariable=self.br_repl_var, font=FONT_SMALL,
                     relief=tk.FLAT, bd=0, bg=C["bg"], fg=C["text"], width=14,
                     insertbackground=C["primary"],
                     highlightbackground=C["border"],
                     highlightcolor=C["primary"],
                     highlightthickness=1).pack(side=tk.LEFT, ipady=4)

            # 示例提示
            tk.Label(br_inner, text="例：查找 01 替换为 81 → 0102 改名为 8102",
                     font=("Microsoft YaHei UI", 7), fg=C["text_dim"],
                     bg=C["card"]).pack(anchor=tk.W, pady=(4,2))

            # 预览结果
            self.br_preview = tk.Label(br_inner, text="", font=FONT_SMALL,
                                       fg=C["primary"], bg=C["card"], justify=tk.LEFT)
            self.br_preview.pack(anchor=tk.W, pady=(4,0))

            # 监听输入变化实时预览
            self.br_find_var.trace_add("write", lambda *a: self._preview_rename())
            self.br_repl_var.trace_add("write", lambda *a: self._preview_rename())

            # 应用按钮
            RoundedBtn(br_inner, "应用批量改名", command=self._apply_batch_rename,
                       bg=C["primary_dim"], fg=C["white"], font=FONT_SMALL,
                       width=120, height=28, canvas_bg=C["card"]).pack(pady=(8,2))

        # ---- 按钮（直接在窗口底部） ----
        bf = tk.Frame(self, bg=C["bg"])
        bf.pack(side=tk.BOTTOM, fill=tk.X, pady=(16,14), padx=pad_x)
        RoundedBtn(bf, "取消", command=self.destroy,
                   bg=C["border"], fg=C["text"], width=100, height=38,
                   canvas_bg=C["bg"]).pack(side=tk.LEFT, padx=6)
        RoundedBtn(bf, "💾 保存", command=self._save, width=100, height=38,
                   canvas_bg=C["bg"]).pack(side=tk.LEFT, padx=6)

        # 监听层数变化
        self.floors_var.trace_add("write", lambda *a: self._on_floors_change())

    def _build_floor_label_entries(self):
        for w in self._floor_labels_frame.winfo_children():
            w.destroy()
        self._floor_entries.clear()

        floors = self.floors_var.get()
        old_labels = self.building.get("floor_labels", {}) if self.building else {}

        for fn in range(1, floors+1):
            row = tk.Frame(self._floor_labels_frame, bg=C["bg"])
            row.pack(fill=tk.X, pady=2)

            tk.Label(row, text=f"第{fn}层 →", font=FONT_SMALL,
                     fg=C["text_secondary"], bg=C["bg"], width=7, anchor=tk.E).pack(
                side=tk.LEFT, padx=(0, 6))

            var = tk.StringVar(value=old_labels.get(str(fn), ""))
            e = tk.Entry(row, textvariable=var, font=FONT_SMALL,
                         relief=tk.FLAT, bd=0, bg=C["card"], fg=C["text"],
                         insertbackground=C["primary"], width=18,
                         highlightbackground=C["border"],
                         highlightcolor=C["primary"], highlightthickness=1)
            e.pack(side=tk.LEFT, ipady=5)
            tk.Label(row, text="（留空=默认）", font=("Microsoft YaHei UI", 7),
                     fg=C["text_dim"], bg=C["bg"]).pack(side=tk.LEFT, padx=4)

            self._floor_entries[fn] = var

    def _on_floors_change(self):
        if self.building and hasattr(self, '_floor_entries'):
            self._build_floor_label_entries()

    def _preview_rename(self):
        """预览批量改名的效果"""
        find = self.br_find_var.get().strip()
        repl = self.br_repl_var.get().strip()
        if not find:
            self.br_preview.configure(text="")
            return
        rooms = self.building.get("rooms", [])
        changed = [r for r in rooms if find in r.get("name", "")]
        if not changed:
            self.br_preview.configure(text="（无匹配房间）", fg=C["text_dim"])
        else:
            examples = [f"{r['name']}→{r['name'].replace(find, repl)}"
                        for r in changed[:5]]
            more = f" ...等{len(changed)}间" if len(changed) > 5 else ""
            self.br_preview.configure(
                text="预览：" + "、".join(examples) + more,
                fg=C["primary"])

    def _apply_batch_rename(self):
        """执行批量改名"""
        find = self.br_find_var.get().strip()
        repl = self.br_repl_var.get().strip()
        if not find:
            messagebox.showwarning("提示", "请输入查找内容", parent=self); return
        rooms = self.building.get("rooms", [])
        changed = [r for r in rooms if find in r.get("name", "")]
        if not changed:
            messagebox.showinfo("提示", "没有匹配的房间", parent=self); return
        count = len(changed)
        if messagebox.askyesno("确认", f"将 {count} 间房屋名字中的\n\"{find}\" → \"{repl}\"\n\n确认？",
                               parent=self):
            for r in changed:
                r["name"] = r["name"].replace(find, repl)
            self.br_find_var.set("")
            self.br_repl_var.set("")
            messagebox.showinfo("完成", f"已修改 {count} 间房屋名字", parent=self)

    def _save(self):
        name = self.name_var.get().strip()
        if not name:
            messagebox.showwarning("提示", "请输入楼房名称", parent=self); return
        floors, rpf = self.floors_var.get(), self.rooms_var.get()

        # 收集楼层标签
        floor_labels = {}
        if hasattr(self, '_floor_entries'):
            for fn, var in self._floor_entries.items():
                val = var.get().strip()
                if val:
                    floor_labels[str(fn)] = val

        if self.building:
            ex = self.building.get("rooms", [])
            rooms = []
            for f in range(1, floors+1):
                for r in range(1, rpf+1):
                    rid = f"{f:02d}{r:02d}"
                    found = next((er for er in ex if er["id"]==rid), None)
                    rooms.append(found if found else DataStore.new_room(rid))
            self.building.update(name=name, floors=floors,
                                 rooms_per_floor=rpf, rooms=rooms,
                                 floor_labels=floor_labels)
            self.result = self.building
        else:
            rooms = [DataStore.new_room(f"{f:02d}{r:02d}")
                     for f in range(1, floors+1) for r in range(1, rpf+1)]
            self.result = {"id": gen_id(), "name": name, "floors": floors,
                           "rooms_per_floor": rpf, "rooms": rooms,
                           "floor_labels": floor_labels}

        self.cb(self.result); self.destroy()


# ============================================================
# 对话框：房间详情（含租金金额编辑）
# ============================================================
class RoomDialog(tk.Toplevel):
    def __init__(self, parent, room, bld_name, on_save, on_transfer=None):
        super().__init__(parent)
        self.room = room; self.bld_name = bld_name
        self._on_save = on_save; self._on_transfer = on_transfer

        self.title(f"{bld_name} · {room['name']}")
        self.geometry("560x740")
        self.resizable(False, False)
        self.configure(bg=C["bg"])
        self.transient(parent); self.grab_set()
        self._center(parent)
        self._ui(); self._load()

    def _center(self, p):
        self.update_idletasks()
        x = p.winfo_rootx()+(p.winfo_width()-560)//2
        y = p.winfo_rooty()+(p.winfo_height()-740)//2
        self.geometry(f"+{x}+{y}")

    def _ui(self):
        bar = tk.Frame(self, bg=C["topbar"], height=56)
        bar.pack(fill=tk.X); bar.pack_propagate(False)
        tk.Label(bar, text=f"🏠 {self.room['name']}", font=FONT_TITLE,
                 fg=C["text"], bg=C["topbar"]).pack(side=tk.LEFT, padx=20, pady=12)

        sf = tk.Frame(bar, bg=C["topbar"]); sf.pack(side=tk.RIGHT, padx=20)
        self.occ_var = tk.BooleanVar()
        self.st_lbl = tk.Label(sf, text="空置", font=FONT_BODY,
                               fg=C["text_secondary"], bg=C["topbar"])
        self.st_lbl.pack(side=tk.LEFT, padx=(0,10))
        tk.Checkbutton(sf, variable=self.occ_var, command=self._toggle_occ,
                       bg=C["topbar"], activebackground=C["topbar"],
                       selectcolor=C["success"]).pack(side=tk.LEFT)

        cv = tk.Canvas(self, bg=C["bg"], highlightthickness=0)
        self.cv = cv  # 保存引用供 bind_scroll 使用
        sb = tk.Scrollbar(self, orient=tk.VERTICAL, command=cv.yview)
        self.ct = tk.Frame(cv, bg=C["bg"])
        self.ct.bind("<Configure>", lambda e: cv.configure(scrollregion=cv.bbox("all")))
        cw = cv.create_window((0,0), window=self.ct, anchor=tk.NW, width=560)
        cv.configure(yscrollcommand=sb.set)
        cv.bind("<Configure>", lambda e: cv.itemconfig(cw, width=e.width))
        cv.bind("<MouseWheel>", lambda e: cv.yview_scroll(int(-e.delta/120),"units"))
        # 让内容区也能响应滚轮
        self.ct.bind("<MouseWheel>", lambda e: cv.yview_scroll(int(-e.delta/120),"units"))
        cv.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        sb.pack(side=tk.RIGHT, fill=tk.Y)

        p = {"padx": 24, "pady": (10, 2)}

        tk.Label(self.ct, text="房屋名称", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, **p)
        self.name_var = tk.StringVar()
        make_entry(self.ct, self.name_var).pack(fill=tk.X, padx=24, ipady=8)

        tk.Label(self.ct, text="租客姓名", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, **p)
        self.tenant_var = tk.StringVar()
        make_entry(self.ct, self.tenant_var).pack(fill=tk.X, padx=24, ipady=8)

        # 租期
        tk.Label(self.ct, text="📅 租期设置", font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(anchor=tk.W, padx=24, pady=(18,4))
        lf = tk.Frame(self.ct, bg=C["card"],
                      highlightbackground=C["border"], highlightthickness=1)
        lf.pack(fill=tk.X, padx=24, pady=4)
        inn = tk.Frame(lf, bg=C["card"]); inn.pack(fill=tk.X, padx=14, pady=14)

        tk.Label(inn, text="租期开始 (YYYY-MM-DD)", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["card"]).pack(anchor=tk.W)
        self.lease_start_var = tk.StringVar()
        tk.Entry(inn, textvariable=self.lease_start_var, font=FONT_BODY,
                 relief=tk.FLAT, bd=0, bg=C["bg"], fg=C["text"],
                 insertbackground=C["primary"]).pack(fill=tk.X, pady=(2,8), ipady=6)

        tk.Label(inn, text="租期月数", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["card"]).pack(anchor=tk.W, pady=(8,0))
        mf = tk.Frame(inn, bg=C["card"]); mf.pack(fill=tk.X, pady=(2,0))
        self.lease_months_var = tk.IntVar()
        tk.Scale(mf, from_=1, to=36, orient=tk.HORIZONTAL,
                 variable=self.lease_months_var, bg=C["card"],
                 troughcolor=C["border"], activebackground=C["primary"],
                 highlightthickness=0, length=340, fg=C["text"],
                 font=FONT_SMALL).pack(side=tk.LEFT)
        tk.Label(mf, textvariable=self.lease_months_var,
                 font=FONT_BODY, fg=C["primary"], bg=C["card"],
                 width=3).pack(side=tk.RIGHT)

        self.lease_info = tk.Label(inn, text="", font=FONT_SMALL,
                                   fg=C["text_secondary"], bg=C["card"], justify=tk.LEFT)
        self.lease_info.pack(anchor=tk.W, pady=(8,0))

        # 每月租金（带金额）
        tk.Label(self.ct, text="💰 每月租金", font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(anchor=tk.W, padx=24, pady=(18,4))
        rf = tk.Frame(self.ct, bg=C["card"],
                      highlightbackground=C["border"], highlightthickness=1)
        rf.pack(fill=tk.X, padx=24, pady=4)
        ri = tk.Frame(rf, bg=C["card"]); ri.pack(fill=tk.X, padx=14, pady=14)

        # 默认月租金设置
        default_row = tk.Frame(ri, bg=C["card"])
        default_row.pack(fill=tk.X, pady=(0, 10))
        tk.Label(default_row, text="默认月租:", font=FONT_SMALL,
                 fg=C["text_secondary"], bg=C["card"]).pack(side=tk.LEFT)
        self.default_amount_var = tk.StringVar(value="")
        tk.Entry(default_row, textvariable=self.default_amount_var,
                 font=FONT_SMALL, relief=tk.FLAT, bd=0,
                 bg=C["bg"], fg=C["text"], width=10,
                 insertbackground=C["primary"],
                 highlightbackground=C["border"],
                 highlightcolor=C["primary"],
                 highlightthickness=1).pack(side=tk.LEFT, padx=6, ipady=3)
        tk.Label(default_row, text="元", font=FONT_SMALL,
                 fg=C["text_secondary"], bg=C["card"]).pack(side=tk.LEFT)
        RoundedBtn(default_row, "批量设置", command=self._apply_default_amount,
                   bg=C["primary_dim"], fg=C["white"], font=FONT_SMALL,
                   width=70, height=26, canvas_bg=C["card"]).pack(side=tk.LEFT, padx=10)

        self.rent_grid = tk.Frame(ri, bg=C["card"]); self.rent_grid.pack(fill=tk.X)

        # 注解
        tk.Label(self.ct, text="📝 租客注解", font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(anchor=tk.W, padx=24, pady=(18,4))
        self.notes = tk.Text(self.ct, height=4, font=FONT_BODY, relief=tk.FLAT,
                             bd=0, bg=C["card"], fg=C["text"], wrap=tk.WORD,
                             insertbackground=C["primary"],
                             highlightbackground=C["border"],
                             highlightcolor=C["primary"], highlightthickness=1)
        self.notes.pack(fill=tk.X, padx=24, ipady=6)

        # 按钮竖向排列：取消在上，保存在下
        bf = tk.Frame(self, bg=C["bg"])
        bf.pack(fill=tk.X, pady=(8,10), padx=24)
        RoundedBtn(bf, "取消", command=self.destroy,
                   bg=C["border"], fg=C["text"], width=120, height=32,
                   canvas_bg=C["bg"]).pack(pady=2)
        self.transfer_btn = RoundedBtn(bf, "🔄 转移租客", command=self._do_transfer,
                                       bg=C["warning"], width=120, height=32,
                                       canvas_bg=C["bg"])
        RoundedBtn(bf, "💾 保存", command=self._save, width=120, height=32,
                   canvas_bg=C["bg"]).pack(pady=2)

    def _apply_default_amount(self):
        """将默认金额应用到所有月份（使用 YYYY-MM 键与手机端统一）"""
        try:
            amt = int(self.default_amount_var.get().strip())
        except ValueError:
            messagebox.showwarning("提示", "请输入有效金额", parent=self); return
        months = self.lease_months_var.get()
        rp = self.room.setdefault("rent_paid", {})
        # 同时更新 _monthly_rent 以保证保存时写回服务器
        self.room["_monthly_rent"] = amt
        lease_start = self.room.get("lease_start", "")
        for m in range(1, months+1):
            k = month_key_from_lease(lease_start, m)
            old_paid = rent_is_paid(rp, k)
            set_rent(rp, k, paid=old_paid, amount=amt)
        self._refresh_rent()

    def _toggle_occ(self):
        occ = self.occ_var.get()
        self.st_lbl.configure(text="已入住" if occ else "空置",
                              fg=C["success"] if occ else C["text_secondary"])
        if occ:
            save_btn = None
            for c in self.winfo_children():
                if isinstance(c, tk.Frame) and c != self.ct:
                    for cc in c.winfo_children():
                        if isinstance(cc, RoundedBtn) and cc.txt and "保存" in cc.txt:
                            save_btn = cc; break
            if save_btn: self.transfer_btn.pack(pady=3, before=save_btn)
        else:
            self.transfer_btn.pack_forget()

    def _do_transfer(self):
        if self._on_transfer:
            self._apply(); self.withdraw()
            self._on_transfer(self.room); self.destroy()

    def _load(self):
        self.name_var.set(self.room.get("name",""))
        self.occ_var.set(self.room.get("occupied",False))
        self.tenant_var.set(self.room.get("tenant_name",""))
        self.lease_start_var.set(self.room.get("lease_start",""))
        self.lease_months_var.set(self.room.get("lease_months",1))
        self.notes.insert("1.0", self.room.get("notes",""))
        # 从服务器同步的 monthlyRent 初始化默认月租金输入框
        mr = self.room.get("_monthly_rent", 0)
        if mr:
            self.default_amount_var.set(str(mr))
        self._toggle_occ(); self._refresh_rent(); self._update_lease()
        self.lease_months_var.trace_add("write",
            lambda *a: (self._update_lease(), self._refresh_rent()))
        self.lease_start_var.trace_add("write",
            lambda *a: self._update_lease())
        # 递归绑定滚轮到内容区所有子widget
        bind_scroll(self.ct, self.cv)

    def _update_lease(self):
        s, m = self.lease_start_var.get().strip(), self.lease_months_var.get()
        rem = remaining_months(s, m); end = end_date_str(s, m)
        lines = []
        if end: lines.append(f"到期: {fmt_date(end)}")
        if rem >= 0:
            if rem == 0: lines.append("⚠️ 已到期")
            elif rem <= 2: lines.append(f"⚠️ 剩余 {rem} 个月")
            else: lines.append(f"剩余 {rem} 个月")
        self.lease_info.configure(text="\n".join(lines))

    def _refresh_rent(self):
        for w in self.rent_grid.winfo_children(): w.destroy()
        months = self.lease_months_var.get()
        # 安全获取，防止 None
        rp = self.room.get("rent_paid")
        if not isinstance(rp, dict):
            rp = {}
            self.room["rent_paid"] = rp

        # 使用 YYYY-MM 格式（与手机端统一），若租期未设置则回退到数字键
        lease_start = self.room.get("lease_start", "")

        for i in range(months):
            m = i + 1
            k = month_key_from_lease(lease_start, m)
            is_p = rent_is_paid(rp, k)
            amt = rent_amount(rp, k)

            # 整行 frame
            row = tk.Frame(self.rent_grid, bg=C["card"])
            row.pack(fill=tk.X, pady=2)

            # 支付状态按钮
            bg = C["success"] if is_p else C["border"]
            fg = C["white"] if is_p else C["text"]
            txt = f"✓ 第{m}月" if is_p else f"第{m}月"
            btn = tk.Button(row, text=txt, font=FONT_SMALL,
                            bg=bg, fg=fg, relief=tk.FLAT, bd=0, width=10,
                            activebackground=C["primary"], cursor="hand2",
                            command=lambda key=k: self._tog_rent(key))
            btn.pack(side=tk.LEFT, padx=(0, 8))

            # 金额标签
            amt_var = tk.StringVar(value=str(amt) if amt > 0 else "")
            amt_entry = tk.Entry(row, textvariable=amt_var,
                                 font=FONT_SMALL, relief=tk.FLAT, bd=0,
                                 bg=C["bg"], fg=C["text"], width=8,
                                 insertbackground=C["primary"],
                                 highlightbackground=C["border"],
                                 highlightcolor=C["primary"],
                                 highlightthickness=1)
            amt_entry.pack(side=tk.LEFT, ipady=2)
            tk.Label(row, text="元", font=FONT_SMALL,
                     fg=C["text_secondary"], bg=C["card"]).pack(side=tk.LEFT)

            # 保存引用以便后续读取
            amt_entry._month_key = k
            amt_entry._amt_var = amt_var

        # 存储引用
        self._rent_entries = [
            w for w in self.rent_grid.winfo_children()
            if isinstance(w, tk.Frame)
        ]

    def _tog_rent(self, key):
        rp = self.room.setdefault("rent_paid", {})
        old_paid = rent_is_paid(rp, key)
        old_amt = rent_amount(rp, key)
        set_rent(rp, key, paid=not old_paid, amount=old_amt)
        self._refresh_rent()

    def _apply(self):
        # 安全获取 rent_paid（防止 None）
        rp = self.room.get("rent_paid")
        if not isinstance(rp, dict):
            rp = {}
            self.room["rent_paid"] = rp
        for row in self.rent_grid.winfo_children():
            if isinstance(row, tk.Frame):
                for child in row.winfo_children():
                    if isinstance(child, tk.Entry) and hasattr(child, '_month_key'):
                        try:
                            amt = int(child.get().strip()) if child.get().strip() else 0
                        except ValueError:
                            amt = 0
                        old_paid = rent_is_paid(rp, child._month_key)
                        set_rent(rp, child._month_key, paid=old_paid, amount=amt)

        self.room["name"] = self.name_var.get().strip() or self.room["id"]
        self.room["occupied"] = self.occ_var.get()
        self.room["tenant_name"] = self.tenant_var.get().strip()
        self.room["lease_start"] = normalize_date_str(self.lease_start_var.get().strip())
        self.room["lease_months"] = self.lease_months_var.get()
        self.room["notes"] = self.notes.get("1.0", tk.END).strip()
        # 同步默认月租金到 _monthly_rent（回写服务器用）
        try:
            dmr = int(self.default_amount_var.get().strip())
            if dmr > 0:
                self.room["_monthly_rent"] = dmr
        except ValueError:
            pass

    def _save(self):
        self._apply()
        if self.room["occupied"] and not self.room["tenant_name"]:
            messagebox.showwarning("提示","请填写租客姓名",parent=self); return
        self._on_save(self.room); self.destroy()

    def destroy(self):
        super().destroy()


# ============================================================
# 转移对话框
# ============================================================
class TransferDialog(tk.Toplevel):
    def __init__(self, parent, buildings, cur_bid, cur_rid, cb):
        super().__init__(parent)
        self.buildings = buildings; self.cur_bid = cur_bid
        self.cur_rid = cur_rid; self._cb = cb; self._cur_bld = None
        self.title("转移租客"); self.geometry("440x400")
        self.resizable(False,False); self.configure(bg=C["bg"])
        self.transient(parent); self.grab_set()
        self._center(parent); self._ui()

    def _center(self, p):
        self.update_idletasks()
        self.geometry(f"+{p.winfo_rootx()+(p.winfo_width()-440)//2}+{p.winfo_rooty()+(p.winfo_height()-400)//2}")

    def _ui(self):
        tk.Label(self, text="转移租客", font=FONT_TITLE,
                 fg=C["text"], bg=C["bg"]).pack(pady=(20,4))
        tk.Label(self, text="选择目标空房屋", font=FONT_SMALL,
                 fg=C["text_secondary"], bg=C["bg"]).pack(pady=(0,12))
        tk.Label(self, text="目标楼房", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, padx=24, pady=4)
        self.bld_var = tk.StringVar()
        names = [b["name"] for b in self.buildings]
        cb = ttk.Combobox(self, textvariable=self.bld_var, values=names,
                          font=FONT_BODY, state="readonly")
        cb.pack(fill=tk.X, padx=24, ipady=4)
        if names: cb.current(0)
        cb.bind("<<ComboboxSelected>>", self._refresh)
        tk.Label(self, text="目标房屋（仅空置）", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, padx=24, pady=(12,4))
        lf = tk.Frame(self, bg=C["border"]); lf.pack(fill=tk.BOTH, expand=True, padx=24, pady=4)
        self.lb = tk.Listbox(lf, font=FONT_BODY, relief=tk.FLAT, bd=0,
                             bg=C["card"], fg=C["text"],
                             selectbackground=C["primary"],
                             selectforeground=C["white"], activestyle="none", height=8)
        self.lb.pack(fill=tk.BOTH, expand=True, padx=1, pady=1)
        bf = tk.Frame(self, bg=C["bg"]); bf.pack(pady=14)
        RoundedBtn(bf, "取消", command=self.destroy,
                   bg=C["border"], fg=C["text"], width=100, height=36,
                   canvas_bg=C["bg"]).pack(side=tk.LEFT, padx=6)
        RoundedBtn(bf, "确认转移", command=self._transfer,
                   bg=C["warning"], width=100, height=36,
                   canvas_bg=C["bg"]).pack(side=tk.LEFT, padx=6)
        self._refresh()

    def _refresh(self, e=None):
        self.lb.delete(0,tk.END)
        name = self.bld_var.get()
        bld = next((b for b in self.buildings if b["name"]==name), None)
        if not bld: return
        self._cur_bld = bld
        for r in bld.get("rooms",[]):
            if r.get("occupied"): continue
            if r["id"]==self.cur_rid and bld.get("id")==self.cur_bid: continue
            self.lb.insert(tk.END, f"{r['name']} ({r['id']})")

    def _transfer(self):
        sel = self.lb.curselection()
        if not sel: messagebox.showwarning("提示","请选择目标房屋",parent=self); return
        bld = self._cur_bld
        empty = [r for r in bld.get("rooms",[]) if not r.get("occupied")
                 and not (r["id"]==self.cur_rid and bld.get("id")==self.cur_bid)]
        if sel[0] >= len(empty): return
        target = empty[sel[0]]
        if messagebox.askyesno("确认",f"转移到 {bld['name']} - {target['name']}？",parent=self):
            self._cb(bld["id"], target["id"]); self.destroy()


# ============================================================
# 主应用
# ============================================================
class InboxDialog(tk.Toplevel):
    """消息箱：列出收到的待处理申请，可同意/拒绝。"""
    def __init__(self, parent, api, requests, on_done=None, on_change=None):
        super().__init__(parent)
        self.api = api
        self.requests = list(requests)
        self.on_done = on_done
        self.on_change = on_change
        self.changed = False

        self.title("消息 - 待处理申请")
        self.configure(bg=C["bg"])
        self.geometry("420x460")
        self.transient(parent)
        self.grab_set()
        self._ui()
        self._center(parent)

    def _center(self, p):
        self.update_idletasks()
        try:
            x = p.winfo_x() + (p.winfo_width() - self.winfo_width()) // 2
            y = p.winfo_y() + (p.winfo_height() - self.winfo_height()) // 2
            self.geometry(f"+{max(x,0)}+{max(y,0)}")
        except Exception:
            pass

    def _ui(self):
        tk.Label(self, text="📬 收到的查看申请", font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(anchor=tk.W, padx=20, pady=(18, 10))
        self.body = tk.Frame(self, bg=C["bg"])
        self.body.pack(fill=tk.BOTH, expand=True, padx=20)
        self._render()
        RoundedBtn(self, "关闭", command=self._close,
                   bg=C["surface"], fg=C["text"], width=120, height=36,
                   canvas_bg=C["bg"]).pack(pady=14)

    def _render(self):
        for w in self.body.winfo_children():
            w.destroy()
        if not self.requests:
            tk.Label(self.body, text="暂无待处理申请", font=FONT_BODY,
                     fg=C["text_secondary"], bg=C["bg"]).pack(pady=40)
            return
        for r in self.requests:
            card = tk.Frame(self.body, bg=C["card"],
                            highlightbackground=C["border"], highlightthickness=1)
            card.pack(fill=tk.X, pady=6)
            inn = tk.Frame(card, bg=C["card"]); inn.pack(fill=tk.X, padx=14, pady=12)
            tk.Label(inn, text=f"👤 {r.get('requesterUsername','?')}",
                     font=("Microsoft YaHei UI", 12, "bold"),
                     fg=C["text"], bg=C["card"]).pack(anchor=tk.W)
            tk.Label(inn, text="申请查看你的全部楼房", font=FONT_SMALL,
                     fg=C["text_secondary"], bg=C["card"]).pack(anchor=tk.W, pady=(2, 8))
            bf = tk.Frame(inn, bg=C["card"]); bf.pack(fill=tk.X)
            RoundedBtn(bf, "✓ 同意", command=lambda rr=r: self._respond(rr, True),
                       bg=C["success"], width=110, height=34, canvas_bg=C["card"]).pack(side=tk.LEFT, padx=(0, 8))
            RoundedBtn(bf, "✕ 拒绝", command=lambda rr=r: self._respond(rr, False),
                       bg=C["danger"], width=110, height=34, canvas_bg=C["card"]).pack(side=tk.LEFT)

    def _respond(self, r, approve):
        try:
            self.api.respond_request(r["id"], approve)
            self.changed = True
            self.requests = [x for x in self.requests if x["id"] != r["id"]]
            self._render()
            # 即时刷新侧栏消息角标，避免"已处理却仍显示有新消息"的误解
            if self.on_change:
                self.on_change()
            if approve:
                messagebox.showinfo("已同意",
                    f"已同意「{r.get('requesterUsername','?')}」查看你的楼房（默认只读）。\n"
                    "如需给写权限，请在「编辑申请人权限」里开启。", parent=self)
        except NetworkError:
            messagebox.showerror("连接失败", "连不上服务器，请检查网络。", parent=self)
        except ApiError as e:
            messagebox.showerror("操作失败", e.message, parent=self)

    def _close(self):
        self.destroy()
        if self.changed and self.on_done:
            self.on_done()


class GranteePermDialog(tk.Toplevel):
    """编辑申请人权限：勾选每个被授权人的写权限（读默认有）。"""
    def __init__(self, parent, api, grantees):
        super().__init__(parent)
        self.api = api
        self.grantees = list(grantees)
        self.vars = {}  # grantee_id -> BooleanVar(can_write)

        self.title("编辑申请人权限")
        self.configure(bg=C["bg"])
        self.geometry("440x480")
        self.transient(parent)
        self.grab_set()
        self._ui()
        self._center(parent)

    def _center(self, p):
        self.update_idletasks()
        try:
            x = p.winfo_x() + (p.winfo_width() - self.winfo_width()) // 2
            y = p.winfo_y() + (p.winfo_height() - self.winfo_height()) // 2
            self.geometry(f"+{max(x,0)}+{max(y,0)}")
        except Exception:
            pass

    def _ui(self):
        tk.Label(self, text="🔧 申请人权限管理", font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(anchor=tk.W, padx=20, pady=(18, 4))
        tk.Label(self, text="读权限默认开启；勾选「写权限」即授予管理员权限（含删楼）。",
                 font=FONT_SMALL, fg=C["text_secondary"], bg=C["bg"],
                 wraplength=400, justify=tk.LEFT).pack(anchor=tk.W, padx=20, pady=(0, 10))
        body = tk.Frame(self, bg=C["bg"]); body.pack(fill=tk.BOTH, expand=True, padx=20)

        if not self.grantees:
            tk.Label(body, text="还没有人被你授权查看", font=FONT_BODY,
                     fg=C["text_secondary"], bg=C["bg"]).pack(pady=40)
        else:
            for g in self.grantees:
                gid = g["granteeId"]
                card = tk.Frame(body, bg=C["card"],
                                highlightbackground=C["border"], highlightthickness=1)
                card.pack(fill=tk.X, pady=6)
                inn = tk.Frame(card, bg=C["card"]); inn.pack(fill=tk.X, padx=14, pady=12)
                row = tk.Frame(inn, bg=C["card"]); row.pack(fill=tk.X)
                tk.Label(row, text=f"👤 {g.get('granteeUsername','?')}",
                         font=("Microsoft YaHei UI", 12, "bold"),
                         fg=C["text"], bg=C["card"]).pack(side=tk.LEFT)
                # 撤销按钮
                tk.Button(row, text="撤销", font=FONT_SMALL, relief=tk.FLAT, bd=0,
                          bg=C["card"], fg=C["danger"], cursor="hand2",
                          activebackground=C["card_hover"],
                          command=lambda gg=g: self._revoke(gg)).pack(side=tk.RIGHT)
                # 读（固定开启，不可取消）
                tk.Label(inn, text="✓ 读权限（默认开启）", font=FONT_SMALL,
                         fg=C["success"], bg=C["card"]).pack(anchor=tk.W, pady=(6, 2))
                # 写权限勾选
                var = tk.BooleanVar(value=bool(g.get("canWrite")))
                self.vars[gid] = var
                tk.Checkbutton(inn, text="写权限（管理员，可改可删）", variable=var,
                               font=FONT_SMALL, fg=C["text"], bg=C["card"],
                               selectcolor=C["surface"], activebackground=C["card"],
                               anchor=tk.W).pack(anchor=tk.W)

            RoundedBtn(self, "保存", command=self._save,
                       bg=C["primary"], width=160, height=40,
                       canvas_bg=C["bg"]).pack(pady=10)

        RoundedBtn(self, "关闭", command=self.destroy,
                   bg=C["surface"], fg=C["text"], width=120, height=34,
                   canvas_bg=C["bg"]).pack(pady=(0, 14))

    def _revoke(self, g):
        if not messagebox.askyesno("撤销授权",
                f"确定撤销「{g.get('granteeUsername','?')}」的查看权限吗？", parent=self):
            return
        try:
            self.api.revoke_grantee(g["granteeId"])
            self.grantees = [x for x in self.grantees if x["granteeId"] != g["granteeId"]]
            # 重建界面
            for w in self.winfo_children():
                w.destroy()
            self._ui()
        except (NetworkError, ApiError) as e:
            messagebox.showerror("撤销失败", getattr(e, "message", str(e)), parent=self)

    def _save(self):
        # 找出要开启写权限的人，逐个确认弹窗
        for g in self.grantees:
            gid = g["granteeId"]
            new_write = self.vars[gid].get()
            old_write = bool(g.get("canWrite"))
            if new_write == old_write:
                continue
            if new_write:
                # 开启写权限前弹窗确认
                if not messagebox.askyesno("确认授予管理员权限",
                        f"是否提供给 <{g.get('granteeUsername','?')}> 管理员权限？\n\n"
                        "（管理员可修改、甚至删除你的楼房数据）", parent=self):
                    # 用户取消，恢复勾选状态
                    self.vars[gid].set(False)
                    continue
            try:
                self.api.set_grantee_write(gid, new_write)
                g["canWrite"] = new_write
            except (NetworkError, ApiError) as e:
                messagebox.showerror("保存失败", getattr(e, "message", str(e)), parent=self)
                return
        messagebox.showinfo("已保存", "权限设置已更新。", parent=self)
        self.destroy()


class LoginDialog(tk.Toplevel):
    """登录/注册对话框（含服务器地址设置）。"""
    def __init__(self, parent, api):
        super().__init__(parent)
        self.api = api
        self.cfg = api.cfg
        self.success = False
        self.mode = "login"  # login / register

        self.title("登录 - 房屋管家")
        self.resizable(False, False)
        self.configure(bg=C["bg"])
        self.transient(parent)
        self.grab_set()
        self._ui()
        self._center(parent)
        # 关闭对话框视为取消
        self.protocol("WM_DELETE_WINDOW", self._cancel)

    def _center(self, p):
        self.update_idletasks()
        w, h = self.winfo_reqwidth(), self.winfo_reqheight()
        try:
            x = p.winfo_x() + (p.winfo_width() - w) // 2
            y = p.winfo_y() + (p.winfo_height() - h) // 2
            self.geometry(f"+{max(x,0)}+{max(y,0)}")
        except Exception:
            pass

    def _ui(self):
        pad = {"padx": 28}
        tk.Label(self, text="🏠 房屋管家", font=("Microsoft YaHei UI", 18, "bold"),
                 fg=C["primary"], bg=C["bg"]).pack(pady=(24, 4), **pad)
        self.subtitle = tk.Label(self, text="登录后多设备同步数据",
                                 font=FONT_SMALL, fg=C["text_secondary"], bg=C["bg"])
        self.subtitle.pack(pady=(0, 16), **pad)

        # 用户名
        tk.Label(self, text="用户名", font=FONT_SMALL, fg=C["text_secondary"],
                 bg=C["bg"]).pack(anchor=tk.W, **pad)
        self.user_var = tk.StringVar(value=self.cfg.username)
        make_entry(self, self.user_var, width=28).pack(pady=(2, 10), **pad)

        # 密码
        tk.Label(self, text="密码", font=FONT_SMALL, fg=C["text_secondary"],
                 bg=C["bg"]).pack(anchor=tk.W, **pad)
        self.pwd_var = tk.StringVar()
        pwd_entry = make_entry(self, self.pwd_var, width=28, show="•")
        pwd_entry.pack(pady=(2, 10), **pad)
        pwd_entry.bind("<Return>", lambda e: self._submit())

        # 服务器地址
        tk.Label(self, text="服务器地址", font=FONT_SMALL, fg=C["text_secondary"],
                 bg=C["bg"]).pack(anchor=tk.W, **pad)
        self.server_var = tk.StringVar(value=self.cfg.server_url)
        make_entry(self, self.server_var, width=28).pack(pady=(2, 16), **pad)

        # 提交按钮
        self.submit_btn = RoundedBtn(self, "登 录", command=self._submit,
                                     width=300, height=40, canvas_bg=C["bg"])
        self.submit_btn.pack(pady=(0, 10), **pad)

        # 切换登录/注册
        self.switch_lbl = tk.Label(self, text="没有账号？点此注册", font=FONT_SMALL,
                                   fg=C["primary"], bg=C["bg"], cursor="hand2")
        self.switch_lbl.pack(pady=(0, 22), **pad)
        self.switch_lbl.bind("<Button-1>", lambda e: self._toggle_mode())

    def _toggle_mode(self):
        if self.mode == "login":
            self.mode = "register"
            self.title("注册 - 房屋管家")
            self.subtitle.config(text="创建新账号")
            self.submit_btn.txt = "注 册"; self.submit_btn._draw()
            self.switch_lbl.config(text="已有账号？点此登录")
        else:
            self.mode = "login"
            self.title("登录 - 房屋管家")
            self.subtitle.config(text="登录后多设备同步数据")
            self.submit_btn.txt = "登 录"; self.submit_btn._draw()
            self.switch_lbl.config(text="没有账号？点此注册")

    def _submit(self):
        username = self.user_var.get().strip()
        password = self.pwd_var.get()
        if not username or not password:
            messagebox.showwarning("提示", "请填写用户名和密码", parent=self)
            return
        # 先保存服务器地址
        self.cfg.server_url = ClientConfig.normalize_url(self.server_var.get())
        self.cfg.save()
        try:
            if self.mode == "login":
                self.api.login(username, password)
            else:
                self.api.register(username, password)
            self.success = True
            self.destroy()
        except NetworkError:
            messagebox.showerror("连接失败",
                                 "连不上服务器，请检查地址和网络是否正常。", parent=self)
        except ApiError as e:
            messagebox.showerror("失败", e.message, parent=self)

    def _cancel(self):
        self.success = False
        self.destroy()


class SwitchAccountDialog(tk.Toplevel):
    """切换账号：列出本设备登录过的账号，点选即免密切换（token 仍有效时）。

    - 点账号卡 → 切换；token 失效则仅提示「请重新登录」（不自动跳转）。
    - 每个账号可「移除」出账号簿。
    - 「+ 登录其他账号」打开登录框，登录成功即切换。
    结果通过 self.result 返回：None=未切换；("switched", user)=已切到新账号。
    """
    def __init__(self, parent, api):
        super().__init__(parent)
        self.api = api
        self.cfg = api.cfg
        self.result = None

        self.title("切换账号")
        self.configure(bg=C["bg"])
        self.geometry("420x480")
        self.transient(parent)
        self.grab_set()
        self._ui()
        self._center(parent)
        self.protocol("WM_DELETE_WINDOW", self._close)

    def _center(self, p):
        self.update_idletasks()
        try:
            x = p.winfo_x() + (p.winfo_width() - self.winfo_width()) // 2
            y = p.winfo_y() + (p.winfo_height() - self.winfo_height()) // 2
            self.geometry(f"+{max(x,0)}+{max(y,0)}")
        except Exception:
            pass

    def _ui(self):
        tk.Label(self, text="👥 切换账号", font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(anchor=tk.W, padx=20, pady=(18, 4))
        tk.Label(self, text="点选本设备登录过的账号，30 天内免密切换",
                 font=FONT_SMALL, fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, padx=20, pady=(0, 10))
        self.body = tk.Frame(self, bg=C["bg"])
        self.body.pack(fill=tk.BOTH, expand=True, padx=20)
        self._render()
        bf = tk.Frame(self, bg=C["bg"]); bf.pack(fill=tk.X, padx=20, pady=14)
        RoundedBtn(bf, "＋ 登录其他账号", command=self._add_account,
                   bg=C["primary"], width=180, height=38, canvas_bg=C["bg"]).pack(side=tk.LEFT)
        RoundedBtn(bf, "关闭", command=self._close,
                   bg=C["surface"], fg=C["text"], width=90, height=38, canvas_bg=C["bg"]).pack(side=tk.RIGHT)

    def _render(self):
        for w in self.body.winfo_children():
            w.destroy()
        accounts = self.cfg.accounts
        if not accounts:
            tk.Label(self.body, text="暂无已保存的账号\n点下方「登录其他账号」添加",
                     font=FONT_BODY, justify=tk.CENTER,
                     fg=C["text_secondary"], bg=C["bg"]).pack(pady=40)
            return
        cur_user = self.cfg.username
        cur_srv = self.cfg.server_url
        for a in accounts:
            is_current = (a.get("username") == cur_user and a.get("server_url") == cur_srv)
            card = tk.Frame(self.body, bg=C["card"],
                            highlightbackground=(C["primary"] if is_current else C["border"]),
                            highlightthickness=(2 if is_current else 1))
            card.pack(fill=tk.X, pady=5)
            inn = tk.Frame(card, bg=C["card"]); inn.pack(fill=tk.X, padx=14, pady=10)

            left = tk.Frame(inn, bg=C["card"]); left.pack(side=tk.LEFT, fill=tk.X, expand=True)
            name_txt = f"👤 {a.get('username','?')}" + ("  （当前）" if is_current else "")
            tk.Label(left, text=name_txt, font=("Microsoft YaHei UI", 12, "bold"),
                     fg=(C["primary"] if is_current else C["text"]), bg=C["card"]).pack(anchor=tk.W)
            tk.Label(left, text=a.get("server_url", ""), font=FONT_SMALL,
                     fg=C["text_secondary"], bg=C["card"]).pack(anchor=tk.W, pady=(2, 0))

            btns = tk.Frame(inn, bg=C["card"]); btns.pack(side=tk.RIGHT)
            if not is_current:
                RoundedBtn(btns, "切换", command=lambda acc=a: self._do_switch(acc),
                           bg=C["success"], width=66, height=32, canvas_bg=C["card"]).pack(side=tk.LEFT, padx=(0, 6))
            RoundedBtn(btns, "移除", command=lambda acc=a: self._do_remove(acc),
                       bg=C["danger"], width=66, height=32, canvas_bg=C["card"]).pack(side=tk.LEFT)

    def _do_switch(self, account):
        try:
            user = self.api.switch_to_account(account)
            self.result = ("switched", user)
            self.destroy()
        except NetworkError:
            messagebox.showerror("连接失败",
                "连不上该账号的服务器，请检查网络后重试。", parent=self)
        except ApiError:
            # 按需求：仅提示，不自动跳登录框
            messagebox.showwarning("登录已过期",
                f"账号「{account.get('username','?')}」的登录已过期"
                "（超 30 天或服务端重置）。\n请点「＋ 登录其他账号」用该账号重新登录。",
                parent=self)

    def _do_remove(self, account):
        uname = account.get("username", "?")
        if not messagebox.askyesno("移除账号",
                f"确定把「{uname}」从本设备账号簿移除吗？\n"
                "（不影响服务器上的账号，只是本机不再保存其登录）", parent=self):
            return
        self.cfg.remove_account(uname, account.get("server_url", ""))
        self.cfg.save()
        self._render()

    def _add_account(self):
        dlg = LoginDialog(self, self.api)
        self.wait_window(dlg)
        if dlg.success:
            # 登录成功 = 已切到新账号
            try:
                user = self.api.verify_token()
            except (NetworkError, ApiError):
                user = {"username": self.cfg.username}
            self.result = ("switched", user)
            self.destroy()
        else:
            self._render()  # 可能新增/无变化，刷新一下

    def _close(self):
        self.destroy()


class PendingChangeDialog(tk.Toplevel):
    """待审改动弹窗：一次只显示一条手机端离线改动，由 owner 选择接收/拒绝。

    显示：楼房+房间、提交位置（IP 转城市）、设备型号、提交时间、字段级变动列表。
    多条待审时由 App 逐条弹出，本弹窗只负责单条，绝不互相覆盖。
    """
    def __init__(self, parent, api, change, total_pending=1):
        super().__init__(parent)
        self.api = api
        self.change = change
        self.total_pending = total_pending
        self.resolved = None  # None=未处理(被关), True=接收, False=拒绝

        self.title("待接收的手机端改动")
        self.configure(bg=C["bg"])
        self.geometry("460x560")
        self.transient(parent)
        self.grab_set()
        # 不允许直接 X 关闭忽略，必须做出选择（关 = 稍后再问）
        self.protocol("WM_DELETE_WINDOW", self._later)
        self._ui()
        self._center(parent)
        self._kick_geo_lookup()

    def _center(self, p):
        self.update_idletasks()
        try:
            x = p.winfo_x() + (p.winfo_width() - self.winfo_width()) // 2
            y = p.winfo_y() + (p.winfo_height() - self.winfo_height()) // 2
            self.geometry(f"+{max(x,0)}+{max(y,0)}")
        except Exception:
            pass

    def _fmt_time(self, iso):
        try:
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            return dt.astimezone().strftime("%Y-%m-%d %H:%M")
        except Exception:
            return iso or "未知"

    def _ui(self):
        c = self.change
        tk.Label(self, text="💙 蕾姆发现一条来自手机端的改动", font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(anchor=tk.W, padx=20, pady=(18, 6))

        if self.total_pending > 1:
            tk.Label(self, text=f"（共 {self.total_pending} 条待处理，将依次弹出）",
                     font=FONT_SMALL, fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, padx=20)

        # 来源信息卡
        meta = tk.Frame(self, bg=C["card"], highlightbackground=C["border"], highlightthickness=1)
        meta.pack(fill=tk.X, padx=20, pady=(10, 8))
        inn = tk.Frame(meta, bg=C["card"]); inn.pack(fill=tk.X, padx=14, pady=10)

        bld = c.get("buildingName", "?")
        room = c.get("roomNumber", "?")
        self._meta_row(inn, "🏢 楼房 / 房间", f"{bld}  ·  {room}")
        self.loc_var = tk.StringVar(value="📍 提交位置：正在定位…")
        tk.Label(inn, textvariable=self.loc_var, font=FONT_BODY, anchor=tk.W,
                 justify=tk.LEFT, wraplength=380, fg=C["text"], bg=C["card"]).pack(anchor=tk.W, pady=2)
        model = c.get("deviceModel") or "未知设备"
        self._meta_row(inn, "📱 设备型号", model)
        self._meta_row(inn, "🕐 提交时间", self._fmt_time(c.get("createdAt", "")))

        # 变动列表
        tk.Label(self, text="变动内容：", font=("Microsoft YaHei UI", 11, "bold"),
                 fg=C["text"], bg=C["bg"]).pack(anchor=tk.W, padx=20, pady=(4, 4))
        box = tk.Frame(self, bg=C["surface"], highlightbackground=C["border"], highlightthickness=1)
        box.pack(fill=tk.BOTH, expand=True, padx=20)
        bi = tk.Frame(box, bg=C["surface"]); bi.pack(fill=tk.BOTH, expand=True, padx=12, pady=10)
        diff = c.get("diff", [])
        if not diff:
            tk.Label(bi, text="（无具体字段差异）", font=FONT_BODY,
                     fg=C["text_secondary"], bg=C["surface"]).pack(anchor=tk.W)
        for d in diff:
            row = tk.Frame(bi, bg=C["surface"]); row.pack(fill=tk.X, anchor=tk.W, pady=3)
            tk.Label(row, text=f"· {d.get('label','?')}：", font=FONT_BODY,
                     fg=C["text"], bg=C["surface"]).pack(side=tk.LEFT)
            tk.Label(row, text=f"{d.get('before','')}", font=FONT_BODY,
                     fg=C["text_secondary"], bg=C["surface"]).pack(side=tk.LEFT)
            tk.Label(row, text="  →  ", font=FONT_BODY,
                     fg=C["text_dim"], bg=C["surface"]).pack(side=tk.LEFT)
            tk.Label(row, text=f"{d.get('after','')}", font=("Microsoft YaHei UI", 11, "bold"),
                     fg=C["primary"], bg=C["surface"]).pack(side=tk.LEFT)

        # 按钮
        bf = tk.Frame(self, bg=C["bg"]); bf.pack(fill=tk.X, padx=20, pady=14)
        RoundedBtn(bf, "✅ 接收（纳入主库）", command=lambda: self._resolve(True),
                   bg=C["success"], width=190, height=40, canvas_bg=C["bg"]).pack(side=tk.LEFT)
        RoundedBtn(bf, "❌ 拒绝", command=lambda: self._resolve(False),
                   bg=C["danger"], width=110, height=40, canvas_bg=C["bg"]).pack(side=tk.LEFT, padx=(10, 0))
        RoundedBtn(bf, "稍后", command=self._later,
                   bg=C["surface"], fg=C["text"], width=80, height=40, canvas_bg=C["bg"]).pack(side=tk.RIGHT)

    def _meta_row(self, parent, label, value):
        tk.Label(parent, text=f"{label}：{value}", font=FONT_BODY, anchor=tk.W,
                 justify=tk.LEFT, wraplength=380, fg=C["text"], bg=C["card"]).pack(anchor=tk.W, pady=2)

    def _kick_geo_lookup(self):
        """后台线程查 IP 归属地，查完用 after 安全回主线程更新 label。"""
        ip = self.change.get("submitterIp") or ""
        if not ip:
            self.loc_var.set("📍 提交位置：未知（无 IP 信息）")
            return

        def worker():
            loc = resolve_ip_location(ip)
            try:
                self.after(0, lambda: self._set_loc(ip, loc))
            except Exception:
                pass
        threading.Thread(target=worker, daemon=True).start()

    def _set_loc(self, ip, loc):
        if self.winfo_exists():
            self.loc_var.set(f"📍 提交位置：{loc}\n        （IP：{ip}）")

    def _resolve(self, approve):
        try:
            self.api.resolve_pending_change(self.change["id"], approve)
            self.resolved = approve
            self.destroy()
        except NetworkError:
            messagebox.showerror("连接失败", "连不上服务器，请检查网络后重试。", parent=self)
        except ApiError as e:
            # 该条可能已被处理：当作完成，避免卡死队列
            messagebox.showwarning("无法处理", e.message, parent=self)
            self.resolved = None
            self.destroy()

    def _later(self):
        """稍后再说：关掉本条，下次轮询会再弹出。"""
        self.resolved = None
        self.destroy()


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("楼房管理系统")
        self.geometry("1024x720")
        self.minsize(860, 600)
        self.configure(bg=C["bg"])

        # 初始化 API 客户端 + 配置
        self.cfg = ClientConfig(get_app_dir())
        self.api = ApiClient(self.cfg)

        # 先应用本地保存的主题（登录前界面也用对的配色）
        self._apply_theme_only(self.cfg.theme or DEFAULT_THEME)

        # 登录流程：有 token 先校验，失败/无 token 则弹登录框
        if not self._ensure_login():
            self.destroy()
            return

        self.dm = DataStore(self.api)
        self._apply_theme(self.dm.theme)

        self.nav = []
        self.main = tk.Frame(self, bg=C["bg"])
        self.main.pack(fill=tk.BOTH, expand=True)

        if self.dm.offline:
            messagebox.showwarning("离线模式",
                "当前无法连接服务器，已加载本地缓存数据（只读）。\n"
                "联网后重新打开程序即可同步。")

        self._show_home()
        self.protocol("WM_DELETE_WINDOW", self._close)

        # 启动「待审改动」后台轮询：手机端离线重连的改动会进待审表，
        # 这里定时拉取并逐条弹窗，由你选择接收/拒绝。
        self._pending_dialog_open = False
        self._pending_poll_on = False
        self._pending_after_id = None
        self._start_pending_poll()

    def _ensure_login(self):
        """确保已登录。返回 True=已登录，False=用户取消。"""
        # 有 token 先尝试校验
        if self.cfg.token:
            try:
                self.api.verify_token()
                return True
            except ApiError:
                self.api.logout()  # token 失效
            except NetworkError:
                # 断网但有 token：允许进入（离线模式用缓存）
                return True
        # 弹登录框
        dlg = LoginDialog(self, self.api)
        self.wait_window(dlg)
        return dlg.success

    def _apply_theme_only(self, theme_name):
        """仅切换配色全局变量，不写回 dm（登录前 dm 还不存在）。"""
        global C
        C = THEMES.get(theme_name, THEMES[DEFAULT_THEME])
        self.configure(bg=C["bg"])

    def _apply_theme(self, theme_name):
        global C
        C = THEMES.get(theme_name, THEMES[DEFAULT_THEME])
        self.configure(bg=C["bg"])
        self.dm.theme = theme_name

    def _clear(self):
        for w in self.main.winfo_children(): w.destroy()

    def _push(self, fn):
        self.nav.append(fn); self._clear(); fn()

    def _back(self):
        if len(self.nav) > 1:
            self.nav.pop(); self._clear(); self.nav[-1]()
        else:
            self._show_home()

    # ====== 主页 ======
    def _show_home(self):
        self._clear(); self.nav = [self._show_home]

        sb = tk.Frame(self.main, bg=C["sidebar_bg"], width=250)
        sb.pack(side=tk.LEFT, fill=tk.Y); sb.pack_propagate(False)

        lf = tk.Frame(sb, bg=C["sidebar_bg"]); lf.pack(fill=tk.X, pady=(28,18), padx=22)
        tk.Label(lf, text="🏢", font=("Segoe UI Emoji",30), bg=C["sidebar_bg"]).pack(anchor=tk.W)
        tk.Label(lf, text="楼房管理", font=("Microsoft YaHei UI",17,"bold"),
                 fg=C["text"], bg=C["sidebar_bg"]).pack(anchor=tk.W, pady=(4,0))
        tk.Label(lf, text="HOUSE MANAGEMENT", font=("Microsoft YaHei UI",8),
                 fg=C["text_dim"], bg=C["sidebar_bg"]).pack(anchor=tk.W)
        tk.Frame(sb, bg=C["divider"], height=1).pack(fill=tk.X, padx=22, pady=10)

        # 用户状态栏：显示用户名，点击弹出菜单（切换账号/退出登录）
        uf = tk.Frame(sb, bg=C["surface"], cursor="hand2")
        uf.pack(fill=tk.X, padx=18, pady=(0, 8))
        ui = tk.Frame(uf, bg=C["surface"])
        ui.pack(fill=tk.X, padx=12, pady=10)
        uname = self.cfg.username or "未登录"
        tk.Label(ui, text="👤", font=("Segoe UI Emoji", 14),
                 bg=C["surface"]).pack(side=tk.LEFT)
        tk.Label(ui, text=uname, font=("Microsoft YaHei UI", 11, "bold"),
                 fg=C["text"], bg=C["surface"]).pack(side=tk.LEFT, padx=(8, 0))
        tk.Label(ui, text="▾", font=("Microsoft YaHei UI", 11),
                 fg=C["text_secondary"], bg=C["surface"]).pack(side=tk.RIGHT)
        for w in (uf, ui) + tuple(ui.winfo_children()):
            w.bind("<Button-1>", lambda e: self._show_user_menu(e))

        sf = tk.Frame(sb, bg=C["sidebar_bg"]); sf.pack(fill=tk.X, padx=22, pady=8)
        blds = self.dm.buildings
        tr = sum(len(b.get("rooms",[])) for b in blds)
        occ = sum(1 for b in blds for r in b.get("rooms",[]) if r.get("occupied"))
        for txt, val, clr in [("🏘️ 楼房", len(blds), C["primary"]),
                               ("🚪 房屋", tr, C["text_secondary"]),
                               ("👤 已入住", occ, C["success"])]:
            row = tk.Frame(sf, bg=C["sidebar_bg"]); row.pack(fill=tk.X, pady=4)
            tk.Label(row, text=txt, font=FONT_SMALL,
                     fg=C["text_secondary"], bg=C["sidebar_bg"]).pack(side=tk.LEFT)
            tk.Label(row, text=str(val), font=("Microsoft YaHei UI",13,"bold"),
                     fg=clr, bg=C["sidebar_bg"]).pack(side=tk.RIGHT)

        tk.Frame(sb, bg=C["sidebar_bg"]).pack(expand=True)

        # 主题选择器
        tf = tk.Frame(sb, bg=C["sidebar_bg"]); tf.pack(fill=tk.X, padx=18, pady=(0,10))
        tk.Label(tf, text="🎨 界面风格", font=FONT_SMALL,
                 fg=C["text_secondary"], bg=C["sidebar_bg"]).pack(anchor=tk.W, pady=(0,6))
        tg = tk.Frame(tf, bg=C["sidebar_bg"]); tg.pack(fill=tk.X)
        rf = None
        for i, (tn, ti) in enumerate(THEMES.items()):
            if i % 2 == 0:
                rf = tk.Frame(tg, bg=C["sidebar_bg"]); rf.pack(fill=tk.X, pady=2)
            active = (self.dm.theme == tn)
            bclr = C["primary"] if active else C["border"]
            btn = tk.Frame(rf, bg=C["surface"],
                          highlightbackground=bclr,
                          highlightthickness=2 if active else 1)
            btn.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=3, pady=2)
            inn = tk.Frame(btn, bg=C["surface"]); inn.pack(padx=8, pady=6)
            tk.Label(inn, text=f"{ti['icon']} {tn}",
                     font=FONT_SMALL, fg=C["text"] if active else C["text_secondary"],
                     bg=C["surface"]).pack()
            sw = tk.Frame(inn, bg=C["surface"]); sw.pack(pady=(4,0))
            for sc in [ti["primary"], ti["success"], ti["warning"]]:
                tk.Frame(sw, bg=sc, width=14, height=8).pack(side=tk.LEFT, padx=2)
            # 悬停反馈：未选中的主题块在鼠标移入时高亮边框，移出复原（选中态不变）
            def _theme_hover(_e, b=btn, act=active):
                if not act:
                    b.configure(highlightbackground=C["primary"], highlightthickness=2)
            def _theme_leave(_e, b=btn, act=active):
                if not act:
                    b.configure(highlightbackground=C["border"], highlightthickness=1)
            for w in (btn, inn) + tuple(inn.winfo_children()) + tuple(sw.winfo_children()):
                w.bind("<Button-1>", lambda e, tn=tn: self._switch_theme(tn))
                w.bind("<Enter>", _theme_hover)
                w.bind("<Leave>", _theme_leave)
                w.configure(cursor="hand2")

        RoundedBtn(sb, "＋ 添加楼房", command=self._add_building,
                   bg=C["primary"], width=206, height=42,
                   canvas_bg=C["sidebar_bg"]).pack(pady=(10, 6))

        # 申请查看其他用户的楼房
        RoundedBtn(sb, "🔍 申请查看他人楼房", command=self._request_access_dialog,
                   bg=C["surface"], fg=C["text"], width=206, height=38,
                   canvas_bg=C["sidebar_bg"]).pack(pady=(0, 6))

        # 消息状态栏（待处理申请数）
        try:
            pending = len(self.api.inbox()) if not self.dm.offline else 0
        except Exception:
            pending = 0
        msg_label = f"📬 消息 ({pending})" if pending else "📭 消息"
        msg_bg = C["warning"] if pending else C["surface"]
        msg_fg = C["white"] if pending else C["text"]
        self.msg_btn = RoundedBtn(sb, msg_label, command=self._show_inbox,
                   bg=msg_bg, fg=msg_fg, width=206, height=38,
                   canvas_bg=C["sidebar_bg"])
        self.msg_btn.pack(pady=(0, 20))

        ma = tk.Frame(self.main, bg=C["bg"]); ma.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        # 右键菜单：刷新数据（手机端更新后无需退出重登）
        ma.bind("<Button-3>", self._show_context_menu)
        hd = tk.Frame(ma, bg=C["bg"]); hd.pack(fill=tk.X, padx=30, pady=(26,10))
        tk.Label(hd, text="我的楼房", font=FONT_TITLE,
                 fg=C["text"], bg=C["bg"]).pack(side=tk.LEFT)
        search = make_entry(hd, width=22)
        search.pack(side=tk.RIGHT, ipady=6)
        search.insert(0,"🔍 搜索...")
        search.bind("<FocusIn>", lambda e: search.delete(0,tk.END) if search.get()=="🔍 搜索..." else None)
        search.bind("<FocusOut>", lambda e: search.insert(0,"🔍 搜索...") if not search.get() else None)

        cv = tk.Canvas(ma, bg=C["bg"], highlightthickness=0)
        self.home_cv = cv  # 保存引用
        scr = tk.Scrollbar(ma, orient=tk.VERTICAL, command=cv.yview)
        self.card_frm = tk.Frame(cv, bg=C["bg"])
        self.card_frm.bind("<Configure>", lambda e: cv.configure(scrollregion=cv.bbox("all")))
        cw = cv.create_window((0,0), window=self.card_frm, anchor=tk.NW)
        cv.configure(yscrollcommand=scr.set)
        cv.bind("<Configure>", lambda e: cv.itemconfig(cw, width=e.width))
        cv.bind("<MouseWheel>", lambda e: cv.yview_scroll(int(-e.delta/120), "units"))
        cv.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scr.pack(side=tk.RIGHT, fill=tk.Y)
        search.bind("<KeyRelease>", lambda e: self._refresh_cards(search.get()))
        self._refresh_cards("")
        bind_scroll(self.card_frm, cv)

    def _switch_theme(self, tn):
        self._apply_theme(tn); self._show_home()

    # ====== 用户菜单 / 刷新 ======
    def _show_user_menu(self, event):
        """弹出用户菜单：刷新、切换账号、退出登录。"""
        menu = tk.Menu(self, tearoff=0, font=FONT_BODY,
                       bg=C["card"], fg=C["text"],
                       activebackground=C["primary"], activeforeground=C["white"])
        uname = self.cfg.username or "未登录"
        menu.add_command(label=f"当前账号：{uname}", state="disabled")
        menu.add_separator()
        menu.add_command(label="🔄 刷新数据", command=self._refresh_data)
        menu.add_command(label="🔧 编辑申请人权限", command=self._edit_grantees_dialog)
        menu.add_command(label="🔁 切换账号", command=self._switch_account)
        menu.add_command(label="🚪 退出登录", command=lambda: self._relogin(switch=False))
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    def _switch_account(self):
        """打开账号选择框：免密切换本设备登录过的账号（不再是退出重登）。"""
        dlg = SwitchAccountDialog(self, self.api)
        self.wait_window(dlg)
        if dlg.result and dlg.result[0] == "switched":
            # 切到新账号：重建数据并回主页
            self.dm = DataStore(self.api)
            self._apply_theme(self.dm.theme)
            self._show_home()

    def _refresh_data(self):
        """重新拉取服务器数据并重绘当前界面（手机端改了数据后，电脑端无需重登）。"""
        try:
            self.dm.load()
            if self.dm.offline:
                messagebox.showwarning("离线", "仍无法连接服务器，显示的是本地缓存。", parent=self)
        except Exception as e:
            messagebox.showerror("刷新失败", str(e), parent=self)
            return
        # 重绘当前页面
        if self.nav:
            self._clear(); self.nav[-1]()
        else:
            self._show_home()

    # ====== 账号级通讯：申请查看 / 消息箱 / 编辑权限 ======
    def _request_access_dialog(self):
        """申请查看其他用户的楼房（输入对方用户名）。"""
        if self.dm.offline:
            messagebox.showwarning("离线", "离线状态无法发起申请，请联网后重试。", parent=self)
            return
        name = simpledialog.askstring("申请查看他人楼房",
                                      "请输入对方的用户名：", parent=self)
        if not name or not name.strip():
            return
        try:
            self.api.request_access(name.strip())
            messagebox.showinfo("申请已发送",
                                f"已向「{name.strip()}」发送查看申请，\n等待对方在其消息栏同意。", parent=self)
        except NetworkError:
            messagebox.showerror("连接失败", "连不上服务器，请检查网络。", parent=self)
        except ApiError as e:
            messagebox.showerror("申请失败", e.message, parent=self)

    def _show_inbox(self):
        """消息状态栏：显示收到的待处理申请，可同意/拒绝。"""
        if self.dm.offline:
            messagebox.showwarning("离线", "离线状态无法查看消息，请联网后重试。", parent=self)
            return
        try:
            requests = self.api.inbox()
        except NetworkError:
            messagebox.showerror("连接失败", "连不上服务器，请检查网络。", parent=self)
            return
        except ApiError as e:
            messagebox.showerror("加载失败", e.message, parent=self)
            return
        InboxDialog(self, self.api, requests, on_done=self._after_inbox,
                    on_change=self._refresh_msg_badge)

    def _refresh_msg_badge(self):
        """重新拉取待处理申请数并即时更新侧栏消息按钮（处理完一条立即生效）。"""
        btn = getattr(self, "msg_btn", None)
        if not btn or not btn.winfo_exists():
            return
        try:
            pending = len(self.api.inbox()) if not self.dm.offline else 0
        except Exception:
            return
        if pending:
            btn.set_label(text=f"📬 消息 ({pending})",
                          bg=C["warning"], fg=C["white"])
        else:
            btn.set_label(text="📭 消息", bg=C["surface"], fg=C["text"])

    def _after_inbox(self):
        # 处理完申请后刷新数据（新授权的人可能产生可见楼房变化）
        self._refresh_data()

    def _edit_grantees_dialog(self):
        """编辑申请人权限：列出被授权人，勾选读/写权限。"""
        if self.dm.offline:
            messagebox.showwarning("离线", "离线状态无法编辑权限，请联网后重试。", parent=self)
            return
        try:
            grantees = self.api.list_grantees()
        except NetworkError:
            messagebox.showerror("连接失败", "连不上服务器，请检查网络。", parent=self)
            return
        except ApiError as e:
            messagebox.showerror("加载失败", e.message, parent=self)
            return
        GranteePermDialog(self, self.api, grantees)

    def _show_context_menu(self, event):
        """右键下拉菜单：刷新数据。"""
        menu = tk.Menu(self, tearoff=0, font=FONT_BODY,
                       bg=C["card"], fg=C["text"],
                       activebackground=C["primary"], activeforeground=C["white"])
        menu.add_command(label="🔄 刷新数据", command=self._refresh_data)
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    def _relogin(self, switch=False):
        """退出登录：清当前会话 token 后弹登录框（账号仍保留在账号簿，可免密切回）。"""
        if not messagebox.askyesno("退出登录", "确定要退出当前账号吗？", parent=self):
            return
        self.api.logout()
        dlg = LoginDialog(self, self.api)
        self.wait_window(dlg)
        if dlg.success:
            # 重新登录成功：重建数据并回主页
            self.dm = DataStore(self.api)
            self._show_home()
        else:
            # 用户取消登录：关闭程序
            self.destroy()

    def _add_building(self):
        BuildingDialog(self, lambda b: (self.dm.add(b), self._show_home()))

    def _refresh_cards(self, filt):
        for w in self.card_frm.winfo_children(): w.destroy()
        blds = self.dm.buildings
        ft = filt.lower().strip()
        if ft and ft != "🔍 搜索...":
            blds = [b for b in blds if ft in b["name"].lower()]
        if not blds:
            emp = tk.Frame(self.card_frm, bg=C["bg"]); emp.pack(fill=tk.BOTH, expand=True, pady=100)
            tk.Label(emp, text="📭", font=("Segoe UI Emoji",48), bg=C["bg"]).pack()
            tk.Label(emp, text="还没有添加楼房", font=FONT_BODY,
                     fg=C["text_secondary"], bg=C["bg"]).pack(pady=6)
            tk.Label(emp, text='点击左侧 "＋ 添加楼房" 开始', font=FONT_SMALL,
                     fg=C["text_dim"], bg=C["bg"]).pack()
            return
        cols = 2
        for i, b in enumerate(blds):
            if i % cols == 0:
                row = tk.Frame(self.card_frm, bg=C["bg"]); row.pack(fill=tk.X, padx=26, pady=8)
            self._bld_card(row, b).pack(side=tk.LEFT, fill=tk.X, expand=True,
                                        padx=(0,10) if i%cols==0 else (10,0))
        bind_scroll(self.card_frm, self.home_cv)

    def _bld_card(self, parent, b):
        perm = b.get("_permission", "owner")
        is_mine = (perm == "owner")
        # 他人楼房用不同边框色 + 角标区分
        border = C["border"] if is_mine else C["warning"]
        card = tk.Frame(parent, bg=C["card"],
                        highlightbackground=border,
                        highlightthickness=1 if is_mine else 2)
        inn = tk.Frame(card, bg=C["card"]); inn.pack(fill=tk.X, padx=20, pady=18)

        # 他人楼房：顶部加"来自 xxx"角标
        if not is_mine:
            tag = "👁 只读" if perm == "read" else "✎ 可编辑"
            tk.Label(inn, text=f"👥 来自 {b.get('_owner_username','?')}  ·  {tag}",
                     font=FONT_SMALL, fg=C["warning"], bg=C["card"]).pack(anchor=tk.W, pady=(0,6))

        r1 = tk.Frame(inn, bg=C["card"]); r1.pack(fill=tk.X)
        ic_bg = C["primary_dim"] if is_mine else C["surface"]
        ic = tk.Frame(r1, bg=ic_bg, width=44, height=44)
        ic.pack(side=tk.LEFT, padx=(0,14)); ic.pack_propagate(False)
        tk.Label(ic, text="🏢" if is_mine else "🏠", font=("Segoe UI Emoji",20), bg=ic_bg).place(relx=.5, rely=.5, anchor=tk.CENTER)
        nf = tk.Frame(r1, bg=C["card"]); nf.pack(side=tk.LEFT)
        tk.Label(nf, text=b["name"], font=FONT_HEADER, fg=C["text"], bg=C["card"]).pack(anchor=tk.W)
        bf = tk.Frame(r1, bg=C["card"]); bf.pack(side=tk.RIGHT)
        # 编辑/删除按钮：只读楼房不显示（无权改）
        if perm != "read":
            for txt, clr, cmd in [("✏️", C["primary"], lambda bb=b: self._edit_bld(bb)),
                                  ("🗑️", C["danger"], lambda bb=b: self._del_bld(bb))]:
                tk.Button(bf, text=txt, font=FONT_SMALL, relief=tk.FLAT, bd=0,
                          bg=C["card"], fg=clr, activebackground=C["card_hover"],
                          cursor="hand2", command=cmd).pack(side=tk.LEFT, padx=2)
        r2 = tk.Frame(inn, bg=C["card"]); r2.pack(fill=tk.X, pady=(10,8))
        fl, rpf = b.get("floors",1), b.get("rooms_per_floor",1)
        total = fl * rpf
        occ = sum(1 for r in b.get("rooms",[]) if r.get("occupied"))
        pct = int(occ/total*100) if total>0 else 0
        for txt in [f"📐 {fl}层 × {rpf}户", f"🚪 共{total}间", f"👤 入住{occ}间 ({pct}%)"]:
            tk.Label(r2, text=txt, font=FONT_SMALL,
                     fg=C["text_secondary"], bg=C["card"]).pack(side=tk.LEFT, padx=(0,16))
        bar = tk.Frame(inn, bg=C["divider"], height=4); bar.pack(fill=tk.X, pady=(2,12))
        if total > 0:
            tk.Frame(bar, bg=C["primary"], height=4).place(x=0,y=0,relwidth=pct/100)
        RoundedBtn(inn, "进入管理 →", width=130, height=34,
                   command=lambda bb=b: self._enter_bld(bb),
                   font=FONT_SMALL, canvas_bg=C["card"]).pack(anchor=tk.E)
        for w in (card, inn):
            w.bind("<Button-3>", lambda e, bb=b: self._bld_menu(e, bb))
        return card

    def _bld_menu(self, e, b):
        m = tk.Menu(self, tearoff=0, font=FONT_BODY,
                    bg=C["card"], fg=C["text"],
                    activebackground=C["primary"], activeforeground=C["white"])
        m.add_command(label="✏️ 编辑", command=lambda: self._edit_bld(b))
        m.add_command(label="🗑️ 删除", command=lambda: self._del_bld(b))
        m.post(e.x_root, e.y_root)

    def _edit_bld(self, b):
        idx = self.dm.find(b["id"])[0]
        if idx >= 0:
            BuildingDialog(self, lambda upd: (self.dm.update(idx, upd), self._show_home()), b)

    def _del_bld(self, b):
        if messagebox.askyesno("确认删除", f"确定删除「{b['name']}」？\n此操作不可撤销！"):
            i, _ = self.dm.find(b["id"])
            if i>=0: self.dm.delete(i)
            self._show_home()

    def _enter_bld(self, b):
        self._push(lambda bb=b: self._show_room_grid(bb))

    # ====== 房间网格（横向滚动） ======
    def _show_room_grid(self, building):
        self._clear()
        i, building = self.dm.find(building["id"])
        if i < 0: self._back(); return

        # 顶栏（不含编辑楼房按钮 - 3.2）
        bar = tk.Frame(self.main, bg=C["topbar"], height=60)
        bar.pack(fill=tk.X); bar.pack_propagate(False)
        BackBtn(bar, self._back, bg=C["topbar"]).pack(side=tk.LEFT, padx=14, pady=11)
        tk.Label(bar, text=building["name"], font=FONT_TITLE,
                 fg=C["text"], bg=C["topbar"]).pack(side=tk.LEFT, pady=14)

        rooms = building.get("rooms", [])
        floors = building.get("floors", 1)
        rpf = building.get("rooms_per_floor", 1)
        total = len(rooms)
        occ = sum(1 for r in rooms if r.get("occupied"))

        tk.Label(bar, text=f"  {floors}层 · {rpf}户/层 · {total}间 · 入住{occ}间",
                 font=FONT_SMALL, fg=C["text_secondary"],
                 bg=C["topbar"]).pack(side=tk.LEFT, padx=10, pady=18)

        # 竖向滚动容器
        cv = tk.Canvas(self.main, bg=C["bg"], highlightthickness=0)
        vsb = tk.Scrollbar(self.main, orient=tk.VERTICAL, command=cv.yview)
        ct = tk.Frame(cv, bg=C["bg"])
        ct.bind("<Configure>", lambda e: cv.configure(scrollregion=cv.bbox("all")))
        cw = cv.create_window((0,0), window=ct, anchor=tk.NW)
        cv.configure(yscrollcommand=vsb.set)
        cv.bind("<Configure>", lambda e: cv.itemconfig(cw, width=e.width))
        cv.bind("<MouseWheel>", lambda e: cv.yview_scroll(int(-e.delta/120), "units"))
        cv.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)

        leg = tk.Frame(ct, bg=C["bg"]); leg.pack(fill=tk.X, padx=30, pady=(16,8))
        tk.Label(leg, text="房间列表", font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(side=tk.LEFT)
        for clr, txt in [(C["success"], "已入住"), (C["border"], "空置")]:
            tk.Frame(leg, bg=clr, width=10, height=10).pack(side=tk.LEFT, padx=(16,4))
            tk.Label(leg, text=txt, font=FONT_SMALL,
                     fg=C["text_secondary"], bg=C["bg"]).pack(side=tk.LEFT)

        floor_labels = building.get("floor_labels", {})
        for fn in range(1, floors+1):
            self._draw_floor_hscroll(ct, building, fn, rpf, rooms, floor_labels)
        bind_scroll(ct, cv)

    def _draw_floor_hscroll(self, parent, building, floor_num, rpf, all_rooms, floor_labels):
        """楼层视图 - 带横向滚动条"""

        # 楼层标题
        fh = tk.Frame(parent, bg=C["bg"])
        fh.pack(fill=tk.X, padx=30, pady=(16, 8))

        fl_label = tk.Frame(fh, bg=C["primary_dim"], width=60, height=28)
        fl_label.pack(side=tk.LEFT)
        fl_label.pack_propagate(False)
        tk.Label(fl_label, text=str(floor_num), font=("Segoe UI", 14, "bold"),
                 fg=C["white"], bg=C["primary_dim"]).place(relx=.5, rely=.5, anchor=tk.CENTER)

        # 使用自定义楼层标签
        custom_label = floor_labels.get(str(floor_num), "")
        display_name = custom_label if custom_label else f"第 {floor_num} 层"
        tk.Label(fh, text=display_name, font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(side=tk.LEFT, padx=10)

        f_rooms = [r for r in all_rooms if r["id"].startswith(f"{floor_num:02d}")]
        f_occ = sum(1 for r in f_rooms if r.get("occupied"))
        tk.Label(fh, text=f"入住 {f_occ}/{len(f_rooms)}",
                 font=FONT_SMALL, fg=C["text_secondary"], bg=C["bg"]).pack(side=tk.LEFT, padx=10)

        # ---- 横向滚动容器 ----
        h_container = tk.Frame(parent, bg=C["bg"])
        h_container.pack(fill=tk.X, padx=26, pady=(0, 8))

        h_canvas = tk.Canvas(h_container, bg=C["bg"], height=140,
                             highlightthickness=0)
        h_scroll = tk.Scrollbar(h_container, orient=tk.HORIZONTAL,
                                command=h_canvas.xview)
        grid = tk.Frame(h_canvas, bg=C["bg"])
        gw = grid.bind("<Configure>",
                       lambda e: h_canvas.configure(scrollregion=h_canvas.bbox("all")))
        h_cw = h_canvas.create_window((0,0), window=grid, anchor=tk.NW)
        h_canvas.configure(xscrollcommand=h_scroll.set)

        h_canvas.pack(side=tk.TOP, fill=tk.X, expand=True)
        h_scroll.pack(side=tk.TOP, fill=tk.X)

        # 鼠标滚轮水平滚动（直接绑定到 canvas 自身，不用 bind_all）
        def _on_hwheel(event):
            h_canvas.xview_scroll(int(-event.delta/60), "units")

        h_canvas.bind("<MouseWheel>", _on_hwheel)
        # 让子 widget 也能传递滚轮事件到 canvas
        grid.bind("<MouseWheel>", _on_hwheel)

        for rn in range(1, rpf+1):
            rid = f"{floor_num:02d}{rn:02d}"
            rd = next((r for r in all_rooms if r["id"]==rid), None)
            if rd is None: rd = DataStore.new_room(rid)
            self._room_card(grid, rd, building).pack(side=tk.LEFT, padx=5, pady=5)

    def _room_card(self, parent, room, building):
        occ = room.get("occupied", False)
        border_color = C["success"] if occ else C["border"]
        w, h = 120, 120

        card = tk.Frame(parent, bg=C["card"], width=w, height=h,
                        highlightbackground=border_color, highlightthickness=2)
        card.pack_propagate(False)
        tk.Frame(card, bg=border_color, height=3).pack(fill=tk.X)

        inn = tk.Frame(card, bg=C["card"])
        inn.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)

        # 主标题：自定义名优先替换原ID显示
        display_name = room.get("name", room["id"])
        is_custom = (display_name != room["id"])
        tk.Label(inn, text=display_name,
                 font=("Segoe UI", 15, "bold") if not is_custom else ("Microsoft YaHei UI", 12, "bold"),
                 fg=C["primary"] if not occ else C["text"],
                 bg=C["card"]).pack(pady=(6, 0))

        if occ:
            tk.Label(inn, text="● 已入住", font=("Microsoft YaHei UI", 8),
                     fg=C["success"], bg=C["card"]).pack(pady=(6, 0))
            tenant = room.get("tenant_name", "")
            if tenant:
                tk.Label(inn, text=tenant, font=("Microsoft YaHei UI", 9),
                         fg=C["text_secondary"], bg=C["card"]).pack()
            rem = remaining_months(room.get("lease_start",""),
                                   room.get("lease_months",0))
            if rem >= 0:
                rc = C["danger"] if rem <= 2 else C["warning"] if rem <= 4 else C["text_secondary"]
                tk.Label(inn, text=f"剩余{rem}个月", font=("Microsoft YaHei UI", 7),
                         fg=rc, bg=C["card"]).pack()
        else:
            tk.Label(inn, text="○ 空置", font=("Microsoft YaHei UI", 8),
                     fg=C["text_dim"], bg=C["card"]).pack(pady=(6, 0))

        handler = lambda e, r=room, b=building: self._open_room(r, b)
        for wgt in [card, inn] + list(inn.winfo_children()):
            wgt.bind("<Button-1>", handler)
            wgt.bind("<Enter>", lambda e, c=card: c.configure(bg=C["card_hover"]))
            wgt.bind("<Leave>", lambda e, c=card: c.configure(bg=C["card"]))

        return card

    def _open_room(self, room, building):
        def on_save(upd):
            i, bld = self.dm.find(building["id"])
            if i >= 0:
                rms = bld.get("rooms",[])
                for j, r in enumerate(rms):
                    if r["id"] == upd["id"]: rms[j] = upd; break
                bld["rooms"] = rms; self.dm.update(i, bld)
                self._show_room_grid(bld)

        def on_transfer(rd):
            i, bld = self.dm.find(building["id"])
            if i >= 0:
                rms = bld.get("rooms",[])
                for j, r in enumerate(rms):
                    if r["id"] == rd["id"]: rms[j] = rd; break
                bld["rooms"] = rms; self.dm.update(i, bld)
            self.do_transfer(bld, rd)

        RoomDialog(self, dict(room), building["name"], on_save, on_transfer)

    def do_transfer(self, building, room):
        blds = self.dm.buildings
        def cb(tgt_bid, tgt_rid):
            is_s, sb = self.dm.find(building["id"])
            id_d, db = self.dm.find(tgt_bid)
            if is_s<0 or id_d<0: return
            src = next((r for r in sb.get("rooms",[]) if r["id"]==room["id"]), None)
            dst = next((r for r in db.get("rooms",[]) if r["id"]==tgt_rid), None)
            if not src or not dst: return
            for k in ("tenant_name","rent_paid","notes","lease_start","lease_months"):
                dst[k] = dict(src[k]) if k=="rent_paid" else src[k]
            dst["occupied"] = True
            src.update(occupied=False, tenant_name="", rent_paid={},
                       notes="", lease_start="", lease_months=0)
            self.dm.update(is_s, sb)
            if is_s != id_d: self.dm.update(id_d, db)
            messagebox.showinfo("转移成功",
                                f"租客已从 {src['name']} → {db['name']} - {dst['name']}")
            self._show_room_grid(sb)
        TransferDialog(self, blds, building["id"], room["id"], cb)

    # ====== 待审改动：后台轮询 + 逐条弹窗 ======
    PENDING_POLL_MS = 8000  # 轮询间隔（毫秒）

    def _start_pending_poll(self):
        """启动轮询（幂等：重复调用不会叠加多个定时器）。"""
        if self._pending_poll_on:
            return
        self._pending_poll_on = True
        self._schedule_pending_poll()

    def _schedule_pending_poll(self):
        if not self._pending_poll_on:
            return
        self._pending_after_id = self.after(self.PENDING_POLL_MS, self._poll_pending)

    def _poll_pending(self):
        """拉取待审改动；有则逐条弹窗。一次只弹一条，处理完才弹下一条。"""
        # 弹窗开着 / 当前离线时，本轮跳过，下轮再来
        if self._pending_dialog_open or getattr(self.dm, "offline", False):
            self._schedule_pending_poll()
            return
        try:
            changes = self.api.list_pending_changes()
        except (NetworkError, ApiError):
            # 拉取失败（断网/鉴权）：静默跳过，下轮再试
            self._schedule_pending_poll()
            return
        except Exception:
            self._schedule_pending_poll()
            return

        if changes:
            self._show_next_pending(changes)
        else:
            self._schedule_pending_poll()

    def _show_next_pending(self, changes):
        """弹出队列中第一条；用户处理完后接着弹下一条（重新拉取以反映最新状态）。"""
        if not changes:
            self._schedule_pending_poll()
            return
        self._pending_dialog_open = True
        dlg = PendingChangeDialog(self, self.api, changes[0], total_pending=len(changes))
        self.wait_window(dlg)
        self._pending_dialog_open = False

        if dlg.resolved is True:
            # 接收了改动：刷新界面让新数据立即可见
            try:
                self.dm.load()
                if self.nav:
                    self._clear(); self.nav[-1]()
                else:
                    self._show_home()
            except Exception:
                pass

        if dlg.resolved is None:
            # 用户点了「稍后」：停止本轮连续弹窗，等下次轮询再问
            self._schedule_pending_poll()
            return

        # 处理了一条（接收或拒绝）：重新拉取剩余的，继续逐条弹
        try:
            remaining = self.api.list_pending_changes()
        except Exception:
            remaining = []
        if remaining:
            # 用 after 让界面喘口气，再弹下一条
            self.after(300, lambda: self._show_next_pending(remaining))
        else:
            self._schedule_pending_poll()

    def _close(self):
        self._pending_poll_on = False
        if self._pending_after_id:
            try: self.after_cancel(self._pending_after_id)
            except Exception: pass
        self.dm.save(); self.destroy()


if __name__ == "__main__":
    App().mainloop()
