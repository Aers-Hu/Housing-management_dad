#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清除测试数据（保留管理员账号 GmAersMess）

用途：测试结束后，把租客/楼房/房间/待审改动/访问申请/授权全部清空，
并删除「除管理员 GmAersMess 外」的所有用户账号，唯独完整保留管理员账号。

设计：
  - 直连 SQLite（%APPDATA%\\HouseApp\\housing.db，或 DB_PATH 环境变量指定）。
  - 删除前要求输入确认词 CLEAR，防手滑误删。
  - 删除后做一次 WAL checkpoint 落盘，并报告各表删了多少行。

⚠️ 运行前请先关闭服务端进程，避免清库与服务端缓存打架。
   即便不小心把管理员账号删了也不要紧：服务端下次启动会自动重新种入。
"""

import os
import sqlite3
import sys

ADMIN_USERNAME = "GmAersMess"


def default_db_path():
    # 与 server/src/db/index.ts 的 defaultDbPath 对齐（Windows 主用）
    env = os.environ.get("DB_PATH")
    if env:
        return env
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.join(
            os.path.expanduser("~"), "AppData", "Roaming")
    elif sys.platform == "darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.join(
            os.path.expanduser("~"), ".local", "share")
    return os.path.join(base, "HouseApp", "housing.db")


def main():
    db_path = default_db_path()
    print("=" * 56)
    print("  清除测试数据（保留管理员账号 %s）" % ADMIN_USERNAME)
    print("=" * 56)
    print("数据库：%s" % db_path)

    if not os.path.exists(db_path):
        print("⚠️  数据库文件不存在，无需清除。")
        return

    print()
    print("将清空：租客/楼房/房间、待审改动、访问申请、授权，")
    print("并删除除 %s 外的所有用户账号。" % ADMIN_USERNAME)
    print("⚠️  请确认已关闭服务端进程后再继续。")
    print()
    ans = input("输入大写 CLEAR 确认清除（其它任意键取消）：").strip()
    if ans != "CLEAR":
        print("已取消，未做任何改动。")
        return

    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = ON;")
    cur = con.cursor()

    # 找到管理员账号 id（保留它）
    row = cur.execute("SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)).fetchone()
    admin_id = row[0] if row else None
    if admin_id:
        print("✅ 找到管理员账号，将予以保留。")
    else:
        print("ℹ️  当前库无管理员账号（服务端下次启动会自动种入）。")

    counts = {}

    # 业务数据：buildings 删除会经 ON DELETE CASCADE 连带 rooms/pending_changes 等，
    # 但为稳妥起见也显式清空各表（幂等）。
    cur.execute("DELETE FROM pending_changes"); counts["pending_changes"] = cur.rowcount
    cur.execute("DELETE FROM access_requests"); counts["access_requests"] = cur.rowcount
    cur.execute("DELETE FROM account_grants");  counts["account_grants"] = cur.rowcount
    cur.execute("DELETE FROM rooms");           counts["rooms"] = cur.rowcount
    cur.execute("DELETE FROM buildings");       counts["buildings"] = cur.rowcount

    # 用户：删除除管理员外的全部
    if admin_id:
        cur.execute("DELETE FROM users WHERE id != ?", (admin_id,))
    else:
        cur.execute("DELETE FROM users")
    counts["users(已删)"] = cur.rowcount

    con.commit()

    # 落盘并合并 WAL
    try:
        cur.execute("PRAGMA wal_checkpoint(TRUNCATE);")
    except Exception:
        pass
    con.commit()
    con.close()

    print()
    print("清除完成，各表删除行数：")
    for k, v in counts.items():
        print("  - %-18s %s" % (k, v))
    remain = "保留 1 个（%s）" % ADMIN_USERNAME if admin_id else "无（重启服务端会自动种入）"
    print("  - %-18s %s" % ("管理员账号", remain))
    print()
    print("✅ 完成。可重新启动服务端开始下一轮测试。")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n已取消。")
