import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';

// ============================================================
// 数据库文件路径（本机主库版）
// 优先级：环境变量 DB_PATH > 本机用户数据目录 > 程序目录/data 兜底
//
// 默认放到「用户数据目录」而非程序目录，这样升级/重装程序不会动到数据库：
//   - Windows : %APPDATA%\HouseApp\housing.db
//   - macOS   : ~/Library/Application Support/HouseApp/housing.db
//   - Linux   : ~/.local/share/HouseApp/housing.db
// ============================================================
function defaultDbPath(): string {
  const home = homedir();
  let dir: string;
  if (process.platform === 'win32') {
    dir = process.env.APPDATA || join(home, 'AppData', 'Roaming');
  } else if (process.platform === 'darwin') {
    dir = join(home, 'Library', 'Application Support');
  } else {
    dir = process.env.XDG_DATA_HOME || join(home, '.local', 'share');
  }
  // 极端情况下 homedir 拿不到，回退到程序目录/data
  if (!dir) return resolve(process.cwd(), 'data', 'housing.db');
  return join(dir, 'HouseApp', 'housing.db');
}

const DB_PATH = process.env.DB_PATH || defaultDbPath();

// 确保目录存在
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// 开启外键约束与 WAL（更好的并发读写）
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// ============================================================
// 建表（IF NOT EXISTS，幂等）
// ============================================================
export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS buildings (
      id              TEXT PRIMARY KEY,
      owner_id        TEXT NOT NULL,
      name            TEXT NOT NULL,
      floors          INTEGER NOT NULL,
      rooms_per_floor INTEGER NOT NULL,
      created_at      TEXT NOT NULL,
      floor_labels    TEXT,                    -- JSON 字符串
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id               TEXT PRIMARY KEY,
      building_id      TEXT NOT NULL,
      floor            INTEGER NOT NULL,
      number           TEXT NOT NULL,
      name             TEXT NOT NULL DEFAULT '',
      is_occupied      INTEGER NOT NULL DEFAULT 0,  -- 0/1
      tenant_name      TEXT NOT NULL DEFAULT '',
      monthly_rent     REAL NOT NULL DEFAULT 0,
      lease_start_date TEXT,
      lease_months     INTEGER,
      notes            TEXT,
      rent_records     TEXT,                        -- JSON 字符串
      FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
    );

    -- 账号级访问申请：requester 申请查看 owner 的全部楼房
    CREATE TABLE IF NOT EXISTS access_requests (
      id           TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL,
      owner_id     TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      UNIQUE (requester_id, owner_id),
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_id)     REFERENCES users(id) ON DELETE CASCADE
    );

    -- 账号级授权：owner 把自己整个账号授权给 grantee（读默认有，can_write 控制写）
    CREATE TABLE IF NOT EXISTS account_grants (
      id         TEXT PRIMARY KEY,
      owner_id   TEXT NOT NULL,
      grantee_id TEXT NOT NULL,
      can_write  INTEGER NOT NULL DEFAULT 0,  -- 0=只读, 1=可写(含删楼)
      created_at TEXT NOT NULL,
      UNIQUE (owner_id, grantee_id),
      FOREIGN KEY (owner_id)   REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (grantee_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 待审改动：手机端断网重连后重放的房间改动先落此表，由楼房 owner 在电脑端逐条批准后才落主库。
    -- proposed/diff 均为 JSON 字符串；submitter_ip/device_model 供电脑端弹窗显示来源。
    CREATE TABLE IF NOT EXISTS pending_changes (
      id            TEXT PRIMARY KEY,
      owner_id      TEXT NOT NULL,           -- 该房间所属楼房的 owner（审批人）
      building_id   TEXT NOT NULL,
      room_id       TEXT NOT NULL,
      submitter_id  TEXT NOT NULL,           -- 提交改动的用户（手机端登录用户）
      proposed      TEXT NOT NULL,           -- JSON：完整提议的房间状态（套用时直接用）
      diff          TEXT NOT NULL,           -- JSON：字段级差异 [{field,label,before,after}]
      submitter_ip  TEXT,                    -- 提交者 IP（电脑端再转城市）
      device_model  TEXT,                    -- 提交设备型号
      created_at    TEXT NOT NULL,
      FOREIGN KEY (owner_id)    REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id)     REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (submitter_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_buildings_owner   ON buildings(owner_id);
    CREATE INDEX IF NOT EXISTS idx_rooms_building     ON rooms(building_id);
    CREATE INDEX IF NOT EXISTS idx_areq_owner         ON access_requests(owner_id);
    CREATE INDEX IF NOT EXISTS idx_areq_requester     ON access_requests(requester_id);
    CREATE INDEX IF NOT EXISTS idx_agrant_grantee     ON account_grants(grantee_id);
    CREATE INDEX IF NOT EXISTS idx_agrant_owner       ON account_grants(owner_id);
    CREATE INDEX IF NOT EXISTS idx_pending_owner      ON pending_changes(owner_id, created_at);
  `);

  migratePendingChanges();
}

// ============================================================
// 迁移：为 pending_changes 增补「双人决策 + 落库状态 + 原始快照 + 裁决时间」列
//   owner_decision : 楼主决定  NULL=未决 / 'approve' / 'reject'
//   admin_decision : 管理员决定（优先级最高，覆盖楼主）同上取值
//   applied        : 当前提议是否已写入主库  0/1（方案 B：先到先生效）
//   original       : JSON，改动前的房间快照（管理员翻盘回滚时按字段还原用）
//   resolved_at    : 管理员最终裁决时间（ISO），用于历史记录排序与 50 条上限清理
// 用 PRAGMA 检测列是否已存在，幂等：已迁移过则跳过，老库平滑升级不丢数据。
// ============================================================
function migratePendingChanges(): void {
  const cols = new Set<string>(
    (db.prepare(`PRAGMA table_info(pending_changes)`).all() as any[]).map((c) => c.name)
  );
  const addCol = (name: string, ddl: string) => {
    if (!cols.has(name)) {
      db.exec(`ALTER TABLE pending_changes ADD COLUMN ${ddl};`);
    }
  };
  addCol('owner_decision', 'owner_decision TEXT');
  addCol('admin_decision', 'admin_decision TEXT');
  addCol('applied', 'applied INTEGER NOT NULL DEFAULT 0');
  addCol('original', 'original TEXT');
  addCol('resolved_at', 'resolved_at TEXT');
}

export { DB_PATH };
