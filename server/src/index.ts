import express from "express";
import cors from "cors";
import { readFileSync, existsSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { resolve } from "node:path";
import { initSchema, DB_PATH, db } from "./db/index.ts";
import dataRoutes from "./routes/data.ts";
import authRoutes from "./routes/auth.ts";
import { authRequired } from "./middleware/auth.ts";

const app = express();
const port = process.env.PORT || 9091;

// 初始化数据库表结构
initSchema();

// 隧道/反向代理后，真实客户端 IP 在 x-forwarded-for 里（限流取 IP 用）
app.set('trust proxy', true);

// Middleware
app.use(cors());
// 请求体限制调小（防超大请求耗尽内存）；业务数据都是小 JSON，1mb 足够
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// 认证接口（注册/登录，无需 token）
app.use('/api/v1/auth', authRoutes);

// 业务数据接口（全部需要登录）
app.use('/api/v1', authRequired, dataRoutes);

// ============================================================
// 404 与全局错误处理（必须放在所有路由之后）
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 统一错误中间件：记录到服务端日志，但只回简洁信息给客户端，不泄露堆栈
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[请求出错]', err?.stack || err);
  // body-parser 体积超限
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求体过大' });
  }
  // JSON 解析失败
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: '请求格式错误' });
  }
  if (res.headersSent) return;
  res.status(500).json({ error: '服务器内部错误' });
});

// ============================================================
// 进程级兜底：记录异常但不让进程直接崩溃
// （生产有 pm2/启动器守护，这里再加一层避免单个未捕获错误中断服务）
// ============================================================
process.on('uncaughtException', (err) => {
  console.error('[未捕获异常]', err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[未处理的 Promise 拒绝]', reason);
});

// ============================================================
// 启动：优先 HTTPS（若配置了证书），否则 HTTP
// 证书路径用环境变量指定：TLS_KEY / TLS_CERT
// ============================================================
const tlsKeyPath = process.env.TLS_KEY || resolve(process.cwd(), 'certs', 'key.pem');
const tlsCertPath = process.env.TLS_CERT || resolve(process.cwd(), 'certs', 'cert.pem');

if (existsSync(tlsKeyPath) && existsSync(tlsCertPath)) {
  const options = {
    key: readFileSync(tlsKeyPath),
    cert: readFileSync(tlsCertPath),
  };
  const server = createHttpsServer(options, app).listen(port, () => {
    console.log(`🔒 HTTPS server listening at https://localhost:${port}/`);
    console.log(`SQLite database at: ${DB_PATH}`);
  });
  installGracefulShutdown(server);
} else {
  const server = app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}/`);
    console.log(`SQLite database at: ${DB_PATH}`);
    console.log(`提示：未找到 TLS 证书，正在使用 HTTP。本地开发可用，上云请配置 HTTPS。`);
  });
  installGracefulShutdown(server);
}

// ============================================================
// 优雅关闭：收到退出信号时停止接收新请求，
// 做一次 WAL checkpoint 把数据落盘并合并 -wal，再关库退出。
// 避免关停瞬间数据库处于未合并状态。
// ============================================================
function installGracefulShutdown(server: { close: (cb?: () => void) => void }): void {
  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`\n收到 ${signal}，正在优雅关闭...`);
    server.close(() => {
      try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        db.close();
        console.log('数据库已落盘并关闭。');
      } catch (e) {
        console.error('关闭数据库时出错：', e);
      }
      process.exit(0);
    });
    // 兜底：5 秒内没关完就强制退出
    setTimeout(() => process.exit(0), 5000).unref?.();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
