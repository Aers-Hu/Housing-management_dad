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

需求原文见 `项目要求.txt`（仅本地，不入库），需求参考截图见 `example/1.png`（仅本地，不入库）。

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
| `清除测试数据.bat` / `clear_test_data.py` | 清空租客/楼房/房间/待审/申请/授权及全部测试用户，**唯独保留管理员账号 `GmAersMess`**（需输入 `CLEAR` 确认，运行前请先关服务端） |

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
| GET | `/pending-changes` | 列出待审的手机端离线改动（楼主见自己名下未决的；管理员见全部楼主待审） |
| POST | `/pending-changes/:id/resolve` | 批准 / 拒绝某条待审改动（楼主先到先生效；管理员为最终裁决，可覆盖回滚） |

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

## 新用户如何使用

如果你是新用户，只需：

### 电脑端

1. 安装 [Python 3.8+](https://www.python.org/downloads/)（安装时勾选「Add Python to PATH」）
2. 从 GitHub 克隆项目：
   ```bash
   git clone https://github.com/Aers-Hu/Housing-management_dad.git
   cd Housing-management_dad
   ```
3. （可选）安装 PyInstaller 并打包成 exe：
   ```bash
   pip install pyinstaller
   pyinstaller --onedir --windowed --name "楼房管理系统" --clean house_management.py
   ```
   打包后双击 `dist/楼房管理系统/楼房管理系统.exe` 即可运行。
   > 如果不想打包，也可以直接用源码运行：
   > ```bash
   > python house_management.py
   > ```
4. 打开程序后，在登录界面把「服务器地址」改成管理员给你的地址，然后注册账号即可

### 手机端

1. 安装管理员发给你的 APK
2. 登录界面展开「服务器设置」，填入相同的服务器地址
3. 用和电脑端**相同的账号**登录

> 电脑和手机连接的是同一台服务器，数据自动互通，无需额外设置。

---

## 核心功能

- 管理多栋楼，自定义楼名、层数、每层房间数、楼层显示号
- 房间网格按楼层排列（房间多时可横向滚动），点击房间设置：是否入住、租客姓名、每月房租、每月交租记录、租客注解
- 租期管理：显示租期与剩余月份（按自然月计算）
- 转移租客（换房时保留注解与交租记录）
- 批量修改房屋名字
- 多端数据同步（在线实时写 + 离线缓存兜底）
- **手机端离线改动审批**：手机断网期间的改动重连后不再静默覆盖主库，而是进入「待审区」，由你在电脑端逐条确认（显示变动内容、提交位置、设备型号、时间）后才落入主库
- **管理员裁决账号**：内置 `GmAersMess`（仅限本机电脑端登录）可查看全部楼主的待审并做最终裁决，优先级高于楼主，可覆盖/回滚楼主决定
- 账号间通讯：申请查看其他用户的全部楼房；被申请方可同意/拒绝，并控制被授权人的只读/可写权限（三级权限：owner / write / read）

---

## 手机端离线改动审批流程

为避免「手机断网期间改的数据，一联网就静默覆盖主库」，离线改动改为**待你确认后才生效**：

```
手机在线改动 ─────────────────────────────► 直接落主库（实时，照旧）

手机断网改动 → 本地队列 → 重连后重放 ──► 服务端「待审表」（不落库）
                                            │  带上：变动字段、提交者IP、设备型号、时间
                                            ▼
                          电脑端每 8 秒轮询 → 逐条弹窗（一条处理完才弹下一条）
                                            │
                          ┌─────────────────┴─────────────────┐
                          ▼                                     ▼
                  ✅ 接收 → 套用到主库                    ❌ 拒绝 → 丢弃，主库不变
```

### 管理员裁决账号 `GmAersMess`（最高优先级）

除「被改楼房的楼主」外，系统内置一个**管理员账号**专门用于集中管理审批：

- **账号**：`GmAersMess`，由服务端**启动时自动种入**（即便清库删了，重启即重建），任何人**不能注册同名**。
- **设备绑定（写死）**：该账号**只允许本机这台电脑的电脑端登录使用**——登录与每个请求都要求携带本机 `MachineGuid`（写死）且来源为本机回环；手机端、其它电脑一律 `403`，无法登录或操作。
- **可见范围**：管理员能看到**全部楼主**的待审改动（楼主只能看到自己名下的）。
- **裁决优先级（方案 B：先到先生效，管理员可事后翻盘）**：
  - 楼主先决定 → **立即生效**（接收即落库 / 拒绝则不落库），但记录保留，管理员仍可翻盘。
  - 管理员裁决 = **最终**，覆盖楼主：管理员准许 → 确保落库；管理员拒绝 → 若已被楼主落库，则**按字段精准回滚**到改动前的值（只动这次改的字段，不影响他人后改的其它字段）。裁决后该记录从所有队列移除。

> 电脑端用 `GmAersMess` 登录后，待审弹窗进入「🛡️ 管理员裁决模式」，会额外显示楼主的暂定决定，按钮变为「准许写入（最终）/ 拒绝写入（最终）」。

**弹窗显示的提交位置**由手机端 IP 转换而来：

- 手机与电脑在**同一 WiFi**下：IP 是局域网地址，无法地理定位，显示「家庭局域网（同一网络内）」。
- 手机用**移动数据/在外网经隧道接入**：当前为纯 TCP 隧道，服务端看到的是回环地址（拿不到手机真实公网 IP），显示「经隧道接入（无法定位真实位置）」。
- 若改为 HTTP vhost 隧道（带 `X-Forwarded-For`）拿到公网 IP：调用 `ip-api.com`（免费、免密钥、中文）查城市，如「广东 深圳（中国电信）」。
- **设备型号**由手机端 `expo-device` 上报（如 `iPhone 15 Pro`），便于你判断提交是否可信。

> ⚠️ 经 frpc 隧道时，能否拿到手机真实公网 IP 取决于隧道类型：HTTP vhost 模式（带 `X-Forwarded-For`）可拿到真实 IP；**当前 `launcher/frpc.toml` 用的是纯 TCP 隧道**，服务端只能看到回环地址，外网提交统一显示「经隧道接入」。设备型号、变动内容、时间不受影响，照常显示。服务端已开启 `trust proxy`，一旦换成 HTTP 隧道即可自动取真实 IP。

> 注：仅「断网重连后重放的改动」需要审批；手机在线时的实时改动、以及电脑端自己的改动均直接生效，不受影响。改动审批后需手机端重新构建 APK 才能上报设备型号（已引入 `expo-device`）。

### 审核期间手机端显示什么数据（以主库为准）

离线改动重连重放后进入待审表，主库此刻**尚未生效**。为避免手机端显示「乐观值/幽灵数据」，手机在重放后会**立即从主库重新拉取受影响楼房的房间，覆盖本地缓存**（`StorageService.reconcileOfflineReplays`），并提示「X 处改动待服务器端确认后生效」。于是：

- **审核期间**：手机显示主库旧值（与主库一致），不会误以为已生效。
- **审核被拒**：主库不变，手机也始终是旧值，无残留幽灵数据。
- **审核通过**：主库更新，手机下次刷新/进入该楼自然显示新值。

---

## 数据与隐私

租客等业务数据存放于本地/自建服务端，不上传第三方。以下文件包含敏感信息并已被 `.gitignore` 排除：

- `项目要求.txt` — 需求文档（仅本地参考）
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
