# 房屋管家（出租房管理系统）

面向房东的出租房管理工具：管理多栋楼、每层房间、租客信息与交租情况，支持多端同步与账号间授权查看。

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│  你的电脑（主库）                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 桌面客户端    │  │ Node 服务端   │  │ launcher/    │  │
│  │ (Python GUI) │  │ (Express+    │  │ 一键启动+    │  │
│  │              │  │  SQLite:9091)│  │ frpc 隧道    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│         └─────────┬───────┘                  │          │
│                   │                          │          │
│           本地 127.0.0.1:9091                │          │
└─────────────────────────────────────────────────────────┘
                    │ frpc 隧道
                    ▼
        ┌───────────────────────┐
        │   云服务器 (frps)      │
        │   可选，用于外出时     │
        │   手机远程同步         │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │   手机客户端 (Expo)    │
        │   在外通过域名访问     │
        └───────────────────────┘
```

**数据存放：** 权威数据在 SQLite 数据库（默认 `%APPDATA%\HouseApp\housing.db`），桌面端和手机端都通过服务端 REST API 读写同一份数据。服务端不可用时，桌面端和手机端均会回退到本地缓存。

## 项目构成

本仓库包含四个相互配合的部分：

| 部分 | 技术栈 | 目录 | 说明 |
|------|--------|------|------|
| 本机启动器 | Batch + PowerShell + frpc | `launcher/` | **日常入口**：一键启动服务端+隧道，守护进程，开机自启 |
| 桌面客户端 | Python 3 + Tkinter | `house_management.py`、`api_client.py` | 图形界面程序，可打包成 Windows exe，5 套主题 |
| 手机客户端 | Expo 54（React Native 0.81）+ TypeScript | `client/` | 移动端 App，支持 Android APK 构建（EAS 云端） |
| 服务端 | Node.js + Express + TypeScript + SQLite | `server/` | 账号认证、数据存储、多端同步与授权 |

需求原文见 `项目要求.txt`，需求参考截图见 `example/1.png`（仅本地，不入库）。

---

## 一、本机启动器（launcher/）⭐ 日常使用入口

将你的 Windows 电脑作为"主库"所在地，一键拉起服务端并保持运行。配合 frpc 隧道，让你外出时手机也能访问家里的数据。

### 文件说明

| 文件 | 用途 |
|------|------|
| `一键启动.bat` | **双击启动**（推荐日常用）。内部调用 PowerShell 脚本 |
| `start-housing.ps1` | 实际启动+守护脚本，可改顶部配置（端口、是否开隧道） |
| `frpc.toml.example` | 隧道配置模板，复制为 `frpc.toml` 后填写云服务器信息 |
| `frpc.toml` | 隧道实际配置，**含服务器 IP/Token，不入库** |
| `install-autostart.bat` | 注册「开机自启」到当前用户启动项 |
| `备份数据库.bat` / `backup-db.ps1` | 手动备份数据库到 `backups/`，自动保留最近 14 天 |
| `frpc.exe` | frp 隧道客户端（需自行下载放入，不入库） |

### 首次使用

1. 确认已安装 Node.js（24+）：命令行运行 `node --version`
2. 构建服务端：
   ```bash
   cd server
   pnpm install
   pnpm run build
   ```
3. 配置密钥：复制 `server/.env.example` 为 `server/.env`，修改 `TOKEN_SECRET` 为随机串
4. （可选，手机在外同步才需要）配置隧道：
   - 从 [frp releases](https://github.com/fatedier/frp/releases) 下载 Windows 版，解压 `frpc.exe` 放入 `launcher/`
   - 复制 `frpc.toml.example` 为 `frpc.toml`，填写云服务器 IP、token、域名
   - 如果只在本机/局域网使用，将 `start-housing.ps1` 顶部的 `$EnableTunnel` 改为 `$false`
5. 双击 `一键启动.bat`，窗口保持打开即运行中
6. 验证：浏览器打开 `http://127.0.0.1:9091/api/v1/health`，返回 `{"status":"ok"}`

### 开机自启

双击 `install-autostart.bat` → 下次开机自动运行。取消：Win+R 输入 `shell:startup`，删掉「房屋管家主库」快捷方式。

### 数据备份 ⚠️

租客数据就是一个文件 `%APPDATA%\HouseApp\housing.db`，**务必定期备份**（硬盘损坏 = 数据全丢）。

- **手动：** 双击 `备份数据库.bat`
- **自动：** 用 Windows「任务计划程序」添加定时任务指向 `备份数据库.bat`
- **异地：** 定期将 `launcher/backups/` 复制到 U 盘 / 网盘

---

## 二、桌面客户端（Python / Tkinter）

主程序 GUI，日常使用的就是这一端。

### 运行（开发）

```bash
# 需 Python 3.8+，仅用标准库 + tkinter，无需安装第三方依赖
python house_management.py
```

### 打包为 EXE

```bash
# Windows 下双击或执行（内部用 PyInstaller）
build.bat
```

打包产物位于 `dist/楼房管理系统.exe`，打包配置见 `楼房管理系统.spec`。

### 相关文件

