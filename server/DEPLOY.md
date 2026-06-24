# 房屋管家 · 部署上云指南

把 server 部署到一台你自己租的云服务器，手机 App 和电脑 Python 程序就能随时随地同步数据。
本文从「买服务器」一直讲到「开机自启 + 数据备份」，照着做即可。

---

## 〇、整体回顾：数据存在哪

- **权威数据**：云服务器上的 SQLite 数据库文件 `server/data/housing.db`（租客姓名、租金、交租记录、注解都在这里）。
- 手机 App、电脑程序上只是**缓存副本**，断网时兜底用；真正算数的是云服务器那一份。
- 备份 = 复制 `housing.db` 这一个文件即可（见第七节）。

---

## 一、买什么服务器

只跑这一个轻量 Node 服务，配置要求很低。

| 选项 | 推荐配置 | 价格参考 | 备注 |
|---|---|---|---|
| **国内轻量应用服务器**（阿里云/腾讯云） | 2核2G，3-5M带宽 | 学生/新用户 ¥30-120/年 | 便宜，但**域名要备案**（免费，约等 3-7 天） |
| **境外/香港轻量服务器** | 2核2G | 略贵一点 | **免备案**，即开即用，适合怕麻烦 |

**系统选 Ubuntu 22.04 LTS 或更新版**（本文命令以 Ubuntu 为例）。

> 怕备案麻烦、想马上用 → 选香港/境外。
> 在意延迟、长期用、能等几天 → 选国内 + 备案。

要不要域名？
- **强烈建议买一个域名**（一年几十块）。有域名才能轻松配免费 HTTPS 证书。
- 不买域名也能用 IP 直连，但 HTTPS 配置麻烦、手机端可能提示不安全。

---

## 二、服务器上装环境

登录服务器后（`ssh root@你的服务器IP`），依次执行：

```bash
# 1. 装 Node.js 24（自带 SQLite，无需额外数据库）
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs

# 2. 确认版本（要 v24 以上）
node --version

# 3. 装 pnpm 和 pm2（进程守护，开机自启用）
npm install -g pnpm pm2
```

---

## 三、把代码传到服务器

两种方式任选：

**方式 A：用 git（推荐）**
```bash
cd /opt
git clone <你的仓库地址> housingapp
cd housingapp/server
```

**方式 B：本地打包上传**
在本地把 `server` 目录打包，用 `scp` 传到服务器 `/opt/housingapp/server`。
> 注意：**别传 `node_modules`、`data/`、`certs/`、`.env`**（这些要么体积大、要么含隐私/密钥）。

---

## 四、配置环境变量（关键：安全）

在 `server` 目录下创建 `.env` 文件（参考 `.env.example`）：

```bash
cd /opt/housingapp/server
cp .env.example .env
nano .env
```

把内容改成：

```ini
PORT=9091

# ⚠️ 必须改！生成一长串随机字符串当密钥（否则 token 可被伪造）
# 在服务器上运行这行生成：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TOKEN_SECRET=把上面命令生成的随机串粘贴到这里

# 数据库路径（建议放到固定目录，方便备份）
DB_PATH=/opt/housingapp/data/housing.db

# HTTPS 证书路径（第六节配好证书后再填，先留空走 HTTP）
# TLS_KEY=/etc/letsencrypt/live/你的域名/privkey.pem
# TLS_CERT=/etc/letsencrypt/live/你的域名/fullchain.pem
```

> **`TOKEN_SECRET` 一定要改成随机串**，这是放公网的安全底线。

---

## 五、安装依赖、构建、启动

```bash
cd /opt/housingapp/server

# 装依赖
pnpm install

# 构建生产版本
pnpm run build

# 让 .env 生效并用 pm2 启动（开机自启 + 崩溃自动重启）
pm2 start dist/index.js --name housing-server --update-env

# 设置开机自启
pm2 startup        # 按提示复制执行它给出的那条命令
pm2 save
```

确认在跑：
```bash
pm2 status
pm2 logs housing-server   # 看日志，应显示 listening
curl http://localhost:9091/api/v1/health   # 应返回 {"status":"ok"}
```

