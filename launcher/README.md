# 本机主库启动器（launcher）

这台电脑是「主库」所在地。本文件夹的脚本负责一键拉起并守护：

1. **Node 主库服务** — 监听 `127.0.0.1:9091`，数据库在 `%APPDATA%\HouseApp\housing.db`
2. **frpc 隧道客户端** — 把本机服务经云服务器暴露给在外的手机

## 文件说明

| 文件 | 用途 |
|---|---|
| `一键启动.bat` | **双击它就能启动**（推荐日常用）。内部调用 ps1，自动绕过执行策略 |
| `start-housing.ps1` | 实际的启动+守护脚本，可改顶部配置（端口、是否开隧道） |
| `frpc.toml.example` | 隧道配置模板，复制为 `frpc.toml` 后填你的云服务器信息 |
| `install-autostart.bat` | 注册「开机自启」（把启动器加入当前用户启动项） |
| `frpc.exe` | 需你自行下载放入（见下） |

## 首次使用

1. 确认装了 Node 24+：命令行运行 `node --version`。
2. 构建主库服务：
   ```
   cd ..\server
   pnpm install
   pnpm run build
   ```
3. 配置密钥：把 `..\server\.env.example` 复制为 `..\server\.env`，按里面提示把 `TOKEN_SECRET` 改成随机串。
4. （要手机在外同步才需要）配隧道：
   - 从 https://github.com/fatedier/frp/releases 下载 Windows 版，解压出 `frpc.exe` 放到本文件夹。
   - 复制 `frpc.toml.example` 为 `frpc.toml`，填上你云服务器的 IP、token、域名。
   - 云服务器侧的 frps 配置见 `..\..\DEPLOY-本地主库版.md`。
   - 如果暂时只在本机/局域网用，可不配，把 `start-housing.ps1` 顶部 `$EnableTunnel` 改成 `$false`。
5. 双击 `一键启动.bat`。窗口保持打开即在运行；关闭窗口即停止。

## 开机自启

双击 `install-autostart.bat`，会把启动器加入「当前用户启动项」，下次开机自动运行。
想取消：按 Win+R 输入 `shell:startup`，删掉里面的「房屋管家主库」快捷方式即可。

## 验证在跑

浏览器打开 `http://127.0.0.1:9091/api/v1/health`，返回 `{"status":"ok"}` 即正常。