| 文件 | 说明 |
|------|------|
| `house_management.py` | Tkinter 图形界面，含 5 套主题（暗夜黑 / 极简白 / 森林绿 / 海洋蓝 / 暖橙色） |
| `api_client.py` | 与服务端通信（纯标准库 `urllib`，便于打包），含「服务端扁平模型 ↔ Python 嵌套模型」双向转换 |
| `client_config.json` | 本地配置（服务器地址、登录 token、用户名、主题偏好），**含敏感信息，不入库** |
| `housing_cache.json` | 服务端不可用时的本地数据缓存，**不入库** |
| `test_api_client.py` | 桌面端 API 通信测试 |
| `test_datastore.py` | 桌面端数据存储测试 |

---

## 三、服务端（Node.js / Express + SQLite）

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
pnpm run start    # node dist/index.js，端口默认 5000（配合云部署）
```

### 配置

复制 `server/.env.example` 为 `server/.env` 后按需修改：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 监听端口 | `9091`（开发）/ `5000`（生产） |
| `TOKEN_SECRET` | token 签名密钥 | **上云前务必改成一长串随机值** |
| `DB_PATH` | SQLite 数据库路径 | `%APPDATA%\HouseApp\housing.db` |
| `TLS_KEY` / `TLS_CERT` | TLS 证书路径 | 配置后自动启用 HTTPS，否则使用 HTTP |

部署与运维加固见 `server/DEPLOY.md` 与 `server/运维加固清单.md`。

### 技术要点

- 数据库使用 Node 内置 `node:sqlite`（无需原生编译）；表结构见 `server/src/db/index.ts`
- 密码用 `scrypt` 哈希；登录态用自包含的 HMAC-SHA256 签名 token（30 天有效），服务端不存 session，见 `server/src/auth/crypto.ts`
- 已集成限流中间件（`server/src/middleware/rateLimit.ts`），全局错误兜底与优雅关闭
- 数据文件、数据库、证书均已在 `.gitignore` 中排除，**不入库**

### 主要接口（前缀 `/api/v1`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/auth/register`、`/auth/login` | 注册 / 登录（免 token） |
| GET | `/auth/me` | 校验 token |
| GET | `/buildings` | 列出可访问的楼房（自有 + 被授权） |
| GET/POST/PUT/DELETE | `/buildings/:id` 等 | 楼房增删改查 |
| PUT/POST/DELETE | `/rooms/:id`、`/buildings/:id/rooms` | 房间增删改查 |
| POST/GET | `/access-requests` 系列 | 申请查看其他用户楼房、收件箱、发件箱、同意/拒绝 |
| GET/PUT/DELETE | `/grantees` 系列 | 授权管理（owner/write/read 三级权限、撤销授权） |
| GET | `/sync` | 全量数据同步（客户端断网重连后拉取最新数据） |

---

## 四、手机客户端（Expo / React Native）

移动端 App，与桌面端共用同一套服务端数据。

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
├── utils/              # api / sync / comm / storage / config / roomTypes / netstatus
└── assets/
```

### 运行

```bash
cd client
npx expo start
```

服务器地址优先取登录页填写并保存的值，其次取环境变量 `EXPO_PUBLIC_API_BASE`，最后兜底 `http://localhost:9091`（见 `client/utils/config.ts`）。

### Android APK 构建（EAS 云端）

```bash
cd client
npx eas build --platform android --profile preview   # 构建预览版 APK
npx eas build --platform android --profile production # 构建正式版
```

EAS 配置见 `client/eas.json`，项目 ID：`8ddfb094-5c7b-4bf2-8faf-a841593477a7`。Android 正式版已允许明文 HTTP（`android:usesCleartextTraffic="true"`），以便连接自建 HTTP 服务端。

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

## 核心功能

- 管理多栋楼，自定义楼名、层数、每层房间数、楼层显示号
- 房间网格按楼层排列（房间多时可横向滚动），点击房间设置：是否入住、租客姓名、每月房租、每月交租记录、租客注解
- 租期管理：显示租期与剩余月份（按自然月计算）
- 转移租客（换房时保留注解与交租记录）
- 批量修改房屋名字
- 多端数据同步（全量同步 + 离线缓存兜底）
- 账号间通讯：申请查看其他用户的全部楼房；被申请方可同意/拒绝，并控制被授权人的只读/可写权限（三级权限：owner / write / read）

---

## 数据与隐私

租客等业务数据存放于本地/自建服务端，不上传第三方。以下文件包含敏感信息并已被 `.gitignore` 排除：

- `housing_data.json`、`housing_cache.json` — 本地缓存数据
- `client_config.json` — 含登录 token
- `server/data/` — SQLite 数据库（租客姓名、租金、记录等）
- `server/certs/` — TLS 证书与密钥
- `launcher/frpc.toml` — 隧道配置（含云服务器 IP/Token）
- `launcher/backups/` — 数据库备份

---

## 分支与提交

- 当前开发分支：`feature/sync-communication`，主分支 `main`
- 提交信息沿用现有风格：`feat:` / `fix:` / `chore:` / `docs:` + 中文简述

GitHub 仓库：https://github.com/Aers-Hu/Housing-management_dad
