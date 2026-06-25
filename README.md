# 楼房管理系统（出租房管理）

面向房东的出租房管理工具：管理多栋楼、每层房间、租客信息与交租情况，支持多端同步与账号间授权查看。

## 项目构成

本仓库包含三个相互配合的部分：

| 部分 | 技术栈 | 目录 | 说明 |
|------|--------|------|------|
| 桌面客户端 | Python 3 + Tkinter | `house_management.py`、`api_client.py` | 主要使用的图形界面程序，可打包成 Windows exe |
| 手机客户端 | Expo（React Native）+ TypeScript | `client/` | 移动端 App，与桌面端共用同一套服务端数据 |
| 服务端 | Node.js + Express + TypeScript + SQLite | `server/` | 账号认证、数据存储、多端同步与授权 |

> 桌面端和手机端都通过服务端的 REST API 读写数据，因此同一账号在不同设备上看到的是同一份数据。服务端不可用时，桌面端会回退到本地缓存（`housing_cache.json`）。

## 核心功能

- 管理多栋楼，自定义楼名、层数、每层房间数、楼层显示号
- 房间网格按楼层排列（房间多时可横向滚动），点击房间设置：是否入住、租客姓名、每月房租、每月交租记录、租客注解
- 租期管理：显示租期与剩余月份（按自然月计算）
- 转移租客（换房时保留注解与交租记录）
- 多端数据同步
- 账号间通讯：申请查看其他用户的全部楼房；被申请方可同意/拒绝，并控制被授权人的只读/可写权限

需求原文见 `项目要求.txt`，需求参考截图见 `example/1.png`（仅本地，不入库）。

---

## 一、桌面客户端（Python / Tkinter）

主程序，日常使用的就是这一端。

### 运行（开发）

```bash
# 需要 Python 3.8+，仅用标准库 + tkinter，无需安装第三方依赖
python house_management.py
```

### 打包为 EXE

```bash
# Windows 下双击或执行（内部用 PyInstaller）
build.bat
```

打包产物位于 `dist/楼房管理系统.exe`，打包配置见 `楼房管理系统.spec`。

### 相关文件

- `house_management.py`：Tkinter 图形界面，含 5 套主题（暗夜黑 / 极简白 / 森林绿 / 海洋蓝 / 暖橙色）
- `api_client.py`：与服务端通信的客户端（纯标准库 `urllib`，便于打包），并负责「服务端扁平模型 ↔ Python 嵌套模型」的双向转换
- `client_config.json`：本地配置（服务器地址、登录 token、用户名、主题偏好），**含敏感信息，不入库**
- `housing_cache.json`：服务端不可用时的本地数据缓存，**不入库**
- `test_api_client.py` / `test_datastore.py`：桌面端测试

---

## 二、服务端（Node.js / Express + SQLite）

为桌面端与手机端提供统一的数据接口。

### 运行（开发）

```bash
cd server
pnpm install
pnpm run dev      # 用 tsx watch 启动，默认端口 9091
```

### 生产构建与启动

```bash
cd server
pnpm run build    # 用 esbuild 打包到 dist/index.js
pnpm run start    # node dist/index.js
```

### 配置

复制 `server/.env.example` 为 `server/.env` 后按需修改：

- `PORT`：监听端口（默认 9091）
- `TOKEN_SECRET`：token 签名密钥，**上云前务必改成一长串随机值**
- `DB_PATH`：SQLite 数据库文件路径（默认 `server/data/housing.db`）
- `TLS_KEY` / `TLS_CERT`：配置后自动启用 HTTPS，否则使用 HTTP

部署与运维加固见 `server/DEPLOY.md` 与 `server/运维加固清单.md`。

### 技术要点

- 数据库使用 Node 内置 `node:sqlite`（无需原生编译）；表结构见 `server/src/db/index.ts`
- 密码用 `scrypt` 哈希；登录态用自包含的 HMAC-SHA256 签名 token（30 天有效），服务端不存 session，见 `server/src/auth/crypto.ts`
- 数据文件、数据库、证书均已在 `.gitignore` 中排除，**不入库**

> 注意：`server/package.json` 中仍保留了部分脚手架模板带入、当前代码未使用的依赖（如 `@supabase/supabase-js`、`drizzle-orm`、`pg`、`multer`、`zod`、`dayjs`）。可在确认无用后清理。

### 主要接口（前缀 `/api/v1`）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register`、`/auth/login` | 注册 / 登录（免 token） |
| GET | `/auth/me` | 校验 token |
| GET | `/buildings` | 列出可访问的楼房（自有 + 被授权） |
| GET/POST/PUT/DELETE | `/buildings/:id` 等 | 楼房增删改查 |
| PUT/POST/DELETE | `/rooms/:id`、`/buildings/:id/rooms` | 房间增删改 |
| POST/GET | `/access-requests` 系列 | 申请查看、收件箱、发件箱、同意/拒绝 |
| GET/PUT/DELETE | `/grantees` 系列 | 授权管理（读/写权限、撤销） |

---

## 三、手机客户端（Expo / React Native）

移动端 App，目录结构与路由约定如下。

### 目录结构

```
client/
├── app/                # Expo Router 路由（仅路由配置）
│   ├── _layout.tsx     # 根布局
│   ├── index.tsx       # 入口（首页）
│   ├── login.tsx
│   ├── building.tsx
│   └── room.tsx
├── screens/            # 页面实现（与 app/ 路由对应）
│   ├── home/           # 楼房列表 + 通讯入口
│   ├── building/       # 单栋楼房的房间网格
│   ├── room/           # 房间详情/编辑
│   └── login/
├── components/         # 可复用组件（Screen.tsx 为页面容器）
├── contexts/           # AuthContext 等
├── hooks/              # 自定义 Hooks
├── utils/              # api / sync / comm / storage / config / roomTypes
└── assets/
```

### 运行

```bash
cd client
npx expo start
```

服务器地址优先取登录页填写并保存的值，其次取环境变量 `EXPO_PUBLIC_API_BASE`，最后兜底 `http://localhost:9091`（见 `client/utils/config.ts`）。

### 开发约定

- 样式基于 tailwindcss（底层 Uniwind），主题 design token 入口为 `client/global.css`
- 路径别名 `@/` 指向 `client/`，优先用别名而非相对路径
- 安装依赖用 `npx expo install <package>`（自动匹配 SDK 兼容版本），不要用 `npm` / `yarn`
- 改动 `client/app/_layout.tsx` 前先阅读，保留 `global.css` 引入与各 Provider
- 主题模式（跟随系统/暗/亮）改 `client/components/ColorSchemeUpdater.tsx` 的 `DEFAULT_THEME`

### 静态校验

```bash
pnpm -w lint:client    # 校验 client
pnpm -w lint:server    # 校验 server
pnpm -w lint:all       # 同时校验
```

---

## 数据与隐私

租客等业务数据存放于本地/自建服务端，不上传第三方。以下文件包含敏感信息并已被 `.gitignore` 排除：`housing_data.json`、`housing_cache.json`、`client_config.json`、`server/data/`（数据库）、`server/certs/`（证书）。

GitHub 仓库：https://github.com/Aers-Hu/Housing-management_dad
