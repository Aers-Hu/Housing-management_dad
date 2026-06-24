import { Router } from 'express';
import { Users } from '../db/repo.ts';
import { hashPassword, verifyPassword, createToken } from '../auth/crypto.ts';
import { authRequired, getUserId } from '../middleware/auth.ts';

const router = Router();

// 用户名规则：3-30 位，字母数字下划线
const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;

// 注册
router.post('/register', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: '用户名需为 3-30 位字母、数字或下划线' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  if (Users.findByUsername(username)) {
    return res.status(409).json({ error: '用户名已被占用' });
  }
  const user = Users.create(username, hashPassword(password));
  const token = createToken(user.id);
  res.status(201).json({ token, user });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: '缺少用户名或密码' });
  }
  const record = Users.findByUsername(username);
  if (!record || !verifyPassword(password, record.passwordHash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = createToken(record.id);
  res.json({ token, user: { id: record.id, username: record.username, createdAt: record.createdAt } });
});

// 当前登录用户信息（校验 token 是否有效）
router.get('/me', authRequired, (req, res) => {
  const user = Users.findById(getUserId(req));
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user });
});

// 按用户名查 ID（授权时用：owner 输入对方用户名找到 granteeId）
router.get('/users/lookup', authRequired, (req, res) => {
  const username = String(req.query.username || '');
  const user = Users.findByUsername(username);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user: { id: user.id, username: user.username } });
});

export default router;
