#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
楼房管理系统 v2.0 - House Management System
楼层平面图式布局 · 深色现代主题 · 完整租客管理
"""

import tkinter as tk
from tkinter import ttk, messagebox
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# 获取应用所在目录（兼容 PyInstaller exe）
def get_app_dir():
    """返回exe/脚本所在目录，确保数据文件写在正确位置"""
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包后：exe所在目录
        return os.path.dirname(sys.executable)
    else:
        # 开发环境：脚本所在目录
        return os.path.dirname(os.path.abspath(__file__))

# ============================================================
# 深色主题配色
# ============================================================
C = {
    "bg":            "#1A1A1E",   # 主背景
    "card":          "#252528",   # 卡片
    "card_hover":    "#2E2E33",   # 卡片悬停
    "surface":       "#1E1E22",   # 表面
    "topbar":        "#16161A",   # 顶栏
    "sidebar_bg":    "#121215",   # 侧边栏
    "primary":       "#4A9EFF",   # 主色
    "primary_dim":   "#2A5A8F",   # 主色暗
    "success":       "#4CAF50",   # 绿色-已入住
    "danger":        "#EF5350",   # 红色
    "warning":       "#FF9800",   # 橙色
    "text":          "#E8E8ED",   # 主文字
    "text_secondary":"#9898A0",   # 次要文字
    "text_dim":      "#686870",   # 暗淡文字
    "border":        "#353538",   # 边框
    "divider":       "#2A2A2E",   # 分隔
    "accent_green":  "#2E7D32",
    "accent_red":    "#C62828",
    "accent_orange": "#E65100",
    "white":         "#FFFFFF",
}

FONT_TITLE   = ("Microsoft YaHei UI", 20, "bold")
FONT_HEADER  = ("Microsoft YaHei UI", 15, "bold")
FONT_BODY    = ("Microsoft YaHei UI", 11)
FONT_SMALL   = ("Microsoft YaHei UI", 9)
FONT_CARD_TITLE = ("Microsoft YaHei UI", 13, "bold")
FONT_NUMBER  = ("Segoe UI", 11)
FONT_BTN     = ("Microsoft YaHei UI", 11)


# ============================================================
# 工具函数
# ============================================================
def gen_id():
    return datetime.now().strftime("%Y%m%d%H%M%S%f")

def fmt_date(s):
    if not s: return ""
    try:
        return datetime.strptime(s, "%Y-%m-%d").strftime("%Y年%m月%d日")
    except:
        return s

def remaining_months(start_str, total_months):
    if not start_str or total_months <= 0: return -1
    try:
        start = datetime.strptime(start_str, "%Y-%m-%d")
        end = start + timedelta(days=total_months * 30)
        now = datetime.now()
        if now > end: return 0
        return max(0, (end - now).days // 30)
    except:
        return -1

def end_date_str(start_str, total_months):
    if not start_str or total_months <= 0: return ""
    try:
        start = datetime.strptime(start_str, "%Y-%m-%d")
        return (start + timedelta(days=total_months * 30)).strftime("%Y-%m-%d")
    except:
        return ""


# ============================================================
# 通用组件
# ============================================================
class RoundedBtn(tk.Canvas):
    """圆角按钮"""
    def __init__(self, parent, text, command=None, width=120, height=36,
                 bg=C["primary"], fg=C["white"], font=FONT_BTN, **kw):
        super().__init__(parent, width=width, height=height,
                         bg=C["bg"], highlightthickness=0, **kw)
        self.btn_bg, self.fg, self.cmd, self.txt = bg, fg, command, text
        self.w, self.h, self.font = width, height, font
        self._pressed = False
        for e, cb in [("<Button-1>", self._down), ("<Enter>", self._over),
                      ("<Leave>", self._out), ("<ButtonRelease-1>", self._up)]:
            self.bind(e, cb)
        self._render()

    def _render(self, hover=False, pressed=False):
        self.delete("all")
        c = self.btn_bg
        if pressed: c = self._dark(c, 0.15)
        elif hover: c = self._dark(c, 0.08)
        self._rr(0, 0, self.w, self.h, 8, fill=c, outline=c)
        self.create_text(self.w//2, self.h//2, text=self.txt,
                         fill=self.fg, font=self.font)

    def _rr(self, x1, y1, x2, y2, r, **kw):
        pts = [x1+r,y1, x2-r,y1, x2,y1, x2,y1+r,
               x2,y2-r, x2,y2, x2-r,y2, x1+r,y2, x1,y2,
               x1,y2-r, x1,y1+r, x1,y1]
        return self.create_polygon(pts, smooth=True, **kw)

    def _dark(self, hx, f):
        hx = hx.lstrip("#")
        return f"#{max(0,min(255,int(int(hx[i:i+2],16)*(1-f)))):02x}{max(0,min(255,int(int(hx[2:4],16)*(1-f)))):02x}{max(0,min(255,int(int(hx[4:6],16)*(1-f)))):02x}"

    def _down(self, e): self._pressed = True; self._render(pressed=True)
    def _up(self, e):
        if self._pressed and self.cmd: self.cmd()
        self._pressed = False; self._render()
    def _over(self, e): self._render(hover=True)
    def _out(self, e): self._pressed = False; self._render()


class BackBtn(tk.Canvas):
    """返回按钮"""
    def __init__(self, parent, command, **kw):
        bg = kw.pop("bg", C["card"])
        super().__init__(parent, width=38, height=38,
                         bg=bg, highlightthickness=0, **kw)
        self.cmd = command
        for e, cb in [("<Button-1>", lambda e: self.cmd()),
                      ("<Enter>", self._over), ("<Leave>", self._out)]:
            self.bind(e, cb)
        self._render(False)

    def _render(self, h):
        self.delete("all")
        bg = C["border"] if h else C["card"]
        self._rr(0,0,38,38,8,fill=bg,outline=bg)
        self.create_line(22,11,13,19,22,27,fill=C["primary"],
                         width=2.5,capstyle=tk.ROUND,joinstyle=tk.ROUND)

    def _rr(self, x1,y1,x2,y2,r,**kw):
        pts=[x1+r,y1,x2-r,y1,x2,y1,x2,y1+r,x2,y2-r,x2,y2,x2-r,y2,
             x1+r,y2,x1,y2,x1,y2-r,x1,y1+r,x1,y1]
        return self.create_polygon(pts,smooth=True,**kw)
    def _over(self,e): self._render(True)
    def _out(self,e): self._render(False)


def make_entry(parent, var=None, width=None, **kw):
    """统一样式的输入框"""
    opts = dict(font=FONT_BODY, relief=tk.FLAT, bd=0, bg=C["card"],
                fg=C["text"], insertbackground=C["primary"],
                highlightbackground=C["border"],
                highlightcolor=C["primary"], highlightthickness=1)
    if width: opts["width"] = width
    opts.update(kw)
    return tk.Entry(parent, textvariable=var, **opts)


# ============================================================
# 数据管理
# ============================================================
class DataStore:
    def __init__(self, path):
        self.path = path
        self.data = {"buildings": []}
        self._load()

    def _load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except:
                self.data = {"buildings": []}

    def save(self):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)

    @property
    def buildings(self):
        return self.data.get("buildings", [])

    def add(self, b):
        self.data.setdefault("buildings", []).append(b); self.save()

    def update(self, idx, b):
        self.data["buildings"][idx] = b; self.save()

    def delete(self, idx):
        del self.data["buildings"][idx]; self.save()

    def find(self, bid):
        for i, b in enumerate(self.buildings):
            if b.get("id") == bid: return i, b
        return -1, None

    @staticmethod
    def new_room(rid):
        return {"id": rid, "name": rid, "occupied": False, "tenant_name": "",
                "rent_paid": {}, "notes": "", "lease_start": "", "lease_months": 0}


# ============================================================
# 对话框：添加/编辑楼房
# ============================================================
class BuildingDialog(tk.Toplevel):
    def __init__(self, parent, on_save, building=None):
        super().__init__(parent)
        self.cb = on_save
        self.building = building
        self.result = None
        is_edit = building is not None

        self.title("编辑楼房" if is_edit else "添加楼房")
        self.geometry("440x380")
        self.resizable(False, False)
        self.configure(bg=C["bg"])
        self.transient(parent); self.grab_set()
        self._center(parent)
        self._ui()

    def _center(self, p):
        self.update_idletasks()
        x = p.winfo_rootx() + (p.winfo_width()-440)//2
        y = p.winfo_rooty() + (p.winfo_height()-380)//2
        self.geometry(f"+{x}+{y}")

    def _ui(self):
        tk.Label(self, text="编辑楼房信息" if self.building else "添加新楼房",
                 font=FONT_TITLE, fg=C["text"], bg=C["bg"]).pack(pady=(20,14))

        # 名称
        tk.Label(self, text="楼房名称", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, padx=24, pady=(8,2))
        self.name_var = tk.StringVar(value=self.building["name"] if self.building else "")
        make_entry(self, self.name_var).pack(fill=tk.X, padx=24, ipady=8)

        # 层数
        tk.Label(self, text="层数", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, padx=24, pady=(14,2))
        f1 = tk.Frame(self, bg=C["bg"]); f1.pack(fill=tk.X, padx=24)
        self.floors_var = tk.IntVar(value=self.building["floors"] if self.building else 5)
        s1 = tk.Scale(f1, from_=1, to=30, orient=tk.HORIZONTAL,
                      variable=self.floors_var, bg=C["bg"],
                      troughcolor=C["border"], activebackground=C["primary"],
                      highlightthickness=0, length=360, fg=C["text"],
                      font=FONT_SMALL)
        s1.pack(side=tk.LEFT)
        tk.Label(f1, textvariable=self.floors_var, font=FONT_BODY,
                 fg=C["primary"], bg=C["bg"], width=3).pack(side=tk.RIGHT)

        # 每层户数
        tk.Label(self, text="每层户数", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, padx=24, pady=(14,2))
        f2 = tk.Frame(self, bg=C["bg"]); f2.pack(fill=tk.X, padx=24)
        self.rooms_var = tk.IntVar(value=self.building["rooms_per_floor"] if self.building else 4)
        s2 = tk.Scale(f2, from_=1, to=10, orient=tk.HORIZONTAL,
                      variable=self.rooms_var, bg=C["bg"],
                      troughcolor=C["border"], activebackground=C["primary"],
                      highlightthickness=0, length=360, fg=C["text"],
                      font=FONT_SMALL)
        s2.pack(side=tk.LEFT)
        tk.Label(f2, textvariable=self.rooms_var, font=FONT_BODY,
                 fg=C["primary"], bg=C["bg"], width=3).pack(side=tk.RIGHT)

        # 按钮
        bf = tk.Frame(self, bg=C["bg"]); bf.pack(pady=20)
        RoundedBtn(bf, "取消", command=self.destroy,
                   bg=C["border"], fg=C["text"], width=100, height=38).pack(side=tk.LEFT, padx=6)
        RoundedBtn(bf, "保存", command=self._save, width=100, height=38).pack(side=tk.LEFT, padx=6)

    def _save(self):
        name = self.name_var.get().strip()
        if not name:
            messagebox.showwarning("提示", "请输入楼房名称", parent=self); return
        floors, rpf = self.floors_var.get(), self.rooms_var.get()

        if self.building:
            ex = self.building.get("rooms", [])
            rooms = []
            for f in range(1, floors+1):
                for r in range(1, rpf+1):
                    rid = f"{f:02d}{r:02d}"
                    found = next((er for er in ex if er["id"]==rid), None)
                    rooms.append(found if found else DataStore.new_room(rid))
            self.building.update(name=name, floors=floors, rooms_per_floor=rpf, rooms=rooms)
            self.result = self.building
        else:
            rooms = [DataStore.new_room(f"{f:02d}{r:02d}")
                     for f in range(1, floors+1) for r in range(1, rpf+1)]
            self.result = {"id": gen_id(), "name": name, "floors": floors,
                           "rooms_per_floor": rpf, "rooms": rooms}
        self.cb(self.result); self.destroy()


# ============================================================
# 对话框：房间详情
# ============================================================
class RoomDialog(tk.Toplevel):
    def __init__(self, parent, room, bld_name, on_save, on_transfer=None):
        super().__init__(parent)
        self.room = room
        self.bld_name = bld_name
        self._on_save = on_save
        self._on_transfer = on_transfer

        self.title(f"{bld_name} · {room['name']}")
        self.geometry("560x700")
        self.resizable(False, False)
        self.configure(bg=C["bg"])
        self.transient(parent); self.grab_set()
        self._center(parent)
        self._ui()
        self._load()

    def _center(self, p):
        self.update_idletasks()
        x = p.winfo_rootx()+(p.winfo_width()-560)//2
        y = p.winfo_rooty()+(p.winfo_height()-700)//2
        self.geometry(f"+{x}+{y}")

    def _ui(self):
        # 顶栏
        bar = tk.Frame(self, bg=C["topbar"], height=56)
        bar.pack(fill=tk.X); bar.pack_propagate(False)
        tk.Label(bar, text=f"🏠 {self.room['name']}", font=FONT_TITLE,
                 fg=C["text"], bg=C["topbar"]).pack(side=tk.LEFT, padx=20, pady=12)

        sf = tk.Frame(bar, bg=C["topbar"]); sf.pack(side=tk.RIGHT, padx=20)
        self.occ_var = tk.BooleanVar()
        self.st_lbl = tk.Label(sf, text="空置", font=FONT_BODY,
                               fg=C["text_secondary"], bg=C["topbar"])
        self.st_lbl.pack(side=tk.LEFT, padx=(0,10))
        cb = tk.Checkbutton(sf, variable=self.occ_var, command=self._toggle_occ,
                            bg=C["topbar"], activebackground=C["topbar"],
                            selectcolor=C["success"])
        cb.pack(side=tk.LEFT)

        # 滚动内容
        cv = tk.Canvas(self, bg=C["bg"], highlightthickness=0)
        sb = tk.Scrollbar(self, orient=tk.VERTICAL, command=cv.yview)
        self.ct = tk.Frame(cv, bg=C["bg"])
        self.ct.bind("<Configure>", lambda e: cv.configure(scrollregion=cv.bbox("all")))
        cw = cv.create_window((0,0), window=self.ct, anchor=tk.NW, width=560)
        cv.configure(yscrollcommand=sb.set)
        cv.bind("<Configure>", lambda e: cv.itemconfig(cw, width=e.width))
        cv.bind_all("<MouseWheel>", lambda e: cv.yview_scroll(int(-e.delta/120),"units"))
        cv.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        sb.pack(side=tk.RIGHT, fill=tk.Y)

        p = {"padx": 24, "pady": (10, 2)}

        # 房屋名称
        tk.Label(self.ct, text="房屋名称", font=FONT_BODY,
                 fg=C["text_secondary"], bg=C["bg"]).pack(anchor=tk.W, **p)
        self.name_var = tk.StringVar()
        make_entry(self.ct, self.name_var).pack(fill=tk.X, padx=24, ipady=8)

        # 租客姓名
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
                                   fg=C["text_secondary"], bg=C["card"],
                                   justify=tk.LEFT)
        self.lease_info.pack(anchor=tk.W, pady=(8,0))

        # 租金提交
        tk.Label(self.ct, text="💰 每月租金", font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(anchor=tk.W, padx=24, pady=(18,4))
        rf = tk.Frame(self.ct, bg=C["card"],
                      highlightbackground=C["border"], highlightthickness=1)
        rf.pack(fill=tk.X, padx=24, pady=4)
        ri = tk.Frame(rf, bg=C["card"]); ri.pack(fill=tk.X, padx=14, pady=14)
        self.rent_grid = tk.Frame(ri, bg=C["card"])
        self.rent_grid.pack(fill=tk.X)

        # 注解
        tk.Label(self.ct, text="📝 租客注解", font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(anchor=tk.W, padx=24, pady=(18,4))
        self.notes = tk.Text(self.ct, height=4, font=FONT_BODY, relief=tk.FLAT,
                             bd=0, bg=C["card"], fg=C["text"], wrap=tk.WORD,
                             insertbackground=C["primary"],
                             highlightbackground=C["border"],
                             highlightcolor=C["primary"], highlightthickness=1)
        self.notes.pack(fill=tk.X, padx=24, ipady=6)

        # 底部按钮
        bf = tk.Frame(self, bg=C["bg"]); bf.pack(fill=tk.X, pady=14, padx=24)
        RoundedBtn(bf, "取消", command=self.destroy,
                   bg=C["border"], fg=C["text"], width=90, height=38).pack(side=tk.LEFT, padx=4)
        self.transfer_btn = RoundedBtn(bf, "🔄 转移", command=self._do_transfer,
                                       bg=C["warning"], width=90, height=38)
        RoundedBtn(bf, "💾 保存", command=self._save, width=90, height=38).pack(side=tk.RIGHT, padx=4)

    def _toggle_occ(self):
        occ = self.occ_var.get()
        self.st_lbl.configure(text="已入住" if occ else "空置",
                              fg=C["success"] if occ else C["text_secondary"])
        if occ:
            save_btn = None
            for c in self.winfo_children():
                if isinstance(c, tk.Frame) and c != self.ct:
                    for cc in c.winfo_children():
                        if isinstance(cc, RoundedBtn) and "保存" in (cc.txt or ""):
                            save_btn = cc; break
            if save_btn: self.transfer_btn.pack(side=tk.LEFT, padx=4, before=save_btn)
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
        self._toggle_occ(); self._refresh_rent(); self._update_lease()
        self.lease_months_var.trace_add("write", lambda *a: (self._update_lease(), self._refresh_rent()))
        self.lease_start_var.trace_add("write", lambda *a: self._update_lease())

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
        paid = self.room.get("rent_paid",{})
        cols = 4
        for i in range(months):
            m = i+1; k = str(m); is_p = paid.get(k, False)
            bg = C["success"] if is_p else C["border"]
            fg = C["white"] if is_p else C["text"]
            txt = f"✓ 第{m}月" if is_p else f"第{m}月"
            btn = tk.Button(self.rent_grid, text=txt, font=FONT_SMALL,
                            bg=bg, fg=fg, relief=tk.FLAT, bd=0,
                            activebackground=C["primary"], cursor="hand2",
                            command=lambda key=k: self._tog_rent(key))
            btn.grid(row=i//cols, column=i%cols, padx=3, pady=3, sticky="ew")
            self.rent_grid.grid_columnconfigure(i%cols, weight=1)

    def _tog_rent(self, key):
        paid = self.room.setdefault("rent_paid",{})
        paid[key] = not paid.get(key, False); self._refresh_rent()

    def _apply(self):
        self.room["name"] = self.name_var.get().strip() or self.room["id"]
        self.room["occupied"] = self.occ_var.get()
        self.room["tenant_name"] = self.tenant_var.get().strip()
        self.room["lease_start"] = self.lease_start_var.get().strip()
        self.room["lease_months"] = self.lease_months_var.get()
        self.room["notes"] = self.notes.get("1.0", tk.END).strip()

    def _save(self):
        self._apply()
        if self.room["occupied"] and not self.room["tenant_name"]:
            messagebox.showwarning("提示","请填写租客姓名",parent=self); return
        self._on_save(self.room); self.destroy()

    def destroy(self):
        try: self.unbind_all("<MouseWheel>")
        except: pass
        super().destroy()


# ============================================================
# 对话框：转移
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
                             selectforeground=C["white"],
                             activestyle="none", height=8)
        self.lb.pack(fill=tk.BOTH, expand=True, padx=1, pady=1)

        bf = tk.Frame(self, bg=C["bg"]); bf.pack(pady=14)
        RoundedBtn(bf, "取消", command=self.destroy,
                   bg=C["border"], fg=C["text"], width=100, height=36).pack(side=tk.LEFT, padx=6)
        RoundedBtn(bf, "确认转移", command=self._transfer,
                   bg=C["warning"], width=100, height=36).pack(side=tk.LEFT, padx=6)
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
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("楼房管理系统")
        self.geometry("1024x720")
        self.minsize(860, 600)
        self.configure(bg=C["bg"])

        dp = os.path.join(get_app_dir(), "housing_data.json")
        self.dm = DataStore(str(dp))

        self.nav = []
        self.main = tk.Frame(self, bg=C["bg"])
        self.main.pack(fill=tk.BOTH, expand=True)

        self._show_home()
        self.protocol("WM_DELETE_WINDOW", self._close)

    # ---- 导航 ----
    def _clear(self):
        for w in self.main.winfo_children(): w.destroy()

    def _push(self, fn):
        self.nav.append(fn); self._clear(); fn()

    def _back(self):
        if len(self.nav) > 1:
            self.nav.pop(); self._clear(); self.nav[-1]()
        else:
            self._show_home()

    # ================================================================
    # 主页：楼房列表
    # ================================================================
    def _show_home(self):
        self._clear(); self.nav = [self._show_home]

        # 侧边栏
        sb = tk.Frame(self.main, bg=C["sidebar_bg"], width=250)
        sb.pack(side=tk.LEFT, fill=tk.Y); sb.pack_propagate(False)

        # Logo
        lf = tk.Frame(sb, bg=C["sidebar_bg"]); lf.pack(fill=tk.X, pady=(28,18), padx=22)
        tk.Label(lf, text="🏢", font=("Segoe UI Emoji",30), bg=C["sidebar_bg"]).pack(anchor=tk.W)
        tk.Label(lf, text="楼房管理", font=("Microsoft YaHei UI",17,"bold"),
                 fg=C["text"], bg=C["sidebar_bg"]).pack(anchor=tk.W, pady=(4,0))
        tk.Label(lf, text="HOUSE MANAGEMENT", font=("Microsoft YaHei UI",8),
                 fg=C["text_dim"], bg=C["sidebar_bg"]).pack(anchor=tk.W)

        tk.Frame(sb, bg=C["divider"], height=1).pack(fill=tk.X, padx=22, pady=10)

        # 统计
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
        RoundedBtn(sb, "＋ 添加楼房", command=self._add_building,
                   bg=C["primary"], width=206, height=42).pack(pady=20)

        # 主区域
        ma = tk.Frame(self.main, bg=C["bg"]); ma.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        hd = tk.Frame(ma, bg=C["bg"]); hd.pack(fill=tk.X, padx=30, pady=(26,10))
        tk.Label(hd, text="我的楼房", font=FONT_TITLE,
                 fg=C["text"], bg=C["bg"]).pack(side=tk.LEFT)

        search = make_entry(hd, width=22)
        search.pack(side=tk.RIGHT, ipady=6)
        search.insert(0,"🔍 搜索...")
        search.bind("<FocusIn>", lambda e: search.delete(0,tk.END) if search.get()=="🔍 搜索..." else None)
        search.bind("<FocusOut>", lambda e: search.insert(0,"🔍 搜索...") if not search.get() else None)

        # 滚动卡片
        cv = tk.Canvas(ma, bg=C["bg"], highlightthickness=0)
        scr = tk.Scrollbar(ma, orient=tk.VERTICAL, command=cv.yview)
        self.card_frm = tk.Frame(cv, bg=C["bg"])
        self.card_frm.bind("<Configure>", lambda e: cv.configure(scrollregion=cv.bbox("all")))
        cw = cv.create_window((0,0), window=self.card_frm, anchor=tk.NW)
        cv.configure(yscrollcommand=scr.set)
        cv.bind("<Configure>", lambda e: cv.itemconfig(cw, width=e.width))
        cv.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scr.pack(side=tk.RIGHT, fill=tk.Y)

        search.bind("<KeyRelease>", lambda e: self._refresh_cards(search.get()))
        self._refresh_cards("")

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

    def _bld_card(self, parent, b):
        card = tk.Frame(parent, bg=C["card"],
                        highlightbackground=C["border"], highlightthickness=1)
        inn = tk.Frame(card, bg=C["card"]); inn.pack(fill=tk.X, padx=20, pady=18)

        r1 = tk.Frame(inn, bg=C["card"]); r1.pack(fill=tk.X)

        # 图标
        ic = tk.Frame(r1, bg=C["primary_dim"], width=44, height=44)
        ic.pack(side=tk.LEFT, padx=(0,14)); ic.pack_propagate(False)
        tk.Label(ic, text="🏢", font=("Segoe UI Emoji",20), bg=C["primary_dim"]).place(relx=.5, rely=.5, anchor=tk.CENTER)

        nf = tk.Frame(r1, bg=C["card"]); nf.pack(side=tk.LEFT)
        tk.Label(nf, text=b["name"], font=FONT_HEADER,
                 fg=C["text"], bg=C["card"]).pack(anchor=tk.W)

        # 操作
        bf = tk.Frame(r1, bg=C["card"]); bf.pack(side=tk.RIGHT)
        for txt, clr, cmd in [("✏️", C["primary"], lambda bb=b: self._edit_bld(bb)),
                              ("🗑️", C["danger"], lambda bb=b: self._del_bld(bb))]:
            tk.Button(bf, text=txt, font=FONT_SMALL, relief=tk.FLAT, bd=0,
                      bg=C["card"], fg=clr, activebackground=C["card_hover"],
                      cursor="hand2", command=cmd).pack(side=tk.LEFT, padx=2)

        # 信息行
        r2 = tk.Frame(inn, bg=C["card"]); r2.pack(fill=tk.X, pady=(10,8))
        fl, rpf = b.get("floors",1), b.get("rooms_per_floor",1)
        total = fl * rpf
        occ = sum(1 for r in b.get("rooms",[]) if r.get("occupied"))
        pct = int(occ/total*100) if total>0 else 0
        for txt in [f"📐 {fl}层 × {rpf}户", f"🚪 共{total}间",
                    f"👤 入住{occ}间 ({pct}%)"]:
            tk.Label(r2, text=txt, font=FONT_SMALL,
                     fg=C["text_secondary"], bg=C["card"]).pack(side=tk.LEFT, padx=(0,16))

        # 进度条
        bar = tk.Frame(inn, bg=C["divider"], height=4); bar.pack(fill=tk.X, pady=(2,12))
        if total > 0:
            tk.Frame(bar, bg=C["primary"], height=4).place(x=0,y=0,relwidth=pct/100)

        RoundedBtn(inn, "进入管理 →", width=130, height=34,
                   command=lambda bb=b: self._enter_bld(bb),
                   font=FONT_SMALL).pack(anchor=tk.E)

        # 右键
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
        def save(upd):
            i, _ = self.dm.find(b["id"])
            if i>=0: self.dm.update(i, upd)
            self._show_home()
        BuildingDialog(self, save, b)

    def _del_bld(self, b):
        if messagebox.askyesno("确认删除", f"确定删除「{b['name']}」？\n此操作不可撤销！"):
            i, _ = self.dm.find(b["id"])
            if i>=0: self.dm.delete(i)
            self._show_home()

    def _enter_bld(self, b):
        self._push(lambda bb=b: self._show_floor_plan(bb))

    # ================================================================
    # 楼层平面图视图 (NEW - 核心改进)
    # ================================================================
    def _show_floor_plan(self, building):
        self._clear()
        i, building = self.dm.find(building["id"])
        if i < 0: self._back(); return

        # 顶栏
        bar = tk.Frame(self.main, bg=C["topbar"], height=60)
        bar.pack(fill=tk.X); bar.pack_propagate(False)

        BackBtn(bar, self._back, bg=C["topbar"]).pack(side=tk.LEFT, padx=14, pady=11)

        tk.Label(bar, text=building["name"], font=FONT_TITLE,
                 fg=C["text"], bg=C["topbar"]).pack(side=tk.LEFT, pady=14)

        rooms = building.get("rooms", [])
        total = len(rooms)
        occ = sum(1 for r in rooms if r.get("occupied"))
        floors = building.get("floors", 1)
        rpf = building.get("rooms_per_floor", 1)

        info = f"  {floors}层 · {total}间 · 入住{occ}间 · 空置{total-occ}间"
        tk.Label(bar, text=info, font=FONT_SMALL,
                 fg=C["text_secondary"], bg=C["topbar"]).pack(side=tk.LEFT, padx=10, pady=18)

        # 编辑楼房按钮
        RoundedBtn(bar, "⚙️ 编辑楼房", command=lambda: self._edit_bld(building),
                   bg=C["border"], fg=C["text"], font=FONT_SMALL,
                   width=110, height=32).pack(side=tk.RIGHT, padx=14, pady=14)

        # 滚动区域
        cv = tk.Canvas(self.main, bg=C["bg"], highlightthickness=0)
        scr = tk.Scrollbar(self.main, orient=tk.VERTICAL, command=cv.yview)
        ct = tk.Frame(cv, bg=C["bg"])
        ct.bind("<Configure>", lambda e: cv.configure(scrollregion=cv.bbox("all")))
        cw = cv.create_window((0,0), window=ct, anchor=tk.NW)
        cv.configure(yscrollcommand=scr.set)
        cv.bind("<Configure>", lambda e: cv.itemconfig(cw, width=e.width))
        cv.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scr.pack(side=tk.RIGHT, fill=tk.Y)

        # 图例
        leg = tk.Frame(ct, bg=C["bg"]); leg.pack(fill=tk.X, padx=30, pady=(14,4))
        tk.Label(leg, text="平面图", font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(side=tk.LEFT)
        for clr, txt in [(C["success"], "已入住"), (C["border"], "空置")]:
            dot = tk.Frame(leg, bg=clr, width=10, height=10)
            dot.pack(side=tk.LEFT, padx=(14,4), pady=2)
            tk.Label(leg, text=txt, font=FONT_SMALL,
                     fg=C["text_secondary"], bg=C["bg"]).pack(side=tk.LEFT)

        # === 每层平面图 ===
        for fn in range(1, floors+1):
            self._draw_floor(ct, building, fn, rpf, rooms)

    def _draw_floor(self, parent, building, floor_num, rpf, all_rooms):
        """绘制单层平面图 - 走廊 + 两侧房间"""

        # ====== 楼层标题 ======
        fh = tk.Frame(parent, bg=C["bg"]); fh.pack(fill=tk.X, padx=30, pady=(16,6))
        tk.Label(fh, text=f"第 {floor_num} 层", font=FONT_HEADER,
                 fg=C["text"], bg=C["bg"]).pack(side=tk.LEFT)

        # 楼层房间统计
        f_rooms = [r for r in all_rooms if r["id"].startswith(f"{floor_num:02d}")]
        f_occ = sum(1 for r in f_rooms if r.get("occupied"))
        tk.Label(fh, text=f"入住 {f_occ}/{len(f_rooms)}",
                 font=FONT_SMALL, fg=C["text_secondary"], bg=C["bg"]).pack(side=tk.LEFT, padx=12)

        # ====== 平面图容器 ======
        plan = tk.Frame(parent, bg=C["surface"],
                        highlightbackground=C["border"], highlightthickness=1)
        plan.pack(fill=tk.X, padx=30, pady=(0,4))

        # 上边距
        tk.Frame(plan, bg=C["surface"], height=10).pack(fill=tk.X)

        # ---- 上方房间行 ----
        top_row = tk.Frame(plan, bg=C["surface"])
        top_row.pack(fill=tk.X, padx=16, pady=4)

        half = rpf // 2  # 走廊上方房间数

        # 左侧房间（走廊上方左半边）
        left_frame = tk.Frame(top_row, bg=C["surface"])
        left_frame.pack(side=tk.LEFT, padx=(0, 4))
        for rn in range(half, 0, -1):
            rid = f"{floor_num:02d}{rn:02d}"
            rd = next((r for r in all_rooms if r["id"]==rid), None)
            if rd is None: rd = DataStore.new_room(rid)
            self._room_block(left_frame, rd, building).pack(side=tk.LEFT, padx=4, pady=4)

        # 走廊（中间）
        hallway = tk.Frame(top_row, bg=C["divider"])
        hallway.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=2)
        # 走廊标签
        tk.Label(hallway, text="走 廊", font=("Microsoft YaHei UI", 8),
                 fg=C["text_dim"], bg=C["divider"]).pack(expand=True)

        # 右侧房间（走廊上方右半边）
        right_frame = tk.Frame(top_row, bg=C["surface"])
        right_frame.pack(side=tk.LEFT, padx=(4, 0))
        for rn in range(half+1, rpf+1):
            rid = f"{floor_num:02d}{rn:02d}"
            rd = next((r for r in all_rooms if r["id"]==rid), None)
            if rd is None: rd = DataStore.new_room(rid)
            self._room_block(right_frame, rd, building).pack(side=tk.LEFT, padx=4, pady=4)

        # 下边距
        tk.Frame(plan, bg=C["surface"], height=10).pack(fill=tk.X)

    def _room_block(self, parent, room, building):
        """房间方块 - 平面图中的单个房间"""
        occ = room.get("occupied", False)
        border_color = C["success"] if occ else C["border"]
        bg_color = C["card"]

        w, h = 102, 108
        block = tk.Frame(parent, bg=bg_color, width=w, height=h,
                         highlightbackground=border_color, highlightthickness=2)
        block.pack_propagate(False)

        inn = tk.Frame(block, bg=bg_color)
        inn.place(relx=0.5, rely=0.5, anchor=tk.CENTER, width=w-8, height=h-8)

        # 房间号
        tk.Label(inn, text=room["id"], font=("Segoe UI", 14, "bold"),
                 fg=C["primary"] if not occ else C["text"],
                 bg=bg_color).pack(pady=(6,2))

        # 房间名
        name = room.get("name", room["id"])
        if name != room["id"]:
            tk.Label(inn, text=name, font=FONT_SMALL,
                     fg=C["text_secondary"], bg=bg_color).pack()

        # 入住状态图标
        if occ:
            tk.Label(inn, text="● 已入住", font=("Microsoft YaHei UI", 8),
                     fg=C["success"], bg=bg_color).pack(pady=(4,0))
            tenant = room.get("tenant_name", "")
            if tenant:
                tk.Label(inn, text=tenant, font=FONT_SMALL,
                         fg=C["text_secondary"], bg=bg_color).pack()
            # 剩余租期
            rem = remaining_months(room.get("lease_start",""),
                                   room.get("lease_months",0))
            if rem >= 0:
                rc = C["danger"] if rem <= 2 else C["warning"] if rem <= 4 else C["text_secondary"]
                tk.Label(inn, text=f"剩余{rem}个月", font=("Microsoft YaHei UI", 7),
                         fg=rc, bg=bg_color).pack()
        else:
            tk.Label(inn, text="○ 空置", font=("Microsoft YaHei UI", 8),
                     fg=C["text_dim"], bg=bg_color).pack(pady=(4,0))

        # 点击事件
        handler = lambda e, r=room, b=building: self._open_room(r, b)
        for wgt in [block, inn] + list(inn.winfo_children()):
            wgt.bind("<Button-1>", handler)
            wgt.bind("<Enter>", lambda e, blk=block: blk.configure(bg=C["card_hover"]))
            wgt.bind("<Leave>", lambda e, blk=block: blk.configure(bg=bg_color))

        return block

    def _open_room(self, room, building):
        def on_save(upd):
            i, bld = self.dm.find(building["id"])
            if i >= 0:
                rms = bld.get("rooms",[])
                for j, r in enumerate(rms):
                    if r["id"] == upd["id"]: rms[j] = upd; break
                bld["rooms"] = rms; self.dm.update(i, bld)
                self._show_floor_plan(bld)

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
            self._show_floor_plan(sb)
        TransferDialog(self, blds, building["id"], room["id"], cb)

    def _close(self):
        self.dm.save(); self.destroy()


# ============================================================
if __name__ == "__main__":
    App().mainloop()
