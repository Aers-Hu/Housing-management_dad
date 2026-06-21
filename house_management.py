#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
楼房管理系统 v2.2 - House Management System
横向滚动 · 楼层重命名 · 租金金额 · 多主题
"""

import tkinter as tk
from tkinter import ttk, messagebox
import json, os, sys
from datetime import datetime, timedelta

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

def fmt_date(s):
    if not s: return ""
    try: return datetime.strptime(s,"%Y-%m-%d").strftime("%Y年%m月%d日")
    except: return s

def remaining_months(start_str, total_months):
    if not start_str or total_months <= 0: return -1
    try:
        start = datetime.strptime(start_str, "%Y-%m-%d")
        end = start + timedelta(days=total_months * 30)
        now = datetime.now()
        if now > end: return 0
        return max(0, (end - now).days // 30)
    except: return -1

def end_date_str(start_str, total_months):
    if not start_str or total_months <= 0: return ""
    try: return (datetime.strptime(start_str,"%Y-%m-%d") +
                 timedelta(days=total_months*30)).strftime("%Y-%m-%d")
    except: return ""

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
        if pressed: c = self._dark(c, 0.15)
        elif hover: c = self._dark(c, 0.08)
        self._rr(0,0,self.w,self.h,8,fill=c,outline=c)
        self.create_text(self.w//2, self.h//2, text=self.txt,
                         fill=self.fg, font=self.font)
    def _rr(self,x1,y1,x2,y2,r,**kw):
        return self.create_polygon([x1+r,y1,x2-r,y1,x2,y1,x2,y1+r,
                x2,y2-r,x2,y2,x2-r,y2,x1+r,y2,x1,y2,x1,y2-r,x1,y1+r,x1,y1],
                smooth=True,**kw)
    def _dark(self, hx, f):
        hx=hx.lstrip("#")
        return f"#{max(0,min(255,int(int(hx[i:i+2],16)*(1-f)))):02x}{max(0,min(255,int(int(hx[2:4],16)*(1-f)))):02x}{max(0,min(255,int(int(hx[4:6],16)*(1-f)))):02x}"
    def _d(self,e): self._p=True; self._draw(pressed=True)
    def _u(self,e):
        if self._p and self.cmd: self.cmd()
        self._p=False; self._draw()
    def _o(self,e): self._draw(hover=True)
    def _l(self,e): self._draw()  # 不重置_p，避免鼠标微动导致点击失效


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
    def __init__(self):
        self.path = os.path.join(get_app_dir(), "housing_data.json")
        self.data = {"buildings": [], "theme": DEFAULT_THEME}
        self._load()

    def _load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except:
                self.data = {"buildings": [], "theme": DEFAULT_THEME}
        if "theme" not in self.data:
            self.data["theme"] = DEFAULT_THEME
        # 迁移旧数据格式
        migrate_all_data(self.data)

    def save(self):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)

    @property
    def buildings(self):
        return self.data.get("buildings", [])

    @property
    def theme(self):
        return self.data.get("theme", DEFAULT_THEME)

    @theme.setter
    def theme(self, val):
        self.data["theme"] = val; self.save()

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
        """将默认金额应用到所有月份"""
        try:
            amt = int(self.default_amount_var.get().strip())
        except ValueError:
            messagebox.showwarning("提示", "请输入有效金额", parent=self); return
        months = self.lease_months_var.get()
        rp = self.room.setdefault("rent_paid", {})
        for m in range(1, months+1):
            k = str(m)
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

        for i in range(months):
            m = i + 1; k = str(m)
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
        self.room["lease_start"] = self.lease_start_var.get().strip()
        self.room["lease_months"] = self.lease_months_var.get()
        self.room["notes"] = self.notes.get("1.0", tk.END).strip()

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
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("楼房管理系统")
        self.geometry("1024x720")
        self.minsize(860, 600)
        self.configure(bg=C["bg"])

        self.dm = DataStore()
        self._apply_theme(self.dm.theme)

        self.nav = []
        self.main = tk.Frame(self, bg=C["bg"])
        self.main.pack(fill=tk.BOTH, expand=True)

        self._show_home()
        self.protocol("WM_DELETE_WINDOW", self._close)

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
            for w in (btn, inn) + tuple(inn.winfo_children()) + tuple(sw.winfo_children()):
                w.bind("<Button-1>", lambda e, tn=tn: self._switch_theme(tn))

        RoundedBtn(sb, "＋ 添加楼房", command=self._add_building,
                   bg=C["primary"], width=206, height=42,
                   canvas_bg=C["sidebar_bg"]).pack(pady=(10, 20))

        ma = tk.Frame(self.main, bg=C["bg"]); ma.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
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
        card = tk.Frame(parent, bg=C["card"],
                        highlightbackground=C["border"], highlightthickness=1)
        inn = tk.Frame(card, bg=C["card"]); inn.pack(fill=tk.X, padx=20, pady=18)
        r1 = tk.Frame(inn, bg=C["card"]); r1.pack(fill=tk.X)
        ic = tk.Frame(r1, bg=C["primary_dim"], width=44, height=44)
        ic.pack(side=tk.LEFT, padx=(0,14)); ic.pack_propagate(False)
        tk.Label(ic, text="🏢", font=("Segoe UI Emoji",20), bg=C["primary_dim"]).place(relx=.5, rely=.5, anchor=tk.CENTER)
        nf = tk.Frame(r1, bg=C["card"]); nf.pack(side=tk.LEFT)
        tk.Label(nf, text=b["name"], font=FONT_HEADER, fg=C["text"], bg=C["card"]).pack(anchor=tk.W)
        bf = tk.Frame(r1, bg=C["card"]); bf.pack(side=tk.RIGHT)
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

    def _close(self):
        self.dm.save(); self.destroy()


if __name__ == "__main__":
    App().mainloop()
