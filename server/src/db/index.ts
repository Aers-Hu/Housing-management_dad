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

    CREATE TABLE IF NOT EXISTS grants (
      id          TEXT PRIMARY KEY,
      building_id TEXT NOT NULL,
      grantee_id  TEXT NOT NULL,
      permission  TEXT NOT NULL CHECK (permission IN ('read','edit')),
      created_at  TEXT NOT NULL,
      UNIQUE (building_id, grantee_id),
      FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
      FOREIGN KEY (grantee_id)  REFERENCES users(id)     ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_buildings_owner ON buildings(owner_id);
    CREATE INDEX IF NOT EXISTS idx_rooms_building   ON rooms(building_id);
    CREATE INDEX IF NOT EXISTS idx_grants_grantee   ON grants(grantee_id);
  `);
}

export { DB_PATH };
