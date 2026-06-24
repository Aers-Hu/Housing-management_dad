import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// 数据库文件路径（可用环境变量覆盖，便于上云时指定持久化目录）
const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), 'data', 'housing.db');

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

    CREATE INDEX IF NOT EXISTS idx_buildings_owner   ON buildings(owner_id);
    CREATE INDEX IF NOT EXISTS idx_rooms_building     ON rooms(building_id);
    CREATE INDEX IF NOT EXISTS idx_areq_owner         ON access_requests(owner_id);
    CREATE INDEX IF NOT EXISTS idx_areq_requester     ON access_requests(requester_id);
    CREATE INDEX IF NOT EXISTS idx_agrant_grantee     ON account_grants(grantee_id);
    CREATE INDEX IF NOT EXISTS idx_agrant_owner       ON account_grants(owner_id);
  `);
}

export { DB_PATH };
