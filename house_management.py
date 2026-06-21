#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
楼房管理系统 - House Management System
简约现代风格的楼房/房屋/租客管理工具
功能：楼房CRUD、房间管理、租客管理、租金追踪、租期管理、房屋转移
"""

import tkinter as tk
from tkinter import ttk, messagebox
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

# ============================================================
# 全局常量 - 配色方案（简约现代风）
# ============================================================
COLORS = {
    "bg":            "#F5F5F7",
    "card":          "#FFFFFF",
    "sidebar":       "#2C2C2E",
    "sidebar_text":  "#FFFFFF",
    "primary":       "#007AFF",
    "success":       "#34C759",
    "danger":        "#FF3B30",
    "warning":       "#FF9500",
    "text":          "#1D1D1F",
    "text_secondary":"#86868B",
    "border":        "#E5E5EA",
    "hover":         "#F2F2F7",
}

FONT_TITLE  = ("Microsoft YaHei UI", 18, "bold")
FONT_HEADER = ("Microsoft YaHei UI", 14, "bold")
FONT_BODY   = ("Microsoft YaHei UI", 11)
FONT_SMALL  = ("Microsoft YaHei UI", 9)
FONT_BTN    = ("Microsoft YaHei UI", 11)


# ============================================================
# 工具函数
# ============================================================
def generate_id():
    return datetime.now().strftime("%Y%m%d%H%M%S%f")

def format_date(s):
    if not s:
        return ""
    try:
        d = datetime.strptime(s, "%Y-%m-%d")
        return d.strftime("%Y年%m月%d日")
    except:
        return s

def calc_remaining_months(start_str, total_months):
    if not start_str or total_months <= 0:
        return -1
    try:
        start = datetime.strptime(start_str, "%Y-%m-%d")
        end = start + timedelta(days=total_months * 30)
        now = datetime.now()
        if now > end:
            return 0
        remaining_days = (end - now).days
        return max(0, remaining_days // 30)
    except:
        return -1

def calc_end_date(start_str, total_months):
    if not start_str or total_months <= 0:
        return ""
    try:
        start = datetime.strptime(start_str, "%Y-%m-%d")
        end = start + timedelta(days=total_months * 30)
        return end.strftime("%Y-%m-%d")
    except:
        return ""


# ============================================================
# 数据管理器
# ============================================================
class DataManager:
    def __init__(self, data_file):
        self.data_file = data_file
        self.data = {"buildings": []}
        self.load()

    def load(self):
        if os.path.exists(self.data_file):
            try:
                with open(self.data_file, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except:
                self.data = {"buildings": []}
        else:
            self.data = {"buildings": []}

    def save(self):
        with open(self.data_file, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)

    def get_buildings(self):
        return self.data.get("buildings", [])

    def add_building(self, building):
        self.data.setdefault("buildings", []).append(building)
        self.save()

    def update_building(self, idx, building):
        self.data["buildings"][idx] = building
        self.save()

    def delete_building(self, idx):
        del self.data["buildings"][idx]
        self.save()

    def find_building(self, building_id):
        for i, b in enumerate(self.data.get("buildings", [])):
            if b.get("id") == building_id:
                return i, b
        return -1, None


# ============================================================
# 通用组件
# ============================================================
class ModernButton(tk.Canvas):
    """自定义圆角按钮"""

    def __init__(self, parent, text, command=None, width=120, height=36,
                 bg=COLORS["primary"], fg="#FFFFFF", font=FONT_BTN, **kwargs):
        super().__init__(parent, width=width, height=height,
                         bg=COLORS["bg"], highlightthickness=0, **kwargs)
        self.btn_bg = bg
        self.btn_fg = fg
        self.command = command
        self.text = text
        self.font = font
        self.w = width
        self.h = height
        self.r = 8
        self._pressed = False

        self.bind("<Button-1>", self._on_click)
        self.bind("<Enter>", self._on_enter)
        self.bind("<Leave>", self._on_leave)
        self.bind("<ButtonRelease-1>", self._on_release)
        self._draw()

    def _draw(self, hover=False, pressed=False):
        self.delete("all")
        color = self.btn_bg
        if pressed:
            color = self._darken(color, 0.15)
        elif hover:
            color = self._darken(color, 0.08)
        self._round_rect(0, 0, self.w, self.h, self.r, fill=color, outline=color)
        self.create_text(self.w // 2, self.h // 2, text=self.text,
                         fill=self.btn_fg, font=self.font)

    def _round_rect(self, x1, y1, x2, y2, r, **kw):
        pts = [x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r,
               x2, y2 - r, x2, y2, x2 - r, y2, x1 + r, y2, x1, y2,
               x1, y2 - r, x1, y1 + r, x1, y1]
        return self.create_polygon(pts, smooth=True, **kw)

    def _darken(self, hx, f):
        hx = hx.lstrip("#")
        r, g, b = int(hx[:2], 16), int(hx[2:4], 16), int(hx[4:6], 16)
        r = max(0, min(255, int(r * (1 - f))))
        g = max(0, min(255, int(g * (1 - f))))
        b = max(0, min(255, int(b * (1 - f))))
        return f"#{r:02x}{g:02x}{b:02x}"

    def _on_click(self, e):
        self._pressed = True
        self._draw(pressed=True)

    def _on_release(self, e):
        self._pressed = False
        self._draw(hover=False)
        if self.command:
            self.command()

    def _on_enter(self, e):
        self._draw(hover=True)

    def _on_leave(self, e):
        self._pressed = False
        self._draw(hover=False)


class BackButton(tk.Canvas):
    """返回箭头按钮"""

    def __init__(self, parent, command, **kwargs):
        super().__init__(parent, width=36, height=36,
                         bg=COLORS["bg"], highlightthickness=0, **kwargs)
        self._cmd = command
        self.bind("<Button-1>", lambda e: self._cmd())
        self.bind("<Enter>", self._on_enter)
        self.bind("<Leave>", self._on_leave)
        self._draw(False)

    def _draw(self, hover):
        self.delete("all")
        color = COLORS["hover"] if hover else COLORS["border"]
        self._round_rect(0, 0, 36, 36, 8, fill=color, outline=color)
        self.create_line(20, 10, 12, 18, 20, 26,
                         fill=COLORS["primary"], width=2.5,
                         capstyle=tk.ROUND, joinstyle=tk.ROUND)

    def _round_rect(self, x1, y1, x2, y2, r, **kw):
        pts = [x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r,
               x2, y2 - r, x2, y2, x2 - r, y2, x1 + r, y2, x1, y2,
               x1, y2 - r, x1, y1 + r, x1, y1]
        return self.create_polygon(pts, smooth=True, **kw)

    def _on_enter(self, e):
        self._draw(True)

    def _on_leave(self, e):
        self._draw(False)


def styled_entry(parent, var=None, **kw):
    """创建统一样式的输入框"""
    e = tk.Entry(parent, textvariable=var, font=FONT_BODY,
                 relief=tk.FLAT, bd=0, bg=COLORS["card"], fg=COLORS["text"],
                 insertbackground=COLORS["primary"],
                 highlightbackground=COLORS["border"],
                 highlightcolor=COLORS["primary"],
                 highlightthickness=1, **kw)
    return e


# ============================================================
# 对话框: 添加/编辑楼房
# ============================================================
class BuildingEditDialog(tk.Toplevel):
    def __init__(self, parent, on_save, building=None):
        super().__init__(parent)
        self.on_save = on_save
        self.building = building
        self.result = None
        is_edit = building is not None

        self.title("编辑楼房" if is_edit else "添加楼房")
        self.geometry("420x360")
        self.resizable(False, False)
        self.configure(bg=COLORS["bg"])
        self.transient(parent)
        self.grab_set()
        self._center(parent)

        self._build_ui()

    def _center(self, parent):
        self.update_idletasks()
        x = parent.winfo_rootx() + (parent.winfo_width() - 420) // 2
        y = parent.winfo_rooty() + (parent.winfo_height() - 360) // 2
        self.geometry(f"+{x}+{y}")

    def _build_ui(self):
        p = {"padx": 24, "pady": (10, 2)}

        title_text = "编辑楼房信息" if self.building else "添加新楼房"
        tk.Label(self, text=title_text, font=FONT_TITLE,
                 fg=COLORS["text"], bg=COLORS["bg"]).pack(pady=(20, 12))

        # 名称
        tk.Label(self, text="楼房名称", font=FONT_BODY,
                 fg=COLORS["text_secondary"], bg=COLORS["bg"]).pack(anchor=tk.W, **p)
        self.name_var = tk.StringVar(value=self.building["name"] if self.building else "")
        name_entry = styled_entry(self, self.name_var)
        name_entry.pack(fill=tk.X, padx=24, ipady=8)

        # 层数
        tk.Label(self, text="层数", font=FONT_BODY,
                 fg=COLORS["text_secondary"], bg=COLORS["bg"]).pack(anchor=tk.W,
                 padx=24, pady=(14, 2))
        frm = tk.Frame(self, bg=COLORS["bg"])
        frm.pack(fill=tk.X, padx=24)
        self.floors_var = tk.IntVar(value=self.building["floors"] if self.building else 5)
        tk.Scale(frm, from_=1, to=30, orient=tk.HORIZONTAL,
                 variable=self.floors_var, bg=COLORS["bg"],
                 troughcolor=COLORS["border"], activebackground=COLORS["primary"],
                 highlightthickness=0, length=340).pack(side=tk.LEFT)
        tk.Label(frm, textvariable=self.floors_var,
                 font=FONT_BODY, fg=COLORS["primary"], bg=COLORS["bg"],
                 width=3).pack(side=tk.RIGHT)

        # 每层户数
        tk.Label(self, text="每层户数", font=FONT_BODY,
                 fg=COLORS["text_secondary"], bg=COLORS["bg"]).pack(anchor=tk.W,
                 padx=24, pady=(14, 2))
        frm2 = tk.Frame(self, bg=COLORS["bg"])
        frm2.pack(fill=tk.X, padx=24)
        self.rooms_var = tk.IntVar(value=self.building["rooms_per_floor"] if self.building else 4)
        tk.Scale(frm2, from_=1, to=10, orient=tk.HORIZONTAL,
                 variable=self.rooms_var, bg=COLORS["bg"],
                 troughcolor=COLORS["border"], activebackground=COLORS["primary"],
                 highlightthickness=0, length=340).pack(side=tk.LEFT)
        tk.Label(frm2, textvariable=self.rooms_var,
                 font=FONT_BODY, fg=COLORS["primary"], bg=COLORS["bg"],
                 width=3).pack(side=tk.RIGHT)

        # 按钮
        btn_frame = tk.Frame(self, bg=COLORS["bg"])
        btn_frame.pack(pady=20)
        ModernButton(btn_frame, "取消", command=self.destroy,
                     bg=COLORS["border"], fg=COLORS["text"],
                     width=100, height=36).pack(side=tk.LEFT, padx=6)
        ModernButton(btn_frame, "保存", command=self._save,
                     width=100, height=36).pack(side=tk.LEFT, padx=6)

    def _save(self):
        name = self.name_var.get().strip()
        if not name:
            messagebox.showwarning("提示", "请输入楼房名称", parent=self)
            return
        floors = self.floors_var.get()
        rpf = self.rooms_var.get()

        if self.building:
            existing = self.building.get("rooms", [])
            new_rooms = []
            for f in range(1, floors + 1):
                for r in range(1, rpf + 1):
                    rid = f"{f:02d}{r:02d}"
                    found = next((er for er in existing if er["id"] == rid), None)
                    new_rooms.append(found if found else self._make_room(rid))
            self.building.update({"name": name, "floors": floors,
                                  "rooms_per_floor": rpf, "rooms": new_rooms})
            self.result = self.building
        else:
            rooms = [self._make_room(f"{f:02d}{r:02d}")
                     for f in range(1, floors + 1) for r in range(1, rpf + 1)]
            self.result = {"id": generate_id(), "name": name, "floors": floors,
                           "rooms_per_floor": rpf, "rooms": rooms}

        self.on_save(self.result)
        self.destroy()

    @staticmethod
    def _make_room(rid):
        return {"id": rid, "name": rid, "occupied": False, "tenant_name": "",
                "rent_paid": {}, "notes": "", "lease_start": "", "lease_months": 0}


# ============================================================
# 对话框: 房间详情
# ============================================================
class RoomDetailDialog(tk.Toplevel):
    def __init__(self, parent, room, building_name, on_save, transfer_callback=None):
        super().__init__(parent)
        self.room = room
        self.building_name = building_name
        self.on_save = on_save
        self.transfer_callback = transfer_callback

        self.title(f"{building_name} - {room['name']}")
        self.geometry("540x660")
        self.resizable(False, False)
        self.configure(bg=COLORS["bg"])
        self.transient(parent)
        self.grab_set()
        self._center(parent)

        self._build_ui()
        self._load_data()

    def _center(self, parent):
        self.update_idletasks()
        x = parent.winfo_rootx() + (parent.winfo_width() - 540) // 2
        y = parent.winfo_rooty() + (parent.winfo_height() - 660) // 2
        self.geometry(f"+{x}+{y}")

    def _build_ui(self):
        # 顶部标题栏
        header = tk.Frame(self, bg=COLORS["sidebar"], height=56)
        header.pack(fill=tk.X)
        header.pack_propagate(False)
        tk.Label(header, text=f"🏠 {self.room['name']}",
                 font=FONT_TITLE, fg=COLORS["sidebar_text"],
                 bg=COLORS["sidebar"]).pack(side=tk.LEFT, padx=20, pady=12)

        # 入住状态
        sf = tk.Frame(header, bg=COLORS["sidebar"])
        sf.pack(side=tk.RIGHT, padx=20)
        self.occupied_var = tk.BooleanVar()
        self.status_label = tk.Label(sf, text="空置", font=FONT_BODY,
                                     fg=COLORS["sidebar_text"], bg=COLORS["sidebar"])
        self.status_label.pack(side=tk.LEFT, padx=(0, 10))
        cb = tk.Checkbutton(sf, variable=self.occupied_var, command=self._toggle_occupied,
                            bg=COLORS["sidebar"], activebackground=COLORS["sidebar"],
                            selectcolor=COLORS["success"], fg=COLORS["sidebar_text"])
        cb.pack(side=tk.LEFT)

        # 可滚动内容
        canvas = tk.Canvas(self, bg=COLORS["bg"], highlightthickness=0)
        scrollbar = tk.Scrollbar(self, orient=tk.VERTICAL, command=canvas.yview)
        self.content = tk.Frame(canvas, bg=COLORS["bg"])
        self.content.bind("<Configure>",
                          lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        cw = canvas.create_window((0, 0), window=self.content, anchor=tk.NW, width=540)
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.bind("<Configure>", lambda e: canvas.itemconfig(cw, width=e.width))

        def _mw(event):
            canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        canvas.bind_all("<MouseWheel>", _mw)
        self._mw = _mw

        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        p = {"padx": 24, "pady": (8, 2)}

        # 房屋名称
        tk.Label(self.content, text="房屋名称", font=FONT_BODY,
                 fg=COLORS["text_secondary"], bg=COLORS["bg"]).pack(anchor=tk.W, **p)
        self.room_name_var = tk.StringVar()
        e = styled_entry(self.content, self.room_name_var)
        e.pack(fill=tk.X, padx=24, ipady=8)

        # 租客姓名
        tk.Label(self.content, text="租客姓名", font=FONT_BODY,
                 fg=COLORS["text_secondary"], bg=COLORS["bg"]).pack(anchor=tk.W, **p)
        self.tenant_var = tk.StringVar()
        e2 = styled_entry(self.content, self.tenant_var)
        e2.pack(fill=tk.X, padx=24, ipady=8)

        # 租期设置
        tk.Label(self.content, text="📅 租期设置", font=FONT_HEADER,
                 fg=COLORS["text"], bg=COLORS["bg"]).pack(anchor=tk.W,
                 padx=24, pady=(16, 4))
        lf = tk.Frame(self.content, bg=COLORS["card"],
                      highlightbackground=COLORS["border"], highlightthickness=1)
        lf.pack(fill=tk.X, padx=24, pady=4)
        inner = tk.Frame(lf, bg=COLORS["card"])
        inner.pack(fill=tk.X, padx=12, pady=12)

        tk.Label(inner, text="租期开始", font=FONT_BODY,
                 fg=COLORS["text_secondary"], bg=COLORS["card"]).pack(anchor=tk.W)
        self.lease_start_var = tk.StringVar()
        le = tk.Entry(inner, textvariable=self.lease_start_var, font=FONT_BODY,
                      relief=tk.FLAT, bd=0, bg=COLORS["bg"], fg=COLORS["text"],
                      insertbackground=COLORS["primary"])
        le.pack(fill=tk.X, pady=(2, 4), ipady=6)
        tk.Label(inner, text="格式: YYYY-MM-DD，如 2025-01-01",
                 font=FONT_SMALL, fg=COLORS["text_secondary"], bg=COLORS["card"]).pack(anchor=tk.W)

        tk.Label(inner, text="租期月数", font=FONT_BODY,
                 fg=COLORS["text_secondary"], bg=COLORS["card"]).pack(anchor=tk.W, pady=(8, 0))
        mf = tk.Frame(inner, bg=COLORS["card"])
        mf.pack(fill=tk.X, pady=(2, 0))
        self.lease_months_var = tk.IntVar()
        tk.Scale(mf, from_=1, to=36, orient=tk.HORIZONTAL,
                 variable=self.lease_months_var, bg=COLORS["card"],
                 troughcolor=COLORS["border"], activebackground=COLORS["primary"],
                 highlightthickness=0, length=320).pack(side=tk.LEFT)
        tk.Label(mf, textvariable=self.lease_months_var,
                 font=FONT_BODY, fg=COLORS["primary"], bg=COLORS["card"],
                 width=3).pack(side=tk.RIGHT)

        self.lease_info_label = tk.Label(inner, text="", font=FONT_SMALL,
                                         fg=COLORS["text_secondary"],
                                         bg=COLORS["card"], justify=tk.LEFT)
        self.lease_info_label.pack(anchor=tk.W, pady=(8, 0))

        # 租金提交
        tk.Label(self.content, text="💰 每月租金提交", font=FONT_HEADER,
                 fg=COLORS["text"], bg=COLORS["bg"]).pack(anchor=tk.W,
                 padx=24, pady=(16, 4))
        rf = tk.Frame(self.content, bg=COLORS["card"],
                      highlightbackground=COLORS["border"], highlightthickness=1)
        rf.pack(fill=tk.X, padx=24, pady=4)
        ri = tk.Frame(rf, bg=COLORS["card"])
        ri.pack(fill=tk.X, padx=12, pady=12)
        self.rent_buttons_frame = tk.Frame(ri, bg=COLORS["card"])
        self.rent_buttons_frame.pack(fill=tk.X)

        # 租客注解
        tk.Label(self.content, text="📝 租客注解", font=FONT_HEADER,
                 fg=COLORS["text"], bg=COLORS["bg"]).pack(anchor=tk.W,
                 padx=24, pady=(16, 4))
        self.notes_text = tk.Text(self.content, height=4, font=FONT_BODY,
                                  relief=tk.FLAT, bd=0, bg=COLORS["card"],
                                  fg=COLORS["text"], wrap=tk.WORD,
                                  insertbackground=COLORS["primary"],
                                  highlightbackground=COLORS["border"],
                                  highlightcolor=COLORS["primary"],
                                  highlightthickness=1)
        self.notes_text.pack(fill=tk.X, padx=24, ipady=6)

        # 底部按钮
        btn_frame = tk.Frame(self, bg=COLORS["bg"])
        btn_frame.pack(fill=tk.X, pady=14, padx=24)

        ModernButton(btn_frame, "取消", command=self.destroy,
                     bg=COLORS["border"], fg=COLORS["text"],
                     width=90, height=38).pack(side=tk.LEFT, padx=4)

        # 转移按钮（仅已入住时显示）
        self.transfer_btn = ModernButton(btn_frame, "🔄 转移租客",
                                         command=self._do_transfer,
                                         bg=COLORS["warning"], fg="#FFFFFF",
                                         width=110, height=38)

        ModernButton(btn_frame, "💾 保存", command=self._save,
                     width=90, height=38).pack(side=tk.RIGHT, padx=4)

    def _toggle_occupied(self):
        occ = self.occupied_var.get()
        self.status_label.configure(text="已入住" if occ else "空置",
                                    fg=COLORS["success"] if occ else COLORS["sidebar_text"])
        # 显示/隐藏转移按钮
        if occ:
            self.transfer_btn.pack(side=tk.LEFT, padx=4,
                                   before=self._find_save_btn())
        else:
            self.transfer_btn.pack_forget()

    def _find_save_btn(self):
        """获取底部按钮栏中保存按钮之前的参考widget"""
        for child in self.winfo_children():
            if isinstance(child, tk.Frame) and child != self.content:
                children = child.winfo_children()
                for c in children:
                    if isinstance(c, ModernButton) and "保存" in (c.text or ""):
                        return c
        return None

    def _do_transfer(self):
        if self.transfer_callback:
            # 先保存当前编辑
            self._apply_to_room()
            self.withdraw()
            self.transfer_callback(self.room)
            self.destroy()

    def _load_data(self):
        self.room_name_var.set(self.room.get("name", ""))
        self.occupied_var.set(self.room.get("occupied", False))
        self.tenant_var.set(self.room.get("tenant_name", ""))
        self.lease_start_var.set(self.room.get("lease_start", ""))
        self.lease_months_var.set(self.room.get("lease_months", 1))
        self.notes_text.insert("1.0", self.room.get("notes", ""))

        self._toggle_occupied()
        self._refresh_rent()
        self._update_lease_info()

        self.lease_months_var.trace_add("write", lambda *a: self._on_lease_change())
        self.lease_start_var.trace_add("write", lambda *a: self._update_lease_info())

    def _on_lease_change(self):
        self._update_lease_info()
        self._refresh_rent()

    def _update_lease_info(self):
        start = self.lease_start_var.get().strip()
        months = self.lease_months_var.get()
        rem = calc_remaining_months(start, months)
        end = calc_end_date(start, months)
        lines = []
        if end:
            lines.append(f"到期日期: {format_date(end)}")
        if rem >= 0:
            if rem == 0:
                lines.append("⚠️ 租期已到期")
            elif rem <= 2:
                lines.append(f"⚠️ 剩余租期: {rem} 个月（即将到期）")
            else:
                lines.append(f"剩余租期: {rem} 个月")
        self.lease_info_label.configure(text="\n".join(lines))

    def _refresh_rent(self):
        for w in self.rent_buttons_frame.winfo_children():
            w.destroy()
        months = self.lease_months_var.get()
        paid = self.room.get("rent_paid", {})
        cols = 4
        for i in range(months):
            m = i + 1
            k = str(m)
            is_paid = paid.get(k, False)
            bg = COLORS["success"] if is_paid else COLORS["border"]
            fg = "#FFFFFF" if is_paid else COLORS["text"]
            txt = f"✓ 第{m}月" if is_paid else f"第{m}月"
            btn = tk.Button(self.rent_buttons_frame, text=txt, font=FONT_SMALL,
                            bg=bg, fg=fg, relief=tk.FLAT, bd=0,
                            activebackground=COLORS["primary"],
                            activeforeground="#FFFFFF", cursor="hand2",
                            command=lambda key=k: self._toggle_rent(key))
            btn.grid(row=i // cols, column=i % cols, padx=3, pady=3, sticky="ew")
            self.rent_buttons_frame.grid_columnconfigure(i % cols, weight=1)

    def _toggle_rent(self, month_key):
        paid = self.room.setdefault("rent_paid", {})
        paid[month_key] = not paid.get(month_key, False)
        self._refresh_rent()

    def _apply_to_room(self):
        self.room["name"] = self.room_name_var.get().strip() or self.room["id"]
        self.room["occupied"] = self.occupied_var.get()
        self.room["tenant_name"] = self.tenant_var.get().strip()
        self.room["lease_start"] = self.lease_start_var.get().strip()
        self.room["lease_months"] = self.lease_months_var.get()
        self.room["notes"] = self.notes_text.get("1.0", tk.END).strip()

    def _save(self):
        self._apply_to_room()
        if self.room["occupied"] and not self.room["tenant_name"]:
            messagebox.showwarning("提示", "请填写租客姓名", parent=self)
            return
        self.on_save(self.room)
        self.destroy()

    def destroy(self):
        try:
            self.unbind_all("<MouseWheel>")
        except:
            pass
        super().destroy()


# ============================================================
# 对话框: 转移租客
# ============================================================
class TransferDialog(tk.Toplevel):
    def __init__(self, parent, buildings, current_building_id,
                 current_room_id, on_transfer):
        super().__init__(parent)
        self.buildings = buildings
        self.current_building_id = current_building_id
        self.current_room_id = current_room_id
        self.on_transfer = on_transfer
        self._current_building = None

        self.title("转移租客到其他房屋")
        self.geometry("440x400")
        self.resizable(False, False)
        self.configure(bg=COLORS["bg"])
        self.transient(parent)
        self.grab_set()
        self._center(parent)
        self._build_ui()

    def _center(self, parent):
        self.update_idletasks()
        x = parent.winfo_rootx() + (parent.winfo_width() - 440) // 2
        y = parent.winfo_rooty() + (parent.winfo_height() - 400) // 2
        self.geometry(f"+{x}+{y}")

    def _build_ui(self):
        tk.Label(self, text="转移租客", font=FONT_TITLE,
                 fg=COLORS["text"], bg=COLORS["bg"]).pack(pady=(20, 4))
        tk.Label(self, text="选择目标空房屋以转移租客",
                 font=FONT_SMALL, fg=COLORS["text_secondary"],
                 bg=COLORS["bg"]).pack(pady=(0, 12))

        tk.Label(self, text="目标楼房", font=FONT_BODY,
                 fg=COLORS["text_secondary"], bg=COLORS["bg"]).pack(
            anchor=tk.W, padx=24, pady=4)
        self.building_var = tk.StringVar()
        names = [b["name"] for b in self.buildings]
        cb = ttk.Combobox(self, textvariable=self.building_var,
                          values=names, font=FONT_BODY, state="readonly")
        cb.pack(fill=tk.X, padx=24, ipady=4)
        if names:
            cb.current(0)
        cb.bind("<<ComboboxSelected>>", self._refresh_rooms)

        tk.Label(self, text="目标房屋（仅显示空置房屋）", font=FONT_BODY,
                 fg=COLORS["text_secondary"], bg=COLORS["bg"]).pack(
            anchor=tk.W, padx=24, pady=(12, 4))
        lf = tk.Frame(self, bg=COLORS["border"])
        lf.pack(fill=tk.BOTH, expand=True, padx=24, pady=4)
        self.room_listbox = tk.Listbox(lf, font=FONT_BODY, relief=tk.FLAT, bd=0,
                                       bg=COLORS["card"], fg=COLORS["text"],
                                       selectbackground=COLORS["primary"],
                                       selectforeground="#FFFFFF",
                                       activestyle="none", height=8)
        self.room_listbox.pack(fill=tk.BOTH, expand=True, padx=1, pady=1)

        btn_frame = tk.Frame(self, bg=COLORS["bg"])
        btn_frame.pack(pady=14)
        ModernButton(btn_frame, "取消", command=self.destroy,
                     bg=COLORS["border"], fg=COLORS["text"],
                     width=100, height=36).pack(side=tk.LEFT, padx=6)
        ModernButton(btn_frame, "确认转移", command=self._transfer,
                     bg=COLORS["warning"], width=100, height=36).pack(
            side=tk.LEFT, padx=6)

        self._refresh_rooms()

    def _refresh_rooms(self, event=None):
        self.room_listbox.delete(0, tk.END)
        name = self.building_var.get()
        building = next((b for b in self.buildings if b["name"] == name), None)
        if not building:
            return
        self._current_building = building
        empty = [r for r in building.get("rooms", [])
                 if not r.get("occupied", False)
                 and not (r["id"] == self.current_room_id
                          and building.get("id") == self.current_building_id)]
        for room in empty:
            self.room_listbox.insert(tk.END, f"{room['name']} ({room['id']})")

    def _transfer(self):
        sel = self.room_listbox.curselection()
        if not sel:
            messagebox.showwarning("提示", "请选择目标房屋", parent=self)
            return
        building = self._current_building
        empty = [r for r in building.get("rooms", [])
                 if not r.get("occupied", False)
                 and not (r["id"] == self.current_room_id
                          and building.get("id") == self.current_building_id)]
        idx = sel[0]
        if idx >= len(empty):
            return
        target = empty[idx]
        if not messagebox.askyesno("确认转移",
                                   f"确定将租客转移到\n{building['name']} - {target['name']} 吗？",
                                   parent=self):
            return
        self.on_transfer(building["id"], target["id"])
        self.destroy()


# ============================================================
# 主应用
# ============================================================
class HouseManagementApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("楼房管理系统")
        self.geometry("960x680")
        self.minsize(800, 600)
        self.configure(bg=COLORS["bg"])

        # 数据文件放在程序同目录
        data_path = Path(__file__).parent / "housing_data.json"
        self.dm = DataManager(str(data_path))

        self.nav_stack = []
        self.container = tk.Frame(self, bg=COLORS["bg"])
        self.container.pack(fill=tk.BOTH, expand=True)

        self._show_building_list()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ---- 导航 ----
    def _clear(self):
        for w in self.container.winfo_children():
            w.destroy()

    def _push(self, builder):
        self.nav_stack.append(builder)
        self._clear()
        builder()

    def _pop(self):
        if len(self.nav_stack) > 1:
            self.nav_stack.pop()
            self._clear()
            self.nav_stack[-1]()
        else:
            self._show_building_list()

    # ---- 页面: 楼房列表 ----
    def _show_building_list(self):
        self._clear()
        self.nav_stack = [self._show_building_list]

        # 侧边栏
        sidebar = tk.Frame(self.container, bg=COLORS["sidebar"], width=240)
        sidebar.pack(side=tk.LEFT, fill=tk.Y)
        sidebar.pack_propagate(False)

        # Logo区
        lf = tk.Frame(sidebar, bg=COLORS["sidebar"])
        lf.pack(fill=tk.X, pady=(24, 16), padx=20)
        tk.Label(lf, text="🏢", font=("Segoe UI Emoji", 28),
                 bg=COLORS["sidebar"]).pack(anchor=tk.W)
        tk.Label(lf, text="楼房管理", font=("Microsoft YaHei UI", 16, "bold"),
                 fg=COLORS["sidebar_text"], bg=COLORS["sidebar"]).pack(
            anchor=tk.W, pady=(4, 0))
        tk.Label(lf, text="HOUSING MANAGEMENT", font=("Microsoft YaHei UI", 8),
                 fg=COLORS["text_secondary"], bg=COLORS["sidebar"]).pack(anchor=tk.W)

        tk.Frame(sidebar, bg=COLORS["text_secondary"], height=1).pack(
            fill=tk.X, padx=20, pady=8)

        # 统计
        sf = tk.Frame(sidebar, bg=COLORS["sidebar"])
        sf.pack(fill=tk.X, padx=20, pady=8)
        blds = self.dm.get_buildings()
        total_r = sum(len(b.get("rooms", [])) for b in blds)
        occ = sum(1 for b in blds for r in b.get("rooms", []) if r.get("occupied"))
        tk.Label(sf, text=f"楼房数量: {len(blds)}", font=FONT_SMALL,
                 fg=COLORS["text_secondary"], bg=COLORS["sidebar"]).pack(anchor=tk.W)
        tk.Label(sf, text=f"房屋总数: {total_r}", font=FONT_SMALL,
                 fg=COLORS["text_secondary"], bg=COLORS["sidebar"]).pack(anchor=tk.W)
        tk.Label(sf, text=f"已入住: {occ}", font=FONT_SMALL,
                 fg=COLORS["success"], bg=COLORS["sidebar"]).pack(anchor=tk.W)

        tk.Frame(sidebar, bg=COLORS["sidebar"]).pack(expand=True)
        ModernButton(sidebar, "+ 添加楼房", command=self._add_building,
                     bg=COLORS["primary"], fg="#FFFFFF",
                     width=200, height=40).pack(pady=20)

        # 主区域
        main_area = tk.Frame(self.container, bg=COLORS["bg"])
        main_area.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        header = tk.Frame(main_area, bg=COLORS["bg"])
        header.pack(fill=tk.X, padx=28, pady=(24, 8))
        tk.Label(header, text="我的楼房", font=FONT_TITLE,
                 fg=COLORS["text"], bg=COLORS["bg"]).pack(side=tk.LEFT)

        # 搜索框
        search_entry = styled_entry(header, width=20)
        search_entry.pack(side=tk.RIGHT, ipady=6)
        search_entry.insert(0, "搜索楼房...")
        search_entry.bind("<FocusIn>",
                          lambda e: search_entry.delete(0, tk.END)
                          if search_entry.get() == "搜索楼房..." else None)
        search_entry.bind("<FocusOut>",
                          lambda e: search_entry.insert(0, "搜索楼房...")
                          if not search_entry.get() else None)

        # 卡片滚动区
        canvas = tk.Canvas(main_area, bg=COLORS["bg"], highlightthickness=0)
        scrollbar = tk.Scrollbar(main_area, orient=tk.VERTICAL, command=canvas.yview)
        self.card_frame = tk.Frame(canvas, bg=COLORS["bg"])
        self.card_frame.bind("<Configure>",
                             lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        cw = canvas.create_window((0, 0), window=self.card_frame, anchor=tk.NW)
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.bind("<Configure>", lambda e: canvas.itemconfig(cw, width=e.width))
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        search_entry.bind("<KeyRelease>",
                          lambda e: self._refresh_cards(self.card_frame,
                                                        search_entry.get()))

        self._refresh_cards(self.card_frame, "")

    def _add_building(self):
        BuildingEditDialog(self, lambda b: (self.dm.add_building(b),
                                            self._show_building_list()))

    def _refresh_cards(self, parent, filter_text=""):
        for w in parent.winfo_children():
            w.destroy()

        buildings = self.dm.get_buildings()
        ft = filter_text.lower().strip()
        if ft and ft != "搜索楼房...":
            buildings = [b for b in buildings if ft in b["name"].lower()]

        if not buildings:
            empty = tk.Frame(parent, bg=COLORS["bg"])
            empty.pack(fill=tk.BOTH, expand=True, pady=80)
            tk.Label(empty, text="📭", font=("Segoe UI Emoji", 48),
                     bg=COLORS["bg"]).pack()
            tk.Label(empty, text="还没有添加楼房", font=FONT_BODY,
                     fg=COLORS["text_secondary"], bg=COLORS["bg"]).pack(pady=4)
            tk.Label(empty, text='点击左侧 "+ 添加楼房" 开始管理',
                     font=FONT_SMALL, fg=COLORS["text_secondary"],
                     bg=COLORS["bg"]).pack()
            return

        cols = 2
        for i, b in enumerate(buildings):
            if i % cols == 0:
                row_frame = tk.Frame(parent, bg=COLORS["bg"])
                row_frame.pack(fill=tk.X, padx=24, pady=6)
            self._make_building_card(row_frame, b).pack(
                side=tk.LEFT, fill=tk.X, expand=True,
                padx=(0, 10) if i % cols == 0 else (10, 0))

    def _make_building_card(self, parent, building):
        card = tk.Frame(parent, bg=COLORS["card"],
                        highlightbackground=COLORS["border"], highlightthickness=1)
        inner = tk.Frame(card, bg=COLORS["card"])
        inner.pack(fill=tk.X, padx=18, pady=16)

        row1 = tk.Frame(inner, bg=COLORS["card"])
        row1.pack(fill=tk.X)

        icon = tk.Frame(row1, bg=COLORS["primary"], width=40, height=40)
        icon.pack(side=tk.LEFT, padx=(0, 12))
        icon.pack_propagate(False)
        tk.Label(icon, text="🏢", font=("Segoe UI Emoji", 18),
                 bg=COLORS["primary"]).place(relx=0.5, rely=0.5, anchor=tk.CENTER)

        nf = tk.Frame(row1, bg=COLORS["card"])
        nf.pack(side=tk.LEFT)
        tk.Label(nf, text=building["name"], font=FONT_HEADER,
                 fg=COLORS["text"], bg=COLORS["card"]).pack(anchor=tk.W)

        bf = tk.Frame(row1, bg=COLORS["card"])
        bf.pack(side=tk.RIGHT)
        tk.Button(bf, text="✏️", font=FONT_SMALL, relief=tk.FLAT, bd=0,
                  bg=COLORS["card"], fg=COLORS["primary"],
                  activebackground=COLORS["hover"], cursor="hand2",
                  command=lambda b=building: self._edit_building(b)).pack(
            side=tk.LEFT, padx=2)
        tk.Button(bf, text="🗑️", font=FONT_SMALL, relief=tk.FLAT, bd=0,
                  bg=COLORS["card"], fg=COLORS["danger"],
                  activebackground=COLORS["hover"], cursor="hand2",
                  command=lambda b=building: self._delete_building(b)).pack(
            side=tk.LEFT, padx=2)

        row2 = tk.Frame(inner, bg=COLORS["card"])
        row2.pack(fill=tk.X, pady=(8, 6))
        floors = building.get("floors", 1)
        rpf = building.get("rooms_per_floor", 1)
        total = floors * rpf
        occ = sum(1 for r in building.get("rooms", []) if r.get("occupied"))
        pct = int(occ / total * 100) if total > 0 else 0
        for txt in [f"📐 {floors}层 × {rpf}户", f"📊 共{total}间",
                    f"🟢 入住{occ}间 ({pct}%)"]:
            tk.Label(row2, text=txt, font=FONT_SMALL,
                     fg=COLORS["text_secondary"], bg=COLORS["card"]).pack(
                side=tk.LEFT, padx=(0, 16))

        # 进度条
        bar_frame = tk.Frame(inner, bg=COLORS["border"], height=4)
        bar_frame.pack(fill=tk.X, pady=(2, 10))
        if total > 0:
            fb = tk.Frame(bar_frame, bg=COLORS["primary"], height=4)
            fb.place(x=0, y=0, relwidth=pct / 100)

        ModernButton(inner, "进入管理 →", width=120, height=32,
                     command=lambda b=building: self._enter_building(b),
                     font=FONT_SMALL).pack(anchor=tk.E)

        # 右键菜单
        for w in (card, inner):
            w.bind("<Button-3>",
                   lambda e, b=building: self._building_menu(e, b))
        return card

    def _building_menu(self, event, building):
        menu = tk.Menu(self, tearoff=0, font=FONT_BODY,
                       bg=COLORS["card"], fg=COLORS["text"],
                       activebackground=COLORS["primary"],
                       activeforeground="#FFFFFF")
        menu.add_command(label="✏️ 编辑楼房",
                         command=lambda: self._edit_building(building))
        menu.add_command(label="🗑️ 删除楼房",
                         command=lambda: self._delete_building(building))
        menu.post(event.x_root, event.y_root)

    def _edit_building(self, building):
        def save(updated):
            idx, _ = self.dm.find_building(building["id"])
            if idx >= 0:
                self.dm.update_building(idx, updated)
            self._show_building_list()
        BuildingEditDialog(self, save, building)

    def _delete_building(self, building):
        if messagebox.askyesno("确认删除",
                               f"确定要删除楼房「{building['name']}」吗？\n此操作不可撤销！"):
            idx, _ = self.dm.find_building(building["id"])
            if idx >= 0:
                self.dm.delete_building(idx)
            self._show_building_list()

    def _enter_building(self, building):
        self._push(lambda b=building: self._show_building_view(b))

    # ---- 页面: 楼房详情 ----
    def _show_building_view(self, building):
        self._clear()
        idx, building = self.dm.find_building(building["id"])
        if idx < 0:
            self._pop()
            return

        # 顶栏
        topbar = tk.Frame(self.container, bg=COLORS["sidebar"], height=56)
        topbar.pack(fill=tk.X)
        topbar.pack_propagate(False)
        BackButton(topbar, self._pop, bg=COLORS["sidebar"]).pack(
            side=tk.LEFT, padx=12, pady=10)
        tk.Label(topbar, text=building["name"], font=FONT_TITLE,
                 fg=COLORS["sidebar_text"], bg=COLORS["sidebar"]).pack(
            side=tk.LEFT, pady=12)

        rooms = building.get("rooms", [])
        total = len(rooms)
        occ = sum(1 for r in rooms if r.get("occupied"))
        tk.Label(topbar, text=f"{building.get('floors', 1)}层 · 共{total}间 · 已入住{occ}间",
                 font=FONT_SMALL, fg=COLORS["text_secondary"],
                 bg=COLORS["sidebar"]).pack(side=tk.LEFT, padx=16, pady=16)

        # 主区域
        main_area = tk.Frame(self.container, bg=COLORS["bg"])
        main_area.pack(fill=tk.BOTH, expand=True)

        canvas = tk.Canvas(main_area, bg=COLORS["bg"], highlightthickness=0)
        scrollbar = tk.Scrollbar(main_area, orient=tk.VERTICAL, command=canvas.yview)
        content = tk.Frame(canvas, bg=COLORS["bg"])
        content.bind("<Configure>",
                     lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        cw = canvas.create_window((0, 0), window=content, anchor=tk.NW)
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.bind("<Configure>", lambda e: canvas.itemconfig(cw, width=e.width))
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        floors = building.get("floors", 1)
        rpf = building.get("rooms_per_floor", 1)

        for fn in range(1, floors + 1):
            fh = tk.Frame(content, bg=COLORS["bg"])
            fh.pack(fill=tk.X, padx=24, pady=(12, 6))
            tk.Label(fh, text=f"第 {fn} 层", font=FONT_HEADER,
                     fg=COLORS["text"], bg=COLORS["bg"]).pack(side=tk.LEFT)
            fr = [r for r in rooms if r["id"].startswith(f"{fn:02d}")]
            fo = sum(1 for r in fr if r.get("occupied"))
            tk.Label(fh, text=f"入住 {fo}/{len(fr)}", font=FONT_SMALL,
                     fg=COLORS["text_secondary"], bg=COLORS["bg"]).pack(
                side=tk.LEFT, padx=12)

            grid = tk.Frame(content, bg=COLORS["bg"])
            grid.pack(fill=tk.X, padx=24, pady=4)
            for rn in range(1, rpf + 1):
                rid = f"{fn:02d}{rn:02d}"
                rd = next((r for r in rooms if r["id"] == rid), None)
                if rd is None:
                    rd = {"id": rid, "name": rid, "occupied": False,
                          "tenant_name": "", "rent_paid": {}, "notes": "",
                          "lease_start": "", "lease_months": 0}
                self._make_room_card(grid, rd, building).pack(
                    side=tk.LEFT, padx=6, pady=6)

    def _make_room_card(self, parent, room, building):
        occ = room.get("occupied", False)
        card = tk.Frame(parent, bg=COLORS["card"], width=140, height=105)
        card.pack_propagate(False)
        card.configure(highlightbackground=COLORS["border"], highlightthickness=1)

        bar = tk.Frame(card, bg=COLORS["success"] if occ else COLORS["border"], height=4)
        bar.pack(fill=tk.X)

        tk.Label(card, text=room["name"], font=("Microsoft YaHei UI", 12, "bold"),
                 fg=COLORS["text"], bg=COLORS["card"]).pack(pady=(10, 2))

        if occ:
            tk.Label(card, text=f"🧑 {room.get('tenant_name', '未命名')}",
                     font=FONT_SMALL, fg=COLORS["text_secondary"],
                     bg=COLORS["card"]).pack()
            rem = calc_remaining_months(room.get("lease_start", ""),
                                        room.get("lease_months", 0))
            if rem >= 0:
                rc = COLORS["danger"] if rem <= 2 else COLORS["text_secondary"]
                tk.Label(card, text=f"剩余 {rem} 个月", font=FONT_SMALL,
                         fg=rc, bg=COLORS["card"]).pack()
        else:
            tk.Label(card, text="空置", font=FONT_SMALL,
                     fg=COLORS["text_secondary"], bg=COLORS["card"]).pack()

        # 点击打开详情
        handler = lambda e, r=room, b=building: self._open_room_detail(r, b)
        for w in [card] + list(card.winfo_children()):
            w.bind("<Button-1>", handler)

        return card

    def _open_room_detail(self, room, building):
        def on_save(updated):
            idx, bld = self.dm.find_building(building["id"])
            if idx >= 0:
                bld_rooms = bld.get("rooms", [])
                for i, r in enumerate(bld_rooms):
                    if r["id"] == updated["id"]:
                        bld_rooms[i] = updated
                        break
                bld["rooms"] = bld_rooms
                self.dm.update_building(idx, bld)
                self._show_building_view(bld)

        def do_transfer(room_data):
            # 先保存
            idx, bld = self.dm.find_building(building["id"])
            if idx >= 0:
                bld_rooms = bld.get("rooms", [])
                for i, r in enumerate(bld_rooms):
                    if r["id"] == room_data["id"]:
                        bld_rooms[i] = room_data
                        break
                bld["rooms"] = bld_rooms
                self.dm.update_building(idx, bld)
            # 打开转移对话框
            self.open_transfer(bld, room_data)

        RoomDetailDialog(self, dict(room), building["name"], on_save, do_transfer)

    # ---- 转移功能 ----
    def open_transfer(self, building, room):
        buildings = self.dm.get_buildings()

        def on_transfer(target_bid, target_rid):
            idx_src, src_bld = self.dm.find_building(building["id"])
            idx_dst, dst_bld = self.dm.find_building(target_bid)
            if idx_src < 0 or idx_dst < 0:
                return

            src = next((r for r in src_bld.get("rooms", [])
                        if r["id"] == room["id"]), None)
            dst = next((r for r in dst_bld.get("rooms", [])
                        if r["id"] == target_rid), None)
            if not src or not dst:
                return

            # 转移
            for k in ("tenant_name", "rent_paid", "notes", "lease_start", "lease_months"):
                dst[k] = dict(src[k]) if k == "rent_paid" else src[k]
            dst["occupied"] = True

            # 清空源
            src.update({"occupied": False, "tenant_name": "", "rent_paid": {},
                        "notes": "", "lease_start": "", "lease_months": 0})

            self.dm.update_building(idx_src, src_bld)
            if idx_src != idx_dst:
                self.dm.update_building(idx_dst, dst_bld)

            messagebox.showinfo("转移成功",
                                f"租客已从 {src['name']} 转移至 {dst_bld['name']} - {dst['name']}")
            self._show_building_view(src_bld)

        TransferDialog(self, buildings, building["id"], room["id"], on_transfer)

    def _on_close(self):
        self.dm.save()
        self.destroy()


# ============================================================
# 入口
# ============================================================
if __name__ == "__main__":
    app = HouseManagementApp()
    app.mainloop()
