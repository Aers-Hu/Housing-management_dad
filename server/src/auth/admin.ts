// ============================================================
// 管理员账号（GmAersMess）— 全局审批裁决人
//
// 设计要点（应昴君需求写死）：
//  1. 该账号唯一职责：接收全部楼主的待审改动，做「是否写入主库」的最终裁决。
//  2. 优先级最高：管理员的决定永远覆盖楼主的决定（见 routes/data.ts 的 reconcile 逻辑）。
//  3. 设备绑定：只允许「本机这台电脑的电脑端」登录与操作。
//     - 必须带 X-Machine-Id 头，且等于本机 MachineGuid（写死在下方）。
//     - 手机端不发该头、其它电脑 MachineGuid 不同，一律被拒。
//     - 即便有人伪造来源 IP，MachineGuid 对不上照样进不来。
//  4. 账号在服务端启动时自动种入（见 repo.ts seedAdmin），且禁止任何人注册同名账号。
// ============================================================

// 写死的管理员凭据（自托管单机场景，按昴君要求写死在源码）
export const ADMIN_USERNAME = 'GmAersMess';
export const ADMIN_PASSWORD = '146772';

// 写死的本机机器指纹：来自
//   reg query "HKLM\SOFTWARE\Microsoft\Cryptography" /v MachineGuid
// 仅这台电脑的电脑端能携带匹配值，从而把管理员账号锁死在本机。
export const ADMIN_MACHINE_ID = '3f16e266-47ea-4bbf-8a1b-77c7779c970e';

// 管理员账号的 userId，在 seedAdmin() 时回填（避免每次按用户名查库）。
let adminUserId: string | null = null;

export function setAdminUserId(id: string): void {
  adminUserId = id;
}

export function getAdminUserId(): string | null {
  return adminUserId;
}

// 是否为管理员账号（按 userId 判断，O(1)）
export function isAdminUser(userId: string | null | undefined): boolean {
  return !!userId && adminUserId !== null && userId === adminUserId;
}

// 校验请求是否来自被授权的本机设备：
//   - X-Machine-Id 必须等于写死的 MachineGuid（大小写不敏感、去空白）
// 来源回环校验在中间件里结合 req.ip 另做（见 middleware/auth.ts）。
export function machineIdMatches(headerVal: unknown): boolean {
  if (typeof headerVal !== 'string') return false;
  return headerVal.trim().toLowerCase() === ADMIN_MACHINE_ID.toLowerCase();
}

// 来源是否为本机回环地址（127.0.0.1 / ::1 / ::ffff:127.0.0.1）
export function isLoopbackIp(ip: unknown): boolean {
  if (typeof ip !== 'string' || !ip) return false;
  const v = ip.trim().toLowerCase();
  return (
    v === '127.0.0.1' ||
    v === '::1' ||
    v === '::ffff:127.0.0.1' ||
    v.startsWith('127.')
  );
}