> 注：pm2 默认不自动读 `.env`。若环境变量没生效，改用：
> `pm2 start dist/index.js --name housing-server --node-args="-r dotenv/config"`
> 或在启动前 `export $(cat .env | xargs)`。

---

## 六、配置 HTTPS（强烈建议）

### 6.1 先开放防火墙端口
在**云厂商控制台的安全组**里放行：
- `80`（申请证书用）、`443`（HTTPS）、或你的 `9091`。

### 6.2 用 Let's Encrypt 申请免费证书（需要域名）

先把域名解析到服务器 IP（在域名商后台加一条 A 记录）。然后：

```bash
apt-get install -y certbot
# 申请证书（把 yourdomain.com 换成你的域名）
certbot certonly --standalone -d yourdomain.com
```

证书会生成在 `/etc/letsencrypt/live/yourdomain.com/`。

### 6.3 让 server 用上证书
编辑 `.env`，取消注释并填好：
```ini
TLS_KEY=/etc/letsencrypt/live/yourdomain.com/privkey.pem
TLS_CERT=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
```

重启：
```bash
pm2 restart housing-server --update-env
pm2 logs housing-server   # 应显示 🔒 HTTPS server listening
```

> 证书 90 天到期，certbot 一般会自动续期。手动续期：`certbot renew`，然后 `pm2 restart housing-server`。

---

## 七、客户端怎么连

服务器跑起来后，把地址告诉两个客户端：

- **地址形式**：
  - 有域名 + HTTPS：`https://yourdomain.com`（若用 443 端口，可不写端口）
  - 仅 IP + HTTP：`http://你的服务器IP:9091`

- **手机 App**：打开登录页 → 展开「服务器设置」→ 填上面的地址 → 注册/登录。
- **电脑 Python 程序**：登录框里「服务器地址」填同样的地址 → 用**同一个账号**登录。

> 两端用同一个账号登录，看到的就是同一批数据。要让家人/合伙人协助管理，用「主账号授权」功能把某栋楼授权给他们的账号（步骤 2 已实现）。

---

## 八、数据备份（重要）

租客数据就是一个文件：`/opt/housingapp/data/housing.db`。

**手动备份**：
```bash
cp /opt/housingapp/data/housing.db ~/housing-backup-$(date +%Y%m%d).db
```

**每天自动备份**（加到 crontab）：
```bash
crontab -e
# 加入这行：每天凌晨 3 点备份，保留到 backups 目录
0 3 * * * cp /opt/housingapp/data/housing.db /opt/housingapp/backups/housing-$(date +\%Y\%m\%d).db
```
（先 `mkdir -p /opt/housingapp/backups`）

**下载到本地保存**：在本地电脑运行
```bash
scp root@你的服务器IP:/opt/housingapp/data/housing.db ./
```

---

## 九、更新代码后怎么重新部署

```bash
cd /opt/housingapp
git pull                       # 拉最新代码
cd server
pnpm install                   # 依赖有变化时
pnpm run build                 # 重新构建
pm2 restart housing-server --update-env
```

> `data/housing.db` 不在 git 里，更新代码不会动你的租客数据，放心 pull。

---

## 十、常见问题排查

| 现象 | 排查 |
|---|---|
| 客户端提示「连不上服务器」 | ① `pm2 status` 看服务在不在跑；② 云厂商安全组端口是否放行；③ 地址/端口填对没 |
| 注册提示用户名被占用 | 换个用户名，或用登录而非注册 |
| token 失效要重新登录 | 正常，token 30 天过期；或服务端 `TOKEN_SECRET` 改过会使旧 token 全失效 |
| 改了 .env 不生效 | `pm2 restart housing-server --update-env`，必要时加 `-r dotenv/config` |
| HTTPS 不生效仍是 HTTP | 看日志有没有 🔒；检查证书路径、`.env` 是否取消注释 |
| 看日志 | `pm2 logs housing-server` |

---

## 附：本地开发自测（不上云）

想先在自己电脑上跑通：
```bash
cd server
pnpm install
# 可选：生成本地自签证书测 HTTPS
bash scripts/gen-cert.sh
# 启动（开发模式）
PORT=9091 TOKEN_SECRET=dev-secret npx tsx src/index.ts
```
手机/电脑客户端地址填 `http://你电脑的局域网IP:9091`（同一 WiFi 下）。
