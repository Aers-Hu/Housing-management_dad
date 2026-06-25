# AGENTS.md — 开发协作指南

本文件面向参与本仓库的协作者与 AI 代理，约定项目结构、命令与注意事项。项目整体介绍见 `README.md`。

## 项目速览

出租房管理系统，三端协作：

- **桌面端（主）**：`house_management.py` + `api_client.py`，Python 3 + Tkinter，仅标准库。
- **服务端**：`server/`，Node.js + Express + TypeScript + 内置 `node:sqlite`。
- **手机端**：`client/`，Expo（React Native）+ TypeScript + tailwindcss/Uniwind。

桌面端与手机端都经服务端 REST API（前缀 `/api/v1`）读写同一份数据。

## 常用命令

```bash
# 桌面端
python house_management.py          # 运行
build.bat                           # 打包 exe（PyInstaller）

# 服务端
cd server && pnpm install
pnpm run dev                        # tsx watch，端口 9091
pnpm run build && pnpm run start    # 生产构建并启动

# 手机端
cd client && npx expo start

# 静态校验
pnpm -w lint:all                    # client + server
```

## 关键约定

### 数据模型一致性（重要）

服务端用驼峰命名的扁平模型（见 `server/src/types.ts`），桌面端用 snake_case 嵌套模型。
两者的转换集中在 `api_client.py` 的 `server_*_to_py` / `py_*_to_server_body`。
**任何字段增减都要同步更新这三处：`server/src/types.ts`、数据库表（`server/src/db/index.ts`）、`api_client.py` 的转换函数**，否则会丢字段。

### 服务端

- 数据库为内置 `node:sqlite`，表结构在 `server/src/db/index.ts`（幂等 `CREATE TABLE IF NOT EXISTS`）。
- 认证：`scrypt` 哈希密码 + HMAC-SHA256 自包含 token，逻辑在 `server/src/auth/crypto.ts`。上云必须设 `TOKEN_SECRET`。
- 权限分级 `owner / write / read`，所有写操作都要先过 `Buildings.accessLevel` 校验（参考 `server/src/routes/data.ts`）。
- `server/package.json` 含模板带入但未使用的依赖（`@supabase/supabase-js`、`drizzle-orm`、`pg`、`multer`、`zod`、`dayjs`），清理前请确认无引用。

### 手机端

- 路径别名 `@/` → `client/`，优先用别名。
- 装依赖用 `npx expo install`，**禁用 `npm` / `yarn`**。
- 改 `client/app/_layout.tsx` 前先读，保留 `global.css` 引入与各 Provider。
- 样式走 tailwindcss className；主题 token 在 `client/global.css`。

### 桌面端

- 仅依赖 Python 标准库 + tkinter，**不要引入第三方包**（否则破坏免依赖打包）。
- 通信层 `api_client.py` 只用 `urllib`，同样不引第三方。

## 不要提交的文件

业务/敏感数据已在 `.gitignore` 排除，请勿强制入库：
`housing_data.json`、`housing_cache.json`、`client_config.json`（含 token）、`server/data/`（数据库）、`server/certs/`、`*.pem`。

## 提交与分支

- 当前开发分支：`feature/sync-communication`，主分支 `main`。
- 提交信息沿用现有风格：`feat:` / `fix:` / `chore:` + 中文简述。
