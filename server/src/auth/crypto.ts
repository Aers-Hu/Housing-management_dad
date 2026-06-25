import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

// ============================================================
// 密码哈希（scrypt，Node 内置，无需原生编译）
// 存储格式： scrypt$<saltHex>$<hashHex>
// ============================================================
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ============================================================
// 签名 token（HMAC-SHA256，自包含，无需服务端存储 session）
// 格式： base64url(payloadJson).base64url(hmac)
// payload = { uid, exp }
// ============================================================
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'dev-insecure-secret-change-me';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 天

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function sign(payloadB64: string): string {
  return b64url(createHmac('sha256', TOKEN_SECRET).update(payloadB64).digest());
}

export function createToken(userId: string): string {
  const payload = { uid: userId, exp: Date.now() + TOKEN_TTL_MS };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf-8'));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyToken(token: string): { uid: string } | null {
  try {
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return null;
    // 验签（防伪造）
    const expectedSig = sign(payloadB64);
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf-8'));
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    if (!payload.uid) return null;
    return { uid: payload.uid };
  } catch {
    return null;
  }
}

// 启动时检查 TOKEN_SECRET：
//   - 生产环境(NODE_ENV=production)未设 → 直接拒绝启动（否则 token 可被伪造，冒充任意账号）
//   - 开发环境未设 → 用默认密钥并警告
if (!process.env.TOKEN_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ 生产环境必须设置 TOKEN_SECRET 环境变量，否则登录 token 可被伪造！');
    console.error('   生成方法：node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    console.error('   然后在 server/.env 里设置 TOKEN_SECRET=<生成的随机串> 再启动。');
    process.exit(1);
  }
  console.warn('⚠️  未设置 TOKEN_SECRET 环境变量，正在使用不安全的默认密钥（仅限本地开发）。');
}
