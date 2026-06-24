import express from "express";
import cors from "cors";
import { readFileSync, existsSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { resolve } from "node:path";
import { initSchema, DB_PATH } from "./db/index.ts";
import dataRoutes from "./routes/data.ts";
import authRoutes from "./routes/auth.ts";
import { authRequired } from "./middleware/auth.ts";

const app = express();
const port = process.env.PORT || 9091;

// 初始化数据库表结构
initSchema();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// 认证接口（注册/登录，无需 token）
app.use('/api/v1/auth', authRoutes);

// 业务数据接口（全部需要登录）
app.use('/api/v1', authRequired, dataRoutes);

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
  createHttpsServer(options, app).listen(port, () => {
    console.log(`🔒 HTTPS server listening at https://localhost:${port}/`);
    console.log(`SQLite database at: ${DB_PATH}`);
  });
} else {
  app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}/`);
    console.log(`SQLite database at: ${DB_PATH}`);
    console.log(`提示：未找到 TLS 证书，正在使用 HTTP。本地开发可用，上云请配置 HTTPS。`);
  });
}
