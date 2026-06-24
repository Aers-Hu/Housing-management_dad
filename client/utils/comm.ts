import { apiRequest } from './api';

// ============================================================
// 账号级通讯：申请查看 + 授权管理
// ============================================================

export interface AccessRequestItem {
  id: string;
  requesterId: string;
  ownerId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  requesterUsername?: string; // inbox 带
  ownerUsername?: string;     // outbox 带
}

export interface GranteeItem {
  id: string;
  ownerId: string;
  granteeId: string;
  canWrite: boolean;
  createdAt: string;
  granteeUsername: string;
}

// 申请查看某用户(按用户名)的全部楼房
export async function requestAccess(username: string): Promise<void> {
  await apiRequest('/access-requests', { method: 'POST', body: { username } });
}

// 我收到的待处理申请（消息状态栏）
export async function getInbox(): Promise<AccessRequestItem[]> {
  const data = await apiRequest<{ requests: AccessRequestItem[] }>('/access-requests/inbox');
  return data.requests;
}

// 同意/拒绝某申请
export async function respondRequest(requestId: string, approve: boolean): Promise<void> {
  await apiRequest(`/access-requests/${requestId}/respond`, {
    method: 'POST',
    body: { action: approve ? 'approve' : 'reject' },
  });
}

// 我授权出去的人列表
export async function getGrantees(): Promise<GranteeItem[]> {
  const data = await apiRequest<{ grantees: GranteeItem[] }>('/grantees');
  return data.grantees;
}

// 设置某被授权人的写权限
export async function setGranteeWrite(granteeId: string, canWrite: boolean): Promise<void> {
  await apiRequest(`/grantees/${granteeId}`, { method: 'PUT', body: { canWrite } });
}

// 撤销某被授权人
export async function revokeGrantee(granteeId: string): Promise<void> {
  await apiRequest(`/grantees/${granteeId}`, { method: 'DELETE' });
}
